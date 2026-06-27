/**
 * 权限模式与网络隔离选择
 * @see src/README.md
 */
import type { AppSettings, NetworkMode, PermissionMode } from '../../../shared/types'
import {
  FullModeIcon,
  SandboxModeIcon,
  SettingsCard,
  SettingsChoiceGroup,
  SettingsRow,
  SettingsSection
} from './SettingsPrimitives'

/** PermissionsSettings Props：设置草稿与保存回调 */
interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 沙箱/完全权限模式选择面板 */
export function PermissionsSettings({ draft, setDraft, onSave }: Props) {
  const setMode = (mode: PermissionMode) => {
    const next = { ...draft, permissionMode: mode }
    setDraft(next)
    void onSave(next)
  }

  const setNetworkMode = (networkMode: NetworkMode) => {
    const next = { ...draft, networkMode }
    setDraft(next)
    void onSave(next)
  }

  return (
    <>
      <SettingsSection title="工作模式">
        <SettingsCard>
          <SettingsChoiceGroup
            value={draft.permissionMode}
            onChange={setMode}
            options={[
              {
                value: 'sandbox',
                title: '沙箱',
                description: '仅允许访问当前工作区内的文件与命令。',
                icon: <SandboxModeIcon />
              },
              {
                value: 'full',
                title: '完全权限',
                description: '可访问整机文件系统；请谨慎使用。',
                icon: <FullModeIcon />
              }
            ]}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="网络模式">
        <SettingsCard>
          <SettingsChoiceGroup
            value={draft.networkMode ?? 'open'}
            onChange={setNetworkMode}
            options={[
              {
                value: 'open',
                title: 'Open',
                description: '允许 web_fetch 与 shell 出站（继承主机网络）。',
                icon: <FullModeIcon />
              },
              {
                value: 'local_only',
                title: 'Local',
                description: 'web 仅限 localhost / 内网；shell 仍可用。',
                icon: <SandboxModeIcon />
              },
              {
                value: 'disabled',
                title: 'Closed',
                description: '阻断 web 与常见出站 shell（curl/npm/git remote 等）。',
                icon: <SandboxModeIcon />
              }
            ]}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="安全">
        <SettingsCard>
          <SettingsRow
            title="高危操作确认"
            description="删除文件、执行危险命令等仍会弹出确认窗口。"
            last
          >
            <span className="st-row-badge">已启用</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
