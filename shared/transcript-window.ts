/**
 * 长线程只挂最近一段对话，上滑再揭示更早消息（对标 Codex
 * “older history fetched as needed” / scroll-to-top 分页；不预拉全量、不设「加载更早」按钮）。
 * 揭示更早/更新按内容柱 scrollHeight 差补 scrollTop，不按未测行高卸顶。
 * ⌘↑ / 查找命中走独立 `historyHead` 最旧或命中页，禁止把瘦身全文灌进尾页 `messages`。
 * 靠近顶预取更早页（`TRANSCRIPT_PREFETCH_PX`），揭开套同一页。
 * @see shared/ARCH.md
 */

type ChatMessageLike = { id: string }

/** 新开会话先画的最近消息条数（消息比官方 turn 更细，略多于 5 turn） */
export const TRANSCRIPT_TAIL = 40

/** 每次上滑到顶揭示的更早消息条数 */
export const TRANSCRIPT_PAGE = 30

/** 距滚动顶多少像素视为「到顶」，触发揭示 */
export const TRANSCRIPT_REVEAL_PX = 80

/** 距顶更远就预取更早页并 idle 预热，揭开时不再冷挂载 */
export const TRANSCRIPT_PREFETCH_PX = 400

/** DOM 最多挂这么多行，避免 ⌘↑ / 读到顶把整段灌进 React（官方分页也不一次铺开） */
export const TRANSCRIPT_MAX_MOUNTED = TRANSCRIPT_TAIL + TRANSCRIPT_PAGE

/**
 * 贴底时的窗口起点：只留最近 `tail` 条。
 */
export function stickTranscriptWindowStart(
  total: number,
  tail: number = TRANSCRIPT_TAIL
): number {
  if (total <= 0) return 0
  return Math.max(0, total - tail)
}

/**
 * 读历史时钉住的起点：不超过贴底窗，也不小于 0。
 * `pinned == null` 表示跟贴底窗走（新消息进来时丢掉更早的尾外行）。
 */
export function effectiveTranscriptWindowStart(
  total: number,
  pinned: number | null | undefined,
  tail: number = TRANSCRIPT_TAIL
): number {
  const stick = stickTranscriptWindowStart(total, tail)
  if (pinned == null) return stick
  return Math.max(0, Math.min(Math.floor(pinned), stick))
}

/**
 * 上滑一页后的钉住起点。
 */
export function revealOlderWindowStart(
  currentStart: number,
  page: number = TRANSCRIPT_PAGE
): number {
  return Math.max(0, currentStart - Math.max(0, page))
}

/**
 * 让指定下标进入窗口（查找 / 回编）：从该条起向最新画，仍受挂载上限约束。
 */
export function windowStartToIncludeIndex(currentStart: number, index: number): number {
  if (index < 0) return currentStart
  return Math.min(currentStart, index)
}

/** 窗口右端（不含）：从起点最多再挂 `maxMounted` 条 */
export function effectiveTranscriptWindowEnd(
  total: number,
  start: number,
  maxMounted: number = TRANSCRIPT_MAX_MOUNTED
): number {
  const s = Math.max(0, Math.floor(start))
  const t = Math.max(0, Math.floor(total))
  if (t <= maxMounted) return t
  return Math.min(t, s + Math.max(1, Math.floor(maxMounted)))
}

/** 下翻到窗底且后面还有更新消息时，把窗口滑向尾页 */
export function shouldRevealNewerTranscript(input: {
  distanceFromBottom: number
  locked: boolean
  canReveal: boolean
  revealPx?: number
}): boolean {
  if (!input.canReveal || !input.locked) return false
  return input.distanceFromBottom <= (input.revealPx ?? TRANSCRIPT_REVEAL_PX)
}

/**
 * 揭示更早或更新后，按内容柱 scrollHeight 差补 scrollTop。
 * 上揭增高则下移镜头，下揭卸顶则上移镜头。估高为 0 时不能跳过补偿。
 */
export function nextRevealPreserveScrollTop(input: {
  previousHeight: number
  nextHeight: number
  scrollTop: number
}): number {
  const next = input.scrollTop + (input.nextHeight - input.previousHeight)
  return next > 0 ? next : 0
}

export function revealNewerWindowStart(
  currentStart: number,
  total: number,
  page: number = TRANSCRIPT_PAGE,
  tail: number = TRANSCRIPT_TAIL
): number {
  const stick = stickTranscriptWindowStart(total, tail)
  return Math.min(stick, Math.max(0, currentStart) + Math.max(0, page))
}

/**
 * 查找 / 回编：命中已在窗内则不动；在窗前把起点前移；在窗后把窗口滑到该条（不灌到最新）。
 */
