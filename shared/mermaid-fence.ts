/**
 * ```mermaid / ```mmd 围栏判定。直播开闭都挂 MermaidBlock，闭合且不在直播 token 时才画图。
 * 围栏在直播中闭合时 `shouldWarmLiveMermaid` 开工 `renderMermaidSvg` 写缓存，不 setSvg。
 * SVG 缓存避免收束 / 廉价尾 → 稳定块重挂时先闪回源码；`resolveLiveMermaidSvg` 收束后命中缓存则同一帧成图。
 * `loadMermaidApi` 给收束预取与成图共用同一动态 import；`takeMermaidRenderJob` /
 * `renderMermaidSvg` 让预取与组件共用同一次 `mermaid.render`，立刻跟进的重挂不取消已开工的成图。
 * `shouldStartMermaidPaintJob` 缓存命中不再开工；`shouldDeferMermaidPaintJob` 远窗未命中推到下一帧。
 * `shouldShowMermaidSvg` 成图后仍走同一 `mermaid-slot`，不换外壳第一层子节点。
 * @see shared/ARCH.md
 */

export type MermaidApi = {
  initialize: (config: {
    startOnLoad: boolean
    securityLevel: 'strict' | 'loose' | 'antiscript' | 'sandbox'
    theme: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  }) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let mermaidLoader: Promise<MermaidApi> | null = null

/** 动态装 mermaid；收束预取与成图共用同一 Promise。 */
export function loadMermaidApi(): Promise<MermaidApi> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((mod) => (mod.default ?? mod) as MermaidApi)
  }
  return mermaidLoader
}

/** 只开工不阻塞；立刻跟进的重挂能碰上同一个 in-flight import。 */
export function prefetchMermaidModule(): void {
  void loadMermaidApi()
}

export type MermaidUiTheme = 'dark' | 'default'

/** 当前界面主题：深色金属走 mermaid `dark`，浅色走 `default`。 */
export function readUiMermaidTheme(): MermaidUiTheme {
  if (typeof document === 'undefined') return 'default'
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'default'
}

const mermaidRenderJobs = new Map<string, Promise<string>>()

/**
 * 同一源码+主题共用一次成图。缓存命中立刻返回；进行中的 Promise 给预取与
 * MermaidBlock 共用，重挂不另开、不取消。
 */
export function takeMermaidRenderJob(
  source: string,
  theme: MermaidUiTheme,
  start: () => Promise<string>
): Promise<string> {
  const text = source.replace(/\n$/, '').trim()
  if (!text) return Promise.reject(new Error('empty mermaid source'))
  const cached = readCachedMermaidSvg(text, theme)
  if (cached) return Promise.resolve(cached)
  const key = mermaidSvgCacheKey(text, theme)
  const existing = mermaidRenderJobs.get(key)
  if (existing) return existing
  const job = start()
    .then((svg) => {
      const out = String(svg ?? '').trim()
      if (!out) throw new Error('empty mermaid svg')
      writeCachedMermaidSvg(text, theme, out)
      return out
    })
    .finally(() => {
      mermaidRenderJobs.delete(key)
    })
  mermaidRenderJobs.set(key, job)
  return job
}

/** 装模块并成图；与收束预取共用 in-flight。不在 16ms 热路径调用。 */
export function renderMermaidSvg(source: string, theme: MermaidUiTheme): Promise<string> {
  const text = source.replace(/\n$/, '').trim()
  return takeMermaidRenderJob(text, theme, async () => {
    const mermaid = await loadMermaidApi()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme
    })
    const renderId = `sharker-mermaid-${Math.random().toString(36).slice(2, 10)}`
    const result = await mermaid.render(renderId, text)
    return result.svg
  })
}

/**
 * 收束后开工模块，并在有 `document` 时异步成图写入 SVG 缓存。
 * 不 await，以免卡住 prefetch microtask / 收束帧。
 */
