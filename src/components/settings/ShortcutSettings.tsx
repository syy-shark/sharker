/**
 * 设置 → Keyboard Shortcuts：Search by command name / Keystroke search、改绑、重置（对标 Codex Settings）。
 * 一条命令可有多行绑定；Shift-click 追加（对标官方桌面 #27835 隐藏手势，不发明可见 Add another shortcut）。
 * @see src/components/settings/ARCH.md
 */
import { useMemo, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { WorkbenchShortcutAction } from '../../../shared/workbench-shortcuts'
import { SHORTCUT_CATALOG, defaultShortcutChords } from '../../../shared/workbench-shortcuts'
import {
  chordsEqual,
  chordsMatch,
  effectiveShortcutChords,
  encodeShortcutChord,
  formatShortcutChord,
  hasCustomShortcut,
  normalizeKeymap,
  persistShortcutChords,
  type KeymapOverrides
} from '../../../shared/keymap'
import {
  changeShortcutLabel,
  createNewShortcutLabel,
  KEYBOARD_SHORTCUTS_INTRO,
  KEYBOARD_SHORTCUTS_LABEL,
  KEYBOARD_SHORTCUTS_SEARCH_PLACEHOLDER,
  KEYSTROKE_SEARCH_LABEL,
  KEYSTROKE_SEARCH_PLACEHOLDER,
  NOT_ASSIGNED_BY_DEFAULT_LABEL
} from '../../../shared/reveal-in-folder'
import { SettingsCard, SettingsSection } from './SettingsPrimitives'
import './ShortcutSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

type Recording =
  | { action: WorkbenchShortcutAction; mode: 'replace'; index: number }
  | { action: WorkbenchShortcutAction; mode: 'append' }

/** 键盘快捷键设置 */
export function ShortcutSettings({ draft, setDraft, onSave }: Props) {
  const [query, setQuery] = useState('')
  const [keyMode, setKeyMode] = useState(false)
  const [keyFilter, setKeyFilter] = useState<string | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [shiftHint, setShiftHint] = useState(false)
  const overrides = draft.keyboardShortcuts ?? {}

  const rows = useMemo(() => {
    const catalog = SHORTCUT_CATALOG.filter((row) => {
      const chords = effectiveShortcutChords(row.action, overrides)
      if (keyMode && keyFilter) {
        return chords.some((chord) => chordsMatch(chord, keyFilter))
      }
      const q = query.trim().toLowerCase()
      if (!q) return true
      return (
        row.title.toLowerCase().includes(q) ||
        row.defaultKeys.toLowerCase().includes(q) ||
        row.action.includes(q) ||
        chords.some((chord) => formatShortcutChord(chord).toLowerCase().includes(q))
      )
    })
    return catalog.flatMap((row) => {
      const chords = effectiveShortcutChords(row.action, overrides)
      const appending = recording?.action === row.action && recording.mode === 'append'
      const items =
        chords.length === 0 && !appending
          ? [{ row, chord: '', index: 0, empty: true as const }]
          : chords.map((chord, index) => ({ row, chord, index, empty: false as const }))
      if (appending) {
        items.push({ row, chord: '', index: chords.length, empty: true })
      }
      return items
    })
  }, [keyFilter, keyMode, overrides, query, recording])

  const persist = (nextMap: KeymapOverrides) => {
    const keyboardShortcuts = normalizeKeymap(nextMap)
    const next = { ...draft, keyboardShortcuts }
    setDraft(next)
    void onSave(next)
  }

  const writeChords = (action: WorkbenchShortcutAction, chords: string[]) => {
    const next = { ...overrides }
    if (chordsEqual(chords, defaultShortcutChords(action))) {
      delete next[action]
    } else {
      next[action] = persistShortcutChords(chords)
    }
    persist(next)
    setRecording(null)
  }

  const bind = (entry: Recording, chord: string) => {
    const current = effectiveShortcutChords(entry.action, overrides)
    if (entry.mode === 'append') {
      if (current.some((item) => chordsMatch(item, chord))) {
        setRecording(null)
        return
      }
      writeChords(entry.action, [...current, chord])
      return
    }
    const next = [...current]
    next[entry.index] = chord
    writeChords(entry.action, next.filter(Boolean))
  }

  const unbindAt = (action: WorkbenchShortcutAction, index: number) => {
    const next = effectiveShortcutChords(action, overrides).filter((_, i) => i !== index)
    writeChords(action, next)
  }

  const resetOne = (action: WorkbenchShortcutAction) => {
    const next = { ...overrides }
    delete next[action]
    persist(next)
    setRecording(null)
  }

  const resetAll = () => persist({})

  return (
    <SettingsSection title={KEYBOARD_SHORTCUTS_LABEL} description={KEYBOARD_SHORTCUTS_INTRO}>
      <SettingsCard>
        <div className="shortcut-toolbar">
          <input
            className={`shortcut-search${keyMode ? ' is-key-mode' : ''}`}
            value={keyMode ? (keyFilter ? formatShortcutChord(keyFilter) : '') : query}
            placeholder={keyMode ? KEYSTROKE_SEARCH_PLACEHOLDER : KEYBOARD_SHORTCUTS_SEARCH_PLACEHOLDER}
            aria-label={keyMode ? KEYSTROKE_SEARCH_LABEL : KEYBOARD_SHORTCUTS_SEARCH_PLACEHOLDER}
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
            {KEYSTROKE_SEARCH_LABEL}
          </button>
          <button type="button" className="shortcut-reset-all" onClick={resetAll}>
            全部重置
          </button>
        </div>
        <ul className="shortcut-list">
          {rows.map((entry) => {
            const custom = hasCustomShortcut(entry.row.action, overrides)
            const listening =
              recording?.action === entry.row.action &&
              (recording.mode === 'append'
                ? entry.empty &&
                  entry.index === effectiveShortcutChords(entry.row.action, overrides).length
                : recording.index === entry.index)
            const hintAppend = shiftHint && !listening
            return (
              <li key={`${entry.row.action}:${entry.index}:${entry.chord}`} className="shortcut-row">
                <div className="shortcut-copy">
                  <div className="shortcut-title">{entry.row.title}</div>
                  {custom ? <div className="shortcut-desc">已改绑</div> : null}
                </div>
                <div className="shortcut-actions">
                  <button
                    type="button"
                    className={`shortcut-bind${listening ? ' is-listening' : ''}`}
                    aria-label={
                      listening
                        ? KEYSTROKE_SEARCH_PLACEHOLDER
                        : hintAppend
                          ? createNewShortcutLabel(entry.row.title)
                          : changeShortcutLabel(entry.row.title)
                    }
                    onMouseMove={(e) => setShiftHint(e.shiftKey)}
                    onMouseLeave={() => setShiftHint(false)}
                    onClick={(e) => {
                      if (listening) {
                        setRecording(null)
                        return
                      }
                      setRecording(
                        e.shiftKey
                          ? { action: entry.row.action, mode: 'append' }
                          : { action: entry.row.action, mode: 'replace', index: entry.index }
                      )
                    }}
                    onKeyDown={(e) => {
                      if (!listening || !recording || recording.action !== entry.row.action) return
                      e.preventDefault()
                      e.stopPropagation()
                      if (e.key === 'Escape') {
                        setRecording(null)
                        return
                      }
                      if (e.key === 'Backspace' || e.key === 'Delete') {
                        if (recording.mode === 'replace') unbindAt(entry.row.action, recording.index)
                        else setRecording(null)
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
                      if (chord) bind(recording, chord)
                    }}
                  >
                    {listening
                      ? KEYSTROKE_SEARCH_PLACEHOLDER
                      : entry.chord
                        ? formatShortcutChord(entry.chord)
                        : NOT_ASSIGNED_BY_DEFAULT_LABEL}
                  </button>
                  {entry.chord ? (
                    <button
                      type="button"
                      className="shortcut-reset"
                      onClick={() => {
                        unbindAt(entry.row.action, entry.index)
                      }}
                    >
                      解除
                    </button>
                  ) : null}
                  {custom ? (
                    <button type="button" className="shortcut-reset" onClick={() => resetOne(entry.row.action)}>
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
