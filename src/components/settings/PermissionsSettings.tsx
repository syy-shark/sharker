/**
 * 权限模式与网络隔离选择；/review 交付在通用。
 * @see src/ARCH.md
 */
import { useEffect, useRef } from 'react'
import type { AppSettings, NetworkMode, PermissionMode } from '../../../shared/types'
import {
  ASK_FOR_APPROVAL_DESCRIPTION,
  ASK_FOR_APPROVAL_LABEL,
  FULL_ACCESS_DESCRIPTION,
  FULL_ACCESS_LABEL,
  PERMISSIONS_LABEL
} from '../../../shared/permission-mode'
import {
  parseToolOutputDisplay,
  type ToolOutputDisplay
} from '../../../shared/tool-output-display'
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

/** Ask for approval / Full access 选择面板（对标 Codex Settings → General → Permissions） */
export function PermissionsSettings({ draft, setDraft, onSave }: Props) {
  const draftRef = useRef(draft)
  const gitPromptTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    return () => {
      if (gitPromptTimer.current) clearTimeout(gitPromptTimer.current)
    }
  }, [])

  const scheduleGitPromptSave = (patch: Partial<AppSettings>) => {
    const next = { ...draftRef.current, ...patch }
    setDraft(next)
    if (gitPromptTimer.current) clearTimeout(gitPromptTimer.current)
    gitPromptTimer.current = setTimeout(() => {
      void onSave({ ...draftRef.current, ...patch })
    }, 320)
  }

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
      <SettingsSection title={PERMISSIONS_LABEL}>
        <SettingsCard>
          <SettingsChoiceGroup
            value={draft.permissionMode}
            onChange={setMode}
            options={[
              {
                value: 'sandbox',
                title: ASK_FOR_APPROVAL_LABEL,
                description: ASK_FOR_APPROVAL_DESCRIPTION,
                icon: <SandboxModeIcon />
              },
              {
                value: 'full',
                title: FULL_ACCESS_LABEL,
                description: FULL_ACCESS_DESCRIPTION,
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

      <SettingsSection title="Git">
        <SettingsCard>
          <SettingsRow
            title="Commit 文案模板"
            description="对标 Codex Settings → Git：生成 commit message 时写入 system 与 git-commit skill。"
          >
            <span className="st-row-badge">模板</span>
          </SettingsRow>
          <textarea
            className="st-textarea"
            value={draft.gitCommitPrompt ?? ''}
            spellCheck={false}
            placeholder="例如：用 Conventional Commits；说明为什么改，不要罗列文件名。"
            aria-label="Commit 文案模板"
            onChange={(e) => scheduleGitPromptSave({ gitCommitPrompt: e.target.value })}
          />
          <SettingsRow
            title="PR 文案模板"
            description="生成 pull request 标题与描述时使用。"
          >
            <span className="st-row-badge">模板</span>
          </SettingsRow>
          <textarea
            className="st-textarea"
            value={draft.gitPrPrompt ?? ''}
            spellCheck={false}
            placeholder="例如：Summary 2–3 条 + Test plan 清单。"
            aria-label="PR 文案模板"
            onChange={(e) => scheduleGitPromptSave({ gitPrPrompt: e.target.value })}
          />
          <SettingsRow
            title="始终 force-with-lease 推送"
            description="对标 Codex Always force push：审查面板推送使用 git push --force-with-lease，从不 --force。默认关。"
          >
            <SettingsToggle
              checked={draft.gitForceWithLease === true}
              onChange={(gitForceWithLease) => {
                const next = { ...draftRef.current, gitForceWithLease }
                setDraft(next)
                void onSave(next)
              }}
              label="始终 force-with-lease 推送"
            />
          </SettingsRow>
          <SettingsRow
            title="分支名前缀"
            description="对标 Codex Git branch naming：审查面板与 agent 新建分支时自动加上。空则不加。没有 / 会补上。"
            last
          >
            <input
              className="st-number"
              type="text"
              spellCheck={false}
              value={draft.gitBranchPrefix ?? ''}
              placeholder="codex"
              aria-label="分支名前缀"
              style={{ width: '9rem', textAlign: 'left' }}
              onChange={(e) => scheduleGitPromptSave({ gitBranchPrefix: e.target.value })}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="项目与终端">
        <SettingsCard>
          <SettingsChoiceGroup
            value={parseToolOutputDisplay(draft.toolOutputDisplay)}
            onChange={(toolOutputDisplay: ToolOutputDisplay) => {
              const next = { ...draft, toolOutputDisplay }
              setDraft(next)
              void onSave(next)
            }}
            options={[
              {
                value: 'brief',
                title: '简要',
                description: '对话里不展开命令输出，只保留步骤摘要。',
                icon: <span aria-hidden>简</span>
              },
              {
                value: 'standard',
                title: '标准',
                description: '折叠查看，只画输出尾部，避免直播贴底跳动。',
                icon: <span aria-hidden>标</span>
              },
              {
                value: 'verbose',
                title: '详细',
                description: '完成后默认展开更长尾部。直播中仍折叠。',
                icon: <span aria-hidden>详</span>
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