export function prefetchMermaidSvgs(
  sources: readonly string[],
  theme?: MermaidUiTheme
): number {
  prefetchMermaidModule()
  const usable = sources.map((source) => source.replace(/\n$/, '').trim()).filter(Boolean)
  if (typeof document !== 'undefined') {
    const ui = theme ?? readUiMermaidTheme()
    for (const source of usable) {
      void renderMermaidSvg(source, ui).catch(() => undefined)
    }
  }
  return usable.length
}

export function isMermaidLang(lang?: string | null): boolean {
  const value = lang?.trim().toLowerCase() ?? ''
  return value === 'mermaid' || value === 'mmd'
}

/** 直播 token 中即使围栏已闭合也不画 SVG，收束后再成图以免卡贴底。 */
export function shouldRenderLiveMermaid(options: { closed: boolean; streaming?: boolean }): boolean {
  return options.closed && !options.streaming
}

/**
 * 围栏已闭合但仍在直播 token：effect 里开工 mermaid.render 写缓存，不 setSvg / 不成图。
 * 收束帧更常命中 `readCachedMermaidSvg`，不必先闪源码。
 */
export function shouldWarmLiveMermaid(options: { closed: boolean; streaming?: boolean }): boolean {
  return options.closed && Boolean(options.streaming)
}

/**
 * 收束后若 SVG 缓存已暖，同一帧成图，不必先闪源码再等 effect。
 * 直播 token 中即使缓存有旧图也不换。
 */
export function resolveLiveMermaidSvg(options: {
  paint: boolean
  svg: string
  cached?: string
}): string {
  if (!options.paint) return ''
  return options.svg || options.cached || ''
}

/** 成图后仍走同一 `mermaid-slot`，不另挂一套外壳。 */
export function shouldShowMermaidSvg(options: {
  closed: boolean
  hasSource: boolean
  failed: boolean
  svg: string
}): boolean {
  return options.closed && options.hasSource && !options.failed && Boolean(options.svg)
}

/** 缓存已有 SVG 时重挂不再开工 mermaid.render / setState。 */
export function shouldStartMermaidPaintJob(options: {
  paint: boolean
  hasCachedSvg?: boolean
}): boolean {
  return options.paint && !options.hasCachedSvg
}

/** 远窗历史揭示帧把成图推到下一帧，避免跟 scrollHeight 补偿抢布局。 */
export function shouldDeferMermaidPaintJob(options: { preferImmediate?: boolean }): boolean {
  return options.preferImmediate === false
}

/** 直播未写完 `mermaid`：`mer` 起就挂 MermaidBlock，不认 `md` / `mm` */
export function isMermaidLangPrefix(lang?: string | null): boolean {
  const value = lang?.trim().toLowerCase().split(/[\s{]/)[0] ?? ''
  if (!value) return false
  if (isMermaidLang(value)) return true
  if (value.length < 3) return false
  return 'mermaid'.startsWith(value)
}

const MERMAID_SVG_CACHE_LIMIT = 32
const mermaidSvgCache = new Map<string, string>()

export function mermaidSvgCacheKey(source: string, theme: MermaidUiTheme): string {
  return `${theme}\n${source.replace(/\n$/, '').trim()}`
}

export function readCachedMermaidSvg(source: string, theme: MermaidUiTheme): string | undefined {
  const key = mermaidSvgCacheKey(source, theme)
  const svg = mermaidSvgCache.get(key)
  if (svg === undefined) return undefined
  mermaidSvgCache.delete(key)
  mermaidSvgCache.set(key, svg)
  return svg
}

export function writeCachedMermaidSvg(
  source: string,
  theme: MermaidUiTheme,
  svg: string
): void {
  const text = svg.trim()
  if (!text) return
  const key = mermaidSvgCacheKey(source, theme)
  mermaidSvgCache.delete(key)
  mermaidSvgCache.set(key, text)
  const size = parseMermaidSvgSize(text)
  if (size) writeCachedMermaidHeight(source, theme, size.height)
  while (mermaidSvgCache.size > MERMAID_SVG_CACHE_LIMIT) {
    const oldest = mermaidSvgCache.keys().next().value
    if (oldest === undefined) break
    mermaidSvgCache.delete(oldest)
  }
}

export function clearMermaidSvgCache(): void {
  mermaidSvgCache.clear()
}

/** 从 mermaid SVG 读固有宽高，成图 / 重挂时按比例占位，避免从源码高度跳到图高 */
export function parseMermaidSvgSize(svg: string): { width: number; height: number } | null {
  const text = String(svg ?? '')
  const viewBox = /viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i.exec(
    text
  )
  if (viewBox) {
    const width = Math.abs(Number(viewBox[3]))
    const height = Math.abs(Number(viewBox[4]))
    if (width > 0 && height > 0) return { width, height }
  }
  const width = readSvgPxAttr(text, 'width')
  const height = readSvgPxAttr(text, 'height')
  if (width > 0 && height > 0) return { width, height }
  return null
}

function readSvgPxAttr(svg: string, name: string): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']?\\s*([\\d.]+)(px|%)?`, 'i').exec(svg)
  if (!match || match[2] === '%') return 0
  const value = Number(match[1])
  return value > 0 ? value : 0
}

