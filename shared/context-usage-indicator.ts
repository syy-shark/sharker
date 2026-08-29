/**
 * 输入框上下文用量环（对标 Codex Settings → General → Composer → Show context window usage）。
 * 官方默认关；直播增量单独加，避免每 token 重走整段历史。
 * @see shared/ARCH.md
 */
import type { ChatMessage } from './types'
import { estimateContextUsage, estimateTextTokens, contextUsageRatio } from './token-estimate'
import { formatContextUsage } from './thread-status'

/** 官方自动压缩阈值附近标高用量 */
export const CONTEXT_USAGE_HIGH_RATIO = 0.85

/** 规范化设置；缺省或非法为 false（官方默认关） */
export function parseShowContextWindowUsage(raw: unknown): boolean {
  return raw === true
}

/** 已落盘消息 + 系统开销；不含直播正文 / 草稿 */
export function contextUsageBaseTokens(messages: ChatMessage[]): number {
  return estimateContextUsage(messages, '', '').total
}

/** 直播正文与草稿的增量，给用量环每 token 只加这一截 */
export function contextUsageLiveExtra(streaming: string, draft: string): number {
  return estimateTextTokens(streaming) + estimateTextTokens(draft)
}

/** 环上的用量；limit<=0 时比例为 0 */
export function contextUsageRing(used: number, limit: number, radius = 7): {
  used: number
  limit: number
  ratio: number
  percent: number
  circumference: number
  dashoffset: number
} {
  const ratio = contextUsageRatio(used, limit)
  const circumference = 2 * Math.PI * radius
  const percent = limit > 0 ? Math.min(100, Math.max(0, Math.round((used / limit) * 100))) : 0
  return {
    used,
    limit,
    ratio,
    percent,
    circumference,
    dashoffset: circumference * (1 - ratio)
  }
}

/** 悬停文案与 `/status` 同一套数字 */
export function contextUsageHoverLabel(used: number, limit: number): string {
  return formatContextUsage(used, limit)
}

/** ≥85% 用警告色（对标自动压缩阈值） */
export function shouldPaintContextUsageHigh(used: number, limit: number): boolean {
  return limit > 0 && used / limit >= CONTEXT_USAGE_HIGH_RATIO
}
