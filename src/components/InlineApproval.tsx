import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import type { ApprovalRequest } from '../../shared/types'
import './InlineApproval.css'

export interface InlineApprovalProps {
  request: ApprovalRequest
  onRespond: (approved: boolean) => void | Promise<void>
  responding?: boolean
}

interface SubmittedDecision {
  requestId: string
  approved: boolean
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2) ?? '{}'
  } catch {
    return '操作参数无法显示'
  }
}

/** Inline, non-modal confirmation for a pending tool approval. */
export function InlineApproval({ request, onRespond, responding = false }: InlineApprovalProps) {
  const rootRef = useRef<HTMLElement>(null)
  const submittedRequestRef = useRef<string | null>(null)
  const [decision, setDecision] = useState<SubmittedDecision | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  const submitted = decision?.requestId === request.id
  const busy = responding || submitted

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'nearest' })
  }, [request.id])

  const respond = (approved: boolean) => {
    if (responding || submittedRequestRef.current === request.id) return

    submittedRequestRef.current = request.id
    setDecision({ requestId: request.id, approved })

    const resetAfterFailure = () => {
      if (submittedRequestRef.current !== request.id) return
      submittedRequestRef.current = null
      setDecision((current) => (current?.requestId === request.id ? null : current))
    }

    try {
      void Promise.resolve(onRespond(approved)).catch(resetAfterFailure)
    } catch {
      resetAfterFailure()
    }
  }

  return (
    <section
      ref={rootRef}
      className="inline-approval"
      role="region"
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
    >
      <div className="inline-approval__heading">
        <span className="inline-approval__icon" aria-hidden="true">
          <AlertTriangle size={17} strokeWidth={1.9} />
        </span>
        <div className="inline-approval__title-wrap">
          <span className="inline-approval__eyebrow">需要确认</span>
          <h3 id={titleId}>{request.title}</h3>
        </div>
      </div>

      <p id={descriptionId} className="inline-approval__description">
        {request.description}
      </p>

      <details className="inline-approval__details" key={request.id}>
        <summary>
          <span>查看操作参数</span>
          <code title={request.toolName}>{request.toolName}</code>
          <ChevronDown className="inline-approval__chevron" size={15} aria-hidden="true" />
        </summary>
        <div className="inline-approval__args">
          <pre tabIndex={0}>{formatArgs(request.args)}</pre>
        </div>
      </details>

      <div className="inline-approval__actions">
        <span className="inline-approval__status" role="status" aria-live="polite">
          {busy && (
            <>
              <LoaderCircle size={14} aria-hidden="true" />
              正在提交审批结果
            </>
          )}
        </span>
        <button
          type="button"
          className="inline-approval__button inline-approval__button--reject"
          disabled={busy}
          onClick={() => respond(false)}
        >
          <X size={15} aria-hidden="true" />
          拒绝
        </button>
        <button
          type="button"
          className="inline-approval__button inline-approval__button--allow"
          disabled={busy}
          onClick={() => respond(true)}
        >
          <ShieldCheck size={15} aria-hidden="true" />
          允许一次
        </button>
      </div>
    </section>
  )
}
