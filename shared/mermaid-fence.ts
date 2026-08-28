/**
 * ```mermaid / ```mmd 围栏判定。只在闭合后画图，未闭合直播仍走代码尾。
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
