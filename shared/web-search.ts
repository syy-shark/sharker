/**
 * 官方 web_search 过程文案与结构化来源（对标 Codex #9960 / #24693 / #32898）。
 * 直播头用 Searching / Searched，来源只留 title+url，不发明 find_in_page / web.run。
 * @see shared/ARCH.md
 */

export const WEB_SEARCH_TOOL = 'web_search'
export const WEB_SEARCH_LIVE_STATUS = 'Searching the web'
/** 官方完成后头：Searched；query 走 detail，避免标题随查询变长挤过程区 */
export const WEB_SEARCH_DONE_TITLE = 'Searched'

export type WebSearchSource = {
  title: string
  url: string
  snippet?: string
}

/** 进行中：官方 TUI/桌面「Searching the web」，避免直播像停住 */
export function formatWebSearchLiveStatus(): string {
  return WEB_SEARCH_LIVE_STATUS
}

/** 完成后头：官方 TUI/桌面 Searched（query 另走 detail） */
export function formatWebSearchActivity(_query?: string): string {
  return WEB_SEARCH_DONE_TITLE
}

/** 官方 web_search 副行：查询本身 */
export function formatWebSearchDetail(query: string): string {
  return String(query || '').trim()
}

export function isWebSearchSourceUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || '').trim())
}

function cleanTitle(title: string, url: string): string {
  const text = String(title || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** 规范化官方结果 DTO 字段；忽略不认识的项 */
export function normalizeWebSearchSources(raw: unknown): WebSearchSource[] {
  if (!Array.isArray(raw)) return []
  const sources: WebSearchSource[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const url = String(rec.url ?? rec.FirstURL ?? '').trim()
    if (!isWebSearchSourceUrl(url)) continue
    const snippet = String(rec.snippet ?? rec.Abstract ?? '').trim()
    sources.push({
      title: cleanTitle(String(rec.title ?? rec.Text ?? rec.Heading ?? ''), url),
      url,
      snippet: snippet || undefined
    })
    if (sources.length >= 8) break
  }
  return sources
}

/** 工具 stdout：第一行官方活动 + source 行 + 模型可读正文 */
export function formatWebSearchToolOutput(input: {
  query: string
  sources: WebSearchSource[]
  body: string
}): string {
  const detail = formatWebSearchDetail(input.query)
  const lines = [detail ? `${WEB_SEARCH_DONE_TITLE} ${detail}` : WEB_SEARCH_DONE_TITLE]
  for (const source of input.sources) {
    if (!isWebSearchSourceUrl(source.url)) continue
    lines.push(`source: ${cleanTitle(source.title, source.url)} | ${source.url}`)
  }
  const body = String(input.body || '').trim()
  if (body) lines.push('', body)
  return lines.join('\n')
}

export function parseWebSearchQuery(output: string): string | null {
  const match = String(output || '').match(/^Searched(?: the web(?: for)?)? (.+)$/m)
  const query = match?.[1]?.trim() ?? ''
  return query || null
}

export function parseWebSearchSources(output: string): WebSearchSource[] {
  const sources: WebSearchSource[] = []
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^source:\s*(.+?)\s+\|\s+(https?:\/\/\S+)/i)
    if (!match?.[1] || !match[2]) continue
    sources.push({ title: match[1].trim(), url: match[2].trim() })
    if (sources.length >= 8) break
  }
  return sources
}
