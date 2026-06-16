/**
 * Turn 调度管线：queryServe → processUserInput → onQuery → queryLoop。
 * @see agent/README.md
 */
import type { AppSettings, ChatMessage, StreamChunk } from '../shared/types'
import { needsToolCalling } from '../shared/needs-tools'
import { getActiveWorkspacePath } from '../shared/workspace'
import { compressContextIfNeeded } from '../shared/context-compress'
import { validateActiveProvider } from '../shared/provider-validate'
import { simpleCompletion, type ChatCompletionMessage } from '../providers/openai'
import { buildSkillsSystemPrompt, loadSkills, selectSkillsForMessage } from '../skills/loader'
import { matchSlashCommand } from './commands'
import { buildSystemPrompt, type ApprovalHandler } from './loop'
import { queryLoop } from './query-loop'
import { killAllShellChildren } from '../tools/shell-runner'

const TURN_TIMEOUT_MS = 120_000

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
  const trimmed = userText.trim()
  const cmd = matchSlashCommand(trimmed)
  if (cmd) {
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
  const skills = await loadSkills(workspace)
  const activeSkills = selectSkillsForMessage(skills, userText)
  if (activeSkills.length > 0) {
    send({
      type: 'turn_start',
      skillNames: activeSkills.map((s) => s.name)
    })
  }

  const skillBlock = buildSkillsSystemPrompt(skills, userText)
  const systemBase = await buildSystemPrompt(settings, { includeBootstrap: useTools })
  const systemContent = skillBlock
    ? `${systemBase}\n\n# Active Skills\n\n${skillBlock}`
    : systemBase

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemContent },
    ...mapHistoryToApiMessages(historyForAgent),
    { role: 'user', content: userText }
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
      turnTimer: setTimeout(() => slot.abortController.abort(), TURN_TIMEOUT_MS),
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

      if (!processed.shouldQuery) {
        for await (const chunk of runLocalCommand(processed)) {
          if (signal.aborted) {
            turnCtx.send({ type: 'done' })
            return
          }
          turnCtx.send(chunk)
        }
        return
      }

      for await (const chunk of onQuery(turnCtx, processed, signal)) {
        turnCtx.send(chunk)
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const error =
        raw === 'This operation was aborted' || raw.includes('aborted')
          ? '请求已超时或被取消，请检查 API 配置后重试'
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
