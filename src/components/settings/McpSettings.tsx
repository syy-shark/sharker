/**
 * MCP 设置：插件市场 + 搜索 + 一键开关。
 * @see shared/mcp-catalog-data.ts
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { MCP_CATALOG } from '../../../shared/mcp-catalog-data'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import { SettingsCard, SettingsSection, SettingsToggle } from './SettingsPrimitives'
import './PluginCatalog.css'

interface PluginRow {
  id: string
  title: string
  description: string
  installed: boolean
  category: 'recommended' | 'more'
  feature?: 'computerUse' | 'browserUse'
}

interface Props {
  draft: AppSettings
}

function mergeCatalogWithInstalled(rows: PluginRow[] | null): PluginRow[] {
  const installedById = new Map((rows ?? []).map((r) => [r.id, r.installed]))
  return MCP_CATALOG.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    feature: item.feature,
    installed: installedById.get(item.id) ?? false
  }))
}

function matchesQuery(p: PluginRow, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const featureLabel = p.feature === 'computerUse' ? 'computer' : p.feature === 'browserUse' ? 'browser' : ''
  return (
    p.title.toLowerCase().includes(needle) ||
    p.description.toLowerCase().includes(needle) ||
    p.id.toLowerCase().includes(needle) ||
    featureLabel.includes(needle)
  )
}

/** MCP 插件目录设置面板 */
export function McpSettings({ draft }: Props) {
  const [plugins, setPlugins] = useState<PluginRow[]>(() => mergeCatalogWithInstalled(null))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const workspace = getActiveWorkspacePath(draft)

  const refresh = useCallback(async () => {
    setError('')
    try {
      if (window.sharker?.listMcpPlugins) {
        const rows = await window.sharker.listMcpPlugins(workspace)
        setPlugins(mergeCatalogWithInstalled(rows))
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setPlugins(mergeCatalogWithInstalled(null))
  }, [workspace])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleToggle = async (id: string, enabled: boolean) => {
    setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, installed: enabled } : p)))
    setBusyId(id)
    setError('')
    try {
      if (!window.sharker?.toggleMcpPlugin) throw new Error('请重启应用以加载最新版本')
      const rows = await window.sharker.toggleMcpPlugin(workspace, id, enabled)
      setPlugins(mergeCatalogWithInstalled(rows))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const filtered = useMemo(() => plugins.filter((p) => matchesQuery(p, query)), [plugins, query])

  const recommended = useMemo(
    () => filtered.filter((p) => p.category === 'recommended'),
    [filtered]
  )
  const more = useMemo(() => filtered.filter((p) => p.category === 'more'), [filtered])

  const renderList = (items: PluginRow[]) => (
    <ul className="plugin-catalog-list">
      {items.map((p) => (
        <li key={p.id} className="plugin-catalog-item plugin-catalog-item--compact">
          <div className="plugin-catalog-copy">
            <div className="plugin-catalog-title">
              {p.title}
              {p.feature ? (
                <span className="plugin-catalog-tag">
                  {p.feature === 'computerUse' ? 'Computer' : 'Browser'}
                </span>
              ) : null}
              {busyId === p.id ? (
                <span className="plugin-catalog-status">切换中…</span>
              ) : p.installed ? (
                <span className="plugin-catalog-status plugin-catalog-status--on">已启用</span>
              ) : null}
            </div>
            <p className="plugin-catalog-desc">{p.description}</p>
          </div>
          <SettingsToggle
            checked={p.installed}
            onChange={(v) => void handleToggle(p.id, v)}
            label={`${p.title} MCP`}
            disabled={busyId === p.id}
          />
        </li>
      ))}
    </ul>
  )

  const hasResults = recommended.length > 0 || more.length > 0

  return (
    <>
      <div className="plugin-catalog-search-wrap">
        <input
          type="search"
          className="plugin-catalog-search"
          placeholder="搜索 MCP 插件…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索 MCP 插件"
        />
      </div>

      {!hasResults ? (
        <p className="plugin-catalog-empty">没有匹配的 MCP 插件</p>
      ) : (
        <>
          {recommended.length > 0 ? (
            <SettingsSection title="推荐">
              <SettingsCard>{renderList(recommended)}</SettingsCard>
            </SettingsSection>
          ) : null}

          {more.length > 0 ? (
            <SettingsSection title="更多">
              <SettingsCard>{renderList(more)}</SettingsCard>
            </SettingsSection>
          ) : null}
        </>
      )}

      {error ? <p className="plugin-catalog-msg plugin-catalog-msg--error">{error}</p> : null}
    </>
  )
}
