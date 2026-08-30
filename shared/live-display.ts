/**
 * 直播过程展示头：从可见步骤推导当前头标签/详情。
 * 头详情只挂短路径，不挂命令末行（对标 Codex #19260）。
 * 与 TurnFlow 渲染共用，保证“头 = 当前步骤”。
 * 思考原文不当时间线标题；展示为 Cursor 式可折叠 Thought，不是灰卡片倾倒。
 */

import { exploreNameFromPath } from './explore-activity'
import { isLiveStableToolDetail } from './tool-output-display'

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
 * 大半都是源码时返回空，UI 只留 Thinking / Thought 折叠条。
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

/**
 * 父页才对 iframe 做全树 getBoundingClientRect。
 * 直播实例（含收束后留下的那行）只信估高与 iframe postMessage，避免收束把 streaming
 * 关掉后重挂 RO 扫整棵（对标 Codex #22860 / #39120）。历史重挂再量。
 */
export function shouldMeasureInlineDemoInParent(options: {
  paintable: boolean
  live?: boolean
  streaming?: boolean
}): boolean {
  return options.paintable && !options.live && !options.streaming
}

/** 未可绘不挂空 iframe，直播先骨架，可绘再 srcDoc（对标 Codex #22860 / #39120） */
export function shouldMountInlineDemoFrame(options: { paintable: boolean }): boolean {
  return options.paintable
}

/**
 * iframe 内全树 getBoundingClientRect / getComputedStyle、终端套壳与 KaTeX CDN。
 * 直播实例（含收束后留下的那行）只用量 range + body 底边，避免收束重写 srcDoc
 * 把 iframe 整页重挂（对标 Codex #22860 / #39120，拆法同 Prism：`live` 管实例寿命）。
 * 历史重挂（`live` 假）再灌完整套壳。
 */
export function shouldWalkInlineDemoTree(options: { live?: boolean; streaming?: boolean }): boolean {
  return !options.live && !options.streaming
}

/** 只缓存历史重挂（walkTree）那份带套壳的 srcDoc；直播轻量 srcDoc 随 token 增长不进缓存。 */
export function shouldCacheInlineDemoSrcDoc(options: { walkTree: boolean }): boolean {
  return options.walkTree
}

/** 历史 srcDoc 用占位 id 入缓存，重挂换 `useId()` 后只替换占位，不重跑 `buildSrcDoc`。 */
export const INLINE_DEMO_SRCDOC_ID_PLACEHOLDER = '__SHARKER_DEMO_ID__'

const INLINE_DEMO_SRCDOC_CACHE_LIMIT = 8
const inlineDemoSrcDocCache = new Map<string, string>()

/** 主题 token 排序后当缓存键，避免对象字面量顺序换 miss。 */
export function inlineDemoThemeCacheKey(theme: Record<string, string>): string {
  return Object.keys(theme)
    .sort()
    .map((key) => `${key}=${theme[key] ?? ''}`)
    .join('\n')
}

/** walkTree + 主题 + HTML 才进同一份套壳 srcDoc。 */
export function inlineDemoSrcDocCacheKey(options: {
  html: string
  walkTree: boolean
  themeKey: string
}): string {
  return `${options.walkTree ? '1' : '0'}\n${options.themeKey}\n${options.html}`
}

/** 把缓存模板里的占位 id 换成这次挂载的 demoId。 */
export function applyInlineDemoSrcDocId(srcDoc: string, demoId: string): string {
  return srcDoc.split(INLINE_DEMO_SRCDOC_ID_PLACEHOLDER).join(demoId)
}

/** LRU 读历史 srcDoc 模板。 */
export function readCachedInlineDemoSrcDoc(key: string): string | undefined {
  const hit = inlineDemoSrcDocCache.get(key)
  if (hit === undefined) return undefined
  inlineDemoSrcDocCache.delete(key)
  inlineDemoSrcDocCache.set(key, hit)
  return hit
}

