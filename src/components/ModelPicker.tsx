/**
 * 输入区模型选择下拉
 * @see src/README.md
 */
import { useEffect, useRef } from 'react'
import type { ProviderConfig } from '../../shared/types'
import { usePopoverAnimation } from '../hooks/usePopoverAnimation'
import './ModelPicker.css'

/** ModelPicker Props：提供商列表与选中回调 */
interface Props {
  providers: ProviderConfig[]
  activeProviderId: string
  onSelect: (id: string) => void
  /** 与上下文环互斥：另一弹层打开时关闭本下拉 */
  dismissWhenPeerOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={open ? 'model-picker-chevron--open' : ''}
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

/** 输入区模型下拉选择器 */
export function ModelPicker({
  providers,
  activeProviderId,
  onSelect,
  dismissWhenPeerOpen = false,
  onOpenChange
}: Props) {
  const pop = usePopoverAnimation()
  const rootRef = useRef<HTMLDivElement>(null)
  const list = providers ?? []
  const active = list.find((p) => p.id === activeProviderId) ?? list[0]
  const label = active?.model?.trim() || active?.name?.trim() || '选择模型'

  useEffect(() => {
    onOpenChange?.(pop.open)
  }, [pop.open, onOpenChange])

  useEffect(() => {
    if (dismissWhenPeerOpen && pop.open) pop.hide()
  }, [dismissWhenPeerOpen, pop.open, pop.hide])

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

  const pick = (id: string) => {
    onSelect(id)
    pop.hide()
  }

  if (list.length === 0) {
    return (
      <span className="model-picker-static" title="请在设置 → 模型中添加 API">
        未配置模型
      </span>
    )
  }

  return (
    <div
      className={`model-picker ${pop.expanded ? 'model-picker--open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="model-picker-trigger"
        onClick={pop.toggle}
        aria-expanded={pop.open}
        aria-haspopup="listbox"
        title={active ? `${active.name} · ${active.model}` : label}
      >
        <span className="model-picker-label">{label}</span>
        <ChevronIcon open={pop.open} />
      </button>

      {pop.mounted && (
        <div
          className={`model-picker-menu ${pop.surfaceClass}`}
          role="listbox"
        >
          <div className="model-picker-menu-head">对话模型</div>
          {list.map((p) => {
            const isActive = p.id === (active?.id ?? activeProviderId)
            const modelName = p.model?.trim() || '未填模型 ID'
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`model-picker-item ${isActive ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(p.id)
                }}
              >
                <span className="model-picker-item-radio" aria-hidden>
                  {isActive && <span className="model-picker-item-dot" />}
                </span>
                <span className="model-picker-item-body">
                  <span className="model-picker-item-model">{modelName}</span>
                  {p.name && <span className="model-picker-item-name">{p.name}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
