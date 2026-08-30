/**
 * 历史助手行派生 hold 的采集与窗口外预热。
 * 不进 16ms 直播路径；`shouldScheduleHistoricalAnswerWarm` 在 loading 时为假。
 * @see shared/ARCH.md
 */
import {
  deriveProcessPhases,
  snapshotFrozenProcessSteps,
  summarizeProcessPhases
} from './process-phases'
import {
  buildAnswerParts,
  extractFinalContent,
  historicalAnswerHoldStamp,
  processSegments,
  seedHistoricalAnswerHold,
  writeHistoricalAnswerHold,
  type AnswerPart,
  type HistoricalAnswerHold
} from './turn-segments'
import type { TurnSegment } from './types'

/** 窗口外侧最多预热这么多条助手行，避免一次扫整页 */
export const HISTORICAL_ANSWER_WARM_LIMIT = 8

/** 直播中不预热；空闲才采集相邻未挂载行 */
export function shouldScheduleHistoricalAnswerWarm(input: { loading?: boolean }): boolean {
  return !input.loading
}

/** 用户行 / 无片段 / 直播中不采集 */
export function shouldWarmHistoricalAnswerHold(input: {
  loading?: boolean
  role?: string
  hasSegments?: boolean
}): boolean {
  return !input.loading && input.role === 'assistant' && Boolean(input.hasSegments)
}

/** 过程区去掉已进正文的文字与内联演示（与 AssistantMessage 同一过滤） */
export function historicalProcessForFlow(
  processOnly: readonly TurnSegment[],
  answerParts: readonly AnswerPart[]
): TurnSegment[] {
  const answerTextIds = new Set(
    answerParts.filter((part) => part.type === 'text').map((part) => part.id)
  )
  return processOnly.filter((segment) => {
    if (segment.toolName === 'present_inline_demo') return false
    if (segment.kind === 'text' && answerTextIds.has(segment.id)) return false
    return true
  })
}

/** 完成后过程芯片 outcome，与 AssistantMessage 同一判断 */
export function historicalProcessOutcome(input: {
  content: string
  outcome?: string
}): 'success' | 'error' | 'aborted' {
  if (input.outcome === 'error' || input.outcome === 'aborted') return input.outcome
  if (/^\*\*错误\*\*:?/u.test((input.content || '').trim())) return 'error'
  return 'success'
}

/** 从窗口边沿向外挑未挂载的助手行，供 idle 预热 */
export function nextHistoricalAnswerWarmMessages<
  T extends { id: string; role: string; meta?: { segments?: readonly unknown[] | null } }
>(input: {
  messages: readonly T[]
  windowStart: number
  windowEnd: number
  limit?: number
}): T[] {
  const limit = input.limit ?? HISTORICAL_ANSWER_WARM_LIMIT
  const out: T[] = []
  let older = input.windowStart - 1
  let newer = input.windowEnd
  while (out.length < limit && (older >= 0 || newer < input.messages.length)) {
    if (older >= 0) {
      const message = input.messages[older]
      if (
        message &&
        shouldWarmHistoricalAnswerHold({
          role: message.role,
          hasSegments: Boolean(message.meta?.segments?.length)
        })
      ) {
        out.push(message)
      }
      older -= 1
    }
    if (out.length >= limit) break
    if (newer < input.messages.length) {
      const message = input.messages[newer]
      if (
        message &&
        shouldWarmHistoricalAnswerHold({
          role: message.role,
          hasSegments: Boolean(message.meta?.segments?.length)
        })
      ) {
        out.push(message)
      }
      newer += 1
    }
  }
  return out
}

/** 现场采集正文部件 / 过程切片 / 冻结步骤（不写 hold） */
export function captureHistoricalAnswerHold(input: {
  messageId: string
  content: string
  durationSec?: number
  outcome?: string
  segments: TurnSegment[]
}): HistoricalAnswerHold {
  const extractedFinal = extractFinalContent(input.segments, { isStreaming: false })
  const answerParts = buildAnswerParts(input.segments, { isStreaming: false })
  const processOnly = processSegments(input.segments, { isStreaming: false })
  const processForFlow = historicalProcessForFlow(processOnly, answerParts)
  const processPhases = deriveProcessPhases(input.segments, { isStreaming: false })
  return {
    stamp: historicalAnswerHoldStamp(input),
    extractedFinal,
    answerParts,
    processOnly,
    processForFlow,
    processPhases,
    processSummary: summarizeProcessPhases(
      processPhases,
      input.durationSec,
      historicalProcessOutcome(input)
    ),
    frozenSteps: snapshotFrozenProcessSteps(processForFlow, { isStreaming: false })
  }
}

/** 已有同一 stamp 则只碰 LRU；否则采集并写入 */
export function warmHistoricalAnswerHold(input: {
  messageId: string
  content: string
  durationSec?: number
  outcome?: string
  segments?: TurnSegment[] | null
}): HistoricalAnswerHold | undefined {
  if (!input.segments?.length) return undefined
  const stamp = historicalAnswerHoldStamp({
    messageId: input.messageId,
    content: input.content,
    durationSec: input.durationSec,
    outcome: input.outcome,
    segments: input.segments
  })
  const seeded = seedHistoricalAnswerHold(input.messageId, stamp)
  if (seeded) return seeded
  return writeHistoricalAnswerHold(
    input.messageId,
    captureHistoricalAnswerHold({
      messageId: input.messageId,
      content: input.content,
      durationSec: input.durationSec,
      outcome: input.outcome,
      segments: input.segments
    })
  )
}
