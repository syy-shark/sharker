/**
 * 长线程只挂最近一段对话，上滑再揭示更早消息（对标 Codex
 * “older history fetched as needed” / scroll-to-top 分页；不预拉全量、不设「加载更早」按钮）。
 * @see shared/ARCH.md
 */

type ChatMessageLike = { id: string }

/** 新开会话先画的最近消息条数（消息比官方 turn 更细，略多于 5 turn） */
export const TRANSCRIPT_TAIL = 40

/** 每次上滑到顶揭示的更早消息条数 */
export const TRANSCRIPT_PAGE = 30

/** 距滚动顶多少像素视为「到顶」，触发揭示 */
export const TRANSCRIPT_REVEAL_PX = 80

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
 * ⌘↑ 要不要立刻揭开已瘦身全文。直播中灌进 React 会卡住贴底（官方也不在 turn 中抽干）。
 * 收束后再揭开；直播中只滚到当前已加载窗顶。
 */
export function shouldFetchSlimHistoryOnJumpTop(input: {
  hasOlder: boolean
  loading?: boolean
}): boolean {
  return Boolean(input.hasOlder) && !input.loading
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
