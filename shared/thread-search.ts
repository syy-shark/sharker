/**
 * 线程内查找：在用户/助手消息正文里定位查询。
 * @see shared/ARCH.md
 */

/** 一条可跳转的命中（同一条消息可有多处） */
export interface ThreadSearchHit {
  messageId: string
  index: number
  /** 该消息内第几处（从 0） */
  occurrence: number
  start: number
  end: number
}

/** 大小写不敏感、不重叠的全部出现 */
export function findAllOccurrences(
  haystack: string,
  query: string
): Array<{ start: number; end: number }> {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return []
  const lower = String(haystack ?? '').toLowerCase()
  const hits: Array<{ start: number; end: number }> = []
  let from = 0
  while (from < lower.length) {
    const at = lower.indexOf(q, from)
    if (at < 0) break
    hits.push({ start: at, end: at + q.length })
    from = at + q.length
  }
  return hits
}

/** 把扁平偏移映射到分段文本（给可见 DOM 高亮用） */
export function locateFlatRange(
  lengths: number[],
  start: number,
  end: number
): { startIndex: number; startOffset: number; endIndex: number; endOffset: number } | null {
  if (start < 0 || end <= start) return null
  let cursor = 0
  let startIndex = -1
  let startOffset = 0
  let endIndex = -1
  let endOffset = 0
  for (let i = 0; i < lengths.length; i++) {
    const len = Math.max(0, lengths[i] ?? 0)
    const next = cursor + len
    if (startIndex < 0 && start < next) {
      startIndex = i
      startOffset = start - cursor
    }
    if (end <= next) {
      endIndex = i
      endOffset = end - cursor
      break
    }
    cursor = next
  }
  if (startIndex < 0 || endIndex < 0) return null
  return { startIndex, startOffset, endIndex, endOffset }
}

/** 在消息列表里找 query（大小写不敏感；一句话多处各算一次，对标 Codex Find next） */
export function findInThread(
  messages: Array<{ id: string; content: string }>,
  query: string
): ThreadSearchHit[] {
  const q = query.trim()
  if (!q) return []
  const hits: ThreadSearchHit[] = []
  messages.forEach((m, index) => {
    findAllOccurrences(m.content || '', q).forEach((occ, occurrence) => {
      hits.push({
        messageId: m.id,
        index,
        occurrence,
        start: occ.start,
        end: occ.end
      })
    })
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
