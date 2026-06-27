/**
 * 扩展能力：Hooks / Codex 凭据 / 远程协作 / LSP。
 */
import { useCallback, useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { HookEntry } from '../../../agent/hooks/runner'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import {
  SettingsCard,
  SettingsPillButton,
  SettingsRow,
  SettingsSection
} from './SettingsPrimitives'

interface Props {
  draft: AppSettings
}

type ActionStatus = { kind: 'idle' | 'ok' | 'err'; text: string }

/** Hooks、Codex 凭据、远程、LSP 设置 */
export function ExtensionsSettings({ draft }: Props) {
  const [hooks, setHooks] = useState<HookEntry[]>([])
  const [oauth, setOauth] = useState<{ connected: boolean; email?: string }>({ connected: false })
  const [hookStatus, setHookStatus] = useState<ActionStatus>({ kind: 'idle', text: '' })
  const [oauthStatus, setOauthStatus] = useState<ActionStatus>({ kind: 'idle', text: '' })
  const [remoteStatus, setRemoteStatus] = useState<ActionStatus>({ kind: 'idle', text: '' })
  const [lspStatus, setLspStatus] = useState<ActionStatus>({ kind: 'idle', text: '' })
  const [oauthBusy, setOauthBusy] = useState(false)
  const workspace = getActiveWorkspacePath(draft)

  const refresh = useCallback(async () => {
    if (window.sharker?.listHooks) setHooks(await window.sharker.listHooks())
    if (window.sharker?.getOAuthGptMeta) setOauth(await window.sharker.getOAuthGptMeta())
    if (window.sharker?.getLspStatus) {
      const s = await window.sharker.getLspStatus()
      setLspStatus({
        kind: s.running ? 'ok' : 'idle',
        text: s.running ? `运行中：${s.server}` : '未启动'
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addHook = async () => {
    const next = [
      ...hooks,
      {
        id: crypto.randomUUID(),
        event: 'turn_done' as const,
        command: 'echo "Sharker hook fired"',
        enabled: true
      }
    ]
    await window.sharker.saveHooks(next)
    setHooks(next)
    setHookStatus({ kind: 'ok', text: '已添加示例 Hook（turn_done）' })
  }

  const importCodex = async () => {
    setOauthBusy(true)
    setOauthStatus({ kind: 'idle', text: '正在读取 ~/.codex/auth.json…' })
    try {
      const res = await window.sharker.startOAuthGpt()
      if (res.ok) {
        setOauthStatus({
          kind: 'ok',
          text: res.message || (res.email ? `已连接 ${res.email}` : '导入成功')
        })
        await refresh()
      } else {
        setOauthStatus({ kind: 'err', text: res.message || '未找到 Codex 登录' })
      }
    } catch (e) {
      setOauthStatus({
        kind: 'err',
        text: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setOauthBusy(false)
    }
  }

  return (
    <>
      <SettingsSection title="Hooks">
        <SettingsCard>
          <SettingsRow
            title="事件钩子"
            description={
              hooks.length === 0
                ? '在 turn_start / turn_done 等事件运行 shell 命令。'
                : `已配置 ${hooks.length} 个钩子`
            }
          >
            <SettingsPillButton onClick={() => void addHook()}>+ 示例</SettingsPillButton>
          </SettingsRow>
          {hooks.length > 0 ? (
            <ul className="ext-hook-list">
              {hooks.map((h) => (
                <li key={h.id} className="ext-hook-item">
                  <code className="ext-hook-event">{h.event}</code>
                  <span className="ext-hook-arrow">→</span>
                  <code className="ext-hook-cmd">{h.command}</code>
                </li>
              ))}
            </ul>
          ) : null}
          {hookStatus.text ? (
            <p className={`ext-status ext-status--${hookStatus.kind}`}>{hookStatus.text}</p>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="ChatGPT 订阅 (Codex)">
        <SettingsCard>
          <SettingsRow
            title={oauth.connected ? '已连接' : '未连接'}
            description={
              oauth.connected && oauth.email
                ? `账号：${oauth.email}`
                : '从本机 Codex CLI 导入 ~/.codex/auth.json（需先 codex login）'
            }
            last
          >
            <SettingsPillButton disabled={oauthBusy} onClick={() => void importCodex()}>
              {oauth.connected ? '重新导入' : '导入凭据'}
            </SettingsPillButton>
          </SettingsRow>
          {oauthStatus.text ? (
            <p className={`ext-status ext-status--${oauthStatus.kind}`}>{oauthStatus.text}</p>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="远程协作">
        <SettingsCard>
          <SettingsRow
            title="创建协作房间"
            description="生成 shareCode 供他人加入当前会话。"
            last
          >
            <SettingsPillButton
              onClick={() =>
                void window.sharker.createRemoteRoom('Sharker 会话').then((r) => {
                  setRemoteStatus({
                    kind: 'ok',
                    text: `房间「${r.name}」· 代码 ${r.shareCode}`
                  })
                }).catch((e) => {
                  setRemoteStatus({
                    kind: 'err',
                    text: e instanceof Error ? e.message : String(e)
                  })
                })
              }
            >
              创建
            </SettingsPillButton>
          </SettingsRow>
          {remoteStatus.text ? (
            <p className={`ext-status ext-status--${remoteStatus.kind}`}>{remoteStatus.text}</p>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="LSP">
        <SettingsCard>
          <SettingsRow
            title="TypeScript LSP"
            description={lspStatus.text || '为当前工作区启动语言服务。'}
            last
          >
            <SettingsPillButton
              onClick={() =>
                void window.sharker.startLsp(workspace).then((s) => {
                  setLspStatus({
                    kind: s.running ? 'ok' : 'err',
                    text: s.running
                      ? `运行中：${s.server}`
                      : s.lastError ?? '启动失败'
                  })
                }).catch((e) => {
                  setLspStatus({
                    kind: 'err',
                    text: e instanceof Error ? e.message : String(e)
                  })
                })
              }
            >
              启动
            </SettingsPillButton>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
