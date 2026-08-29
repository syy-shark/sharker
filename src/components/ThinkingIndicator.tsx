/**
 * Thinking · 与 TurnFlow 直播头同几何，避免切换跳动
 * @see src/ARCH.md
 */
import { THINKING_LABEL } from '../../shared/live-display'
import './ThinkingIndicator.css'

interface Props {
  text?: string
  elapsed?: string
}

/** 流式尚无实质步骤时的轻量状态（布局对齐 turn-flow-live-head） */
export function ThinkingIndicator({ text = '', elapsed }: Props) {
  const preview = text.trim()

  return (
    <div className="thinking-indicator" aria-live="polite" aria-label={THINKING_LABEL}>
      <span className="thinking-indicator-label live-text-shimmer">{THINKING_LABEL}</span>
      <span className="thinking-indicator-time">{elapsed ?? '0s'}</span>
      {preview ? <pre className="thinking-indicator-text">{preview}</pre> : null}
    </div>
  )
}
