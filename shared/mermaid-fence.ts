/**
 * ```mermaid / ```mmd 围栏判定。直播开闭都挂 MermaidBlock，闭合且不在直播 token 时才画图。
 * SVG 缓存避免收束 / 廉价尾 → 稳定块重挂时先闪回源码。
 * @see shared/ARCH.md
 */

export type MermaidUiTheme = 'dark' | 'default'

export function isMermaidLang(lang?: string | null): boolean {
  const value = lang?.trim().toLowerCase() ?? ''
  return value === 'mermaid' || value === 'mmd'
}

/** 直播 token 中即使围栏已闭合也不跑 mermaid.render，收束后再成图以免卡贴底。 */
export function shouldRenderLiveMermaid(options: { closed: boolean; streaming?: boolean }): boolean {
  return options.closed && !options.streaming
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
