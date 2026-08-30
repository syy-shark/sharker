/**
 * 输入区：Open model picker + Pick a reasoning effort（官方桌面 Light / Medium / High / Extra High / Max）
 * 每个已配置接入展开 knownModels，可在同一订阅下换型号。
 */
import { useEffect, useRef } from 'react'
import type { ProviderConfig } from '../../shared/types'
import {
  configuredProviders,
  formatModelLabel,
  isProviderConfigured,
  knownModelsForProvider
} from '../../shared/provider-catalog'
import {
  defaultThinkingLevel,
  PICK_REASONING_EFFORT_LABEL,
  resolveThinkingOptions,
  thinkingLevelLabel
} from '../../shared/thinking-levels'
import { OPEN_MODEL_PICKER_LABEL } from '../../shared/reveal-in-folder'
import { usePopoverAnimation } from '../hooks/usePopoverAnimation'
import { ProviderBrandIcon } from './ProviderBrandIcon'
import './ModelPicker.css'

interface Props {
  providers: ProviderConfig[]
  activeProviderId: string
  /** 选中某接入下的某个模型 id */
  onSelect: (providerId: string, model: string) => void
  /** 更新当前模型的思考水平 */
  onThinkingLevelChange?: (providerId: string, level: string) => void
  dismissWhenPeerOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** 递增时强制打开（Ctrl⇧M / 命令面板） */
  openSignal?: number
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`model-picker-chevron${open ? ' model-picker-chevron--open' : ''}`}
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

/** 输入区模型 / 思考水平选择器 */
export function ModelPicker({
  providers,
  activeProviderId,
  onSelect,
  onThinkingLevelChange,
  dismissWhenPeerOpen = false,
  onOpenChange,
  openSignal = 0
}: Props) {
  /* 退出动画 200ms + 展开 340ms 对齐，卸载略留余量 */
  const pop = usePopoverAnimation(180)
  const rootRef = useRef<HTMLDivElement>(null)
  /** 只展示已填 Key/订阅的接入；当前选中若仍在列表则保留，避免突然消失 */
  const list = (() => {
    const ready = configuredProviders(providers)
    const raw = providers ?? []
    const activeRaw = raw.find((p) => p.id === activeProviderId)
    if (activeRaw && !isProviderConfigured(activeRaw) && !ready.some((p) => p.id === activeRaw.id)) {
      return [activeRaw, ...ready]
    }
    return ready
  })()
  const active = list.find((p) => p.id === activeProviderId) ?? list[0]
  const modelLabel = active?.model?.trim()
    ? formatModelLabel(active.model.trim())
    : active
      ? '未填模型'
      : '未配置模型'
  const thinkingOpts = active ? resolveThinkingOptions(active) : []
  const thinkingValue =
    active &&
    active.thinkingLevel &&
    thinkingOpts.some((o) => o.id === active.thinkingLevel)
      ? active.thinkingLevel
      : active
        ? defaultThinkingLevel(active)
        : ''
  const thinkingShort =
    active && thinkingOpts.length > 0
      ? thinkingLevelLabel({ ...active, thinkingLevel: thinkingValue })
      : ''

  useEffect(() => {
    onOpenChange?.(pop.open)
  }, [pop.open, onOpenChange])

  useEffect(() => {
    if (openSignal > 0) pop.show()
  }, [openSignal, pop.show])

  useEffect(() => {
    if (dismissWhenPeerOpen && pop.open) pop.hide()
  }, [dismissWhenPeerOpen, pop.open, pop.hide])

  useEffect(() => {
    // mounted/expanded 期间都可关闭（含退出动画中），避免 Esc 无效或点外层不收
    if (!pop.expanded) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) pop.hide()
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

  const pickModel = (providerId: string, model: string) => {
    onSelect(providerId, model)
  }

  const pickThinking = (level: string) => {
    if (!active) return
    onThinkingLevelChange?.(active.id, level)
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
        title={
          active
            ? `${active.name} · ${active.model}${thinkingShort ? ` · ${thinkingShort}` : ''}`
            : modelLabel
        }
        aria-label={OPEN_MODEL_PICKER_LABEL}
      >
        {active ? <ProviderBrandIcon provider={active} size={16} /> : null}
        <span className="model-picker-label">{modelLabel}</span>
        <ChevronIcon open={pop.expanded} />
      </button>

      {pop.mounted && (
        <div
          className={`model-picker-menu ${pop.surfaceClass}`}
          role="listbox"
          aria-label={OPEN_MODEL_PICKER_LABEL}
        >
          <div className="model-picker-menu-head">{OPEN_MODEL_PICKER_LABEL}</div>
          {list.map((p) => {
            const models = knownModelsForProvider(p.id, p.model)
            const ids = models.length > 0 ? models : [p.model?.trim() || '']
            return (
              <div key={p.id} className="model-picker-group">
                <div className="model-picker-group-label">{p.name}</div>
                {ids.filter(Boolean).map((modelId) => {
                  const isActive =
                    p.id === (active?.id ?? activeProviderId) &&
                    modelId === (active?.model?.trim() || '')
                  return (
                    <button
                      key={`${p.id}:${modelId}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      title={modelId}
                      className={`model-picker-item ${isActive ? 'active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickModel(p.id, modelId)
                      }}
                    >
                      <ProviderBrandIcon
                        provider={{ ...p, model: modelId }}
                        size={20}
                        className="model-picker-item-brand"
                      />
                      <span className="model-picker-item-body">
                        <span className="model-picker-item-model">
                          {formatModelLabel(modelId)}
                        </span>
                      </span>
                      {isActive ? <span className="model-picker-item-check">✓</span> : null}
                    </button>
                  )
                })}
              </div>
            )
          })}

          {active && thinkingOpts.length > 0 ? (
            <>
              <div className="model-picker-divider" />
              <div className="model-picker-menu-head">{PICK_REASONING_EFFORT_LABEL}</div>
              <div className="model-picker-thinking-grid">
                {thinkingOpts.map((opt) => {
                  const selected = opt.id === thinkingValue
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`model-picker-thinking-btn ${selected ? 'active' : ''}`}
                      title={opt.hint}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickThinking(opt.id)
                      }}
                    >
                      {opt.label.replace(/（.*?）/g, '').trim() || opt.label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