export function mermaidSvgAspectStyle(
  svg?: string
): { aspectRatio: string } | undefined {
  const size = svg ? parseMermaidSvgSize(svg) : null
  if (!size) return undefined
  return { aspectRatio: `${size.width} / ${size.height}` }
}

const MERMAID_HEIGHT_MIN = 120
const MERMAID_HEIGHT_MAX = 720
const mermaidHeightCache = new Map<string, number>()

function clampMermaidHeight(value: number): number {
  if (!Number.isFinite(value)) return MERMAID_HEIGHT_MIN
  return Math.min(MERMAID_HEIGHT_MAX, Math.max(MERMAID_HEIGHT_MIN, Math.round(value)))
}

/** 从节点 / 边 / 行数估成图高，闭合后代码尾先占位，避免换成 SVG 时猛涨或塌下去 */
export function estimateMermaidPlaceholderHeight(source: string): number {
  const text = source.replace(/\n$/, '').trim()
  if (!text) return MERMAID_HEIGHT_MIN
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'))
  const edges = (text.match(/-->|---|-\.-|==>|->>|-->>/g) ?? []).length
  const nodes = (text.match(/\[[^\]]+\]|\([^)]+\)|\{[^}]+\}/g) ?? []).length
  const participants = (text.match(/^\s*participant\s+/gim) ?? []).length
  const rows = Math.max(lines.length, edges + 1, nodes, participants, 1)
  const fromCode = lines.length * 22 + 48
  const fromGraph = rows * 36 + 56
  return clampMermaidHeight(Math.max(fromCode, fromGraph))
}

export function readCachedMermaidHeight(
  source: string,
  theme: MermaidUiTheme
): number | null {
  const key = mermaidSvgCacheKey(source, theme)
  return mermaidHeightCache.get(key) ?? null
}

export function writeCachedMermaidHeight(
  source: string,
  theme: MermaidUiTheme,
  height: number
): number {
  const key = mermaidSvgCacheKey(source, theme)
  const next = clampMermaidHeight(height)
  mermaidHeightCache.set(key, next)
  return next
}

export function clearMermaidHeightCache(): void {
  mermaidHeightCache.clear()
}

/** 成图槽高度：实测 SVG / 缓存 / 估高取高，只升不降以免贴底回跳 */
export function mermaidSlotHeight(
  source: string,
  theme: MermaidUiTheme,
  svg?: string
): number {
  const fromSvg = svg ? parseMermaidSvgSize(svg)?.height : undefined
  return Math.max(
    fromSvg && fromSvg > 0 ? clampMermaidHeight(fromSvg) : 0,
    readCachedMermaidHeight(source, theme) ?? 0,
    estimateMermaidPlaceholderHeight(source)
  )
}
