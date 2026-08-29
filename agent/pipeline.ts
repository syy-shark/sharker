/**
 * Turn 调度管线：queryServe → processUserInput → onQuery → queryLoop。
 * @see agent/ARCH.md
 */
import type { AppSettings, ChatAttachment, ChatMessage, StreamChunk } from '../shared/types'
import { needsToolCalling } from '../shared/needs-tools'
import { getActiveWorkspacePath } from '../shared/workspace'
import { AUTO_COMPACT_LIVE_STATUS, compressContextIfNeeded, shouldCompressContext } from '../shared/context-compress'
import { estimateContextUsage } from '../shared/token-estimate'
import { recordTokenUsage } from '../shared/token-usage-store'
import { validateActiveProvider } from '../shared/provider-validate'
import { simpleCompletion, type ChatCompletionMessage } from '../providers/openai'
import { matchSlashCommand } from './commands'
import { buildSystemPrompt, type ApprovalHandler } from './loop'
import { expandFileReferences } from './file-refs'
import { expandChatReferences, workspaceChatLoader } from './chat-refs'
import { mapHistoryMessageToApi, userMessageContentWithAttachments } from './message-attachments'
import { queryLoop } from './query-loop'
import { leftoverSteerDisposition } from '../shared/pending-steer'
import { applyScheduledTurnSettings } from '../shared/automation'
import {
  markTurnSteerable,
  releaseTurnSteer,
  __resetPendingSteerMailboxForTests
} from './pending-steer-mailbox'
import { killAllShellChildren } from '../tools/shell-runner'
import { enterBuildMode, setWorktreePath } from '../tools/harness-state'
import { assembleMemoryContext } from './memory/assembler'
import { writeMemoriesFromTurn } from './memory/writer'
import { loadSessionMemoryPolicy } from './memory/conversations'
import { getActiveSessionId, getWorkspaceProjectId } from './memory/workspaces-sync'
import { resolveChatMemoryFlags } from '../shared/memory-command'
import type { TurnEventInput } from './memory/types'

const BUILD_PLAN_PREFIX = '__SHARKER_BUILD__\n'

const DEFAULT_TURN_TIMEOUT_MS = 900_000
const COMPUTER_USE_TURN_TIMEOUT_MS = 1_200_000

/** 桌面自动化任务用更长超时（多步操作 + 审批） */
function turnTimeoutMs(userText: string): number {
  if (/微信|wechat|桌面|打开|点击|发消息|computer\s*use|继续/i.test(userText)) {
    return COMPUTER_USE_TURN_TIMEOUT_MS
  }
  return DEFAULT_TURN_TIMEOUT_MS
}

/** processUserInput 的解析结果 */
export interface ProcessUserInputResult {
  userText: string
  shouldQuery: boolean
  /** 本地命令回复文本（shouldQuery=false 时） */
  localReply?: string
  /** 渲染进程命令（如 clear） */
  command?: string
  /** `/plan` 切换后同步输入框芯片 */
  harnessPhase?: 'normal' | 'plan' | 'build'
}

/** executeUserInput 上下文 */
export interface ExecuteUserInputContext {
  settings: AppSettings
  history: ChatMessage[]
  userText: string
  attachments?: ChatAttachment[]
  onApproval: ApprovalHandler
  send: (chunk: StreamChunk) => void
  reloadSettings: () => Promise<AppSettings>
  /** 多会话隔离：本轮流式事件归属 */
  conversationId?: string
  /** 会话级 once/session 审批表 */
  sessionApprovals?: import('../shared/approval-session').SessionApprovalStore
  /** 本轮隔离 worktree；空则清掉覆盖，回到工作区 */
  worktreePath?: string | null
  /** 进行中的线程目标，注入 system（对标 Codex /goal） */
  threadGoal?: string | null
  /** 本轮覆盖模型 / 思考档位；空则用当前设置（对标 Codex scheduled model） */
  providerId?: string | null
  thinkingLevel?: string | null
}

