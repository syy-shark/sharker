/**
 * Settings → Appshots：官方热键改绑（learn.chatgpt.com/docs/appshots）。
 * 不进 Keyboard Shortcuts 目录；不发明开关。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import {
  APPSHOT_BOTH_META_CHORD,
  APPSHOTS_HOTKEY_INTRO,
  APPSHOTS_PERMISSIONS_INTRO,
  APPSHOTS_SETTINGS_INTRO,
  APPSHOTS_SETTINGS_LABEL,
  TAKE_AN_APPSHOT_LABEL,
  formatAppshotHotkey,
  parseAppshotHotkey
} from '../../../shared/appshot'
import { encodeShortcutChord } from '../../../shared/keymap'
import {
  changeShortcutLabel,
  KEYSTROKE_SEARCH_PLACEHOLDER
} from '../../../shared/reveal-in-folder'
import { SettingsCard, SettingsRow, SettingsSection } from './SettingsPrimitives'
import './ShortcutSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 设置 → Appshots */
export function AppshotSettings({ draft, setDraft, onSave }: Props) {
  const draftRef = useRef(draft)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recording, setRecording] = useState(false)

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

  const chord = parseAppshotHotkey(draft.appshotHotkey)

  return (
    <SettingsSection
      title={APPSHOTS_SETTINGS_LABEL}
      description={`${APPSHOTS_SETTINGS_INTRO} ${APPSHOTS_HOTKEY_INTRO} ${APPSHOTS_PERMISSIONS_INTRO}`}
    >
      <SettingsCard>
        <SettingsRow title={TAKE_AN_APPSHOT_LABEL} last>
          <button
            type="button"
            className={`shortcut-bind${recording ? ' is-listening' : ''}`}
            aria-label={
              recording ? KEYSTROKE_SEARCH_PLACEHOLDER : changeShortcutLabel(TAKE_AN_APPSHOT_LABEL)
            }
            onClick={() => setRecording((on) => !on)}
            onKeyDown={(e) => {
              if (!recording) return
              e.preventDefault()
              e.stopPropagation()
              if (e.key === 'Escape') {
                setRecording(false)
                return
              }
              if (e.key === 'Backspace' || e.key === 'Delete') {
                scheduleSave({ ...draftRef.current, appshotHotkey: APPSHOT_BOTH_META_CHORD })
                setRecording(false)
                return
              }
              if (e.key === 'Meta') {
                const loc = e.nativeEvent.location
                if (loc === 1 || loc === 2) {
                  const left = loc === 1 || e.metaKey
                  const right = loc === 2 || e.metaKey
                  if (left && right && !e.altKey && !e.ctrlKey && !e.shiftKey) {
                    scheduleSave({ ...draftRef.current, appshotHotkey: APPSHOT_BOTH_META_CHORD })
                    setRecording(false)
                  }
                }
                return
              }
              const next = encodeShortcutChord({
                key: e.key,
                code: e.code,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                isComposing: e.nativeEvent.isComposing
              })
              if (!next) return
              scheduleSave({ ...draftRef.current, appshotHotkey: next })
              setRecording(false)
            }}
          >
            {recording ? KEYSTROKE_SEARCH_PLACEHOLDER : formatAppshotHotkey(chord)}
          </button>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
