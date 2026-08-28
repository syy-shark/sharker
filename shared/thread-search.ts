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
