/**
 * 设置页自定义下拉选择组件
 * @see src/ARCH.md
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverAnimation } from '../../hooks/usePopoverAnimation'
import './SettingsSelect.css'

/** 下拉选项 */
export interface SettingsSelectOption {
  value: string
  label: string
}

interface Props {
  id?: string
  value: string
  options: SettingsSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={open ? 'settings-select-chevron--open' : ''}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 设置页自定义下拉选择器 */
export function SettingsSelect({ id, value, options, onChange, placeholder = '请选择' }: Props) {
  const pop = usePopoverAnimation()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    width: number
    openUp: boolean
  } | null>(null)
  const selected = options.find((o) => o.value === value)

  /** 菜单挂到 body + fixed，避免被 st-card overflow:hidden 裁切 */
  const updateMenuPos = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuH = menuRef.current?.offsetHeight ?? 220
    const spaceAbove = r.top
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceAbove >= menuH + 8 || spaceAbove > spaceBelow
    const width = Math.max(r.width, 168)
    let left = r.right - width
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    const top = openUp ? r.top - 6 : r.bottom + 6
    setMenuPos({ top, left, width, openUp })
  }

  useLayoutEffect(() => {
    if (!pop.mounted) {
      setMenuPos(null)
      return
    }
    updateMenuPos()
  }, [pop.mounted, pop.open, options.length])

  useEffect(() => {
    if (!pop.mounted) return
    const onWin = () => updateMenuPos()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [pop.mounted])

  useEffect(() => {
    if (!pop.expanded) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      pop.hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        pop.hide()
      }
    }
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [pop.expanded, pop.hide])

  const pick = (next: string) => {
    onChange(next)
    pop.hide()
  }

  const menu =
    pop.mounted && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className={`settings-select-menu settings-select-menu--fixed ${pop.surfaceClass}`}
            role="listbox"
            style={{
              top: menuPos.openUp ? undefined : menuPos.top,
              bottom: menuPos.openUp ? window.innerHeight - menuPos.top : undefined,
              left: menuPos.left,
              width: menuPos.width,
              transformOrigin: menuPos.openUp ? 'bottom center' : 'top center'
            }}
          >
            {options.map((opt) => {
              const isActive = opt.value === value
              return (
                <button
                  key={opt.value || '__empty'}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`settings-select-item ${isActive ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(opt.value)
                  }}
                >
                  <span className="settings-select-item-radio" aria-hidden>
                    {isActive && <span className="settings-select-item-dot" />}
                  </span>
                  <span className="settings-select-item-label">{opt.label}</span>
                </button>
              )
            })}
          </div>,
          document.body
        )
      : null

  return (
    <div
      id={id}
      ref={rootRef}
      className={`settings-select ${pop.expanded ? 'settings-select--open' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="settings-select-trigger"
        aria-expanded={pop.open}
        aria-haspopup="listbox"
        onClick={pop.toggle}
      >
        <span className="settings-select-label">{selected?.label ?? placeholder}</span>
        <ChevronIcon open={pop.expanded} />
      </button>
      {menu}
    </div>
  )
}
