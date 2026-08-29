/**
 * 内置浏览历史（对标 Codex Settings → Browser / Search from the address bar）。
 * 只记本机内置浏览器访问，不混系统 Chrome。不发明 @Browser 搜历史。
 * @see shared/ARCH.md
 */

export const BROWSER_HISTORY_STORAGE_KEY = 'sharker-browser-history'
export const BROWSER_HISTORY_CHANGED_EVENT = 'sharker:browser-history-changed'
export const BROWSER_SESSION_PARTITION = 'persist:sharker-browser'
export const BROWSER_HISTORY_MAX = 200

export type BrowserHistoryEntry = {
  url: string
  title: string
  visitedAt: number
}

export type BrowserHistoryClearRange = 'hour' | 'day' | 'week' | 'month' | 'all'

const RANGE_MS: Record<Exclude<BrowserHistoryClearRange, 'all'>, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 28 * 24 * 60 * 60 * 1000
}

/** 去掉尾斜杠；data / about 不当历史 */
export function normalizeBrowserHistoryUrl(url: string): string {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '')
}

/** http(s) / file 才记；起始页与 about 不进历史 */
export function shouldRecordBrowserHistory(url: string): boolean {
  const raw = String(url || '').trim()
  if (!raw || /^(data:|about:)/i.test(raw)) return false
  return /^(https?:|file:)/i.test(raw)
}

/** 从 localStorage / JSON 读出合法条目 */
export function parseBrowserHistory(raw: unknown): BrowserHistoryEntry[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: BrowserHistoryEntry[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Partial<BrowserHistoryEntry>
    const url = normalizeBrowserHistoryUrl(String(rec.url || ''))
    if (!shouldRecordBrowserHistory(url) || seen.has(url)) continue
    seen.add(url)
    out.push({
      url,
      title: String(rec.title || '').trim(),
      visitedAt: Number(rec.visitedAt) || 0
    })
  }
  return out
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, BROWSER_HISTORY_MAX)
}

/** 新访问提到最前；同 URL 去重 */
export function recordBrowserHistoryVisit(
  entries: readonly BrowserHistoryEntry[],
  visit: { url: string; title?: string; visitedAt?: number }
): BrowserHistoryEntry[] {
  const url = normalizeBrowserHistoryUrl(visit.url)
  if (!shouldRecordBrowserHistory(url)) return [...entries]
  const next: BrowserHistoryEntry = {
    url,
    title: String(visit.title || '').trim(),
    visitedAt: visit.visitedAt ?? Date.now()
  }
  return [next, ...entries.filter((item) => item.url !== url)].slice(0, BROWSER_HISTORY_MAX)
}

function haystack(entry: BrowserHistoryEntry): string {
  return `${entry.title} ${entry.url}`.toLowerCase()
}

/** 设置页历史搜索；空查询返回按时间的全部 */
export function searchBrowserHistory(
  entries: readonly BrowserHistoryEntry[],
  query: string
): BrowserHistoryEntry[] {
  const q = String(query || '').trim().toLowerCase()
  const list = [...entries].sort((a, b) => b.visitedAt - a.visitedAt)
  if (!q) return list
  return list.filter((item) => haystack(item).includes(q))
}

/** 地址栏建议：空查询给最近几条 */
export function suggestBrowserHistory(
  entries: readonly BrowserHistoryEntry[],
  query: string,
  limit = 6
): BrowserHistoryEntry[] {
  return searchBrowserHistory(entries, query).slice(0, Math.max(1, limit))
}

/** 地址栏：还没改字时给最近访问，输入后按标题/网址滤 */
export function suggestBrowserOmnibox(
  entries: readonly BrowserHistoryEntry[],
  query: string,
  currentUrl = '',
  limit = 6
): BrowserHistoryEntry[] {
  const q = String(query || '').trim()
  const current = normalizeBrowserHistoryUrl(currentUrl)
  if (!q || normalizeBrowserHistoryUrl(q) === current) {
    return suggestBrowserHistory(entries, '', limit)
  }
  return suggestBrowserHistory(entries, q, limit)
}

/** 删掉一条 URL */
export function removeBrowserHistoryUrl(
  entries: readonly BrowserHistoryEntry[],
  url: string
): BrowserHistoryEntry[] {
  const want = normalizeBrowserHistoryUrl(url)
  return entries.filter((item) => item.url !== want)
}

/** 清除该时间窗内的访问；all 清空 */
export function browserHistoryClearCutoff(
  range: BrowserHistoryClearRange,
  now = Date.now()
): number {
  if (range === 'all') return 0
  return now - RANGE_MS[range]
}

/** 丢掉 visitedAt >= cutoff 的条目 */
export function clearBrowserHistory(
  entries: readonly BrowserHistoryEntry[],
  range: BrowserHistoryClearRange,
  now = Date.now()
): BrowserHistoryEntry[] {
  if (range === 'all') return []
  const cutoff = browserHistoryClearCutoff(range, now)
  return entries.filter((item) => item.visitedAt < cutoff)
}

/** 地址栏展示标题，没有就用 host */
export function browserHistoryLabel(entry: BrowserHistoryEntry): string {
  const title = String(entry.title || '').trim()
  if (title) return title
  try {
    return new URL(entry.url).host || entry.url
  } catch {
    return entry.url
  }
}