type TurnSlot = {
  conversationId?: string
  abortController: AbortController
  turnTimer: ReturnType<typeof setTimeout>
  release: () => void
}

/**
 * 按会话隔离的 turn 队列：不同 conversation 可并行，
 * 同一 conversation 内仍串行，避免历史/工具状态交错。
 * 无 conversationId 的遗留路径走 default 队列。
 */
const turnChains = new Map<string, Promise<void>>()
const activeSlots = new Map<string, TurnSlot>()
/** 在排队、尚未 runTurn 时被 Stop 的会话 */
const cancelledBeforeStart = new Set<string>()

const DEFAULT_CHAIN_KEY = '__default__'

function chainKey(conversationId?: string): string {
  return conversationId?.trim() || DEFAULT_CHAIN_KEY
}

function enqueueTurn(conversationId: string | undefined, run: () => Promise<void>): Promise<void> {
  const key = chainKey(conversationId)
  const prev = turnChains.get(key) ?? Promise.resolve()
  const next = prev.then(run).catch(() => {})
  // 保留链尾，避免同会话并发；不 await 其它会话
  turnChains.set(
    key,
    next.finally(() => {
      if (turnChains.get(key) === next) turnChains.delete(key)
    })
  )
  return next
}

/** 将历史 ChatMessage 映射为 API 消息格式 */
async function mapHistoryToApiMessages(history: ChatMessage[]): Promise<ChatCompletionMessage[]> {
  const mapped = await Promise.all(history.map((m) => mapHistoryMessageToApi(m)))
  return mapped as ChatCompletionMessage[]
}

/**
 * 解析用户输入：斜杠命令走本地；普通文本进入 onQuery。
 */
export function processUserInput(
  userText: string,
  conversationId?: string
): ProcessUserInputResult {
  let trimmed = userText.trim()
  let harnessPhase: ProcessUserInputResult['harnessPhase']
  if (trimmed.startsWith(BUILD_PLAN_PREFIX)) {
    enterBuildMode(conversationId)
    trimmed = trimmed.slice(BUILD_PLAN_PREFIX.length).trim()
    harnessPhase = 'normal'
  }
  const cmd = matchSlashCommand(trimmed, conversationId)
  if (cmd) {
    const rewritten = cmd.rewrittenText?.trim()
    if (cmd.shouldQuery && rewritten) {
      return {
        userText: rewritten,
        shouldQuery: true,
        command: cmd.command,
        harnessPhase: cmd.harnessPhase ?? harnessPhase
      }
    }
    return {
      userText: trimmed,
      shouldQuery: false,
      localReply: cmd.reply,
      command: cmd.command,
      harnessPhase: cmd.harnessPhase ?? harnessPhase
    }
  }
  return { userText: trimmed, shouldQuery: true, harnessPhase }
}

/** 占坑：发 turn_start 信号，标记本轮开始 */
function queryServe(send: (chunk: StreamChunk) => void, conversationId?: string): void {
  send({ type: 'turn_start', conversationId })
  // 立即给前端一个可见状态，避免「只有 loading 没有步骤」的空窗
  send({ type: 'status', content: '连接模型并准备任务…', conversationId })
}

