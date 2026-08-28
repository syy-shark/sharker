/**
 * `/copy`：复制最近一条已完成的助手正文（对标 Codex /copy · Ctrl+O）。
 * @see shared/ARCH.md
 */

/** 从后往前找非空助手消息 */
export function lastCompletedAssistantText(
  messages: Array<{ role: string; content: string }>
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const text = (m.content || '').trim()
    if (text) return text
  }
  return ''
}
