/**
 * 通用：后续行为、Enter 发送、审查交付、Prevent sleep while running。
 * 对标 Codex Settings → General（Follow-up / Cmd+Enter / Prevent sleep / Code review / review_model）。
 * file_opener 与命令输出在 Permissions → Project and terminal behavior。
 * 建议提示在 SuggestedPromptSettings（官方 Settings → Suggested prompts）。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef } from 'react'
import type { AppSettings } from '../../../shared/types'
import {
  FOLLOW_UP_BEHAVIOR_INTRO,
  FOLLOW_UP_BEHAVIOR_LABEL,
  QUEUE_LABEL,
  QUEUE_SAVES_THE_MESSAGE_LABEL,
  STEER_ADDS_THE_MESSAGE_LABEL,
  STEER_LABEL,
  CMD_CTRL_ENTER_SENDS_MULTILINE_LABEL,
  composerEnterBehaviorLabel,
  parseComposerEnterBehavior,
  type ComposerEnterBehavior
} from '../../../shared/composer-submit'
import {
  CODE_REVIEW_SETTINGS_LABEL,
  DETACHED_REVIEW_DESCRIPTION,
  DETACHED_REVIEW_LABEL,
  INLINE_REVIEW_DESCRIPTION,
  INLINE_REVIEW_LABEL,
  parseReviewDelivery,
  parseReviewProviderId,
  REVIEW_DELIVERY_LABEL,
  type ReviewDelivery
} from '../../../shared/review-prompt'
import { parseShowContextWindowUsage } from '../../../shared/context-usage-indicator'
import {
  PREVENT_SLEEP_WHILE_RUNNING_DESCRIPTION,
  PREVENT_SLEEP_WHILE_RUNNING_LABEL,
  SHOW_CONTEXT_WINDOW_USAGE_LABEL
} from '../../../shared/reveal-in-folder'
import {
  SettingsCard,
  SettingsChoiceGroup,
  SettingsRow,
  SettingsSection,
  SettingsToggle
} from './SettingsPrimitives'
import { SettingsSelect } from './SettingsSelect'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 设置 → 通用 */
export function GeneralSettings({ draft, setDraft, onSave }: Props) {
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
    <>
      <SettingsSection title={FOLLOW_UP_BEHAVIOR_LABEL} description={FOLLOW_UP_BEHAVIOR_INTRO}>
        <SettingsCard>
          <SettingsChoiceGroup
            value={draft.followUpBehavior === 'steer' ? 'steer' : 'queue'}
            onChange={(followUpBehavior: 'queue' | 'steer') => {
              scheduleSave({ ...draftRef.current, followUpBehavior })
            }}
            options={[
              {
                value: 'queue',
                title: QUEUE_LABEL,
                description: QUEUE_SAVES_THE_MESSAGE_LABEL,
                icon: <span aria-hidden>Q</span>
              },
              {
                value: 'steer',
                title: STEER_LABEL,
                description: STEER_ADDS_THE_MESSAGE_LABEL,
                icon: <span aria-hidden>S</span>
              }
            ]}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="输入">
        <SettingsCard>
          <SettingsChoiceGroup
            value={parseComposerEnterBehavior(draft.composerEnterBehavior, draft.requireModEnter)}
            onChange={(composerEnterBehavior: ComposerEnterBehavior) => {
              scheduleSave({
                ...draftRef.current,
                composerEnterBehavior,
                requireModEnter: composerEnterBehavior === 'cmdAlways'
              })
            }}
            options={[
              {
                value: 'enter',
                title: composerEnterBehaviorLabel('enter'),
                description: composerEnterBehaviorLabel('enter'),
                icon: <span aria-hidden>↵</span>
              },
              {
                value: 'cmdIfMultiline',
                title: composerEnterBehaviorLabel('cmdIfMultiline'),
                description: CMD_CTRL_ENTER_SENDS_MULTILINE_LABEL,
                icon: <span aria-hidden>多</span>
              },
              {
                value: 'cmdAlways',
                title: composerEnterBehaviorLabel('cmdAlways'),
                description: composerEnterBehaviorLabel('cmdAlways'),
                icon: <span aria-hidden>⌘</span>
              }
            ]}
          />
          <SettingsRow
            title={SHOW_CONTEXT_WINDOW_USAGE_LABEL}
            description="输入框模型旁画用量环。官方默认关。悬停看具体数字。"
            last
          >
            <SettingsToggle
              checked={parseShowContextWindowUsage(draft.showContextWindowUsage)}
              onChange={(showContextWindowUsage) => {
                scheduleSave({ ...draftRef.current, showContextWindowUsage })
              }}
              label={SHOW_CONTEXT_WINDOW_USAGE_LABEL}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={CODE_REVIEW_SETTINGS_LABEL} description={REVIEW_DELIVERY_LABEL}>
        <SettingsCard>
          <SettingsChoiceGroup
            value={parseReviewDelivery(draft.reviewDelivery)}
            onChange={(reviewDelivery: ReviewDelivery) => {
              scheduleSave({ ...draftRef.current, reviewDelivery })
            }}
            options={[
              {
                value: 'inline',
                title: INLINE_REVIEW_LABEL,
                description: INLINE_REVIEW_DESCRIPTION,
                icon: <span aria-hidden>内</span>
              },
              {
                value: 'detached',
                title: DETACHED_REVIEW_LABEL,
                description: DETACHED_REVIEW_DESCRIPTION,
                icon: <span aria-hidden>独</span>
              }
            ]}
          />
          <SettingsRow
            title="审查模型"
            description="对标 Codex review_model：空则用当前会话模型，不改输入框里的模型。"
            last
          >
            <SettingsSelect
              id="general-review-model"
              value={parseReviewProviderId(draft.reviewProviderId)}
              options={[
                { value: '', label: '跟随当前会话' },
                ...(draft.providers ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.name || p.id}${p.model ? ` · ${p.model}` : ''}`
                }))
              ]}
              onChange={(reviewProviderId) => {
                scheduleSave({ ...draftRef.current, reviewProviderId })
              }}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="窗口">
        <SettingsCard>
          <SettingsRow
            title={PREVENT_SLEEP_WHILE_RUNNING_LABEL}
            description={PREVENT_SLEEP_WHILE_RUNNING_DESCRIPTION}
            last
          >
            <SettingsToggle
              checked={draft.preventSleepWhileRunning === true}
              onChange={(preventSleepWhileRunning) => {
                scheduleSave({ ...draftRef.current, preventSleepWhileRunning })
              }}
              label={PREVENT_SLEEP_WHILE_RUNNING_LABEL}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
