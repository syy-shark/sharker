/**
 * 个性化：启用记忆（官方默认关）、Choose a personality 与 Custom instructions（对标 Codex Settings → Personalization）。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { AgentPersonality } from '../../../shared/personality'
import {
  CHOOSE_A_PERSONALITY_LABEL,
  CUSTOM_INSTRUCTIONS_DESCRIPTION,
  CUSTOM_INSTRUCTIONS_HINT,
  CUSTOM_INSTRUCTIONS_LABEL,
  PERSONALITY_INTRO,
  PERSONALITY_OPTIONS,
  parsePersonality
} from '../../../shared/personality'
import {
  ENABLE_MEMORIES_DESCRIPTION,
  ENABLE_MEMORIES_LABEL,
  GENERATE_MEMORIES_DESCRIPTION,
  GENERATE_MEMORIES_LABEL,
  USE_MEMORIES_DESCRIPTION,
  USE_MEMORIES_LABEL
} from '../../../shared/memory-command'
import {
  SettingsCard,
  SettingsChoiceGroup,
  SettingsRow,
  SettingsSection,
  SettingsToggle
} from './SettingsPrimitives'
import './PersonalizationSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 设置 → 个性化 */
export function PersonalizationSettings({ draft, setDraft, onSave }: Props) {
  const [instructions, setInstructions] = useState('')
  const [instructionsPath, setInstructionsPath] = useState('')
  const [overrideActive, setOverrideActive] = useState(false)
  const draftRef = useRef(draft)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const instructionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (instructionsTimer.current) clearTimeout(instructionsTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!window.sharker.getPersonalAgentsMd) return
    void window.sharker.getPersonalAgentsMd().then((doc) => {
      setInstructions(doc.content)
      setInstructionsPath(doc.path)
      setOverrideActive(doc.overrideActive)
    })
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
    <>
      <SettingsSection title="Memories">
        <SettingsCard>
          <SettingsRow
            title={ENABLE_MEMORIES_LABEL}
            description={ENABLE_MEMORIES_DESCRIPTION}
          >
            <SettingsToggle
              checked={draft.memoriesEnabled === true}
              onChange={(memoriesEnabled) => {
                scheduleSave({ ...draftRef.current, memoriesEnabled })
              }}
              label={ENABLE_MEMORIES_LABEL}
            />
          </SettingsRow>
          <SettingsRow
            title={USE_MEMORIES_LABEL}
            description={USE_MEMORIES_DESCRIPTION}
          >
            <SettingsToggle
              checked={draft.memoryInjection !== false}
              disabled={draft.memoriesEnabled !== true}
              onChange={(memoryInjection) => {
                scheduleSave({ ...draftRef.current, memoryInjection })
              }}
              label={USE_MEMORIES_LABEL}
            />
          </SettingsRow>
          <SettingsRow
            title={GENERATE_MEMORIES_LABEL}
            description={GENERATE_MEMORIES_DESCRIPTION}
            last
          >
            <SettingsToggle
              checked={draft.memoryGeneration !== false}
              disabled={draft.memoriesEnabled !== true}
              onChange={(memoryGeneration) => {
                scheduleSave({ ...draftRef.current, memoryGeneration })
              }}
              label={GENERATE_MEMORIES_LABEL}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={CHOOSE_A_PERSONALITY_LABEL} description={PERSONALITY_INTRO}>
        <SettingsCard>
          <SettingsChoiceGroup
            value={parsePersonality(draft.personality)}
            onChange={(personality: AgentPersonality) => {
              scheduleSave({ ...draftRef.current, personality })
            }}
            options={PERSONALITY_OPTIONS.map((o) => ({
              value: o.id,
              title: o.title,
              description: o.description,
              icon: <span aria-hidden>{o.title.slice(0, 1)}</span>
            }))}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={CUSTOM_INSTRUCTIONS_LABEL} description={CUSTOM_INSTRUCTIONS_DESCRIPTION}>
        <SettingsCard>
          <SettingsRow
            title={CUSTOM_INSTRUCTIONS_LABEL}
            description={
              overrideActive
                ? `写入 ${instructionsPath || '~/.sharker/AGENTS.md'}。当前有 AGENTS.override.md，注入会优先用 override。`
                : CUSTOM_INSTRUCTIONS_HINT
            }
            last
          >
            <span className="personalization-instructions-hint">~/.sharker</span>
          </SettingsRow>
          <textarea
            className="personalization-instructions"
            value={instructions}
            spellCheck={false}
            placeholder={CUSTOM_INSTRUCTIONS_HINT}
            aria-label={CUSTOM_INSTRUCTIONS_LABEL}
            onChange={(e) => {
              const content = e.target.value
              setInstructions(content)
              if (!window.sharker.savePersonalAgentsMd) return
              if (instructionsTimer.current) clearTimeout(instructionsTimer.current)
              instructionsTimer.current = setTimeout(() => {
                void window.sharker.savePersonalAgentsMd(content)
              }, 320)
            }}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
