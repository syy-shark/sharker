/**
 * 个性化：启用记忆（官方默认关）、人格与个人 AGENTS.md（对标 Codex Settings → Personalization）。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { AgentPersonality } from '../../../shared/personality'
import { PERSONALITY_OPTIONS, parsePersonality } from '../../../shared/personality'
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
      <SettingsSection title="记忆">
        <SettingsCard>
          <SettingsRow
            title="启用记忆"
            description="对标 Codex Settings → Personalization Enable memories：本地记忆默认关闭。打开后新对话才按下面两项注入或写入。单对话用 /memories 覆盖，不改这里。"
          >
            <SettingsToggle
              checked={draft.memoriesEnabled === true}
              onChange={(memoriesEnabled) => {
                scheduleSave({ ...draftRef.current, memoriesEnabled })
              }}
              label="启用记忆"
            />
          </SettingsRow>
          <SettingsRow
            title="注入记忆"
            description="对标 Codex memories.use_memories：新对话默认把检索到的长期记忆写入 system。"
          >
            <SettingsToggle
              checked={draft.memoryInjection !== false}
              disabled={draft.memoriesEnabled !== true}
              onChange={(memoryInjection) => {
                scheduleSave({ ...draftRef.current, memoryInjection })
              }}
              label="注入记忆"
            />
          </SettingsRow>
          <SettingsRow
            title="写入记忆"
            description="对标 Codex memories.generate_memories：新对话默认在回合结束后提炼偏好与事实。关闭后仍记录会话事件。"
            last
          >
            <SettingsToggle
              checked={draft.memoryGeneration !== false}
              disabled={draft.memoriesEnabled !== true}
              onChange={(memoryGeneration) => {
                scheduleSave({ ...draftRef.current, memoryGeneration })
              }}
              label="写入记忆"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="人格">
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
      <SettingsSection title="自定义说明">
        <SettingsCard>
          <SettingsRow
            title="个人 AGENTS.md"
            description={
              overrideActive
                ? `写入 ${instructionsPath || '~/.sharker/AGENTS.md'}。当前有 AGENTS.override.md，注入会优先用 override。`
                : `对标 Codex Settings → Personalization：写入 ${instructionsPath || '~/.sharker/AGENTS.md'}，所有项目都会注入。`
            }
            last
          >
            <span className="personalization-instructions-hint">~/.sharker</span>
          </SettingsRow>
          <textarea
            className="personalization-instructions"
            value={instructions}
            spellCheck={false}
            placeholder="跨项目都要遵守的约定，例如：改 JS 后跑 npm test；优先 pnpm。"
            aria-label="个人自定义说明"
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
