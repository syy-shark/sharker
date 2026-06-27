/**
 * 计划就绪后的 Build 操作栏（Cursor 式）。
 */
import './PlanBuildBar.css'

interface Props {
  planDocument: string
  onBuild: () => void
  onDismiss: () => void
}

/** 展示计划摘要与 Build 按钮 */
export function PlanBuildBar({ planDocument, onBuild, onDismiss }: Props) {
  const preview = planDocument.slice(0, 400)
  return (
    <div className="plan-build-bar">
      <div className="plan-build-header">
        <span className="plan-build-title">计划已就绪</span>
        <button type="button" className="plan-build-dismiss" onClick={onDismiss}>
          关闭
        </button>
      </div>
      <pre className="plan-build-preview">
        {preview}
        {planDocument.length > 400 ? '…' : ''}
      </pre>
      <button type="button" className="plan-build-btn" onClick={onBuild}>
        Build — 按计划执行
      </button>
    </div>
  )
}
