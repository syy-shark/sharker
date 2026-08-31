/**
 * 通知：回合完成档、批准通知、系统权限。
 * 档标题用官方 Never / Only while ChatGPT is in the background / Always。
 * 分区说明用官方 Choose when turn completion notifications appear…
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef } from 'react'
import type { AppSettings } from '../../../shared/types'
import {
  ALWAYS_TURN_COMPLETION_LABEL,
  NEVER_TURN_COMPLETION_LABEL,
  NOTIFICATION_PERMISSION_DESCRIPTION,
  ONLY_WHILE_IN_THE_BACKGROUND_LABEL,
  PERMISSION_AND_QUESTION_NOTIFICATIONS_DESCRIPTION,
  parseTurnNotifyMode,
  type TurnNotifyMode
} from '../../../shared/turn-notify'
import {
  NOTIFICATIONS_SETTINGS_INTRO,
  NOTIFICATIONS_SETTINGS_LABEL
} from '../../../shared/reveal-in-folder'
import {
  SettingsCard,
  SettingsChoiceGroup,
  SettingsRow,
  SettingsSection,
  SettingsToggle
} from './SettingsPrimitives'
import './NotificationSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 设置 → 通知 */
export function NotificationSettings({ draft, setDraft, onSave }: Props) {
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
      }, 280)
    },
    [onSave, setDraft]
  )

  return (
    <SettingsSection title={NOTIFICATIONS_SETTINGS_LABEL} description={NOTIFICATIONS_SETTINGS_INTRO}>
      <SettingsCard>
        <SettingsChoiceGroup
          value={parseTurnNotifyMode(draft.turnNotifyMode)}
          onChange={(turnNotifyMode: TurnNotifyMode) => {
            scheduleSave({ ...draftRef.current, turnNotifyMode })
          }}
          options={[
            {
              value: 'never',
              title: NEVER_TURN_COMPLETION_LABEL,
              description: '回合完成不弹系统通知。',
              icon: <span aria-hidden>静</span>
            },
            {
              value: 'background',
              title: ONLY_WHILE_IN_THE_BACKGROUND_LABEL,
              description: '正在看且窗口在前台时不打扰。',
              icon: <span aria-hidden>后</span>
            },
            {
              value: 'always',
              title: ALWAYS_TURN_COMPLETION_LABEL,
              description: '每次回合完成都通知。',
              icon: <span aria-hidden>通</span>
            }
          ]}
        />
        <SettingsRow
          title="批准通知"
          description={PERMISSION_AND_QUESTION_NOTIFICATIONS_DESCRIPTION}
        >
          <SettingsToggle
            checked={draft.approvalNotify !== false}
            onChange={(approvalNotify) => {
              scheduleSave({ ...draftRef.current, approvalNotify })
            }}
            label="批准通知"
          />
        </SettingsRow>
        <SettingsRow
          title="系统通知权限"
          description={NOTIFICATION_PERMISSION_DESCRIPTION}
          last
        >
          <button
            type="button"
            className="notification-permission-btn"
            onClick={() => {
              void window.sharker.requestNotifyPermission?.()
            }}
          >
            请求权限
          </button>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
