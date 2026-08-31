import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, LoaderCircle, ShieldCheck, ShieldPlus, X } from 'lucide-react'
import type { ApprovalRequest } from '../../shared/types'
import {
  ALLOW_FOR_SESSION_LABEL,
  ALLOW_ONCE_LABEL,
  CHAT_APPEARS_STUCK_HINT,
  DENY_LABEL,
  type ApprovalDecision
} from '../../shared/approval-session'
import { AWAITING_APPROVAL_LABEL } from '../../shared/live-display'
import { formatMcpApprovalLabel } from '../../shared/mcp-activity'
import './InlineApproval.css'

export interface InlineApprovalProps {
  request: ApprovalRequest
  onRespond: (decision: ApprovalDecision) => void | Promise<void>
  responding?: boolean
}

interface SubmittedDecision {
  requestId: string
  decision: ApprovalDecision
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2) ?? '{}'
  } catch {
    return '{}'
  }
}

/**
 * 过程内高危确认：Allow once / Allow for session / Deny。
 * MCP 工具名走官方 Calling server.tool({compact})，不另挂「查看操作参数」以免挤高直播审批卡。
 * 不发明 always-allow 配置。
 */
export function InlineApproval({ request, onRespond, responding = false }: InlineApprovalProps) {
  const rootRef = useRef<HTMLElement>(null)
  const submittedRequestRef = useRef<string | null>(null)
  const [decision, setDecision] = useState<SubmittedDecision | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  const submitted = decision?.requestId === request.id
  const busy = responding || submitted

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [request.id])

  const respond = (choice: ApprovalDecision) => {
    if (responding || submittedRequestRef.current === request.id) return

    submittedRequestRef.current = request.id
    setDecision({ requestId: request.id, decision: choice })

    const resetAfterFailure = () => {
      if (submittedRequestRef.current !== request.id) return
      submittedRequestRef.current = null
      setDecision((current) => (current?.requestId === request.id ? null : current))
    }

    try {
      void Promise.resolve(onRespond(choice)).catch(resetAfterFailure)
    } catch {
      resetAfterFailure()
    }
  }

  return (
    <section
      ref={rootRef}
      className="inline-approval"
      role="region"
      title={CHAT_APPEARS_STUCK_HINT}
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (busy) return
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          respond('once')
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          respond('deny')
        }
      }}
    >
      <div className="inline-approval__heading">
        <span className="inline-approval__icon" aria-hidden="true">
          <AlertTriangle size={17} strokeWidth={1.9} />
        </span>
        <div className="inline-approval__title-wrap">
          <span className="inline-approval__eyebrow">{AWAITING_APPROVAL_LABEL}</span>
          <h3 id={titleId}>{request.title}</h3>
        </div>
      </div>

      <p id={descriptionId} className="inline-approval__description">
        {request.description}
      </p>

      <details className="inline-approval__details" key={request.id}>
        <summary>
          <code title={request.toolName}>
            {formatMcpApprovalLabel(request.toolName, request.args)}
          </code>
          <ChevronDown className="inline-approval__chevron" size={15} aria-hidden="true" />
        </summary>
        <div className="inline-approval__args">
          <pre tabIndex={0}>{formatArgs(request.args)}</pre>
        </div>
      </details>

      <div className="inline-approval__actions">
        <span className="inline-approval__status" role="status" aria-live="polite">
          {busy ? <LoaderCircle size={14} aria-hidden="true" /> : null}
        </span>
        <button
          type="button"
          className="inline-approval__button inline-approval__button--reject"
          disabled={busy}
          onClick={() => respond('deny')}
        >
          <X size={15} aria-hidden="true" />
          {DENY_LABEL}
        </button>
        <button
          type="button"
          className="inline-approval__button inline-approval__button--session"
          disabled={busy}
          onClick={() => respond('session')}
          title="Do not ask again for this tool in the current session"
        >
          <ShieldPlus size={15} aria-hidden="true" />
          {ALLOW_FOR_SESSION_LABEL}
        </button>
        <button
          type="button"
          className="inline-approval__button inline-approval__button--allow"
          disabled={busy}
          onClick={() => respond('once')}
        >
          <ShieldCheck size={15} aria-hidden="true" />
          {ALLOW_ONCE_LABEL}
        </button>
      </div>
    </section>
  )
}
