/**
 * Turn 调度管线：queryServe → processUserInput → onQuery → queryLoop。
 * @see agent/README.md
 */
import type { AppSettings, ChatMessage, StreamChunk } from '../shared/types'
import { needsToolCalling } from '../shared/needs-tools'
import { getActiveWorkspacePath } from '../shared/workspace'
import { compressContextIfNeeded } from '../shared/context-compress'
import { estimateContextUsage } from '../shared/token-estimate'
import { recordTokenUsage } from '../shared/token-usage-store'
import { runHooks } from './hooks/runner'
import { validateActiveProvider } from '../shared/provider-validate'
import { simpleCompletion, type ChatCompletionMessage } from '../providers/openai'
import { buildSkillsSystemPrompt, loadSkills, selectSkillsForMessage } from '../skills/loader'
import { matchSlashCommand } from './commands'
import { buildSystemPrompt, type ApprovalHandler } from './loop'
import { expandFileReferences } from './file-refs'
import { queryLoop } from './query-loop'
import { killAllShellChildren } from '../tools/shell-runner'
import { enterBuildMode } from '../tools/harness-state'
import { prepareMcpToolPool } from '../tools/registry'
import { assembleMemoryContext } from './memory/assembler'
import { writeMemoriesFromTurn } from './memory/writer'
import { getActiveSessionId, getWorkspaceProjectId } from './memory/workspaces-sync'
import type { TurnEventInput } from './memory/types'

const BUILD_PLAN_PREFIX = '__SHARKER_BUILD__\n'

const DEFAULT_TURN_TIMEOUT_MS = 120_000
const COMPUTER_USE_TURN_TIMEOUT_MS = 600_000

/** 桌面自动化任务用更长超时（多步 MCP + 审批） */
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
}

/** executeUserInput 上下文 */
export interface ExecuteUserInputContext {
  settings: AppSettings
  history: ChatMessage[]
  userText: string
  onApproval: ApprovalHandler
  send: (chunk: StreamChunk) => void
  reloadSettings: () => Promise<AppSettings>
}

type TurnSlot = {
  abortController: AbortController
  turnTimer: ReturnType<typeof setTimeout>
  release: () => void
}

let activeTurn: Promise<void> | null = null
let activeSlot: TurnSlot | null = null
let turnChain: Promise<void> = Promise.resolve()

/** 将历史 ChatMessage 映射为 API 消息格式 */
function mapHistoryToApiMessages(history: ChatMessage[]): ChatCompletionMessage[] {
  return history.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        tool_call_id: m.toolCallId!,
        content: m.content
      }
    }
    if (m.role === 'assistant' && m.toolName) {
      return { role: 'assistant' as const, content: m.content || null }
    }
    return { role: m.role as 'user' | 'assistant', content: m.content }
  })
}

/**
 * 解析用户输入：斜杠命令走本地；普通文本进入 onQuery。
 */
export function processUserInput(userText: string): ProcessUserInputResult {
  let trimmed = userText.trim()
  if (trimmed.startsWith(BUILD_PLAN_PREFIX)) {
    enterBuildMode()
    trimmed = trimmed.slice(BUILD_PLAN_PREFIX.length).trim()
  }
  const cmd = matchSlashCommand(trimmed)
  if (cmd) {
    const rewritten = cmd.rewrittenText?.trim()
    if (cmd.shouldQuery && rewritten) {
      return { userText: rewritten, shouldQuery: true, command: cmd.command }
    }
    return {
      userText: trimmed,
      shouldQuery: false,
      localReply: cmd.reply,
      command: cmd.command
    }
  }
  return { userText: trimmed, shouldQuery: true }
}

/** 占坑：发 turn_start 信号，标记本轮开始 */
function queryServe(send: (chunk: StreamChunk) => void): void {
  send({ type: 'turn_start', skillNames: [] })
}

