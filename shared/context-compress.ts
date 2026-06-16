/**
 * 上下文达 85% 阈值时自动压缩历史。
 * 详见 shared/README.md
 */
import type { AppSettings, ChatMessage } from './types'
import { resolveContextLimit } from './context-limit'
import { estimateContextUsage } from './token-estimate'

/** 占用率达此比例且消息足够多时触发压缩 */
export const CONTEXT_COMPRESS_THRESHOLD = 0.85
/** 压缩后期望回落到的占用比例（供 UI 参考） */
export const CONTEXT_COMPRESS_TARGET = 0.55
const KEEP_RECENT_MESSAGES = 10

/** 上下文压缩操作的完整结果 */
export interface ContextCompressResult {
  messages: ChatMessage[]
  compressed: boolean
  removedCount: number
  summary?: string
  beforeTokens: number
  afterTokens: number
  limit: number
}

/** 从设置中取当前激活的 Provider */
function pickProvider(settings: AppSettings) {
  const p = settings.providers.find((x) => x.id === settings.activeProviderId)
  return p
}

/** 需同时满足占用率阈值且保留最近 KEEP_RECENT_MESSAGES 条原文 */
export function shouldCompressContext(
  settings: AppSettings,
  messages: ChatMessage[],
  extraText = ''
): { needed: boolean; usage: number; limit: number; ratio: number } {
  const provider = pickProvider(settings)
  const { limit } = resolveContextLimit(provider?.model ?? '', provider?.contextWindow)
  const usage = estimateContextUsage(messages, '', extraText).total
  const ratio = limit > 0 ? usage / limit : 0
  return {
    needed: ratio >= CONTEXT_COMPRESS_THRESHOLD && messages.length > KEEP_RECENT_MESSAGES + 2,
    usage,
    limit,
    ratio
  }
}

/** 将待压缩消息拼成摘要用的对话文本 */
function buildTranscript(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const role = m.role === 'user' ? '用户' : '助手'
      const body = m.content.replace(/\s+/g, ' ').trim().slice(0, 800)
      return `${role}: ${body}`
    })
    .join('\n')
}

/** 摘要生成回调（由主进程注入 simpleCompletion） */
export type SummarizeFn = (settings: AppSettings, transcript: string) => Promise<string>

/** 达阈值时用模型摘要旧消息，保留最近 KEEP_RECENT_MESSAGES 条 */
export async function compressContextIfNeeded(
  settings: AppSettings,
  messages: ChatMessage[],
  summarize: SummarizeFn,
  extraText = ''
): Promise<ContextCompressResult> {
  const provider = pickProvider(settings)
  const { limit } = resolveContextLimit(provider?.model ?? '', provider?.contextWindow)
  const before = estimateContextUsage(messages, '', extraText).total

  const check = shouldCompressContext(settings, messages, extraText)
  if (!check.needed) {
    return {
      messages,
      compressed: false,
      removedCount: 0,
      beforeTokens: before,
      afterTokens: before,
      limit
    }
  }

  const old = messages.slice(0, -KEEP_RECENT_MESSAGES)
  const recent = messages.slice(-KEEP_RECENT_MESSAGES)
  const transcript = buildTranscript(old)

  let summary: string
  try {
    summary = await summarize(
      settings,
      `请将以下对话历史压缩为简洁的中文摘要，保留：用户目标、已做决策、文件路径、未完成事项。不超过 600 字。\n\n${transcript}`
    )
  } catch (e) {
    const fallback = old
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => m.content.slice(0, 120))
      .join('；')
    summary = fallback || '（较早对话已省略）'
  }

  const summaryMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: `【对话摘要】\n${summary.trim()}`
  }

  const compressed = [summaryMsg, ...recent]
  const after = estimateContextUsage(compressed, '', extraText).total

  // 摘要未显著减 token 时放弃压缩，避免白占一轮模型调用
  if (after >= before * 0.95) {
    return {
      messages,
      compressed: false,
      removedCount: 0,
      beforeTokens: before,
      afterTokens: before,
      limit
    }
  }

  return {
    messages: compressed,
    compressed: true,
    removedCount: old.length,
    summary: summary.trim(),
    beforeTokens: before,
    afterTokens: after,
    limit
  }
}
