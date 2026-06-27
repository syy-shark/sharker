/**
 * 上下文用量环形指示与详情弹层
 * @see src/README.md
 */
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/types'
import { CONTEXT_COMPRESS_THRESHOLD } from '../../shared/context-compress'
import {
  contextLimitSourceLabel,
  formatTokenCount,
  type ResolvedContextLimit
} from '../../shared/context-limit'
import {
  contextUsageRatio,
  estimateContextUsage,
  formatContextPercent
} from '../../shared/token-estimate'
import { usePopoverAnimation } from '../hooks/usePopoverAnimation'
import './ContextRing.css'

/** 按占用比例返回圆环颜色 */
function ringColor(ratio: number): string {
  if (ratio >= 0.9) return 'var(--danger)'
  if (ratio >= 0.75) return '#d97706'
  if (ratio >= 0.5) return '#ca8a04'
  return 'var(--accent)'
}

/** ContextRing Props：消息、流式内容与上下文上限 */
interface Props {
  messages: ChatMessage[]
  streaming: string
  draftInput: string
  context: ResolvedContextLimit
  /** 与模型下拉互斥：另一弹层打开时关闭本面板 */
  dismissWhenPeerOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/** 上下文用量圆环与详情弹层 */
export function ContextRing({
  messages,
  streaming,
  draftInput,
  context,
  dismissWhenPeerOpen = false,
  onOpenChange
}: Props) {
  const pop = usePopoverAnimation()
  const rootRef = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const { limit: contextLimit } = context

  const usage = estimateContextUsage(messages, streaming, draftInput)
  const used = usage.total
  const ratio = contextLimit > 0 ? used / contextLimit : 0
  const pctLabel = formatContextPercent(used, contextLimit)
  const ringRatio = contextUsageRatio(used, contextLimit)
  const remaining = Math.max(0, contextLimit - used)
  const nearLimit = ratio >= CONTEXT_COMPRESS_THRESHOLD
  const color = ringColor(ratio)

  const r = 9
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - ringRatio)
  const meterPct = Math.min(100, Math.max(ringRatio * 100, used > 0 ? 1.5 : 0))

  const panelVisible = hovered || pinned

  useEffect(() => {
    onOpenChange?.(panelVisible)
  }, [panelVisible, onOpenChange])

  useEffect(() => {
    if (dismissWhenPeerOpen && panelVisible) {
      setPinned(false)
      setHovered(false)
    }
  }, [dismissWhenPeerOpen, panelVisible])

  useEffect(() => {
    if (panelVisible) {
      if (!pop.mounted) pop.show()
    } else if (pop.mounted) {
      pop.hide()
    }
  }, [panelVisible, pop.mounted, pop.show, pop.hide])

  useEffect(() => {
    if (!pop.mounted) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPinned(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false)
        setHovered(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pop.mounted])

  return (
    <button
      ref={rootRef}
      type="button"
      className={`context-ring-btn ${pop.expanded ? 'open' : ''}`}
      onClick={() => setPinned((p) => !p)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-expanded={panelVisible}
      aria-label={`上下文已用 ${pctLabel}`}
      title={`上下文 ${pctLabel}`}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle className="context-ring-bg" cx="11" cy="11" r={r} fill="none" strokeWidth="2" />
        <circle
          className="context-ring-fg"
          cx="11"
          cy="11"
          r={r}
          fill="none"
          strokeWidth="2"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 11 11)"
        />
      </svg>

      {pop.mounted && (
        <div
          className={`context-ring-panel ${pop.surfaceClass}`}
          role="dialog"
          aria-label="上下文用量"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="context-ring-panel-head">
            <span className="context-ring-panel-title">上下文</span>
            <span className="context-ring-panel-pct" style={{ color }}>
              {pctLabel}
            </span>
          </div>
          <div className="context-ring-meter" aria-hidden>
            <div
              className="context-ring-meter-fill"
              style={{ width: `${meterPct}%`, background: color }}
            />
          </div>
          <p className="context-ring-panel-row context-ring-panel-row--strong">
            <span>会话总量</span>
            <span>
              {formatTokenCount(used)} / {formatTokenCount(contextLimit)} tokens
            </span>
          </p>
          {nearLimit && (
            <p className="context-ring-panel-warn">
              接近上限（≥{Math.round(CONTEXT_COMPRESS_THRESHOLD * 100)}%）时，发送前将自动摘要压缩较早对话。
            </p>
          )}
          <p className="context-ring-panel-row context-ring-panel-row--muted">
            <span>剩余</span>
            <span>{formatTokenCount(remaining)}</span>
          </p>
          <div className="context-ring-panel-divider" />
          <p className="context-ring-panel-row context-ring-panel-row--muted">
            <span>对话</span>
            <span>
              {usage.messageCount} 条 · 约 {formatTokenCount(usage.messages)}
            </span>
          </p>
          {usage.draft > 0 && (
            <p className="context-ring-panel-row context-ring-panel-row--muted">
              <span>输入框</span>
              <span>约 {formatTokenCount(usage.draft)}</span>
            </p>
          )}
          <p className="context-ring-panel-row context-ring-panel-row--muted">
            <span>系统与工具</span>
            <span>约 {formatTokenCount(usage.overhead)}</span>
          </p>
          <div className="context-ring-panel-divider" />
          <p className="context-ring-panel-row context-ring-panel-row--muted">
            <span>模型</span>
            <span className="context-ring-model-id" title={context.model}>
              {context.model}
            </span>
          </p>
          <p className="context-ring-panel-row context-ring-panel-row--muted">
            <span>上限来源</span>
            <span>{contextLimitSourceLabel(context.source)}</span>
          </p>
          <p className="context-ring-panel-hint">
            用量为估算值：中文按字数、英文按约 4 字符 1 token，并计入系统提示开销。与官方
            tokenizer 会有偏差；可在设置 → 模型中手动填写上下文上限。
          </p>
        </div>
      )}
    </button>
  )
}
