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

/** 贴底 scrollTop：内容变高或输入框把视口挤矮都要跟到底（对标 Codex #40788） */
export function liveStickScrollTop(scrollHeight: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight)
}

/** 内容高度或滚动视口变了才需要重写 scrollTop */
export function liveStickNeedsFollow(
  prev: { scrollHeight: number; clientHeight: number },
  next: { scrollHeight: number; clientHeight: number }
): boolean {
  return prev.scrollHeight !== next.scrollHeight || prev.clientHeight !== next.clientHeight
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
