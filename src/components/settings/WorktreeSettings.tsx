/**
 * 设置 → Worktrees：Worktree root、托管保留数、官方 `.worktreeinclude` leftover。
 * 对标 Codex Settings → Worktrees。不发明环境编辑器、`.worktreeinclude` 编辑器或单独未落盘的自动删除开关。
 * @see src/components/settings/ARCH.md
 */
import { useEffect, useRef } from 'react'
import type { AppSettings } from '../../../shared/types'
import {
  WORKTREE_ROOT_LABEL,
  WORKTREES_SETTINGS_INTRO,
  WORKTREES_SETTINGS_LABEL
} from '../../../shared/reveal-in-folder'
import {
  WORKTREE_INCLUDE_AGENTS_HINT,
  WORKTREE_INCLUDE_HINT,
  WORKTREE_INCLUDE_INTRO
} from '../../../shared/worktree-include'
import { clampWorktreeKeepCount } from '../../../shared/worktree-prune'
import { clampWorktreeRoot } from '../../../shared/worktree-root'
import { SettingsCard, SettingsRow, SettingsSection } from './SettingsPrimitives'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** Official Settings → Worktrees：根目录 + keep count（0 = 关闭自动删除） */
export function WorktreeSettings({ draft, setDraft, onSave }: Props) {
  const draftRef = useRef(draft)
  const rootTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    return () => {
      if (rootTimer.current) clearTimeout(rootTimer.current)
    }
  }, [])

  const scheduleRootSave = (worktreeRoot: string) => {
    const next = { ...draftRef.current, worktreeRoot }
    setDraft(next)
    if (rootTimer.current) clearTimeout(rootTimer.current)
    rootTimer.current = setTimeout(() => {
      void onSave({ ...draftRef.current, worktreeRoot })
    }, 320)
  }

  return (
    <SettingsSection title={WORKTREES_SETTINGS_LABEL} description={WORKTREES_SETTINGS_INTRO}>
      <p className="st-section-desc" title={WORKTREE_INCLUDE_INTRO}>
        {WORKTREE_INCLUDE_INTRO}
      </p>
      <p className="st-section-desc" title={WORKTREE_INCLUDE_HINT}>
        {WORKTREE_INCLUDE_HINT} {WORKTREE_INCLUDE_AGENTS_HINT}
      </p>
      <SettingsCard>
        <SettingsRow
          title={WORKTREE_ROOT_LABEL}
          description="Managed and permanent worktrees are created here. Empty uses ~/.sharker/worktrees. Absolute paths only; changing this does not move existing directories."
        >
          <input
            className="st-number"
            type="text"
            spellCheck={false}
            value={draft.worktreeRoot ?? ''}
            placeholder="~/.sharker/worktrees"
            aria-label={WORKTREE_ROOT_LABEL}
            style={{ width: '16rem', textAlign: 'left' }}
            onChange={(e) => scheduleRootSave(e.target.value)}
            onBlur={() => {
              const worktreeRoot = clampWorktreeRoot(draftRef.current.worktreeRoot)
              const next = { ...draftRef.current, worktreeRoot }
              setDraft(next)
              void onSave(next)
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Keep recent worktrees"
          description="Default 15 Codex-managed worktrees. Set 0 to turn off automatic deletion. Archiving a chat still removes its managed worktree."
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
            aria-label="Keep recent worktrees"
          />
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