export function windowStartToCoverIndex(
  total: number,
  pinned: number | null | undefined,
  index: number,
  maxMounted: number = TRANSCRIPT_MAX_MOUNTED
): number {
  if (index < 0) return effectiveTranscriptWindowStart(total, pinned)
  const start = effectiveTranscriptWindowStart(total, pinned)
  const end = effectiveTranscriptWindowEnd(total, start, maxMounted)
  if (index >= start && index < end) return start
  if (index < start) return index
  const stick = stickTranscriptWindowStart(total)
  if (index >= stick) return stick
  return Math.min(index, stick)
}

export function windowIncludesLatest(total: number, end: number): boolean {
  return Math.floor(end) >= Math.floor(total)
}

/**
 * ⌘↑ 要不要立刻取最旧一页（`historyHead`）。直播中灌进 React 会卡住贴底（官方也不在 turn 中抽干）。
 * 收束后再取；直播中只滚到当前已加载窗顶。已在最旧页则只滚动。
 */
export function shouldFetchSlimHistoryOnJumpTop(input: {
  hasOlder: boolean
  loading?: boolean
  alreadyAtHead?: boolean
}): boolean {
  return Boolean(input.hasOlder) && !input.loading && !input.alreadyAtHead
}

/** ⌘↑：只取线程最旧一段，不把尾页或中间段灌进 `messages` */
export function headRangeForJumpTop(
  tailStartSeq: number,
  maxMounted: number = TRANSCRIPT_MAX_MOUNTED
): { fromSeq: number; toSeq: number } | null {
  const tail = Math.max(0, Math.floor(tailStartSeq))
  if (tail <= 0) return null
  return { fromSeq: 0, toSeq: Math.min(tail, Math.max(1, Math.floor(maxMounted))) }
}

/**
 * 查找命中落在尾页之前：只取命中起最多 `maxMounted` 条，不揭开 [hit, tail)。
 */
export function headRangeForFindHit(
  hitSeq: number,
  tailStartSeq: number,
  maxMounted: number = TRANSCRIPT_MAX_MOUNTED
): { fromSeq: number; toSeq: number } | null {
  const hit = Math.max(0, Math.floor(hitSeq))
  const tail = Math.max(0, Math.floor(tailStartSeq))
  if (hit >= tail) return null
  return { fromSeq: hit, toSeq: Math.min(tail, hit + Math.max(1, Math.floor(maxMounted))) }
}

/** 头页下翻：取 [headEnd, tail) 里下一页；已接上尾页则返回 null（改回尾页） */
export function nextHeadRange(
  headEndSeq: number,
  tailStartSeq: number,
  page: number = TRANSCRIPT_PAGE
): { fromSeq: number; toSeq: number } | null {
  const fromSeq = Math.max(0, Math.floor(headEndSeq))
  const tail = Math.max(0, Math.floor(tailStartSeq))
  if (fromSeq >= tail) return null
  const toSeq = Math.min(tail, fromSeq + Math.max(1, Math.floor(page)))
  if (toSeq <= fromSeq) return null
  return { fromSeq, toSeq }
}

/** 头页上翻：取 [headStart - page, headStart) */
export function prevHeadRange(
  headStartSeq: number,
  page: number = TRANSCRIPT_PAGE
): { fromSeq: number; toSeq: number } | null {
  const toSeq = Math.max(0, Math.floor(headStartSeq))
  if (toSeq <= 0) return null
  const fromSeq = Math.max(0, toSeq - Math.max(1, Math.floor(page)))
  if (toSeq <= fromSeq) return null
  return { fromSeq, toSeq }
}

/** 头页追加后若超过挂载上限，丢掉最旧若干条 */
export function slideHeadAfterAppend(
  prevStart: number,
  prevLen: number,
  appended: number,
  maxMounted: number = TRANSCRIPT_MAX_MOUNTED
): { startSeq: number; keepFrom: number } {
  const total = Math.max(0, Math.floor(prevLen)) + Math.max(0, Math.floor(appended))
  const cap = Math.max(1, Math.floor(maxMounted))
  if (total <= cap) return { startSeq: Math.max(0, Math.floor(prevStart)), keepFrom: 0 }
  const drop = total - cap
  return { startSeq: Math.max(0, Math.floor(prevStart)) + drop, keepFrom: drop }
}

/** 头页前插后若超过挂载上限，丢掉最新若干条 */
export function slideHeadAfterPrepend(
  prevEnd: number,
  prevLen: number,
  prepended: number,
  maxMounted: number = TRANSCRIPT_MAX_MOUNTED
): { endSeq: number; keepLen: number } {
  const extra = Math.max(0, Math.floor(prepended))
  const total = Math.max(0, Math.floor(prevLen)) + extra
  const cap = Math.max(1, Math.floor(maxMounted))
  if (total <= cap) return { endSeq: Math.max(0, Math.floor(prevEnd)), keepLen: total }
  return {
    endSeq: Math.max(0, Math.floor(prevEnd) - (total - cap)),
    keepLen: cap
  }
}

/**
 * 切回会话时要不要钉窗口：贴底的仍跟尾，读历史的恢复当时的起点。
 */