/** 写入历史 srcDoc 模板；空串不进缓存。 */
export function writeCachedInlineDemoSrcDoc(key: string, srcDoc: string): string {
  if (!srcDoc) return srcDoc
  inlineDemoSrcDocCache.delete(key)
  inlineDemoSrcDocCache.set(key, srcDoc)
  while (inlineDemoSrcDocCache.size > INLINE_DEMO_SRCDOC_CACHE_LIMIT) {
    const oldest = inlineDemoSrcDocCache.keys().next().value
    if (oldest === undefined) break
    inlineDemoSrcDocCache.delete(oldest)
  }
  return srcDoc
}

/** 测试与会话切换清掉历史 srcDoc 模板。 */
export function clearInlineDemoSrcDocCache(): void {
  inlineDemoSrcDocCache.clear()
}

/**
 * 历史重挂命中缓存则只换 demoId；直播 `walkTree` 假时当场 `build(demoId)`，不占缓存。
 * `build` 收到占位 id 时才把套壳 srcDoc 写进缓存。
 */
export function resolveInlineDemoSrcDoc(options: {
  html: string
  walkTree: boolean
  themeKey: string
  demoId: string
  build: (id: string) => string
}): string {
  if (!shouldCacheInlineDemoSrcDoc({ walkTree: options.walkTree })) {
    return options.build(options.demoId)
  }
  const key = inlineDemoSrcDocCacheKey({
    html: options.html,
    walkTree: options.walkTree,
    themeKey: options.themeKey
  })
  const cached = readCachedInlineDemoSrcDoc(key)
  const template =
    cached ??
    writeCachedInlineDemoSrcDoc(key, options.build(INLINE_DEMO_SRCDOC_ID_PLACEHOLDER))
  return applyInlineDemoSrcDocId(template, options.demoId)
}

/** 直播 srcDoc 首帧立刻画；大段增长 80ms，其余 200ms，避免每 token 重挂整页脚本 */
export const LIVE_INLINE_DEMO_FIRST_PAINT_MS = 40
export const LIVE_INLINE_DEMO_GROW_PAINT_MS = 80
export const LIVE_INLINE_DEMO_IDLE_PAINT_MS = 200
export const LIVE_INLINE_DEMO_GROW_CHARS = 180

/** 直播 iframe 刷新间隔：首帧快、之后节流（对标 Codex #22860 / #39120） */
export function liveInlineDemoPaintDelay(options: {
  lastPaintLen: number
  htmlLen: number
}): number {
  if (options.lastPaintLen <= 0) return LIVE_INLINE_DEMO_FIRST_PAINT_MS
  if (options.htmlLen - options.lastPaintLen >= LIVE_INLINE_DEMO_GROW_CHARS) {
    return LIVE_INLINE_DEMO_GROW_PAINT_MS
  }
  return LIVE_INLINE_DEMO_IDLE_PAINT_MS
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

/** 工具间隙规划桥接：不当直播头（对标 Codex flashing thinking summaries） */
export function isPlanningNextLiveTitle(title: string): boolean {
  return String(title || '').includes('规划下一步')
}

/** 直播头只挂短路径/叶名，不挂命令末行以免每条输出顶贴底（对标 Codex #19260） */
export function shouldMountLiveHeadDetail(detail: string | undefined): boolean {
  return isLiveStableToolDetail(detail)
}

/** 当前头步骤：优先最后一个 active，否则最后一项。跳过规划桥接以免闪头。 */
export function selectLiveHeadStep(steps: LiveDisplayStep[]): LiveDisplayStep | null {
  if (!steps.length) return null
  const usable = steps.filter((step) => !isPlanningNextLiveTitle(step.title || ''))
  const pool = usable.length ? usable : steps
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i]?.status === 'active') return pool[i]
  }
  return pool[pool.length - 1] || null
}

