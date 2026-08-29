/**
 * 通用：后续行为、Enter 发送、审查交付、Prevent sleep while running。
 * 对标 Codex Settings → General（Follow-up / Cmd+Enter / file_opener / Prevent sleep / Code review / review_model）。
 * 建议提示在 SuggestedPromptSettings（官方 Settings → Suggested prompts）。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef } from 'react'
import type { AppSettings } from '../../../shared/types'
import {
  FOLLOW_UP_BEHAVIOR_LABEL,
  QUEUE_LABEL,
  STEER_LABEL,
  STEER_THE_CURRENT_RUN_LABEL,
  WAIT_FOR_THE_NEXT_RUN_LABEL,
  CMD_CTRL_ENTER_SENDS_MULTILINE_LABEL,
  composerEnterBehaviorLabel,
  parseComposerEnterBehavior,
  type ComposerEnterBehavior
} from '../../../shared/composer-submit'
import {
  parseReviewDelivery,
  parseReviewProviderId,
  type ReviewDelivery
} from '../../../shared/review-prompt'
import { parseFileOpener } from '../../../shared/file-opener'
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
      <SettingsSection title={FOLLOW_UP_BEHAVIOR_LABEL}>
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
                description: WAIT_FOR_THE_NEXT_RUN_LABEL,
                icon: <span aria-hidden>Q</span>
              },
              {
                value: 'steer',
                title: STEER_LABEL,
                description: STEER_THE_CURRENT_RUN_LABEL,
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
      <SettingsSection title="代码审查">
        <SettingsCard>
          <SettingsChoiceGroup
            value={parseReviewDelivery(draft.reviewDelivery)}
            onChange={(reviewDelivery: ReviewDelivery) => {
              scheduleSave({ ...draftRef.current, reviewDelivery })
            }}
            options={[
              {
                value: 'inline',
                title: '当前对话',
                description: '官方默认：能在当前对话跑 /review 就在当前对话。直播中 Queue 或 Steer，不中止。',
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
      <SettingsSection title="文件打开">
        <SettingsCard>
          <SettingsRow
            title="默认打开位置"
            description="对标 Codex file_opener：对话引用点开去哪。none 仍是应用内预览；不接自定义编辑器。"
            last
          >
            <SettingsSelect
              id="general-file-opener"
              value={parseFileOpener(draft.fileOpener)}
              options={[
                { value: 'none', label: 'Sharker 预览' },
                { value: 'vscode', label: 'VS Code' },
                { value: 'vscode-insiders', label: 'VS Code Insiders' },
                { value: 'cursor', label: 'Cursor' },
                { value: 'windsurf', label: 'Windsurf' }
              ]}
              onChange={(value) => {
                scheduleSave({ ...draftRef.current, fileOpener: parseFileOpener(value) })
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
