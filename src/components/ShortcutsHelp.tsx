/**
 * ⌘/ 快捷键一览（对标 Codex Shortcuts window）。
 * @see src/components/ARCH.md
 */
import { useEffect } from 'react'
import { WORKBENCH_SHORTCUT_HELP } from '../../shared/workbench-shortcuts'
import './ShortcutsHelp.css'

interface Props {
  open: boolean
  onClose: () => void
}

/** 工作台快捷键对照表 */
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
      <button type="button" className="shortcuts-help-backdrop" aria-label="关闭快捷键一览" onClick={onClose} />
      <div className="shortcuts-help glass-popover popover-enter" role="dialog" aria-label="快捷键">
        <header className="shortcuts-help-head">
          <h2>快捷键</h2>
          <p>对标 Codex 桌面端常用和弦</p>
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
