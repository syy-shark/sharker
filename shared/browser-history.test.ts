import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  BROWSER_CLEAR_INTRO,
  BROWSER_HISTORY_INTRO,
  BROWSER_HISTORY_MAX,
  BROWSER_SESSION_PARTITION,
  CLEAR_BROWSING_DATA_LABEL,
  browserHistoryClearCutoff,
  browserHistoryLabel,
  clearBrowserHistory,
  normalizeBrowserHistoryUrl,
  parseBrowserHistory,
  recordBrowserHistoryVisit,
  removeBrowserHistoryUrl,
  searchBrowserHistory,
  shouldRecordBrowserHistory,
  inAppBrowserPopupUrl,
  suggestBrowserHistory,
  suggestBrowserOmnibox,
  resolveInAppBrowserOmnibox
} from './browser-history'

describe('browser history', () => {
  it('records, suggests, and clears the in-app profile only', () => {
    expect(BROWSER_SESSION_PARTITION).toBe('persist:sharker-browser')
    expect(shouldRecordBrowserHistory('https://localhost:3000/pricing')).toBe(true)
    expect(shouldRecordBrowserHistory('file:///tmp/a.html')).toBe(true)
    expect(shouldRecordBrowserHistory('data:text/html,hi')).toBe(false)
    expect(shouldRecordBrowserHistory('about:blank')).toBe(false)
    expect(normalizeBrowserHistoryUrl('https://ex.com/a/')).toBe('https://ex.com/a')
    const first = recordBrowserHistoryVisit([], {
      url: 'https://ex.com/a/',
      title: 'Alpha',
      visitedAt: 100
    })
    expect(first).toEqual([{ url: 'https://ex.com/a', title: 'Alpha', visitedAt: 100 }])
    const again = recordBrowserHistoryVisit(first, {
      url: 'https://ex.com/a',
      title: 'Alpha 2',
      visitedAt: 200
    })
    expect(again).toEqual([{ url: 'https://ex.com/a', title: 'Alpha 2', visitedAt: 200 }])
    const two = recordBrowserHistoryVisit(again, {
      url: 'https://ex.com/b',
      title: 'Beta',
      visitedAt: 300
    })
    expect(searchBrowserHistory(two, 'beta').map((item) => item.url)).toEqual(['https://ex.com/b'])
    expect(searchBrowserHistory(two, '').map((item) => item.url)).toEqual([
      'https://ex.com/b',
      'https://ex.com/a'
    ])
    expect(suggestBrowserHistory(two, 'ex.com/a', 1).map((item) => item.url)).toEqual([
      'https://ex.com/a'
    ])
    expect(suggestBrowserOmnibox(two, 'https://ex.com/b', 'https://ex.com/b').map((item) => item.url)).toEqual(
      ['https://ex.com/b', 'https://ex.com/a']
    )
    expect(suggestBrowserOmnibox(two, 'alpha', 'https://ex.com/b').map((item) => item.url)).toEqual([
      'https://ex.com/a'
    ])
    expect(removeBrowserHistoryUrl(two, 'https://ex.com/b/')).toEqual(again)
    expect(browserHistoryClearCutoff('all', 1000)).toBe(0)
    expect(browserHistoryClearCutoff('hour', 3_600_000)).toBe(0)
    expect(
      clearBrowserHistory(
        [
          { url: 'https://old.com', title: '', visitedAt: 10 },
          { url: 'https://new.com', title: '', visitedAt: 9_999_000 }
        ],
        'hour',
        10_000_000
      )
    ).toEqual([{ url: 'https://old.com', title: '', visitedAt: 10 }])
    expect(clearBrowserHistory(two, 'all')).toEqual([])
    expect(browserHistoryLabel({ url: 'https://ex.com/a', title: 'Alpha', visitedAt: 1 })).toBe(
      'Alpha'
    )
    expect(browserHistoryLabel({ url: 'https://ex.com/a', title: '', visitedAt: 1 })).toBe('ex.com')
    expect(parseBrowserHistory('[{"url":"https://ok.com","title":"Ok","visitedAt":1}]')).toEqual([
      { url: 'https://ok.com', title: 'Ok', visitedAt: 1 }
    ])
    expect(parseBrowserHistory('nope')).toEqual([])
    const overflow = Array.from({ length: BROWSER_HISTORY_MAX + 5 }, (_, i) => ({
      url: `https://n${i}.com`,
      title: '',
      visitedAt: i
    }))
    expect(recordBrowserHistoryVisit(overflow, { url: 'https://fresh.com', visitedAt: 999 })).toHaveLength(
      BROWSER_HISTORY_MAX
    )
    expect(inAppBrowserPopupUrl('https://localhost:3000/docs')).toBe('https://localhost:3000/docs')
    expect(inAppBrowserPopupUrl('file:///tmp/a.html')).toBe('file:///tmp/a.html')
    expect(inAppBrowserPopupUrl('javascript:alert(1)')).toBe('')
    expect(inAppBrowserPopupUrl('about:blank')).toBe('')
    expect(resolveInAppBrowserOmnibox('file:///tmp/a.html', 'data:text/html,start')).toBe(
      'file:///tmp/a.html'
    )
    expect(resolveInAppBrowserOmnibox('https://ex.com', 'data:text/html,start')).toBe(
      'https://ex.com'
    )
    expect(resolveInAppBrowserOmnibox('javascript:alert(1)', 'data:text/html,start')).toBe(
      'data:text/html,start'
    )
    expect(resolveInAppBrowserOmnibox('index.html', 'data:text/html,start')).toBe(
      'https://index.html'
    )
    const browserSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/EmbeddedBrowser.tsx'),
      'utf8'
    )
    expect(browserSrc).toContain("addEventListener('new-window'")
    expect(browserSrc).toContain('inAppBrowserPopupUrl')
    expect(browserSrc).toContain('resolveInAppBrowserOmnibox')
    expect(browserSrc).toContain("action: 'deny'")
    expect(browserSrc).toContain('BROWSER_BACK_LABEL')
    expect(browserSrc).toContain('BROWSER_FORWARD_LABEL')
    expect(browserSrc).toContain('RELOAD_BROWSER_PAGE_LABEL')
    expect(browserSrc).toContain('OPEN_BROWSER_TAB_LABEL')
    expect(browserSrc).toContain('SEARCH_FROM_THE_ADDRESS_BAR_LABEL')
    expect(browserSrc).not.toContain('aria-label="后退"')
    expect(browserSrc).not.toContain('aria-label="前进"')
    expect(browserSrc).not.toContain('aria-label="地址栏"')
    expect(browserSrc).not.toContain('>主页<')
    expect(CLEAR_BROWSING_DATA_LABEL).toBe('Clear browsing data')
    expect(BROWSER_HISTORY_INTRO).toMatch(/search the built-in browser's history/)
    expect(BROWSER_CLEAR_INTRO).toMatch(/Use Clear browsing data/)
    const settingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/BrowserSettings.tsx'),
      'utf8'
    )
    expect(settingsSrc).toContain('CLEAR_BROWSING_DATA_LABEL')
    expect(settingsSrc).toContain('BROWSER_HISTORY_INTRO')
    expect(settingsSrc).toContain('BROWSER_CLEAR_INTRO')
    expect(settingsSrc).not.toContain('title="清除浏览数据"')
    expect(settingsSrc).not.toContain('>清除数据<')
    expect(settingsSrc).not.toContain('只含内置浏览器访问过的页面')
    expect(settingsSrc).not.toContain('只动内置浏览器配置')
  })
})