export function buildLiveHead(options: {
  steps: LiveDisplayStep[]
  approvalWaiting?: boolean
  fallbackLabel?: string
}): LiveHead {
  const step = selectLiveHeadStep(options.steps)
  if (options.approvalWaiting) {
    return {
      label: AWAITING_APPROVAL_LABEL,
      detail: undefined,
      step
    }
  }
  const raw = step?.title?.trim() || ''
  const detail = step?.detail
  return {
    label: resolvePrepareLiveTitle(raw) || raw || options.fallbackLabel || THINKING_LABEL,
    detail: shouldMountLiveHeadDetail(detail) ? detail : undefined,
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
  lastStepKind?: string
}): boolean {
  if (options.approvalWaiting || options.generatingAnswer || options.hasActiveWork) return false
  if (!options.hasToolOrNarration) return false
  if (options.lastStepKind === 'status') return false
  const last = (options.lastStepTitle || '').trim()
  if (/正在准备/.test(last)) return false
  if (last.includes('规划下一步')) return false
  return true
}

/**
 * 合成步骤要不要顶掉直播头。
 * 规划 / 生成回答只用来关掉思考占位，不把头闪成「规划下一步」（对标 Codex
 * changelog「flashing thinking summaries」与 #8204 工具间隙不闪 Working）。
 * 审批没有真实步骤时仍要露出 Awaiting approval。
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
 * 正文已上屏或回合结束后，把可折叠过程收成 Working / Worked for（对标 Codex）。
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

/** 收束后同一直播行仍留 Thought，避免 Thinking 整块卸掉把贴底拽矮（对标 Codex Thought）。 */
export function shouldShowLiveThought(options: { hasThoughtBody: boolean }): boolean {
  return options.hasThoughtBody
}

/** 收束后无步骤但还有 Thought 时仍挂 TurnFlow，不整棵 return null。 */
export function shouldKeepCompletedLiveTurnFlow(options: {
  isStreaming: boolean
  chronologicalCount: number
  visibleStepCount: number
  hasThoughtBody: boolean
}): boolean {
  if (options.isStreaming) return true
  if (options.hasThoughtBody) return true
  if (options.chronologicalCount === 0) return false
  return options.visibleStepCount > 0
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

/** Goal 进度行预留「99d 23h 59m」，跨日换文案不抬 composer-stage（对标 Codex #20558） */
export const GOAL_ELAPSED_CLOCK_RESERVE_CH = 12

/** 对标 Codex Goal / 长回合秒表：23s · 4m · 1h 9m；满 24h 起 `1d 0h 0m` */
export function formatElapsedClock(seconds: number): string {
  if (seconds < 1) return '<1s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h ${rem}m`
}

export function elapsedClockSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.round((now - startedAt) / 1000))
}

/**
 * 下一回文案会变的等待：秒档 1s，分/小时档对齐下一分钟。
 * 避免 500ms tick 在 `4m` / `1h 9m` 期间空刷直播头（对标 Codex #22860）。
 */
export function nextElapsedClockDelayMs(seconds: number): number {
  const sec = Math.max(0, Math.round(seconds))
  if (sec < 60) return 1000
  const intoMinute = sec % 60
  return (60 - intoMinute) * 1000
}

/** 官方直播折叠头：进行中 Working，完成后 Worked for（秒表仍走预留宽时钟） */
export const WORKING_LABEL = 'Working'
export const WORKED_FOR_LABEL = 'Worked for'

export function formatWorkedForLabel(streaming: boolean): string {
  return streaming ? WORKING_LABEL : WORKED_FOR_LABEL
}

/** 官方直播思考折叠：进行中 Thinking，完成后 Thought（秒表仍走预留宽时钟） */
export const THINKING_LABEL = 'Thinking'
export const THOUGHT_LABEL = 'Thought'
/** 开轮尚未出 token / 工具：官方直播空档头 Thinking（仍认旧「连接模型并准备任务」） */
export const TURN_START_LIVE_STATUS = THINKING_LABEL

