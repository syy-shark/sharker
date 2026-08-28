/**
 * 权限模式与网络隔离选择
 * @see src/ARCH.md
 */
import type { AppSettings, NetworkMode, PermissionMode } from '../../../shared/types'
import { parseReviewDelivery, type ReviewDelivery } from '../../../shared/review-prompt'
import { clampWorktreeKeepCount } from '../../../shared/worktree-prune'
import {
  FullModeIcon,
  SandboxModeIcon,
  SettingsCard,
  SettingsChoiceGroup,
  SettingsRow,
  SettingsSection,
  SettingsToggle
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

      <SettingsSection title="记忆">
        <SettingsCard>
          <SettingsRow
            title="注入记忆"
            description="对标 Codex /memories：把检索到的长期记忆写入本轮 system。"
          >
            <SettingsToggle
              checked={draft.memoryInjection !== false}
              onChange={(v) => {
                const next = { ...draft, memoryInjection: v }
                setDraft(next)
                void onSave(next)
              }}
              label="注入记忆"
            />
          </SettingsRow>
          <SettingsRow
            title="写入记忆"
            description="回合结束后提炼偏好与事实。关闭后仍记录会话事件。"
            last
          >
            <SettingsToggle
              checked={draft.memoryGeneration !== false}
              onChange={(v) => {
                const next = { ...draft, memoryGeneration: v }
                setDraft(next)
                void onSave(next)
              }}
              label="写入记忆"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Git">
        <SettingsCard>
          <SettingsChoiceGroup
            value={parseReviewDelivery(draft.reviewDelivery)}
            onChange={(reviewDelivery: ReviewDelivery) => {
              const next = { ...draft, reviewDelivery }
              setDraft(next)
              void onSave(next)
            }}
            options={[
              {
                value: 'inline',
                title: '当前对话',
                description: '对标 Codex Inline：能在当前对话跑 /review 就在当前对话。',
                icon: <span aria-hidden>内</span>
              },
              {
                value: 'detached',
                title: '独立线程',
                description: '对标 Codex Detached：/review 新开审查对话。here / detached 可单次覆盖。',
                icon: <span aria-hidden>独</span>
              }
            ]}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Worktree">
        <SettingsCard>
          <SettingsRow
            title="托管 worktree 保留数"
            description="对标 Codex：默认保留最近 15 个。填 0 则不自动删除。归档对话仍会清掉对应托管 worktree。"
            last
          >
            <input
              className="st-number"
              type="number"
              min={0}
              max={99}
              value={draft.worktreeKeepCount ?? 15}
              onChange={(e) => {
                const next = {
                  ...draft,
                  worktreeKeepCount: clampWorktreeKeepCount(e.target.value)
                }
                setDraft(next)
                void onSave(next)
              }}
              aria-label="托管 worktree 保留数"
            />
          </SettingsRow>
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
