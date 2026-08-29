/**
 * 设置 → 浏览器：本机内置浏览历史、重新打开、删除、清除数据、下载目录。
 * 对标 Codex Settings → Browser。不发明 @Browser / Computer Use / 导入系统配置。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, Trash2 } from 'lucide-react'
import type { AppSettings } from '../../../shared/types'
import {
  parseBrowserAskWhereToSave,
  parseBrowserDownloadPath
} from '../../../shared/browser-downloads'
import {
  BROWSER_HISTORY_CHANGED_EVENT,
  browserHistoryLabel,
  clearBrowserHistory,
  removeBrowserHistoryUrl,
  searchBrowserHistory,
  type BrowserHistoryClearRange,
  type BrowserHistoryEntry
} from '../../../shared/browser-history'
import {
  dispatchOpenBrowserUrl,
  loadBrowserHistory,
  saveBrowserHistory
} from '../../lib/browser-history-store'
import {
  SettingsCard,
  SettingsPillButton,
  SettingsRow,
  SettingsSection,
  SettingsToggle
} from './SettingsPrimitives'
import './BrowserSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

const RANGES: Array<{ id: BrowserHistoryClearRange; label: string }> = [
  { id: 'hour', label: '过去 1 小时' },
  { id: 'day', label: '过去 24 小时' },
  { id: 'week', label: '过去 7 天' },
  { id: 'month', label: '过去 4 周' },
  { id: 'all', label: '全部时间' }
]

function formatVisited(ts: number): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

/** 内置浏览器资料：历史、清除与下载 */
export function BrowserSettings({ draft, setDraft, onSave }: Props) {
  const draftRef = useRef(draft)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [entries, setEntries] = useState<BrowserHistoryEntry[]>(() => loadBrowserHistory())
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<BrowserHistoryClearRange>('day')
  const [clearHistory, setClearHistory] = useState(true)
  const [clearCookies, setClearCookies] = useState(false)
  const [clearCache, setClearCache] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const scheduleSave = useCallback(
    (next: AppSettings) => {
      setDraft(next)
      draftRef.current = next
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void onSave(next)
      }, 180)
    },
    [onSave, setDraft]
  )

  const refresh = useCallback(() => {
    setEntries(loadBrowserHistory())
  }, [])

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener(BROWSER_HISTORY_CHANGED_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(BROWSER_HISTORY_CHANGED_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [refresh])

  const visible = searchBrowserHistory(entries, query)

  const handleRemove = (url: string) => {
    setEntries(saveBrowserHistory(removeBrowserHistoryUrl(entries, url)))
  }

  const handleClear = async () => {
    if (!clearHistory && !clearCookies && !clearCache) return
    setBusy(true)
    try {
      if (clearHistory) setEntries(saveBrowserHistory(clearBrowserHistory(entries, range)))
      if (clearCookies || clearCache) {
        await window.sharker?.clearBrowserData?.({
          cookies: clearCookies,
          cache: clearCache
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const downloadPath = parseBrowserDownloadPath(draft.browserDownloadPath)
  const askWhere = parseBrowserAskWhereToSave(draft.browserAskWhereToSave)

  const handlePickDownloadDir = async () => {
    const picked = await window.sharker?.pickWorkspaceFolder?.()
    if (!picked) return
    const browserDownloadPath = parseBrowserDownloadPath(picked)
    if (!browserDownloadPath) return
    scheduleSave({ ...draftRef.current, browserDownloadPath })
  }

  return (
    <>
      <SettingsSection title="下载">
        <SettingsCard>
          <SettingsRow
            title="下载位置"
            description={
              downloadPath
                ? downloadPath
                : '默认保存到系统下载文件夹。可选其它目录，或恢复默认。'
            }
          >
            <div className="browser-settings-actions">
              <SettingsPillButton onClick={() => void handlePickDownloadDir()}>
                选择位置
              </SettingsPillButton>
              <SettingsPillButton
                onClick={() => scheduleSave({ ...draftRef.current, browserDownloadPath: '' })}
              >
                恢复默认
              </SettingsPillButton>
            </div>
          </SettingsRow>
          <SettingsRow
            title="每次询问保存位置"
            description="下载前弹出另存为。关闭则直接写入上面的目录。"
            last
          >
            <SettingsToggle
              checked={askWhere}
              label="每次询问保存位置"
              onChange={(browserAskWhereToSave) => {
                scheduleSave({ ...draftRef.current, browserAskWhereToSave })
              }}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="浏览历史">
        <SettingsCard>
          <SettingsRow
            title="搜索历史"
            description="只含内置浏览器访问过的页面，不含系统 Chrome。"
          >
            <input
              className="browser-settings-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题或网址"
              aria-label="搜索浏览历史"
            />
          </SettingsRow>
        </SettingsCard>
        {visible.length === 0 ? (
          <p className="browser-settings-empty">
            {entries.length === 0 ? '还没有浏览记录。在内置浏览器打开网页后会出现在这里。' : '没有匹配的记录。'}
          </p>
        ) : (
          <ul className="browser-settings-list">
            {visible.map((item) => (
              <li key={item.url} className="browser-settings-item">
                <button
                  type="button"
                  className="browser-settings-open"
                  title={item.url}
                  onClick={() => dispatchOpenBrowserUrl(item.url)}
                >
                  <Globe size={14} aria-hidden />
                  <span className="browser-settings-copy">
                    <span className="browser-settings-title">{browserHistoryLabel(item)}</span>
                    <span className="browser-settings-url">{item.url}</span>
                  </span>
                  <span className="browser-settings-time">{formatVisited(item.visitedAt)}</span>
                </button>
                <button
                  type="button"
                  className="browser-settings-remove"
                  aria-label={`删除 ${browserHistoryLabel(item)}`}
                  title="删除"
                  onClick={() => handleRemove(item.url)}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="清除浏览数据">
        <SettingsCard>
          <SettingsRow title="时间范围" description="历史按此窗口删除；Cookie 与缓存一次清掉该配置内全部。">
            <select
              className="browser-settings-range"
              value={range}
              onChange={(event) => setRange(event.target.value as BrowserHistoryClearRange)}
              aria-label="清除时间范围"
            >
              {RANGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </SettingsRow>
          <label className="browser-settings-check">
            <input
              type="checkbox"
              checked={clearHistory}
              onChange={(event) => setClearHistory(event.target.checked)}
            />
            浏览历史
          </label>
          <label className="browser-settings-check">
            <input
              type="checkbox"
              checked={clearCookies}
              onChange={(event) => setClearCookies(event.target.checked)}
            />
            Cookie 与网站数据
          </label>
          <label className="browser-settings-check">
            <input
              type="checkbox"
              checked={clearCache}
              onChange={(event) => setClearCache(event.target.checked)}
            />
            缓存的图片与文件
          </label>
          <SettingsRow title="清除" description="只动内置浏览器配置，不影响对话或系统浏览器。" last>
            <button
              type="button"
              className="browser-settings-clear"
              disabled={busy || (!clearHistory && !clearCookies && !clearCache)}
              onClick={() => void handleClear()}
            >
              {busy ? '正在清除…' : '清除数据'}
            </button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
