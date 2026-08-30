/**
 * 输入框旁思考档位条：官方 Pick a reasoning effort（Light / Medium / High / Extra High / Max）。
 * 只读当前模型官方档位，不跟直播 token 重绘。
 * @see src/components/ARCH.md
 */
import {
  PICK_REASONING_EFFORT_LABEL,
  stepThinkingLevel,
  thinkingGaugeIndex,
  type ThinkingLevelOption
} from '../../shared/thinking-levels'
import './ReasoningGauge.css'

export function ReasoningGauge({
  options,
  value,
  onChange
}: {
  options: ThinkingLevelOption[]
  value: string
  onChange: (id: string) => void
}) {
  if (options.length < 2) return null
  const index = thinkingGaugeIndex(options, value)
  const current = options[index]
  const currentLabel = current?.label.replace(/（.*?）/g, '').trim() || current?.label || ''

  const step = (delta: number) => {
    const next = stepThinkingLevel(options, value, delta)
    if (next && next !== value) onChange(next)
  }

  return (
    <div
      className="reasoning-gauge"
      role="slider"
      aria-label={PICK_REASONING_EFFORT_LABEL}
      aria-valuemin={0}
      aria-valuemax={options.length - 1}
      aria-valuenow={index}
      aria-valuetext={currentLabel}
      tabIndex={0}
      title={currentLabel ? `${PICK_REASONING_EFFORT_LABEL} · ${currentLabel}` : PICK_REASONING_EFFORT_LABEL}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault()
          step(1)
          return
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault()
          step(-1)
        }
      }}
    >
      <span className="reasoning-gauge-track" aria-hidden>
        {options.map((opt, i) => (
          <button
            key={opt.id}
            type="button"
            tabIndex={-1}
            className={`reasoning-gauge-seg${i <= index ? ' is-on' : ''}${i === index ? ' is-current' : ''}`}
            style={{ height: `${6 + i * 3}px` }}
            title={opt.label}
            aria-label={opt.label}
            onMouseDown={(event) => {
              event.preventDefault()
              onChange(opt.id)
            }}
          />
        ))}
      </span>
    </div>
  )
}