/** 组装上下文并驱动 queryLoop */
async function* onQuery(
  ctx: ExecuteUserInputContext,
  processed: ProcessUserInputResult,
  signal: AbortSignal
): AsyncGenerator<StreamChunk> {
  const { settings, history, userText, attachments, onApproval, send } = ctx
  const workspace = ctx.worktreePath || getActiveWorkspacePath(settings)

  if (processed.harnessPhase) {
    yield { type: 'harness_mode', harnessPhase: processed.harnessPhase }
  }

  const providerError = validateActiveProvider(settings)
  if (providerError) {
    yield { type: 'error', error: providerError.replace(/\*\*/g, '') }
    yield { type: 'done' }
    return
  }

  let historyForAgent = history
  if (shouldCompressContext(settings, history, userText).needed) {
    send({
      type: 'status',
      content: AUTO_COMPACT_LIVE_STATUS,
      conversationId: ctx.conversationId
    })
  }
  const compressed = await compressContextIfNeeded(
    settings,
    history,
    async (s, prompt) =>
      simpleCompletion(s, '你是对话摘要助手，用简洁中文保留关键信息。', prompt),
    userText
  )
  if (compressed.compressed) {
    historyForAgent = compressed.messages
    send({
      type: 'context_compress',
      contextCompress: {
        removedCount: compressed.removedCount,
        beforeTokens: compressed.beforeTokens,
        afterTokens: compressed.afterTokens,
        limit: compressed.limit,
        messages: compressed.messages
      }
    })
  }

  const useTools = needsToolCalling(userText, historyForAgent)
  const [expandedUserText, projectId, sessionId, systemBaseRaw] = await Promise.all([
    expandFileReferences(userText, workspace).then((text) =>
      expandChatReferences(
        text,
        workspaceChatLoader(workspace, settings.activeWorkspaceId),
        ctx.conversationId
      )
    ),
    getWorkspaceProjectId(settings.activeWorkspaceId),
    getActiveSessionId(settings.activeWorkspaceId),
    buildSystemPrompt(settings, {
      includeBootstrap: useTools,
      cwd: ctx.worktreePath || workspace,
      conversationId: ctx.conversationId
    })
  ])
  const memorySessionId = ctx.conversationId || sessionId
  const chatMemory = memorySessionId
    ? await loadSessionMemoryPolicy(memorySessionId)
    : { memoryInjection: null, memoryGeneration: null }
  const memoryFlags = resolveChatMemoryFlags(chatMemory, settings)
  const memorySettings = {
    ...settings,
    memoryInjection: memoryFlags.injection,
    memoryGeneration: memoryFlags.generation
  }
  const memoryPromise = assembleMemoryContext({
    settings: memorySettings,
    workspaceId: settings.activeWorkspaceId,
    projectId,
    sessionId: memorySessionId,
    userMessage: userText,
    recentMessages: historyForAgent.slice(-4).map((m) => m.content)
  })

  let systemContent = systemBaseRaw
  if (ctx.worktreePath) {
    systemContent +=
      `\n\nThis thread is isolated to Git worktree: ${ctx.worktreePath}. ` +
      `Treat that path as the current workspace for all file, git, and terminal tools. ` +
      `Do not modify the original checkout.`
  }
  if (ctx.threadGoal?.trim()) {
    systemContent += `\n\n${ctx.threadGoal.trim()}`
  }

  try {
    const memoryCtx = await memoryPromise
    if (memoryCtx?.block) {
      systemContent = `${systemContent}\n\n${memoryCtx.block}`
    }
  } catch (e) {
    console.warn('[memory] assemble failed', e)
  }

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemContent },
    ...(await mapHistoryToApiMessages(historyForAgent)),
    {
      role: 'user',
      content: await userMessageContentWithAttachments(expandedUserText, attachments)
    }
  ]

  yield* queryLoop(settings, messages, onApproval, signal, {
    userText,
    history: historyForAgent,
    sessionApprovals: ctx.sessionApprovals,
    conversationId: ctx.conversationId
  })
}

/** 本地命令回复：token / command + done */
async function* runLocalCommand(
  processed: ProcessUserInputResult
): AsyncGenerator<StreamChunk> {
  if (processed.command) {
    yield { type: 'command', command: processed.command }
  }
  if (processed.harnessPhase) {
    yield { type: 'harness_mode', harnessPhase: processed.harnessPhase }
  }
  if (processed.localReply) {
    yield { type: 'token', content: processed.localReply }
  }
  yield { type: 'done' }
}

/**
 * 执行单轮用户输入：queryServe → processUserInput → onQuery 或本地命令。
 * 主进程 chat:send 的唯一入口。
 */
