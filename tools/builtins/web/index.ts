/**
 * web_fetch / web_search。
 * @see tools/README.md
 */
import { ok } from '../../context'
import { assertWebAccessAllowed } from '../../network-policy'
import type { ToolHandler } from '../../types'

/** HTML 粗略转文本 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80_000)
}

export const webFetchTool: ToolHandler = {
  name: 'web_fetch',
  title: '抓取网页',
  async execute(args, ctx) {
    const url = String(args.url)
    assertWebAccessAllowed(url, ctx.settings)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Sharker/0.1' },
      signal: AbortSignal.timeout(30_000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = res.headers.get('content-type') ?? ''
    const body = await res.text()
    if (ct.includes('html')) {
      return ok(`URL: ${url}\n\n${htmlToText(body)}`)
    }
    return ok(`URL: ${url}\nContent-Type: ${ct}\n\n${body.slice(0, 50_000)}`)
  }
}

/** DuckDuckGo Instant Answer API（免 key） */
async function searchDuckDuckGo(query: string): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`DDG API ${res.status}`)
  const json = (await res.json()) as {
    Abstract?: string
    AbstractURL?: string
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
  }
  const parts: string[] = []
  if (json.Abstract) parts.push(`Summary: ${json.Abstract}\nSource: ${json.AbstractURL ?? ''}`)
  const topics = json.RelatedTopics?.slice(0, 8) ?? []
  for (const t of topics) {
    if (t.Text) parts.push(`- ${t.Text} (${t.FirstURL ?? ''})`)
  }
  return parts.join('\n') || '(no instant results — try web_fetch on a specific URL)'
}

export const webSearchTool: ToolHandler = {
  name: 'web_search',
  title: '网页搜索',
  async execute(args, ctx) {
    const query = String(args.query)
    assertWebAccessAllowed('https://api.duckduckgo.com/', ctx.settings)
    const results = await searchDuckDuckGo(query)
    return ok(`Search: ${query}\n\n${results}`)
  }
}

export const webTools: ToolHandler[] = [webFetchTool, webSearchTool]