export function restoreTranscriptWindowStart(snap: {
  stickToBottom: boolean
  userLocked: boolean
  transcriptWindowStart?: number | null
} | null | undefined): number | null {
  if (!snap || (snap.stickToBottom && !snap.userLocked)) return null
  const start = snap.transcriptWindowStart
  if (start == null || !Number.isFinite(start)) return null
  return Math.max(0, Math.floor(start))
}

/**
 * 用户锁贴底且滚到顶、还有更早消息时才揭示（贴底增高不触发，避免官方 resume 后抽干全历史）。
 */
export function shouldRevealOlderTranscript(input: {
  scrollTop: number
  locked: boolean
  canReveal: boolean
  revealPx?: number
}): boolean {
  if (!input.canReveal || !input.locked) return false
  return input.scrollTop <= (input.revealPx ?? TRANSCRIPT_REVEAL_PX)
}

/**
 * 内存窗已到头、盘上还有更早页时，改为取一页而不是再切片。
 */
export function shouldFetchOlderHistoryPage(input: {
  scrollTop: number
  locked: boolean
  windowStart: number
  hasOlder: boolean
  revealPx?: number
}): boolean {
  return shouldRevealOlderTranscript({
    scrollTop: input.scrollTop,
    locked: input.locked,
    canReveal: input.hasOlder && input.windowStart <= 0,
    revealPx: input.revealPx
  })
}

/** 已锁阅读且靠近顶、盘上还有更早页时，先取页并预热，不进 16ms */
export function shouldPrefetchOlderHistoryPage(input: {
  scrollTop: number
  locked: boolean
  windowStart: number
  hasOlder: boolean
  loading?: boolean
  prefetchPx?: number
}): boolean {
  if (input.loading) return false
  return shouldFetchOlderHistoryPage({
    scrollTop: input.scrollTop,
    locked: input.locked,
    windowStart: input.windowStart,
    hasOlder: input.hasOlder,
    revealPx: input.prefetchPx ?? TRANSCRIPT_PREFETCH_PX
  })
}

/** 预取缓存与当前要揭开的页同一对话、同一起点才套用 */
export function shouldUsePrefetchedOlderPage(input: {
  cachedConvId?: string | null
  cachedFromSeq?: number
  convId?: string | null
  fromSeq: number
}): boolean {
  return Boolean(
    input.cachedConvId &&
      input.convId &&
      input.cachedConvId === input.convId &&
      input.cachedFromSeq === input.fromSeq
  )
}

/**
 * 把更早一页接到当前列表前面，按 id 去重。
 */
export function prependHistoryPage(
  current: readonly ChatMessageLike[],
  older: readonly ChatMessageLike[]
): ChatMessageLike[] {
  if (!older.length) return [...current]
  const seen = new Set(current.map((m) => m.id))
  const unique = older.filter((m) => m.id && !seen.has(m.id))
  return unique.length ? [...unique, ...current] : [...current]
}

/**
 * 全量（或更长前缀）与当前未落盘的新消息合并：已有 id 以已加载为准，只追加未见过的尾。
 */
export function mergeConversationHistory(
  loaded: readonly ChatMessageLike[],
  current: readonly ChatMessageLike[]
): ChatMessageLike[] {
  if (!loaded.length) return [...current]
  const seen = new Set(loaded.map((m) => m.id))
  const extra = current.filter((m) => m.id && !seen.has(m.id))
  return extra.length ? [...loaded, ...extra] : [...loaded]
}

/**
 * 前面插入了 `prepended` 条后，钉住的窗口下标跟着后移，镜头不跳。
 */
export function shiftPinnedStartAfterPrepend(
  pinned: number | null | undefined,
  prepended: number
): number | null {
  if (pinned == null || prepended <= 0) return pinned ?? null
  return pinned + prepended
}

/**
 * 取走更早一页后的盘上起点。
 */
export function nextHistoryStartSeq(startSeq: number, prepended: number): number {
  return Math.max(0, Math.floor(startSeq) - Math.max(0, prepended))
}

/**
 * 上滑取更早页：空页 / 失败不得把 `historyStartSeq` 置 0，否则落盘会删中间页。
 * 成功时才前移起点（仅当调用方仍把该页 prepend 进尾页；头页浏览不该改尾页 seq）。
 */
export function historyStartSeqAfterOlderPage(currentStart: number, loadedCount: number): number {
  const start = Math.max(0, Math.floor(currentStart))
  if (loadedCount <= 0) return start
  return nextHistoryStartSeq(start, loadedCount)
}

/** 从尾页上滑：只算头页区间，不改 `historyStartSeq` */
export function olderPageRangeForTail(
  tailStartSeq: number,
  page: number = TRANSCRIPT_PAGE
): { fromSeq: number; toSeq: number } | null {
  return prevHeadRange(tailStartSeq, page)
}
