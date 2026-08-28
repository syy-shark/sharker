/**
 * 线程内查找：在用户/助手消息正文里定位查询。
 * @see shared/ARCH.md
 */

/** 一条可跳转的命中 */
export interface ThreadSearchHit {
  messageId: string
  index: number
}

/** 在消息列表里找 query（大小写不敏感） */
export function findInThread(
  messages: Array<{ id: string; content: string }>,
  query: string
): ThreadSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: ThreadSearchHit[] = []
  messages.forEach((m, index) => {
    if ((m.content || '').toLowerCase().includes(q)) {
      hits.push({ messageId: m.id, index })
    }
  })
  return hits
}

/** ⌘F 用当前划选预填查找（对标 Codex Find starts with current text selection） */
export function seedFindQuery(selected: string, max = 200): string {
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 200
  return String(selected ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, cap)
}
