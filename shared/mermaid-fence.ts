/**
 * ```mermaid / ```mmd 围栏判定。直播开闭都挂 MermaidBlock，只在闭合后画图。
 * SVG 缓存避免收束 / 廉价尾 → 稳定块重挂时先闪回源码。
 * @see shared/ARCH.md
 */

export type MermaidUiTheme = 'dark' | 'default'

export function isMermaidLang(lang?: string | null): boolean {
  const value = lang?.trim().toLowerCase() ?? ''
  return value === 'mermaid' || value === 'mmd'
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
