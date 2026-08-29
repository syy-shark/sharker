/**
 * 打开长线程时按字节预算瘦身：用户/助手正文走快路径，大段命令输出与推理点开再取
 * （对标 Codex #38653 / “older details only on demand”，约 50KiB 人类可读启动窗）。
 * @see shared/ARCH.md
 */
import type { AssistantMeta, ChatMessage, TurnSegment } from './types'

/** 启动窗人类可读内容上限（官方建议约 50KiB） */
export const TRANSCRIPT_BOOTSTRAP_BYTES = 50 * 1024

/** 超过该字符数的工具输出改占位，点开再取 */
export const DEFER_TOOL_OUTPUT_CHARS = 2_000

/** 超过该字符数的思考原文改占位 */
export const DEFER_THINKING_CHARS = 2_000

/** UTF-8 字节数，给启动窗预算用 */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** 消息是否抽掉了输出/思考原文（落盘时必须跳过，以免写成空壳） */
export function messageHasDeferredHydration(message: ChatMessage): boolean {
  if ((message.meta?.thinkingPreviewDeferred ?? 0) > 0) return true
  return Boolean(
    message.meta?.segments?.some(
      (s) => (s.resultOutputDeferred ?? 0) > 0 || (s.contentDeferred ?? 0) > 0
    )
  )
}

/**
 * 从新到旧累加预算：先保住正文，超限或过长的命令输出 / 思考改占位。
 */
export function slimMessagesForUi(
  messages: readonly ChatMessage[],
  budget: number = TRANSCRIPT_BOOTSTRAP_BYTES
): ChatMessage[] {
  let used = 0
  const out: ChatMessage[] = new Array(messages.length)
  for (let i = messages.length - 1; i >= 0; i--) {
    const kept = slimMessageForUi(messages[i], used < budget)
    used += kept.bytes
    out[i] = kept.message
  }
  return out
}

/** 用库里的完整消息补回占位字段，其它 UI 状态不动 */
export function mergeHydratedMessage(current: ChatMessage, full: ChatMessage): ChatMessage {
  if (current.id !== full.id) return current
  return full
}

/** 单条：正文必留；超预算或过长的输出/思考改占位 */
function slimMessageForUi(
  message: ChatMessage,
  underBudget: boolean
): { message: ChatMessage; bytes: number } {
  let bytes = utf8ByteLength(message.content || '')
  if (message.role === 'user' || !message.meta) return { message, bytes }

  const segs = message.meta.segments
  let changed = false
  const nextSegs = segs?.map((segment) => {
    let next = segment
    if (segment.kind === 'thinking' && segment.content) {
      if (!underBudget || segment.content.length > DEFER_THINKING_CHARS) {
        next = {
          ...next,
          content: '',
          contentDeferred: utf8ByteLength(segment.content)
        }
        changed = true
      } else {
        bytes += utf8ByteLength(segment.content)
      }
    }
    if (segment.resultOutput) {
      if (!underBudget || segment.resultOutput.length > DEFER_TOOL_OUTPUT_CHARS) {
        next = {
          ...next,
          resultOutput: '',
          resultOutputDeferred: utf8ByteLength(segment.resultOutput)
        }
        changed = true
      } else {
        bytes += utf8ByteLength(segment.resultOutput)
      }
    }
    return next
  })

  let thinkingPreview = message.meta.thinkingPreview
  let thinkingPreviewDeferred = message.meta.thinkingPreviewDeferred
  if (thinkingPreview && (!underBudget || thinkingPreview.length > DEFER_THINKING_CHARS)) {
    thinkingPreviewDeferred = utf8ByteLength(thinkingPreview)
    thinkingPreview = undefined
    changed = true
  } else if (thinkingPreview) {
    bytes += utf8ByteLength(thinkingPreview)
  }

  if (!changed) return { message, bytes }
  const meta: AssistantMeta = {
    ...message.meta,
    segments: nextSegs,
    thinkingPreview,
    thinkingPreviewDeferred
  }
  return { message: { ...message, meta }, bytes }
}

/** 过程行是否还有未取回的命令输出 */
export function segmentHasDeferredOutput(segment: Pick<TurnSegment, 'resultOutput' | 'resultOutputDeferred'>): boolean {
  return (segment.resultOutputDeferred ?? 0) > 0 && !String(segment.resultOutput || '').trim()
}

/** 思考原文是否还在库里、点开再取 */
export function messageHasDeferredThinking(message: ChatMessage): boolean {
  if ((message.meta?.thinkingPreviewDeferred ?? 0) > 0 && !String(message.meta?.thinkingPreview || '').trim()) {
    return true
  }
  return Boolean(
    message.meta?.segments?.some(
      (s) => s.kind === 'thinking' && (s.contentDeferred ?? 0) > 0 && !String(s.content || '').trim()
    )
  )
}

/**
 * 模型 / 压缩 / 分叉 / `/status` / `/feedback` 要不要回库取未瘦身全文。
 * UI 尾页或 ⌘↑ 瘦身全线程后，React 里可能仍是占位，不能当模型历史或用量。
 */
export function shouldReloadUnslimmedHistory(input: {
  historyStartSeq: number
  messages: readonly ChatMessage[]
}): boolean {
  if (input.historyStartSeq > 0) return true
  return input.messages.some(messageHasDeferredHydration)
}
