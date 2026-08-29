/**
 * 权限模式与网络隔离选择
 * @see src/ARCH.md
 */
import { useEffect, useRef } from 'react'
import type { AppSettings, NetworkMode, PermissionMode } from '../../../shared/types'
import { parseReviewDelivery, type ReviewDelivery } from '../../../shared/review-prompt'
import {
  parseToolOutputDisplay,
  type ToolOutputDisplay
} from '../../../shared/tool-output-display'
import { clampWorktreeKeepCount } from '../../../shared/worktree-prune'
import { clampWorktreeRoot } from '../../../shared/worktree-root'
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
                description: '官方默认：能在当前对话跑 /review 就在当前对话。直播中排队或注入，不中止。',
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

      <SettingsSection title="Worktree">
        <SettingsCard>
          <SettingsRow
            title="Worktree 根目录"
            description="对标 Codex Worktree root：托管与永久 worktree 建在此目录下。空则 ~/.sharker/worktrees。须填绝对路径；改了不搬旧目录。"
          >
            <input
              className="st-number"
              type="text"
              spellCheck={false}
              value={draft.worktreeRoot ?? ''}
              placeholder="~/.sharker/worktrees"
              aria-label="Worktree 根目录"
              style={{ width: '16rem', textAlign: 'left' }}
              onChange={(e) => scheduleGitPromptSave({ worktreeRoot: e.target.value })}
              onBlur={() => {
                const worktreeRoot = clampWorktreeRoot(draftRef.current.worktreeRoot)
                const next = { ...draftRef.current, worktreeRoot }
                setDraft(next)
                void onSave(next)
              }}
            />
          </SettingsRow>
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