/** 组装上下文并驱动 queryLoop */
async function* onQuery(
  ctx: ExecuteUserInputContext,
  processed: ProcessUserInputResult,
  signal: AbortSignal
): AsyncGenerator<StreamChunk> {
  const { settings, history, userText, onApproval, send } = ctx
  const workspace = getActiveWorkspacePath(settings)

  const providerError = validateActiveProvider(settings)
  if (providerError) {
    yield { type: 'error', error: providerError.replace(/\*\*/g, '') }
    yield { type: 'done' }
    return
  }

  let historyForAgent = history
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
  const [, expandedUserText, skills, projectId, sessionId, systemBaseRaw] = await Promise.all([
    prepareMcpToolPool(workspace),
    expandFileReferences(userText, workspace),
    loadSkills(workspace),
    getWorkspaceProjectId(settings.activeWorkspaceId),
    getActiveSessionId(settings.activeWorkspaceId),
    buildSystemPrompt(settings, { includeBootstrap: useTools })
  ])
  const memoryPromise = assembleMemoryContext({
    settings,
    workspaceId: settings.activeWorkspaceId,
    projectId,
    sessionId,
    userMessage: userText,
    recentMessages: historyForAgent.slice(-4).map((m) => m.content)
  })
  const activeSkills = selectSkillsForMessage(skills, userText)
  if (activeSkills.length > 0) {
    send({
      type: 'turn_start',
      skillNames: activeSkills.map((s) => s.name)
    })
  }

  const skillBlock = buildSkillsSystemPrompt(skills, userText)
  let systemBase = systemBaseRaw

  try {
    const memoryCtx = await memoryPromise
    if (memoryCtx?.block) {
      systemBase = `${systemBase}\n\n${memoryCtx.block}`
    }
  } catch (e) {
    console.warn('[memory] assemble failed', e)
  }

  const systemContent = skillBlock
    ? `${systemBase}\n\n# Active Skills\n\n${skillBlock}`
    : systemBase

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemContent },
    ...mapHistoryToApiMessages(historyForAgent),
    { role: 'user', content: expandedUserText }
  ]

  yield* queryLoop(settings, messages, onApproval, signal, {
    userText,
    history: historyForAgent
  })
}

/** 本地命令回复：token / command + done */
async function* runLocalCommand(
  processed: ProcessUserInputResult
): AsyncGenerator<StreamChunk> {
  if (processed.command) {
    yield { type: 'command', command: processed.command }
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
  const runTurn = async () => {
    const settings = await ctx.reloadSettings()
    const slot: TurnSlot = {
      abortController: new AbortController(),
      turnTimer: setTimeout(() => slot.abortController.abort(), turnTimeoutMs(ctx.userText)),
      release: () => {
        clearTimeout(slot.turnTimer)
        if (activeSlot === slot) activeSlot = null
      }
    }
    activeSlot = slot
    const signal = slot.abortController.signal
    const turnCtx = { ...ctx, settings }

    try {
      queryServe(turnCtx.send)

      const processed = processUserInput(ctx.userText)
      void runHooks('turn_start', { userText: ctx.userText.slice(0, 120) })

      const turnEvents: TurnEventInput[] = []
      let assistantText = ''
      const captureSend = (chunk: StreamChunk) => {
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
        turnCtx.send(chunk)
      }
      const turnCtxWithCapture = { ...turnCtx, send: captureSend }

      if (!processed.shouldQuery) {
        for await (const chunk of runLocalCommand(processed)) {
          if (signal.aborted) {
            turnCtx.send({ type: 'done' })
            return
          }
          captureSend(chunk)
        }
        return
      }

      for await (const chunk of onQuery(turnCtxWithCapture, processed, signal)) {
        captureSend(chunk)
      }
      void runHooks('turn_done', { userText: processed.userText.slice(0, 120) })
      const tokens = estimateContextUsage(ctx.history, processed.userText, '').total
      void recordTokenUsage(tokens)

      void writeMemoriesFromTurn({
        settings: turnCtx.settings,
        workspaceId: turnCtx.settings.activeWorkspaceId,
        sessionId: await getActiveSessionId(turnCtx.settings.activeWorkspaceId),
        projectId: await getWorkspaceProjectId(turnCtx.settings.activeWorkspaceId),
        userText: processed.userText,
        assistantText,
        events: turnEvents
      }).catch((e) => console.warn('[memory] writer failed', e))
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const error =
        raw === 'This operation was aborted' || raw.includes('aborted')
          ? '任务超时或被取消（桌面自动化任务最长约 10 分钟）。若卡在截图，请改用 MCP get_app_state；点击/打字需点「允许」。'
          : raw
      turnCtx.send({ type: 'error', error })
      turnCtx.send({ type: 'done' })
    } finally {
      slot.release()
    }
  }

  const turnPromise = turnChain.then(runTurn)
  activeTurn = turnPromise
  turnChain = turnPromise.catch(() => {})
  await turnPromise
}

/** 中止当前 turn（供 chat:abort 与插队使用），并结束后台 shell */
export function abortActiveTurn(): void {
  activeSlot?.abortController.abort()
  killAllShellChildren()
}