export function formatThoughtLabel(streaming: boolean): string {
  return streaming ? THINKING_LABEL : THOUGHT_LABEL
}

/**
 * 官方直播空档头：无工具时 Thinking，已开工或正在出回答时 Working。
 * 不发明「规划下一步 / 生成回答中」以免闪头（对标 Codex flashing thinking summaries）。
 */
export function formatStreamingFallbackLabel(options: {
  approvalWaiting?: boolean
  hasStartedWork?: boolean
}): string {
  if (options.approvalWaiting) return AWAITING_APPROVAL_LABEL
  return options.hasStartedWork ? WORKING_LABEL : THINKING_LABEL
}

/**
 * 工具参数还在流时的「正在准备…」：官方直播头直接用 Read / List / Running 等，
 * 不发明准备态闪头（对标 Codex 工具格一开始就出标题）。
 */
export function resolvePrepareLiveTitle(text: string): string | null {
  const cleaned = String(text || '').trim()
  if (!cleaned || !/正在准备|正在生成|正在整理|连接模型|准备任务/.test(cleaned)) return null
  if (/连接模型|准备任务/.test(cleaned)) return THINKING_LABEL
  if (/正在准备读取/.test(cleaned)) {
    const rest = cleaned.replace(/.*正在准备读取\s*/, '').trim()
    const leaf = rest && rest !== '文件' ? exploreNameFromPath(rest) : undefined
    return leaf ? `Read ${leaf}` : 'Read'
  }
  if (/正在准备列出|正在准备目录|正在准备浏览/.test(cleaned)) {
    const rest = cleaned.replace(/.*正在准备(?:列出目录|列出|目录|浏览)\s*/, '').trim()
    const leaf = exploreNameFromPath(rest)
    return leaf ? `List ${leaf}` : 'List'
  }
  if (/正在准备运行|正在准备命令/.test(cleaned)) return 'Running'
  if (/正在准备写入|正在准备修改|正在整理|正在生成.*写入|正在生成写入/.test(cleaned)) {
    return 'Edited'
  }
  if (/正在准备Searched|正在准备网页|正在准备抓取/.test(cleaned)) return 'Searching the web'
  if (/正在准备Viewed Image|正在准备查看图片/.test(cleaned)) return 'Viewed Image'
  return WORKING_LABEL
}

/** 官方工具格动词：status 桥接行用，避免准备态改成 Read 后留在历史时间线 */
export const OFFICIAL_ACTIVITY_HEAD_RE =
  /^(Read|List|Search|Running|Ran|Edited|Deleted|Added|Searching the web|Searched|Working|Calling|Called|Viewed Image)(\b|$)/i

export function isOfficialActivityHeadTitle(text: string): boolean {
  return OFFICIAL_ACTIVITY_HEAD_RE.test(String(text || '').trim())
}

/** 官方审批直播头：Awaiting approval（仍认旧「等待确认」） */
export const AWAITING_APPROVAL_LABEL = 'Awaiting approval'

export function isAwaitingApprovalText(text: string): boolean {
  return /等待确认|Awaiting approval/i.test(String(text || ''))
}

export function formatAwaitingApprovalLabel(suffix?: string): string {
  const extra = String(suffix || '').trim()
  return extra ? `${AWAITING_APPROVAL_LABEL} · ${extra}` : AWAITING_APPROVAL_LABEL
}

