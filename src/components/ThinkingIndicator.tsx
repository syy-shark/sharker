/**
 * 思考中流光指示器
 * @see src/README.md
 */
import './ThinkingIndicator.css'

/** ThinkingIndicator Props：思考预览文本 */
interface Props {
  text?: string
  elapsed?: string
}

/** 流式思考中的流光指示器 */
export function ThinkingIndicator({ text = '', elapsed }: Props) {
  const preview = text.trim()

  return (
    <div className="thinking-indicator" aria-live="polite">
      <span className="thinking-indicator-label">思考中</span>
      {elapsed ? <span className="thinking-indicator-time">{elapsed}</span> : null}
      {preview ? <pre className="thinking-indicator-text">{preview}</pre> : null}
    </div>
  )
}