export async function executeUserInput(ctx: ExecuteUserInputContext): Promise<void> {
  const conversationId = ctx.conversationId
  // 新的用户输入表示“要跑这一轮”。清掉先前 Stop/插队留下的 before-start 取消标记，
  // 否则 abort 后立即 dispatch 的新 turn 会被 runTurn 入口直接短路取消。
  if (conversationId) cancelledBeforeStart.delete(conversationId)
  const runTurn = async () => {
    const settings = applyScheduledTurnSettings(await ctx.reloadSettings(), {
      providerId: ctx.providerId,
      thinkingLevel: ctx.thinkingLevel
    })
    const key = chainKey(conversationId)
    const slot: TurnSlot = {
      conversationId,
      abortController: new AbortController(),
      turnTimer: setTimeout(() => slot.abortController.abort(), turnTimeoutMs(ctx.userText)),
      release: () => {
        clearTimeout(slot.turnTimer)
        if (activeSlots.get(key) === slot) activeSlots.delete(key)
      }
    }
    activeSlots.set(key, slot)
    if (conversationId) markTurnSteerable(conversationId)
    const signal = slot.abortController.signal
    const stamp = (chunk: StreamChunk): StreamChunk => ({
      ...chunk,
      conversationId: chunk.conversationId ?? conversationId,
      timestamp: chunk.timestamp ?? Date.now()
    })
    const baseSend = (chunk: StreamChunk) => ctx.send(stamp(chunk))
    const turnCtx = { ...ctx, settings, send: baseSend }
    let outcome: 'success' | 'aborted' | 'error' = 'success'
    let sampled = false
    let leftoverFlushed = false

    const flushLeftoverSteers = (disposition: 'consume' | 'restore') => {
      if (!conversationId || leftoverFlushed) return
      leftoverFlushed = true
      const leftover = releaseTurnSteer(conversationId)
      for (const item of leftover) {
        turnCtx.send({
          type: disposition === 'consume' ? 'steer_consumed' : 'steer_restored',
          content: item.text,
          steerId: item.id,
          conversationId,
          ...(disposition === 'consume' ? { steerFinish: true } : {})
        })
      }
    }

    const turnEvents: TurnEventInput[] = []
    let assistantText = ''
    const sendChunk = (chunk: StreamChunk) => {
      if (chunk.type === 'done' && conversationId && outcome === 'success') {
        flushLeftoverSteers(leftoverSteerDisposition({ outcome, sampled }))
      }
      if (chunk.type === 'tool_start') {
        turnEvents.push({
          kind: 'tool_start',
          toolName: chunk.toolName,
          payload: { args: chunk.toolArgs }
        })
      } else if (chunk.type === 'tool_done') {
        turnEvents.push({ kind: 'tool_done', toolName: chunk.toolName })
      } else if (chunk.type === 'error') {
        turnEvents.push({ kind: 'tool_error', payload: { error: chunk.error } })
      } else if (chunk.type === 'token' && chunk.content) {
        assistantText += chunk.content
      }
      turnCtx.send(stamp(chunk))
    }
    const turnCtxWithCapture = { ...turnCtx, send: sendChunk }

    try {
      // Stop 在排队阶段已点过：本会话直接取消，不影响其他会话并行 turn
      if (conversationId && cancelledBeforeStart.has(conversationId)) {
        cancelledBeforeStart.delete(conversationId)
        outcome = 'aborted'
        sendChunk({ type: 'turn_cancelled', conversationId })
        sendChunk({ type: 'done', conversationId })
        return
      }

      queryServe(turnCtx.send, conversationId)
      setWorktreePath(ctx.worktreePath ?? null, conversationId)

      const processed = processUserInput(ctx.userText, conversationId)

      if (!processed.shouldQuery) {
        sampled = false
        for await (const chunk of runLocalCommand(processed)) {
          if (signal.aborted) {
            outcome = 'aborted'
            sendChunk({ type: 'done', conversationId })
            return
          }
          sendChunk(chunk)
        }
        return
      }

      sampled = true
      for await (const chunk of onQuery(turnCtxWithCapture, processed, signal)) {
        sendChunk(chunk)
      }
      const tokens = estimateContextUsage(ctx.history, processed.userText, '').total
      void recordTokenUsage(tokens)

      const writeSessionId =
        turnCtx.conversationId || (await getActiveSessionId(turnCtx.settings.activeWorkspaceId))
      const writePolicy = writeSessionId
        ? await loadSessionMemoryPolicy(writeSessionId)
        : { memoryInjection: null, memoryGeneration: null }
      const writeFlags = resolveChatMemoryFlags(writePolicy, turnCtx.settings)
      void writeMemoriesFromTurn({
        settings: {
          ...turnCtx.settings,
          memoryInjection: writeFlags.injection,
          memoryGeneration: writeFlags.generation
        },
        workspaceId: turnCtx.settings.activeWorkspaceId,
        sessionId: writeSessionId,
        projectId: await getWorkspaceProjectId(turnCtx.settings.activeWorkspaceId),
        userText: processed.userText,
        assistantText,
        events: turnEvents
      }).catch((e) => console.warn('[memory] writer failed', e))
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const aborted =
        signal.aborted ||
        (e instanceof Error && e.name === 'AbortError') ||
        raw === 'This operation was aborted' ||
        raw.includes('aborted')
      if (aborted) {
        // Stop / 超时：统一 cancelled，避免再挂 error 文案干扰直播收尾
        outcome = 'aborted'
        sendChunk({ type: 'turn_cancelled', conversationId })
        sendChunk({ type: 'done', conversationId })
      } else {
        outcome = 'error'
        sendChunk({ type: 'error', error: raw, conversationId })
        sendChunk({ type: 'done', conversationId })
      }
    } finally {
      if (conversationId && !leftoverFlushed) {
        flushLeftoverSteers('restore')
      }
      slot.release()
    }
  }

  // 仅同会话串行；不同会话并行
  await enqueueTurn(conversationId, runTurn)
}

