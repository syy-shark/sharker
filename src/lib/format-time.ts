/**
 * 对话列表相对时间格式化
 * @see src/README.md
 */
export function formatConversationTime(updatedAt: number): string {
  const diff = Math.max(0, Date.now() - updatedAt)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(updatedAt)
  const now = new Date()
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
