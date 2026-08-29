/**
 * 建议提示：空对话上下文芯片开关。
 * 对标 Codex Settings → Suggested prompts。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef } from 'react'
import type { AppSettings } from '../../../shared/types'
import { SUGGESTED_PROMPTS_SETTINGS_LABEL } from '../../../shared/reveal-in-folder'
import { SettingsCard, SettingsRow, SettingsSection, SettingsToggle } from './SettingsPrimitives'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 设置 → 建议提示 */
export function SuggestedPromptSettings({ draft, setDraft, onSave }: Props) {
  const draftRef = useRef(draft)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return (
    <SettingsSection title={SUGGESTED_PROMPTS_SETTINGS_LABEL}>
      <SettingsCard>
        <SettingsRow
          title="上下文建议"
          description="空对话显示要继续的任务，以及审查 / 目标。对标 Codex Settings → Suggested prompts。"
          last
        >
          <SettingsToggle
            checked={draft.suggestedPrompts !== false}
            onChange={(suggestedPrompts) => {
              scheduleSave({ ...draftRef.current, suggestedPrompts })
            }}
            label={SUGGESTED_PROMPTS_SETTINGS_LABEL}
          />
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
