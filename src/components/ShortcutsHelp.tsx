/**
 * ⌘/ Open keyboard shortcuts overlay (official Commands table).
 * @see src/components/ARCH.md
 */
import { useEffect } from 'react'
import { WORKBENCH_SHORTCUT_HELP } from '../../shared/workbench-shortcuts'
import {
  FILE_CLOSE_LABEL,
  KEYBOARD_SHORTCUTS_LABEL,
  OPEN_KEYBOARD_SHORTCUTS_LABEL
} from '../../shared/reveal-in-folder'
import './ShortcutsHelp.css'

interface Props {
  open: boolean
  onClose: () => void
}

/** Official Keyboard Shortcuts overlay */
export function ShortcutsHelp({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="shortcuts-help-root" role="presentation">
      <button type="button" className="shortcuts-help-backdrop" aria-label={FILE_CLOSE_LABEL} onClick={onClose} />
      <div
        className="shortcuts-help glass-popover popover-enter"
        role="dialog"
        aria-label={OPEN_KEYBOARD_SHORTCUTS_LABEL}
      >
        <header className="shortcuts-help-head">
          <h2>{KEYBOARD_SHORTCUTS_LABEL}</h2>
        </header>
        <ul className="shortcuts-help-list">
          {WORKBENCH_SHORTCUT_HELP.map((row) => (
            <li key={row.keys}>
              <span>{row.title}</span>
              <kbd>{row.keys}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
