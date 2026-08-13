/**
 * 输入区：模型选择 + 思考水平（官方支持时）+ 厂商图标
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
  resolveThinkingOptions,
  thinkingLevelLabel
} from '../../shared/thinking-levels'
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
  onOpenChange
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
            ? `${active.name} · ${active.model}${thinkingShort ? ` · 思考 ${thinkingShort}` : ''}`
            : modelLabel
        }
      >
        {active ? <ProviderBrandIcon provider={active} size={16} /> : null}
        <span className="model-picker-label">{modelLabel}</span>
        {thinkingShort ? (
          <span className="model-picker-thinking-chip" title={`思考水平：${thinkingShort}`}>
            {shortThinkingChip(thinkingShort)}
          </span>
        ) : null}
        <ChevronIcon open={pop.expanded} />
      </button>

      {pop.mounted && (
        <div className={`model-picker-menu ${pop.surfaceClass}`} role="listbox">
          <div className="model-picker-menu-head">对话模型</div>
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
              <div className="model-picker-menu-head">思考水平</div>
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

/** 触发器上的短标签，避免过长 */
function shortThinkingChip(label: string): string {
  const t = label.replace(/（.*?）/g, '').trim()
  if (t.length <= 4) return t
  if (t.includes('关闭')) return '关'
  if (t.includes('最大') || t.includes('很高')) return '最大'
  if (t.includes('高')) return '高'
  if (t.includes('中')) return '中'
  if (t.includes('低') || t.includes('最低')) return '低'
  if (t.includes('开启')) return '思'
  return t.slice(0, 2)
}
