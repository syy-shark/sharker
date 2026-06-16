/**
 * 思考与工具步骤时间线 UI
 * @see src/README.md
 */
import type { ProcessStep } from '../../shared/process-steps'
import './ProcessTimeline.css'

/** ProcessTimeline Props：过程步骤列表 */
interface Props {
  steps: ProcessStep[]
}

/** 步骤类型对应图标 */
function StepIcon({ kind, active }: { kind: ProcessStep['kind']; active: boolean }) {
  const cls = `process-step-icon process-step-icon--${kind}${active ? ' process-step-icon--active' : ''}`
  if (kind === 'think') {
    return (
      <span className={cls} aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3a7 7 0 00-4 12.7V17a2 2 0 002 2h4a2 2 0 002-2v-1.3A7 7 0 0012 3z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9 21h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (kind === 'compress') {
    return (
      <span className={cls} aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 7h16M4 12h10M4 17h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    )
  }
  if (kind === 'skill') {
    return (
      <span className={cls} aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 14.8 7.2 16.8l.9-5.3L4.2 7.7l5.4-.8L12 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  return (
    <span className={cls} aria-hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path
          d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

/** 思考/工具/技能步骤时间线 */
export function ProcessTimeline({ steps }: Props) {
  if (steps.length === 0) return null

  return (
    <ol className="process-timeline">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`process-timeline-item process-timeline-item--${step.status}`}
          style={{ '--step-index': String(index) } as Record<string, string>}
        >
          <div className="process-timeline-rail" aria-hidden>
            <StepIcon kind={step.kind} active={step.status === 'active'} />
            {index < steps.length - 1 && <span className="process-timeline-line" />}
          </div>
          <div className="process-timeline-body">
            <div className="process-timeline-head">
              <span className="process-timeline-title">{step.title}</span>
              {step.status === 'active' && step.kind !== 'think' && (
                <span className="process-timeline-pulse" aria-hidden />
              )}
            </div>
            {step.kind === 'think' && step.thinkingText ? (
              <div
                className={`process-thinking ${
                  step.status === 'active' ? 'process-thinking--live' : ''
                }`}
              >
                <p className="process-thinking-text">{step.thinkingText}</p>
                {step.status === 'active' && <span className="process-thinking-caret" aria-hidden />}
              </div>
            ) : null}
            {step.detail ? (
              <code className="process-timeline-detail">{step.detail}</code>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
