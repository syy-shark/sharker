/**
 * 消息 hover 时间戳：静态绝对时间，不走「刚刚 / N 秒前」心跳
 * （对标 Codex #23849 hover timestamp；不发明 #28091 常显开关；秒级值不当成毫秒，避免 #17317）。
 * @see shared/ARCH.md
 */

/** 小于该值按 Unix 秒，否则按毫秒 */
const SECOND_MS_CUTOFF = 1e12

/** 把库里的 TIMESTAMPTZ / 数字 / ISO 收成 epoch ms */
export function messageCreatedAtMs(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined
    return value < SECOND_MS_CUTOFF ? Math.round(value * 1000) : Math.round(value)
  }
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) && ms > 0 ? ms : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (/^\d+(\.\d+)?$/.test(trimmed)) return messageCreatedAtMs(Number(trimmed))
    const parsed = Date.parse(trimmed)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  }
  return undefined
}

/** 当天只显示时刻；更早显示月日+时刻。不每秒重算。 */
export function formatMessageTimestamp(
  createdAt: unknown,
  now = Date.now(),
  locales?: Intl.LocalesArgument
): string | null {
  const ms = messageCreatedAtMs(createdAt)
  if (ms == null) return null
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date(now)
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (sameDay) {
    return date.toLocaleTimeString(locales, { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleString(locales, {
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