/**
 * 中止 turn（供 chat:abort 与插队使用）。
 * @param conversationId 若指定：只取消该会话（含 turnChain 排队未开跑）；不匹配则不动当前 activeSlot。
 *   省略时：全局中止当前 activeSlot（工作区切换等）。
 * @returns 被请求中止的 conversationId（若有）
 */
export function abortActiveTurn(conversationId?: string): string | null {
  if (conversationId) {
    cancelledBeforeStart.add(conversationId)
    const slot = activeSlots.get(chainKey(conversationId))
    if (slot) {
      // 只 abort 本会话：shell 经 AbortSignal 自行 killChildTree，
      // 绝不能 killAllShellChildren，否则会误杀其它并行会话的命令。
      slot.abortController.abort()
    }
    return conversationId
  }
  // 全局中止：所有会话（工作区切换等）
  const ids = [...activeSlots.values()].map((s) => s.conversationId).filter(Boolean) as string[]
  for (const id of ids) cancelledBeforeStart.add(id)
  for (const slot of activeSlots.values()) slot.abortController.abort()
  killAllShellChildren()
  // 兼容旧诊断：返回其中一个正在跑的 id
  return ids[0] ?? null
}

/** 当前主进程正在跑的 turn 所属会话（测试 / 诊断；多会话时返回其中一个） */
export function getActiveTurnConversationId(): string | null {
  for (const slot of activeSlots.values()) {
    if (slot.conversationId) return slot.conversationId
  }
  return null
}

/** 测试 / 诊断：是否有任一会话 turn 在跑 */
export function hasActiveTurn(): boolean {
  return activeSlots.size > 0
}

/** 指定会话是否有正在跑的 turn（chat:steer 入口） */
export function hasActiveTurnForConversation(conversationId?: string): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return activeSlots.has(chainKey(id))
}

/** 测试用：清空排队取消标记与 chain 状态敏感字段 */
export function __resetTurnPipelineForTests(): void {
  cancelledBeforeStart.clear()
  turnChains.clear()
  activeSlots.clear()
  __resetPendingSteerMailboxForTests()
}
