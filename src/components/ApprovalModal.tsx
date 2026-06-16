/**
 * 工具审批确认弹窗
 * @see src/README.md
 */
import type { ApprovalRequest } from '../../shared/types'
import './ApprovalModal.css'

/** ApprovalModal Props：审批请求与用户响应回调 */
interface Props {
  request: ApprovalRequest
  onRespond: (approved: boolean) => void
}

/** 高危工具审批确认弹窗 */
export function ApprovalModal({ request, onRespond }: Props) {
  return (
    <div className="approval-overlay">
      <div className="approval-modal">
        <h3>{request.title}</h3>
        <p className="approval-desc">{request.description}</p>
        <div className="approval-detail">
          <span className="tool-tag">{request.toolName}</span>
          <pre>{JSON.stringify(request.args, null, 2)}</pre>
        </div>
        <div className="approval-actions">
          <button type="button" className="btn-secondary" onClick={() => onRespond(false)}>
            拒绝
          </button>
          <button type="button" className="btn-approve" onClick={() => onRespond(true)}>
            允许
          </button>
        </div>
      </div>
    </div>
  )
}
