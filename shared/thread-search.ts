/**
 * 线程内查找：在用户/助手消息正文里定位查询。
 * 分页线程盘上检索与内存/直播命中合并（对标 Codex #33907）。
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
  /** 盘上 seq，给分页线程跳到未加载的更早命中 */
  seq?: number
}

/** ILIKE 模式转义，避免用户输入 `%` / `_` 当通配 */
export function escapeLikePattern(raw: string): string {
  return String(raw ?? '').replace(/[\\%_]/g, (ch) => `\\${ch}`)
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
  messages: Array<{ id: string; content: string; seq?: number }>,
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
        end: occ.end,
        seq: m.seq
      })
    })
  })
  return hits
}

/**
 * 内存命中优先（含直播行），盘上只补尚未加载的更早消息
 * （对标 Codex #33907 thread/searchOccurrences，不回放整段线程）。
 */
export function mergeThreadSearchHits(
  memory: readonly ThreadSearchHit[],
  disk: readonly ThreadSearchHit[]
): ThreadSearchHit[] {
  const loaded = new Set(memory.map((h) => h.messageId))
  const extra = disk
    .filter((h) => !loaded.has(h.messageId))
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.start - b.start)
  return extra.concat(memory)
}

/** 当前命中还在未加载的更早页里，需要先揭页再滚 */
export function findHitNeedsHistory(
  hit: Pick<ThreadSearchHit, 'messageId'> | undefined,
  loadedIds: Iterable<string>
): boolean {
  if (!hit) return false
  const ids = loadedIds instanceof Set ? loadedIds : new Set(loadedIds)
  return !ids.has(hit.messageId)
}

/** 命中列表变长/变短后保住同一处（messageId + occurrence） */
export function resolveFindHitIndex(
  hits: readonly ThreadSearchHit[],
  current: Pick<ThreadSearchHit, 'messageId' | 'occurrence'> | null | undefined,
  fallback = 0
): number {
  if (!hits.length) return 0
  if (!current) return Math.min(Math.max(0, fallback), hits.length - 1)
  const idx = hits.findIndex(
    (h) => h.messageId === current.messageId && h.occurrence === current.occurrence
  )
  if (idx >= 0) return idx
  return Math.min(Math.max(0, fallback), hits.length - 1)
}

/** ⌘F 用当前划选预填查找（对标 Codex Find starts with current text selection） */
export function seedFindQuery(selected: string, max = 200): string {
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 200
  return String(selected ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, cap)
}
