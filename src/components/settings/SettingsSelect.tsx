/**
 * 设置页自定义下拉选择组件
 * @see src/README.md
 */
import { useEffect, useRef } from 'react'
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
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!pop.open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) pop.hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pop.hide()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pop.open, pop.hide])

  const pick = (next: string) => {
    onChange(next)
    pop.hide()
  }

  return (
    <div
      id={id}
      ref={rootRef}
      className={`settings-select ${pop.expanded ? 'settings-select--open' : ''}`}
    >
      <button
        type="button"
        className="settings-select-trigger"
        aria-expanded={pop.open}
        aria-haspopup="listbox"
        onClick={pop.toggle}
      >
        <span className="settings-select-label">{selected?.label ?? placeholder}</span>
        <ChevronIcon open={pop.open} />
      </button>
      {pop.mounted && (
        <div
          className={`settings-select-menu ${pop.surfaceClass}`}
          role="listbox"
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
        </div>
      )}
    </div>
  )
}
