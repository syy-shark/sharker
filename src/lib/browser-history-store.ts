/**
 * 内置浏览历史落盘：renderer localStorage，不进设置、不进对话。
 * @see src/lib/ARCH.md
 */
import {
  BROWSER_HISTORY_CHANGED_EVENT,
  BROWSER_HISTORY_STORAGE_KEY,
  parseBrowserHistory,
  type BrowserHistoryEntry
} from '../../shared/browser-history'

/** 读出本机内置浏览器历史 */
export function loadBrowserHistory(): BrowserHistoryEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return parseBrowserHistory(localStorage.getItem(BROWSER_HISTORY_STORAGE_KEY))
  } catch {
    return []
  }
}

/** 写入并通知设置页 / 地址栏 */
export function saveBrowserHistory(entries: readonly BrowserHistoryEntry[]): BrowserHistoryEntry[] {
  const next = parseBrowserHistory(entries)
  try {
    localStorage.setItem(BROWSER_HISTORY_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 配额满则丢掉最旧的已由 parse 截断 */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BROWSER_HISTORY_CHANGED_EVENT))
  }
  return next
}

/** 打开内置浏览器到指定 URL（设置页「重新打开」） */
export const OPEN_BROWSER_URL_EVENT = 'sharker:open-browser-url'

export function dispatchOpenBrowserUrl(url: string): void {
  if (typeof window === 'undefined' || !url) return
  window.dispatchEvent(new CustomEvent(OPEN_BROWSER_URL_EVENT, { detail: { url } }))
}