/** 对标 Codex “You stopped after 47m 28s” / “You stopped after 0s”，保留分秒 */
export function formatStoppedAfterClock(seconds: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))
  if (s < 60) return `${s}s`
  const minutes = Math.floor(s / 60)
  const remS = s % 60
  if (minutes < 60) return remS ? `${minutes}m ${remS}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remM = minutes % 60
  if (remM === 0 && remS === 0) return `${hours}h`
  if (remS === 0) return `${hours}h ${remM}m`
  if (remM === 0) return `${hours}h ${remS}s`
  return `${hours}h ${remM}m ${remS}s`
}

/** 官方中止行：You stopped after 47m 28s */
export function formatStoppedAfterLabel(seconds: number): string {
  return `You stopped after ${formatStoppedAfterClock(seconds)}`
}

export const STOPPED_AFTER_FOOTNOTE_RE =
  /\s*_\((?:已停止|You stopped after|stopped)(?:\s*[·.]?\s*[^)]+)?\)_\s*$/iu

export function stoppedAfterFootnote(seconds: number): string {
  return `\n\n_(${formatStoppedAfterLabel(seconds)})_`
}

export function stripStoppedAfterFootnote(content: string): string {
  return content.replace(STOPPED_AFTER_FOOTNOTE_RE, '').trim()
}

function parseClockToSeconds(text: string): number | undefined {
  const h = text.match(/(\d+)\s*h/i)
  const min = text.match(/(\d+)\s*m/i)
  const sec = text.match(/(\d+)\s*s/i)
  if (!h && !min && !sec) return undefined
  return (h ? Number(h[1]) * 3600 : 0) + (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0)
}

export function parseStoppedAfterSeconds(content: string): number | undefined {
  const match = content.match(
    /_\((?:已停止|You stopped after|stopped)(?:\s*[·.]?\s*([^)]+))?\)_\s*$/iu
  )
  if (!match?.[1]) return undefined
  return parseClockToSeconds(match[1].trim())
}

export function resolveStoppedAfterLabel(input: {
  content?: string
  startedAt?: number | null
  endedAt?: number | null
}): string {
  const parsed = input.content ? parseStoppedAfterSeconds(input.content) : undefined
  const seconds =
    parsed != null
      ? parsed
      : processElapsedSeconds({ startedAt: input.startedAt, endedAt: input.endedAt })
  return formatStoppedAfterLabel(seconds)
}

/** 直播过程数组：引用没变就复用同一份，避免回答 token 重挂 TurnFlow */
export function sameRefList<T>(prev: readonly T[] | null | undefined, next: readonly T[]): boolean {
  if (prev === next) return true
  if (!prev || prev.length !== next.length) return false
  return prev.every((item, i) => item === next[i])
}

/** 挤出环的当帧读已挂行高，给历史 content-visibility 当内在尺寸。 */
export function readMountedMessageRowHeight(id: string): number {
  if (typeof document === 'undefined') return 0
  const key = id.trim()
  if (!key) return 0
  const el = document.getElementById(`msg-${key}`)
  return el ? Math.round(el.offsetHeight) : 0
}

/** 把挤出时记下的行高写入测量表，第一帧不走 160px 估高。 */
export function mergeSeededRowHeights(
  dest: Map<string, number>,
  seeded: Readonly<Record<string, number>>
): Map<string, number> {
  for (const [id, height] of Object.entries(seeded)) {
    const key = id.trim()
    if (!key || height <= 0 || dest.has(key)) continue
    dest.set(key, height)
  }
  return dest
}

/**
 * 只给历史行量 content-visibility 内在高度。
 * 直播行每枚 token 都会长高，高度由贴底 ResizeObserver 跟，再盯会叠一层
 * ResizeObserver 回调（对标 Codex #22860 / #39120，不复制官方 RO 风暴）。
 */
export function shouldObserveRowIntrinsicHeight(input: {
  id?: string
  live?: boolean
}): boolean {
  const id = String(input.id || '').trim()
  if (!id || id === 'streaming') return false
  return !input.live
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

/**
 * 收束换行短窗：直播行卸下、历史气泡后挂长高时距底会突然超过 48px。
 * 此时仍贴底且用户没上翻，不把这次距离当成离开（对标 Codex #37849 跳回用户提示）。
 * 高亮/图片晚于短窗再长高时，只要还在贴底且滚动意向不是上翻，同样不锁。
 */
/** 收束后继续贴底的毫秒短窗（高亮/图片晚长高仍跟得上） */
export const LIVE_COMMIT_SETTLE_MS = 240
/** 收束后连写 scrollTop 的动画帧数 */
export const LIVE_COMMIT_SETTLE_FRAMES = 3

/** loading 从 true 变 false 时进入收束换行短窗 */
export function shouldStartLiveCommitSettle(options: {
  wasLoading: boolean
  loading: boolean
}): boolean {
  return options.wasLoading && !options.loading
}

/**
 * 贴底跟随中距底突然变大：布局收束，不是用户上翻。
 * 直播中思考收回 / 工具卡换高、以及收束短窗里浏览器夹低 scrollTop，都会看起来像上翻；
 * 已锁（滚轮 / 触摸已 lockUserScroll）则不忽略。空闲后仍贴底且意向不是上翻也不锁。
 * 对标 Codex #37872 直播中跳、#37849 / #38412 收束跳回用户提示。
 */
export function shouldIgnoreLeaveBottomDuringCommit(options: {
  commitSettling: boolean
  liveStreaming?: boolean
  stickToBottom: boolean
  userLocked: boolean
  scrollIntent?: 'up' | 'down' | null
}): boolean {
  if (!options.stickToBottom || options.userLocked) return false
  if (options.commitSettling || options.liveStreaming) return true
  return options.scrollIntent !== 'up'
}

/** 直播或收束换行时不把浏览器夹低 scrollTop 记成上翻意向 */
export function shouldRecordTranscriptScrollIntent(options: {
  commitSettling: boolean
  liveStreaming?: boolean
}): boolean {
  return !options.commitSettling && !options.liveStreaming
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

/**
 * 对话柱尾与输入区之间的安全距：给操作条和 composer 阴影留空，
 * 避免最后一行复制/分叉被输入框顶边盖住（对标 Codex #41155 / #40788）。
 */
export const LIVE_TAIL_SAFE_PX = 12

/** 内容高度或滚动视口变了才需要重写 scrollTop */
export function liveStickNeedsFollow(
  prev: { scrollHeight: number; clientHeight: number },
  next: { scrollHeight: number; clientHeight: number }
): boolean {
  return prev.scrollHeight !== next.scrollHeight || prev.clientHeight !== next.clientHeight
}

/**
 * 读历史时查找条 / 新消息芯片挤矮视口：只夹到新的最大 scrollTop，
 * 不跟贴底、不改阅读锚点（对标 Codex #38220 / #40788 不拽读者）。
 */
export function clampLockedScrollTop(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const maxTop = Math.max(0, scrollHeight - clientHeight)
  if (!Number.isFinite(scrollTop) || scrollTop < 0) return 0
  return scrollTop > maxTop ? maxTop : scrollTop
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

/**
 * 围栏复制条相对对话柱贴顶：块还在视口里就保持可见，离开时跟着走。
 * 对标 Codex #20593（官方加换行钮后复制条不再 sticky；Sharker 不发明换行开关，默认已换行）。
 */
export function codeArtifactHeadStickyTop(
  shell: { top: number; bottom: number },
  viewport: { top: number; bottom: number },
  headHeight: number
): number | null {
  if (headHeight <= 0) return null
  if (shell.bottom <= viewport.top || shell.top >= viewport.bottom) return null
  const stuck = Math.max(shell.top, viewport.top)
  return Math.min(stuck, shell.bottom - headHeight)
}

/**
 * 直播围栏行：已完成行退回同一字符串引用，只换增长行。
 * 对标 Codex #39061 / #22860（长围栏不跟每枚 token 重拆全文）。
 */
export function continueLiveFenceLines(
  prev: readonly string[] | null | undefined,
  code: string
): string[] {
  const next = code.replace(/\n$/, '').split('\n')
  if (!prev?.length) return next
  if (next.length === prev.length && next.every((line, index) => line === prev[index])) {
    return prev as string[]
  }
  return next.map((line, index) => (index < prev.length && prev[index] === line ? prev[index]! : line))
}

/**
 * 历史气泡闭合后立刻着色。直播 token 中即使已闭合也不着色。
 * 直播收束后同一实例优先走 `shouldPaintLiveFenceHighlight` 命中缓存；未命中再交给 effect。
 */
export function shouldHighlightLiveFence(options: {
  live: boolean
  closed: boolean
  streaming?: boolean
}): boolean {
  if (!options.closed || options.streaming) return false
  return !options.live
}

/** 闭合且不在直播 token 中即可着色：历史立刻画，直播收束后可画。 */
export function shouldAllowLiveFenceHighlight(options: {
  closed: boolean
  streaming?: boolean
}): boolean {
  return options.closed && !options.streaming
}

/**
 * 收束后若预热已命中缓存，同一帧就着色，不必先画纯文本再等 effect。
 * 直播 token 中即使缓存有旧围栏也不着色。
 */
export function shouldPaintLiveFenceHighlight(options: {
  live: boolean
  closed: boolean
  streaming?: boolean
  cached?: boolean
}): boolean {
  if (!shouldAllowLiveFenceHighlight(options)) return false
  if (shouldHighlightLiveFence(options)) return true
  return Boolean(options.cached)
}

/** 已完成围栏行：对象没变就退回 prev，给 memo 子树当稳定 props */
export function nextClosedFenceLines(
  prev: readonly string[] | null | undefined,
  lines: readonly string[]
): string[] {
  const next = lines.length > 1 ? lines.slice(0, -1) : []
  if (prev && prev.length === next.length && next.every((line, index) => line === prev[index])) {
    return prev as string[]
  }
  return next
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
 * 已是 New message 或已贴底时不必订直播指纹。
 * 读历史只等第一次长高；之后芯片文案不变，跟 token 会抬 composer-stage（对标 Codex #38220 / #22860）。
 */
export function shouldWatchLiveJumpProgress(options: {
  visible: boolean
  unseen: boolean
}): boolean {
  return options.visible && !options.unseen
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

/** Official #38220: non-disruptive “new message” affordance while reading history. */
export const NEW_MESSAGE_LABEL = 'New message'
/** Official desktop jump-to-bottom control when the live tail is already seen. */
export const JUMP_TO_BOTTOM_LABEL = 'Jump to bottom'
/** Official #41391 / #41446: keep-reading path after Add to chat. */
export const JUMP_TO_LATEST_LABEL = 'Jump to latest'
/** Official #41391: unseen live turn after a selected-text send. */
export const NEW_RESPONSE_LABEL = 'New response'

/**
 * Jump-to-bottom becomes New message when unseen live content grows.
 * 划选发送锁阅读位置时改用 Jump to latest / New response（对标 Codex #41391）。
 * ChatView 把芯片放进 composer-stage 流里占位，不得 absolute 盖直播尾
 * （对标 Codex #38220 non-disruptive new message / #40788 reserve space）。
 */
export function jumpToBottomAffordance(
  hasUnseenLive: boolean,
  options?: { keepReading?: boolean }
): {
  label: string
  ariaLabel: string
  emphasize: boolean
} {
  if (options?.keepReading) {
    if (hasUnseenLive) {
      return {
        label: NEW_RESPONSE_LABEL,
        ariaLabel: 'New response, jump to latest',
        emphasize: true
      }
    }
    return { label: JUMP_TO_LATEST_LABEL, ariaLabel: JUMP_TO_LATEST_LABEL, emphasize: false }
  }
  if (hasUnseenLive) {
    return { label: NEW_MESSAGE_LABEL, ariaLabel: 'New message, jump to bottom', emphasize: true }
  }
  return { label: JUMP_TO_BOTTOM_LABEL, ariaLabel: JUMP_TO_BOTTOM_LABEL, emphasize: false }
}
