/**
 * 对话上下文 token 用量粗估。
 * 详见 shared/README.md
 */
import { TOOL_DEFINITIONS } from '../agent/tool-definitions'
import type { ChatMessage } from './types'

let cachedToolsOverhead = 0

/** 估算 TOOL_DEFINITIONS JSON 的 token 开销（带缓存） */
function estimateToolsSchemaTokens(): number {
  if (cachedToolsOverhead > 0) return cachedToolsOverhead
  try {
    cachedToolsOverhead = estimateTextTokens(JSON.stringify(TOOL_DEFINITIONS))
  } catch {
    cachedToolsOverhead = 6_500
  }
  return cachedToolsOverhead
}

/** 系统提示 + 工具 schema 等固定开销（粗估） */
export function agentContextOverhead(): number {
  return 800 + estimateToolsSchemaTokens()
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g

/** 单段文本 token 粗估：中文按字、英文按约 4 字符 1 token */
export function estimateTextTokens(text: string): number {
  if (!text) return 0
  const cjk = (text.match(CJK_RE) || []).length
  const other = text.length - cjk
  return Math.ceil(cjk + other / 4)
}

const MESSAGE_OVERHEAD = 8

/** 单条消息的 token 粗估（含工具元数据） */
function messageContentTokens(m: ChatMessage): number {
  let n = estimateTextTokens(m.content)
  if (m.toolName) n += estimateTextTokens(m.toolName) + 12
  if (m.toolCallId) n += 16
  if (m.meta?.activities?.length) {
    for (const a of m.meta.activities) {
      n += estimateTextTokens(a.label) + 4
    }
  }
  return n + MESSAGE_OVERHEAD
}

/** 上下文用量分项估算结果 */
export interface ContextUsageEstimate {
  total: number
  messages: number
  draft: number
  overhead: number
  messageCount: number
}

/** 估算当前对话 + 流式 + 草稿 + 系统开销的总 token */
export function estimateContextUsage(
  messages: ChatMessage[],
  streaming: string,
  draftInput: string,
  options?: { includeOverhead?: boolean }
): ContextUsageEstimate {
  const includeOverhead = options?.includeOverhead !== false
  let messagesTokens = estimateTextTokens(streaming)
  let messageCount = streaming ? 1 : 0

  for (const m of messages) {
    messagesTokens += messageContentTokens(m)
    messageCount += 1
  }

  const draft = estimateTextTokens(draftInput)
  const overhead = includeOverhead ? agentContextOverhead() : 0

  return {
    total: messagesTokens + draft + overhead,
    messages: messagesTokens,
    draft,
    overhead,
    messageCount
  }
}

/** 面板与圆环上的占用百分比文案 */
export function formatContextPercent(used: number, limit: number): string {
  if (used <= 0 || limit <= 0) return '0%'
  const ratio = used / limit
  if (ratio < 0.0001) return '<0.01%'
  if (ratio < 0.001) return '<0.1%'
  if (ratio < 0.01) return '<1%'
  if (ratio < 0.1) return `${(ratio * 100).toFixed(1)}%`
  return `${Math.round(ratio * 100)}%`
}

/** 圆环绘制用比例（有用量时保证可见最小弧长） */
export function contextUsageRatio(used: number, limit: number): number {
  if (limit <= 0) return 0
  const ratio = used / limit
  if (used <= 0) return 0
  return Math.min(1, Math.max(ratio, 0.015))
}
