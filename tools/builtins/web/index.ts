/**
 * web_fetch / web_search。
 * 直播都用官方 Searching the web / Searched（fetch 的 URL 走 detail）；搜索来源结构化，不把 Instant Answer 灌进直播头。
 * @see tools/ARCH.md
 */
import { ok } from '../../context'
import { assertWebAccessAllowed } from '../../network-policy'
import type { ToolHandler } from '../../types'
import {
  formatWebSearchLiveStatus,
  formatWebSearchToolOutput,
  normalizeWebSearchSources,
  type WebSearchSource
} from '../../../shared/web-search'

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
  title: 'Searched',
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

type DdgTopic = { Text?: string; FirstURL?: string; Topics?: DdgTopic[] }

function collectDdgTopics(topics: DdgTopic[] | undefined, into: WebSearchSource[]): void {
  for (const topic of topics ?? []) {
    if (into.length >= 8) return
    if (topic.FirstURL || topic.Text) {
      into.push(...normalizeWebSearchSources([{ Text: topic.Text, FirstURL: topic.FirstURL }]))
    }
    if (topic.Topics?.length) collectDdgTopics(topic.Topics, into)
  }
}

/** DuckDuckGo Instant Answer → 官方 title/url 来源 + 模型可读正文 */
export function parseDuckDuckGoInstantAnswer(json: {
  Heading?: string
  Abstract?: string
  AbstractURL?: string
  RelatedTopics?: DdgTopic[]
}): { sources: WebSearchSource[]; body: string } {
  const sources = normalizeWebSearchSources([
    { title: json.Heading, url: json.AbstractURL, snippet: json.Abstract }
  ])
  collectDdgTopics(json.RelatedTopics, sources)
  const unique = new Map<string, WebSearchSource>()
  for (const source of sources) {
    if (!unique.has(source.url)) unique.set(source.url, source)
  }
  const list = [...unique.values()].slice(0, 8)
  const parts: string[] = []
  if (json.Abstract) parts.push(`Summary: ${json.Abstract}\nSource: ${json.AbstractURL ?? ''}`)
  for (const source of list) {
    if (source.snippet && source.url === json.AbstractURL) continue
    parts.push(`- ${source.title} (${source.url})`)
  }
  return {
    sources: list,
    body: parts.join('\n') || '(no instant results — try web_fetch on a specific URL)'
  }
}

export const webSearchTool: ToolHandler = {
  name: 'web_search',
  title: 'Searched',
  async execute(args, ctx) {
    const query = String(args.query ?? '')
    assertWebAccessAllowed('https://api.duckduckgo.com/', ctx.settings)
    ctx.onStatus?.(formatWebSearchLiveStatus())
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`DDG API ${res.status}`)
    const parsed = parseDuckDuckGoInstantAnswer(
      (await res.json()) as {
        Heading?: string
        Abstract?: string
        AbstractURL?: string
        RelatedTopics?: DdgTopic[]
      }
    )
    return ok(
      formatWebSearchToolOutput({
        query,
        sources: parsed.sources,
        body: parsed.body
      })
    )
  }
}

export const webTools: ToolHandler[] = [webFetchTool, webSearchTool]
