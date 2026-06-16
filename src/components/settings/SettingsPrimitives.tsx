/**
 * 设置页通用布局与单选组件
 * @see src/README.md
 */
import type { ReactNode } from 'react'
import { useCallback, useRef } from 'react'
import { useSlidingIndicator } from '../../hooks/useSlidingIndicator'
import './SettingsPrimitives.css'

/** 设置区块标题与内容容器 */
export function SettingsSection({
  title,
  children
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="st-section">
      <h3 className="st-section-title">{title}</h3>
      {children}
    </section>
  )
}

/** 设置卡片容器 */
export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="st-card">{children}</div>
}

/** 设置行：标题/描述 + 右侧控件 */
export function SettingsRow({
  title,
  description,
  children,
  last
}: {
  title: string
  description?: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={`st-row ${last ? 'st-row--last' : ''}`}>
      <div className="st-row-copy">
        <div className="st-row-title">{title}</div>
        {description ? <div className="st-row-desc">{description}</div> : null}
      </div>
      <div className="st-row-control">{children}</div>
    </div>
  )
}

/** 选项卡片网格布局 */
export function SettingsChoiceGrid({ children }: { children: ReactNode }) {
  return <div className="st-choice-grid">{children}</div>
}

/** 带滑动指示器的单选卡片组 */
export function SettingsChoiceGroup<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{
    value: T
    title: string
    description: string
    icon: ReactNode
  }>
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())

  const getItemEl = useCallback((key: string) => itemRefs.current.get(key), [])

  const slide = useSlidingIndicator(value, gridRef, getItemEl)

  return (
    <div className="st-choice-grid" ref={gridRef}>
      {slide.ready && (
        <div
          className="st-choice-slide"
          style={{
            transform: `translate3d(${slide.left}px, ${slide.top}px, 0)`,
            width: slide.width,
            height: slide.height
          }}
          aria-hidden
        />
      )}
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            ref={(el) => {
              if (el) itemRefs.current.set(opt.value, el)
              else itemRefs.current.delete(opt.value)
            }}
            className={`st-choice-card ${selected ? 'st-choice-card--selected' : ''}`}
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
          >
            <span className="st-choice-card-radio" aria-hidden>
              {selected ? <span className="st-choice-card-radio-dot" /> : null}
            </span>
            <span className="st-choice-card-icon">{opt.icon}</span>
            <span className="st-choice-card-title">{opt.title}</span>
            <span className="st-choice-card-desc">{opt.description}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 单个可点击选项卡片 */
export function SettingsChoiceCard({
  selected,
  title,
  description,
  icon,
  onSelect
}: {
  selected: boolean
  title: string
  description: string
  icon: ReactNode
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`st-choice-card ${selected ? 'st-choice-card--selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="st-choice-card-radio" aria-hidden>
        {selected ? <span className="st-choice-card-radio-dot" /> : null}
      </span>
      <span className="st-choice-card-icon">{icon}</span>
      <span className="st-choice-card-title">{title}</span>
      <span className="st-choice-card-desc">{description}</span>
    </button>
  )
}

/** 开关切换按钮 */
export function SettingsToggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`st-toggle ${checked ? 'st-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="st-toggle-knob" />
    </button>
  )
}

/** 圆角药丸形操作按钮 */
export function SettingsPillButton({
  children,
  onClick,
  variant = 'default'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary'
}) {
  return (
    <button
      type="button"
      className={`st-pill-btn ${variant === 'primary' ? 'st-pill-btn--primary' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** 沙箱模式图标 */
export function SandboxModeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h6l2 2h8v10H4V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 完全权限模式图标 */
export function FullModeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}
