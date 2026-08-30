/**
 * 历史助手行派生 hold 的采集与窗口外预热。
 * 不进 16ms 直播路径；`shouldScheduleHistoricalAnswerWarm` 在 loading 时为假。
 * @see shared/ARCH.md
 */
import { nextFilesChangedStats } from './files-changed-card'
import {
  deriveProcessPhases,
  snapshotFrozenProcessSteps,
  summarizeProcessPhases
} from './process-phases'
import { TRANSCRIPT_PAGE } from './transcript-window'
import {
  buildAnswerParts,
  extractFinalContent,
  hasProcessFlow,
  historicalAnswerHoldStamp,
  processSegments,
  seedHistoricalAnswerHold,
  shouldDisplayFinalBody,
  writeHistoricalAnswerHold,
  type AnswerPart,
  type HistoricalAnswerHold
} from './turn-segments'
import type { TurnSegment } from './types'

/** 覆盖一次上滑揭示页，避免揭示 30 行时只预热到 8 条 */
export const HISTORICAL_ANSWER_WARM_LIMIT = TRANSCRIPT_PAGE

/** 每个 idle 切片只采一条，避免一帧扫完整页 */
export const HISTORICAL_ANSWER_WARM_SLICE = 1

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
  T extends {
    id: string
    role: string
    content?: string
    meta?: {
      segments?: readonly TurnSegment[] | null
      durationSec?: number
      outcome?: string
    }
  }
>(input: {
  messages: readonly T[]
  windowStart: number
  windowEnd: number
  limit?: number
  skipHeld?: boolean
}): T[] {
  const limit = input.limit ?? HISTORICAL_ANSWER_WARM_LIMIT
  const out: T[] = []
  let older = input.windowStart - 1
  let newer = input.windowEnd
  const takeSide = (from: number, step: 1 | -1): T | undefined => {
    let index = from
    while (index >= 0 && index < input.messages.length) {
      const message = input.messages[index]
      index += step
      if (
        message &&
        shouldWarmHistoricalAnswerHold({
          role: message.role,
          hasSegments: Boolean(message.meta?.segments?.length)
        }) &&
        (!input.skipHeld ||
          !seedHistoricalAnswerHold(
            message.id,
            historicalAnswerHoldStamp({
              messageId: message.id,
              content: message.content ?? '',
              durationSec: message.meta?.durationSec,
              outcome: message.meta?.outcome,
              segments: message.meta?.segments
            })
          ))
      ) {
        if (step < 0) older = index
        else newer = index
        return message
      }
    }
    if (step < 0) older = -1
    else newer = input.messages.length
    return undefined
  }
  while (out.length < limit && (older >= 0 || newer < input.messages.length)) {
    const olderMessage = older >= 0 ? takeSide(older, -1) : undefined
    if (olderMessage) out.push(olderMessage)
    if (out.length >= limit) break
    const newerMessage = newer < input.messages.length ? takeSide(newer, 1) : undefined
    if (newerMessage) out.push(newerMessage)
    if (!olderMessage && !newerMessage) break
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
    frozenSteps: snapshotFrozenProcessSteps(processForFlow, { isStreaming: false }),
    filesChanged: nextFilesChangedStats(null, input.segments),
    hasProcess: hasProcessFlow(input.segments, { isStreaming: false }),
    finalBody: shouldDisplayFinalBody(extractedFinal, input.segments, { isStreaming: false })
  }
}

/** 还有未预热的相邻行时继续排下一个 idle 切片 */
export function shouldContinueHistoricalAnswerWarm(input: { remaining: number }): boolean {
  return input.remaining > 0
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
