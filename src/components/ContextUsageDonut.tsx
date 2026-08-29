/**
 * 输入框旁上下文用量环。只订直播 `streaming` 字符串，不抬 ComposerDock / ChatView。
 * 对标 Codex composer context-window usage donut。
 * @see src/components/ARCH.md
 */
import { useMemo } from 'react'
import type { ChatMessage, ProviderConfig } from '../../shared/types'
import { resolveContextLimit } from '../../shared/context-limit'
import {
  contextUsageBaseTokens,
  contextUsageHoverLabel,
  contextUsageLiveExtra,
  contextUsageRing,
  shouldPaintContextUsageHigh
} from '../../shared/context-usage-indicator'
import { useLiveStreamUiSelectWhen } from '../hooks/useLiveStreamUi'
import './ContextUsageDonut.css'

const RING_RADIUS = 7

/** 模型选择器旁的用量环；关闭设置时不挂 */
export function ContextUsageDonut({
  messages,
  draft,
  providers,
  activeProviderId
}: {
  messages: ChatMessage[]
  draft: string
  providers: ProviderConfig[]
  activeProviderId: string
}) {
  const streaming = useLiveStreamUiSelectWhen(true, (snap) => snap.streaming)
  const base = useMemo(() => contextUsageBaseTokens(messages), [messages])
  const provider = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const { limit } = resolveContextLimit(provider?.model ?? '', provider?.contextWindow)
  const used = base + contextUsageLiveExtra(streaming, draft)
  const ring = contextUsageRing(used, limit, RING_RADIUS)
  const label = contextUsageHoverLabel(used, limit)
  const high = shouldPaintContextUsageHigh(used, limit)

  return (
    <span
      className={`context-usage-donut${high ? ' is-high' : ''}`}
      title={label}
      aria-label={`上下文用量 ${label}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ring.percent}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
        <circle className="context-usage-donut-track" cx="10" cy="10" r={RING_RADIUS} />
        <circle
          className="context-usage-donut-arc"
          cx="10"
          cy="10"
          r={RING_RADIUS}
          strokeDasharray={ring.circumference}
          strokeDashoffset={ring.dashoffset}
        />
      </svg>
    </span>
  )
}
