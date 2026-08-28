/**
 * ```mermaid / ```mmd 围栏判定。只在闭合后画图，未闭合直播仍走代码尾。
 * @see shared/ARCH.md
 */

export function isMermaidLang(lang?: string | null): boolean {
  const value = lang?.trim().toLowerCase() ?? ''
  return value === 'mermaid' || value === 'mmd'
}
