/**
 * 设置 → 键盘快捷键：搜索、改绑、重置（对标 Codex Keyboard Shortcuts）。
 * @see src/components/settings/ARCH.md
 */
import { useMemo, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { WorkbenchShortcutAction } from '../../../shared/workbench-shortcuts'
import { SHORTCUT_CATALOG } from '../../../shared/workbench-shortcuts'
import {
  chordsMatch,
  encodeShortcutChord,
  formatShortcutChord,
  normalizeKeymap,
  type KeymapOverrides
} from '../../../shared/keymap'
import { KEYBOARD_SHORTCUTS_LABEL } from '../../../shared/reveal-in-folder'
import { SettingsCard, SettingsSection } from './SettingsPrimitives'
import './ShortcutSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

function currentChord(action: WorkbenchShortcutAction, overrides: KeymapOverrides | undefined): string {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, action)) {
    return overrides[action] || ''
  }
  return SHORTCUT_CATALOG.find((row) => row.action === action)?.defaultKeys || ''
}

function encodedBindings(
  action: WorkbenchShortcutAction,
  overrides: KeymapOverrides | undefined
): string[] {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, action)) {
    const custom = overrides[action]
    return custom ? [custom] : []
  }
  const raw = SHORTCUT_CATALOG.find((row) => row.action === action)?.defaultChord
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

/** 键盘快捷键设置 */
export function ShortcutSettings({ draft, setDraft, onSave }: Props) {
  const [query, setQuery] = useState('')
  const [keyMode, setKeyMode] = useState(false)
  const [keyFilter, setKeyFilter] = useState<string | null>(null)
  const [recording, setRecording] = useState<WorkbenchShortcutAction | null>(null)
  const overrides = draft.keyboardShortcuts ?? {}

  const rows = useMemo(() => {
    if (keyMode && keyFilter) {
      return SHORTCUT_CATALOG.filter((row) =>
        encodedBindings(row.action, overrides).some((chord) => chordsMatch(chord, keyFilter))
      )
    }
    const q = query.trim().toLowerCase()
    if (!q) return SHORTCUT_CATALOG
    return SHORTCUT_CATALOG.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.defaultKeys.toLowerCase().includes(q) ||
        row.action.includes(q) ||
        formatShortcutChord(currentChord(row.action, overrides)).toLowerCase().includes(q)
    )
  }, [keyFilter, keyMode, overrides, query])

  const persist = (nextMap: KeymapOverrides) => {
    const keyboardShortcuts = normalizeKeymap(nextMap)
    const next = { ...draft, keyboardShortcuts }
    setDraft(next)
    void onSave(next)
  }

  const bind = (action: WorkbenchShortcutAction, chord: string) => {
    persist({ ...overrides, [action]: chord })
    setRecording(null)
  }

  const resetOne = (action: WorkbenchShortcutAction) => {
    const next = { ...overrides }
    delete next[action]
    persist(next)
    setRecording(null)
  }

  const resetAll = () => persist({})

  return (
    <SettingsSection title={KEYBOARD_SHORTCUTS_LABEL}>
      <SettingsCard>
        <div className="shortcut-toolbar">
          <input
            className={`shortcut-search${keyMode ? ' is-key-mode' : ''}`}
            value={keyMode ? (keyFilter ? formatShortcutChord(keyFilter) : '') : query}
            placeholder={keyMode ? '按下快捷键以筛选…' : '搜索命令或按键…'}
            aria-label={keyMode ? '按快捷键筛选' : '搜索快捷键'}
            readOnly={keyMode}
            onChange={(e) => {
              if (!keyMode) setQuery(e.target.value)
            }}
            onKeyDown={(e) => {
              if (!keyMode) return
              e.preventDefault()
              if (e.key === 'Escape') {
                setKeyFilter(null)
                return
              }
              const chord = encodeShortcutChord({
                key: e.key,
                code: e.code,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                isComposing: e.nativeEvent.isComposing
              })
              if (chord) setKeyFilter(chord)
            }}
          />
          <button
            type="button"
            className={`shortcut-key-mode${keyMode ? ' is-active' : ''}`}
            aria-pressed={keyMode}
            onClick={() => {
              setKeyMode((on) => {
                const next = !on
                if (!next) setKeyFilter(null)
                return next
              })
            }}
          >
            按键
          </button>
          <button type="button" className="shortcut-reset-all" onClick={resetAll}>
            全部重置
          </button>
        </div>
        <ul className="shortcut-list">
          {rows.map((row) => {
            const custom = Object.prototype.hasOwnProperty.call(overrides, row.action)
            const bound = currentChord(row.action, overrides)
            const listening = recording === row.action
            return (
              <li key={row.action} className="shortcut-row">
                <div className="shortcut-copy">
                  <div className="shortcut-title">{row.title}</div>
                  {custom ? <div className="shortcut-desc">已改绑</div> : null}
                </div>
                <div className="shortcut-actions">
                  <button
                    type="button"
                    className={`shortcut-bind${listening ? ' is-listening' : ''}`}
                    aria-label={`${row.title} 快捷键`}
                    onClick={() => setRecording(listening ? null : row.action)}
                    onKeyDown={(e) => {
                      if (!listening) return
                      e.preventDefault()
                      e.stopPropagation()
                      if (e.key === 'Escape') {
                        setRecording(null)
                        return
                      }
                      if (e.key === 'Backspace' || e.key === 'Delete') {
                        persist({ ...overrides, [row.action]: '' })
                        setRecording(null)
                        return
                      }
                      const chord = encodeShortcutChord({
                        key: e.key,
                        code: e.code,
                        metaKey: e.metaKey,
                        ctrlKey: e.ctrlKey,
                        altKey: e.altKey,
                        shiftKey: e.shiftKey,
                        isComposing: e.nativeEvent.isComposing
                      })
                      if (chord) bind(row.action, chord)
                    }}
                  >
                    {listening ? '按下快捷键…' : bound ? (custom ? formatShortcutChord(bound) : bound) : '未分配'}
                  </button>
                  {bound ? (
                    <button
                      type="button"
                      className="shortcut-reset"
                      onClick={() => {
                        persist({ ...overrides, [row.action]: '' })
                        setRecording(null)
                      }}
                    >
                      解除
                    </button>
                  ) : null}
                  {custom ? (
                    <button type="button" className="shortcut-reset" onClick={() => resetOne(row.action)}>
                      重置
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </SettingsCard>
    </SettingsSection>
  )
}
