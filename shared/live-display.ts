/**
 * 直播过程展示头：从可见步骤推导当前头标签/详情。
 * 与 TurnFlow 渲染共用，保证“头 = 当前步骤”。
 * 思考原文不当时间线标题；展示为 Cursor 式可折叠 Thought，不是灰卡片倾倒。
 */

export type ThinkPreviewSource = {
  kind?: string
  content?: string
}

/** 合并 thinking 段原文（直播预览用，不当主回答） */
export function liveThinkingText(segments: ThinkPreviewSource[]): string {
  return segments
    .filter((s) => s.kind === 'thinking')
    .map((s) => s.content ?? '')
    .join('')
}

/** 像源码/CSS 声明的行：不当思考旁白展示 */
export function isCodeyThinkLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (/^[{}();,[\]</>]*$/.test(t)) return true
  if (/^<\/?[a-zA-Z][\w:-]*[\s>/]/.test(t)) return true
  if (/^[.#@][\w-]*\s*\{/.test(t)) return true
  if (
    /^(background|background-color|color|cursor|font-size|font-family|font-weight|margin|padding|display|width|height|min-width|max-width|min-height|max-height|border|border-radius|position|flex|flex-direction|grid|grid-template|transform|opacity|z-index|overflow|align-items|justify-content|gap|top|left|right|bottom|inset|box-shadow|letter-spacing|line-height|white-space|text-align|pointer-events|user-select|transition|animation)\s*:/i.test(
      t
    )
  ) {
    return true
  }
  if (/^`{3}/.test(t)) return true
  return false
}

/**
 * 思考正文：保留叙事尾部，丢掉末尾 CSS/HTML 草稿。
 * 大半都是源码时返回空，UI 只留「思考中 / 已思考」折叠条。
 */
export function liveThoughtBody(
  text: string,
  opts?: { maxChars?: number }
): string {
  const maxChars = opts?.maxChars ?? 2200
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
  if (!normalized) return ''
  const lines = normalized.split('\n')
  while (lines.length > 0 && isCodeyThinkLine(lines[lines.length - 1] || '')) {
    lines.pop()
  }
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) lines.pop()
  const kept = lines.filter((line) => line.trim())
  if (kept.length === 0) return ''
  const codey = kept.filter((line) => isCodeyThinkLine(line)).length
  if (codey / kept.length > 0.6) return ''
  let out = lines.join('\n').trim()
  if (out.length > maxChars) {
    out = out.slice(-maxChars)
    const cut = out.search(/\s/)
    if (cut > 0 && cut < 32) out = out.slice(cut + 1)
    out = `…${out.trimStart()}`
  }
  return out
}

/**
 * 思考预览短窗（测试与旧路径）。新 UI 用 liveThoughtBody。
 */
export function rollingThinkPreview(
  text: string,
  opts?: { maxLines?: number; maxChars?: number }
): string {
  const maxLines = opts?.maxLines ?? 8
  const maxChars = opts?.maxChars ?? 720
  const body = liveThoughtBody(text, { maxChars: maxChars * 2 })
  if (!body) return ''
  const lines = body.split('\n').filter((line) => line.trim())
  const window = lines.slice(-Math.max(1, maxLines))
  let out = window.join('\n')
  if (out.length > maxChars) {
    out = out.slice(-maxChars)
    const cut = out.search(/\s/)
    if (cut > 0 && cut < 24) out = out.slice(cut + 1)
    out = `…${out.trimStart()}`
  }
  return out
}

/** 有真实结构节点才画 iframe，避免半截 CSS 看起来像代码卡片 */
export function isInlineDemoPaintable(html: string): boolean {
  const t = html.trim()
  if (!t || t === '<!-- streaming -->') return false
  if (t.length < 48) return false
  return /<(?:div|section|article|main|header|footer|nav|aside|p|h[1-6]|ul|ol|li|table|svg|canvas|button|figure|img|video|pre|form|input|label)\b/i.test(
    t
  )
}

const DEMO_HEIGHT_MIN = 48
const DEMO_HEIGHT_MAX = 1200
const DEMO_HEIGHT_CACHE_LIMIT = 32
const demoHeightCache = new Map<string, number>()

function clampDemoHeight(value: number): number {
  if (!Number.isFinite(value)) return DEMO_HEIGHT_MIN
  return Math.min(DEMO_HEIGHT_MAX, Math.max(DEMO_HEIGHT_MIN, Math.round(value)))
}

function demoHeightCacheKey(html: string): string {
  const text = html.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return `${text.length}:${text.slice(0, 240)}`
}

/** 从声明高度 / 块数量估 iframe 首帧高，避免 48px 再猛涨把贴底顶跳 */
export function estimateInlineDemoHeight(html: string): number {
  const text = html.trim()
  if (!text || text === '<!-- streaming -->') return DEMO_HEIGHT_MIN

  let explicit = 0
  for (const match of text.matchAll(/(?:^|[\s;{"'])(?:min-)?height\s*:\s*(\d{2,4})px/gi)) {
    const n = Number(match[1])
    if (n >= DEMO_HEIGHT_MIN && n <= 4000) explicit = Math.max(explicit, n)
  }
  for (const match of text.matchAll(
    /<(?:canvas|svg|img|video)\b[^>]*\bheight\s*=\s*["']?(\d{2,4})/gi
  )) {
    const n = Number(match[1])
    if (n >= DEMO_HEIGHT_MIN && n <= 4000) explicit = Math.max(explicit, n)
  }
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)/i.exec(text)
  if (viewBox) {
    const n = Math.abs(Number(viewBox[1]))
    if (n >= DEMO_HEIGHT_MIN && n <= 4000) explicit = Math.max(explicit, n)
  }
  if (explicit > 0) return clampDemoHeight(explicit + 16)
  if (!isInlineDemoPaintable(text)) return DEMO_HEIGHT_MIN

  const blocks = text.match(
    /<(?:div|section|article|main|header|footer|p|h[1-6]|li|tr|pre|blockquote|figure|button|label|svg|canvas|img)\b/gi
  )
  const blockCount = blocks?.length ?? 1
  const lines = text.split('\n').length
  return clampDemoHeight(Math.max(blockCount * 28, lines * 18, 96))
}

export function readCachedInlineDemoHeight(html: string): number | null {
  const key = demoHeightCacheKey(html)
  if (!key) return null
  return demoHeightCache.get(key) ?? null
}

export function writeCachedInlineDemoHeight(html: string, height: number): number {
  const key = demoHeightCacheKey(html)
  const next = clampDemoHeight(height)
  if (!key) return next
  demoHeightCache.delete(key)
  demoHeightCache.set(key, next)
  while (demoHeightCache.size > DEMO_HEIGHT_CACHE_LIMIT) {
    const oldest = demoHeightCache.keys().next().value
    if (oldest === undefined) break
    demoHeightCache.delete(oldest)
  }
  return next
}

export function clearInlineDemoHeightCache(): void {
  demoHeightCache.clear()
}

/** 直播首帧：缓存实测高，否则用估高，流式至少 96 */
export function seedInlineDemoHeight(html: string, streaming = false): number {
  return Math.max(
    readCachedInlineDemoHeight(html) ?? 0,
    estimateInlineDemoHeight(html),
    streaming ? 96 : DEMO_HEIGHT_MIN
  )
}

export type LiveDisplayStep = {
  id: string
  title: string
  detail?: string
  status: 'active' | 'done' | 'error' | 'cancelled' | string
  kind?: string
}

export type LiveHead = {
  label: string
  detail?: string
  step: LiveDisplayStep | null
}

/** 当前头步骤：优先最后一个 active，否则最后一项 */
export function selectLiveHeadStep(steps: LiveDisplayStep[]): LiveDisplayStep | null {
  if (!steps.length) return null
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.status === 'active') return steps[i]
  }
  return steps[steps.length - 1] || null
}

export function buildLiveHead(options: {
  steps: LiveDisplayStep[]
  approvalWaiting?: boolean
  fallbackLabel?: string
}): LiveHead {
  const step = selectLiveHeadStep(options.steps)
  if (options.approvalWaiting) {
    const title = step?.title?.startsWith('等待确认') ? step.title : '等待确认'
    return {
      label: title,
      detail: '高危操作需要你确认后才能继续',
      step
    }
  }
  return {
    label: step?.title?.trim() || options.fallbackLabel || '处理中',
    detail: step?.detail,
    step
  }
}

/**
 * 是否应追加合成「规划下一步」：
 * - 过程已空闲
 * - 已有实质工具/旁白
 * - 末步不是“正在准备…”
 * - 末步标题本身也还不是规划
 */
export function shouldSynthesizePlanning(options: {
  hasActiveWork: boolean
  hasToolOrNarration: boolean
  generatingAnswer: boolean
  approvalWaiting: boolean
  lastStepTitle?: string
}): boolean {
  if (options.approvalWaiting || options.generatingAnswer || options.hasActiveWork) return false
  if (!options.hasToolOrNarration) return false
  const last = (options.lastStepTitle || '').trim()
  if (/正在准备/.test(last)) return false
  if (last.includes('规划下一步')) return false
  return true
}

/**
 * 合成步骤要不要顶掉直播头。
 * 规划 / 生成回答只用来关掉思考占位，不把头闪成「规划下一步」（对标 Codex
 * changelog「flashing thinking summaries」与 #8204 工具间隙不闪 Working）。
 * 审批没有真实步骤时仍要露出「等待确认」。
 */
export function shouldPromoteSyntheticLiveHead(
  kind: 'planning' | 'answer' | 'approval'
): boolean {
  return kind === 'approval'
}

/**
 * 贴底附近的历史行保持真实高度。
 * 不用 `:nth-last-child`：排队气泡与 `.messages-end` 会把旧消息挤进
 * `content-visibility: auto`，直播增高时滚动会跳。
 */
export const NEAR_LIVE_ROW_WINDOW = 8

/**
 * 正文已上屏或回合结束后，把可折叠过程收成「工作了 / 工作中」（对标 Codex Worked for）。
 * 审批/失败行不算可折叠：折叠时仍要露出来。
 */
export function shouldFoldTurnWork(options: {
  contentStreaming: boolean
  isStreaming: boolean
  foldableStepCount: number
}): boolean {
  if (options.foldableStepCount <= 0) return false
  return options.contentStreaming || !options.isStreaming
}

/** 回答刚上屏时收回用户展开的 Thought / Worked for，避免过程区在直播回答上方突然长高 */
export function shouldCollapseProcessOnAnswerStart(
  contentStreaming: boolean,
  wasContentStreaming: boolean
): boolean {
  return contentStreaming && !wasContentStreaming
}

/** 过程区起止：最早 startedAt → 最晚 endedAt */
export function turnProcessBounds(
  segments: Array<{ startedAt?: number; endedAt?: number }>
): { startedAt?: number; endedAt?: number } {
  let startedAt: number | undefined
  let endedAt: number | undefined
  for (const segment of segments) {
    if (segment.startedAt != null) {
      startedAt = startedAt == null ? segment.startedAt : Math.min(startedAt, segment.startedAt)
    }
    if (segment.endedAt != null) {
      endedAt = endedAt == null ? segment.endedAt : Math.max(endedAt, segment.endedAt)
    }
  }
  return { startedAt, endedAt }
}

export function processElapsedSeconds(options: {
  startedAt?: number | null
  endedAt?: number | null
  now?: number
}): number {
  if (options.startedAt == null) return 0
  const end = options.endedAt ?? options.now ?? Date.now()
  return Math.max(0, Math.round((end - options.startedAt) / 1000))
}

/** 直播头 / Worked for 秒表预留「1h 59m」，避免跨分钟换行挤过程区 */
export const ELAPSED_CLOCK_RESERVE_CH = 7

/** 对标 Codex Goal / 长回合秒表：23s · 4m · 1h 9m */
export function formatElapsedClock(seconds: number): string {
  if (seconds < 1) return '<1s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem ? `${hours}h ${rem}m` : `${hours}h`
}

/** 直播过程数组：引用没变就复用同一份，避免回答 token 重挂 TurnFlow */
export function sameRefList<T>(prev: readonly T[] | null | undefined, next: readonly T[]): boolean {
  if (prev === next) return true
  if (!prev || prev.length !== next.length) return false
  return prev.every((item, i) => item === next[i])
}

/** 该历史行是否落在贴底窗口内（0-based index） */
export function isNearLiveMessageRow(
  index: number,
  total: number,
  window = NEAR_LIVE_ROW_WINDOW
): boolean {
  if (total <= 0 || window <= 0) return false
  if (index < 0 || index >= total) return false
  return index >= Math.max(0, total - window)
}

/** 远离贴底窗口后用实测高度当 content-visibility 内在尺寸，避免从 160px 估高跳变 */
export function rowIntrinsicSizeStyle(
  height: number | undefined
): { containIntrinsicSize: string } | undefined {
  if (height == null || height < 1) return undefined
  return { containIntrinsicSize: `auto ${Math.round(height)}px` }
}

/** 离开贴底窗口的第一帧：state 还没写入时用已测量高度（对标 Codex #38220） */
export function resolveRowIntrinsicHeight(
  stored: number | undefined,
  measured: number | undefined
): number | undefined {
  if (stored != null && stored >= 1) return stored
  if (measured != null && measured >= 1) return measured
  return undefined
}

/** 收束/换消息时只有真贴底才强制滚到底，避免读历史被拽走（对标 Codex #37849） */
export function shouldForceStickScroll(options: {
  stickToBottom: boolean
  userLocked: boolean
  distanceFromBottom: number
  atBottomPx?: number
}): boolean {
  if (!options.stickToBottom || options.userLocked) return false
  return options.distanceFromBottom <= (options.atBottomPx ?? 16)
}

/** 审批出现：已贴底才跟；读历史不解锁、不抢镜头（对标 Codex #38220，Enter/Esc 仍走输入框） */
export function shouldFollowApprovalIntoView(options: {
  userLocked: boolean
  stickToBottom: boolean
}): boolean {
  return !options.userLocked && options.stickToBottom
}

/** 贴底 scrollTop：内容变高或输入框把视口挤矮都要跟到底（对标 Codex #40788） */
export function liveStickScrollTop(scrollHeight: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight)
}

/**
 * 直播正文槽（散文 / diff / demo）已上屏就挂操作条。
 * 尚无正文可复制时先占同一高度，避免写盘 diff 后第一句回答再冒出 38px
 * （对标 Codex #40788 / #41155 action row）。
 */
export function shouldMountMessageActions(options: {
  showBody: boolean
  isError?: boolean
}): boolean {
  return options.showBody && !options.isError
}

export function shouldReserveMessageActions(options: {
  isStreaming?: boolean
  hasCopyableContent: boolean
}): boolean {
  return Boolean(options.isStreaming) && !options.hasCopyableContent
}

/** 内容高度或滚动视口变了才需要重写 scrollTop */
export function liveStickNeedsFollow(
  prev: { scrollHeight: number; clientHeight: number },
  next: { scrollHeight: number; clientHeight: number }
): boolean {
  return prev.scrollHeight !== next.scrollHeight || prev.clientHeight !== next.clientHeight
}

/**
 * 代码/diff 内层滚动跟尾：外壳有 max-height 后新行不再顶对话柱，
 * 必须把内层滚到最新行，否则直播看起来像停住（对标 Codex #32030 / #38695）。
 * 用户上翻读已画行时不抢。
 */
export function shouldFollowArtifactTail(options: {
  followTail: boolean
  userLocked: boolean
}): boolean {
  return options.followTail && !options.userLocked
}

export type TranscriptNavIntent = 'top' | 'bottom'

/** 输入框 / 查找 / 右侧预览 / 终端 / 浏览器里不抢 Home End */
export const TRANSCRIPT_NAV_BLOCK =
  'textarea, input, select, [contenteditable="true"], .composer-box, .embedded-browser, .embedded-terminal, .file-tree-viewer, .code-diff-block, .chat-find, .command-palette'

/** 点这些不把焦点交给对话柱（对标 Codex 桌面 #39851：点正文后方向键滚动） */
export const TRANSCRIPT_SCROLL_FOCUS_BLOCK =
  'a, button, input, textarea, select, [contenteditable="true"], [role="textbox"], .chat-find'

/** 点对话柱空白/正文时把焦点交给滚动层，交互控件自己拿焦点 */
export function shouldFocusTranscriptScroller(target: {
  closest?: (selector: string) => unknown
} | null): boolean {
  if (!target || typeof target.closest !== 'function') return true
  return !target.closest(TRANSCRIPT_SCROLL_FOCUS_BLOCK)
}

/** 对话柱聚焦时向上键要锁贴底，避免直播增高把镜头拽回去 */
export function shouldLockStickOnTranscriptKey(event: {
  key: string
  shiftKey?: boolean
}): boolean {
  return event.key === 'PageUp' || event.key === 'ArrowUp' || (event.key === ' ' && Boolean(event.shiftKey))
}

/**
 * 长对话跳顶/底：⌘↑⌘↓ 以及官方桌面用户期望的 Home / End（对标 Codex #39181）。
 * 输入框内不抢光标；End 回到贴底以便继续跟直播。
 */
export function transcriptNavIntent(
  event: {
    key: string
    metaKey?: boolean
    ctrlKey?: boolean
    altKey?: boolean
    shiftKey?: boolean
    isComposing?: boolean
  },
  blocked = false
): TranscriptNavIntent | null {
  if (event.isComposing || blocked) return null
  if (event.altKey || event.shiftKey) return null
  const mod = Boolean(event.metaKey || event.ctrlKey)
  if (mod) {
    if (event.key === 'ArrowUp') return 'top'
    if (event.key === 'ArrowDown') return 'bottom'
    return null
  }
  if (event.key === 'Home') return 'top'
  if (event.key === 'End') return 'bottom'
  return null
}

/** 只在行离开贴底窗口时写入高度；引用没变就复用同一 Map */
export function nextRowIntrinsicHeights(
  prev: ReadonlyMap<string, number>,
  snapshots: ReadonlyArray<{ id: string; nearLive: boolean; height?: number }>
): ReadonlyMap<string, number> {
  let changed = false
  const next = new Map(prev)
  for (const row of snapshots) {
    if (row.nearLive) continue
    const raw = row.height
    if (raw == null || raw < 1) continue
    const height = Math.round(raw)
    if (next.get(row.id) !== height) {
      next.set(row.id, height)
      changed = true
    }
  }
  return changed ? next : prev
}

/** 直播进度指纹：只比有没有变，不把全文塞进 state */
export function liveProgressKey(options: {
  streamingChars: number
  liveSegmentCount: number
  thinkingChars?: number
}): string {
  return `${options.liveSegmentCount}:${options.streamingChars}:${options.thinkingChars ?? 0}`
}

/** 已有上一帧、这一帧又变了，才算「直播长高」 */
export function liveProgressGrew(prev: string, next: string): boolean {
  return Boolean(prev) && Boolean(next) && prev !== next
}

/**
 * 读历史时直播又长高：只标未读，不改 scrollTop（对标 Codex #38220 new message）。
 */
export function shouldMarkUnseenLive(options: {
  userLocked: boolean
  stickToBottom: boolean
  liveGrew: boolean
}): boolean {
  return options.userLocked && !options.stickToBottom && options.liveGrew
}

/** 重新贴底后清掉「新消息」 */
export function shouldClearUnseenLive(options: {
  stickToBottom: boolean
  userLocked: boolean
}): boolean {
  return options.stickToBottom && !options.userLocked
}

/**
 * 「回到底部」在有未读直播时改成「新消息」，仍不抢镜头。
 * ChatView 把芯片放进 composer-stage 流里占位，不得 absolute 盖直播尾
 * （对标 Codex #38220 non-disruptive new message / #40788 reserve space）。
 */
export function jumpToBottomAffordance(hasUnseenLive: boolean): {
  label: string
  ariaLabel: string
  emphasize: boolean
} {
  if (hasUnseenLive) {
    return { label: '新消息', ariaLabel: '有新消息，回到底部', emphasize: true }
  }
  return { label: '回到底部', ariaLabel: '回到底部', emphasize: false }
}
