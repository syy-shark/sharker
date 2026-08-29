/**
 * 官方计划模式收束 Action Menu：Proposed Plan + Implement this plan?
 * 桌面只有实施 / 不实施，不发明 Clear context。
 */
import {
  IMPLEMENT_PLAN_NO,
  IMPLEMENT_PLAN_PROMPT,
  IMPLEMENT_PLAN_YES,
  PROPOSED_PLAN_TITLE
} from '../../shared/update-plan'
import './PlanBuildBar.css'

interface Props {
  planDocument: string
  onBuild: () => void
  onDismiss: () => void
}

/** 展示 Proposed Plan 与官方实施 / 不实施 */
export function PlanBuildBar({ planDocument, onBuild, onDismiss }: Props) {
  const preview = planDocument.slice(0, 400)
  return (
    <div className="plan-build-bar view-enter">
      <div className="plan-build-header">
        <div className="plan-build-heading">
          <span className="plan-build-title">{PROPOSED_PLAN_TITLE}</span>
          <span className="plan-build-prompt">{IMPLEMENT_PLAN_PROMPT}</span>
        </div>
        <button type="button" className="plan-build-dismiss" onClick={onDismiss}>
          {IMPLEMENT_PLAN_NO}
        </button>
      </div>
      <pre className="plan-build-preview">
        {preview}
        {planDocument.length > 400 ? '…' : ''}
      </pre>
      <button type="button" className="plan-build-btn" onClick={onBuild}>
        {IMPLEMENT_PLAN_YES}
      </button>
    </div>
  )
}
