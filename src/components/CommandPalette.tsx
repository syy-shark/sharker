/**
 * Codex 式命令面板：⌘K / ⌘⇧P 过滤并执行工作台命令。
 * @see src/ARCH.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { filterPaletteCommands, type PaletteCommand } from '../../shared/command-palette'
import { FILE_CLOSE_LABEL, OPEN_COMMAND_MENU_LABEL } from '../../shared/reveal-in-folder'
import './CommandPalette.css'

interface Props {
  open: boolean
  onClose: () => void
  onRun: (command: PaletteCommand) => void
}

/** 居中玻璃命令菜单 */
export function CommandPalette({ open, onClose, onRun }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const items = useMemo(() => filterPaletteCommands(query), [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const run = (cmd: PaletteCommand) => {
    onRun(cmd)
    onClose()
  }

  return (
    <div className="command-palette-root" role="presentation">
      <button type="button" className="command-palette-backdrop" aria-label={FILE_CLOSE_LABEL} onClick={onClose} />
      <div
        className="command-palette glass-popover popover-enter"
        role="dialog"
        aria-label={OPEN_COMMAND_MENU_LABEL}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          value={query}
          placeholder="搜索命令…"
          aria-label="搜索命令"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (items.length ? (i + 1) % items.length : 0))
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const cmd = items[active]
              if (cmd) run(cmd)
            }
          }}
        />
        {items.length === 0 ? (
          <p className="command-palette-empty">没有匹配的命令</p>
        ) : (
          <ul className="command-palette-list" role="listbox" aria-label="命令">
            {items.map((cmd, index) => (
              <li key={cmd.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`command-palette-item${index === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(cmd)}
                >
                  <span className="command-palette-title">{cmd.title}</span>
                  {cmd.shortcut ? (
                    <kbd className="command-palette-shortcut">{cmd.shortcut}</kbd>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
