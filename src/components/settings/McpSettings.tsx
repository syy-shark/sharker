/**
 * 设置 → MCP 服务器：列表、开关、添加 STDIO / Streamable HTTP（官方传输说明）、Restart。
 * 对标 Codex Settings → MCP servers。不假装 OAuth Authenticate。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useState } from 'react'
import type { McpServerConfig, McpServerDraft } from '../../../shared/mcp-config'
import {
  draftToMcpServer,
  formatMcpEnvText,
  isMcpServerEnabled,
  mcpServerKind,
  mcpServerLaunchLabel
} from '../../../shared/mcp-config'
import {
  ADD_SERVER_LABEL,
  MCP_COMMAND_LABEL,
  MCP_HTTP_DESCRIPTION,
  MCP_NAME_LABEL,
  MCP_SERVERS_INTRO,
  MCP_STDIO_DESCRIPTION,
  REMOVE_LABEL,
  SAVE_LABEL
} from '../../../shared/reveal-in-folder'
import {
  SettingsCard,
  SettingsChoiceGroup,
  SettingsPillButton,
  SettingsRow,
  SettingsSection,
  SettingsToggle
} from './SettingsPrimitives'
import '../../pages/SettingsPage.css'
import './McpSettings.css'

interface Props {
  workspacePath: string
}

const EMPTY_DRAFT: McpServerDraft = {
  name: '',
  kind: 'stdio',
  command: '',
  argsText: '',
  envText: '',
  url: '',
  bearerTokenEnvVar: ''
}

/** 设置 → MCP 服务器 */
export function McpSettings({ workspacePath }: Props) {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [configPath, setConfigPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<McpServerDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [restartNote, setRestartNote] = useState('')

  const applySnapshot = useCallback(
    (next: { path: string; servers: McpServerConfig[] }) => {
      setConfigPath(next.path)
      setServers(next.servers)
    },
    []
  )

  const reload = useCallback(async () => {
    if (!window.sharker.listMcpServers) {
      setLoading(false)
      return
    }
    try {
      applySnapshot(await window.sharker.listMcpServers(workspacePath || ''))
    } catch {
      setServers([])
    } finally {
      setLoading(false)
    }
  }, [applySnapshot, workspacePath])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  const onToggle = async (name: string, enabled: boolean) => {
    if (!window.sharker.setMcpServerEnabled) return
    setBusy(true)
    try {
      applySnapshot(await window.sharker.setMcpServerEnabled(workspacePath || '', name, enabled))
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (name: string) => {
    if (!window.sharker.removeMcpServer) return
    setBusy(true)
    try {
      applySnapshot(await window.sharker.removeMcpServer(workspacePath || '', name))
    } finally {
      setBusy(false)
    }
  }

  const onSave = async () => {
    const parsed = draftToMcpServer(draft)
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    if (!window.sharker.upsertMcpServer) return
    setBusy(true)
    setFormError('')
    try {
      applySnapshot(await window.sharker.upsertMcpServer(workspacePath || '', parsed.server))
      setDraft(EMPTY_DRAFT)
      setRestartNote('已保存。点 Restart 后下一轮对话才会连上新 Server。')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onRestart = async () => {
    if (!window.sharker.restartMcpServers) return
    setBusy(true)
    try {
      await window.sharker.restartMcpServers()
      setRestartNote('已 Restart。下一轮对话会重新连接已启用的 Server。')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="mcp-empty">加载中…</p>
  }

  return (
    <div className="mcp-settings">
      <SettingsSection title="已配置的 Server">
        <SettingsCard>
          {servers.length === 0 ? (
            <p className="mcp-empty mcp-empty--inset">
              {MCP_SERVERS_INTRO}{' '}
              <code>{configPath || '~/.sharker/mcp.json'}</code>
            </p>
          ) : (
            servers.map((server, index) => {
              const kind = mcpServerKind(server)
              const last = index === servers.length - 1
              return (
                <SettingsRow
                  key={server.name}
                  title={server.name}
                  description={`${kind === 'http' ? 'Streamable HTTP' : 'STDIO'} · ${
                    mcpServerLaunchLabel(server) || '—'
                  }${!isMcpServerEnabled(server) ? ' · 已关闭' : ''}`}
                  last={last}
                >
                  <div className="mcp-row-actions">
                    <SettingsToggle
                      checked={isMcpServerEnabled(server)}
                      onChange={(on) => void onToggle(server.name, on)}
                      label={`${isMcpServerEnabled(server) ? '关闭' : '启用'} ${server.name}`}
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="btn-danger-ghost"
                      disabled={busy}
                      onClick={() => void onRemove(server.name)}
                    >
                      {REMOVE_LABEL}
                    </button>
                  </div>
                </SettingsRow>
              )
            })
          )}
        </SettingsCard>
        <div className="mcp-toolbar">
          <SettingsPillButton onClick={() => void onRestart()}>Restart</SettingsPillButton>
          {restartNote ? <span className="mcp-note">{restartNote}</span> : null}
        </div>
      </SettingsSection>

      <SettingsSection title={ADD_SERVER_LABEL}>
        <SettingsCard>
          <div className="st-card--stack mcp-form">
            <SettingsChoiceGroup
              value={draft.kind}
              onChange={(kind) => setDraft((prev) => ({ ...prev, kind }))}
              options={[
                {
                  value: 'stdio',
                  title: 'STDIO',
                  description: MCP_STDIO_DESCRIPTION,
                  icon: <span aria-hidden>本</span>
                },
                {
                  value: 'http',
                  title: 'Streamable HTTP',
                  description: MCP_HTTP_DESCRIPTION,
                  icon: <span aria-hidden>网</span>
                }
              ]}
            />
            <label className="settings-field">
              {MCP_NAME_LABEL}
              <input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="context7"
                autoComplete="off"
              />
            </label>
            {draft.kind === 'stdio' ? (
              <>
                <label className="settings-field">
                  {MCP_COMMAND_LABEL}
                  <input
                    value={draft.command ?? ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, command: e.target.value }))}
                    placeholder="npx"
                    autoComplete="off"
                  />
                </label>
                <label className="settings-field">
                  参数
                  <input
                    value={draft.argsText ?? ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, argsText: e.target.value }))}
                    placeholder="-y @upstash/context7-mcp"
                    autoComplete="off"
                  />
                </label>
                <label className="settings-field">
                  环境变量
                  <textarea
                    className="mcp-env"
                    value={draft.envText ?? formatMcpEnvText()}
                    onChange={(e) => setDraft((prev) => ({ ...prev, envText: e.target.value }))}
                    placeholder={'TOKEN=…'}
                    rows={3}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="settings-field">
                  URL
                  <input
                    value={draft.url ?? ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder="https://mcp.example.com/mcp"
                    autoComplete="off"
                  />
                </label>
                <label className="settings-field">
                  Bearer 环境变量
                  <input
                    value={draft.bearerTokenEnvVar ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, bearerTokenEnvVar: e.target.value }))
                    }
                    placeholder="FIGMA_OAUTH_TOKEN"
                    autoComplete="off"
                  />
                </label>
              </>
            )}
            {formError ? <p className="test-result err">{formError}</p> : null}
            <div>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void onSave()}>
                {SAVE_LABEL}
              </button>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
