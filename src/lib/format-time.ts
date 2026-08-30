/**
 * 对话列表 last-active 相对时间
 * 对标 Codex Desktop recents：`6 min` / `3 days ago`，用 updatedAt 不用 createdAt
 * @see src/lib/ARCH.md
 */

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

function formatCalendarDay(updatedAt: number, now: number): string {
  const d = new Date(updatedAt)
  const n = new Date(now)
  if (d.getFullYear() === n.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 侧栏 recents 可见戳。`now` 可注入以免测试跟墙钟跑。无 1s 心跳。 */
export function formatLastActiveTime(updatedAt: number, now = Date.now()): string {
  const diff = Math.max(0, now - updatedAt)
  if (diff < MINUTE_MS) return 'Just now'
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} min`
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} hr`
  if (diff < WEEK_MS) {
    const days = Math.floor(diff / DAY_MS)
    return days === 1 ? '1 day ago' : `${days} days ago`
  }
  return formatCalendarDay(updatedAt, now)
}

/** 与 formatLastActiveTime 相同；保留给旧调用点 */
export function formatConversationTime(updatedAt: number, now = Date.now()): string {
  return formatLastActiveTime(updatedAt, now)
}
