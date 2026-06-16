/**
 * 思考中流光指示器
 * @see src/README.md
 */
import './ThinkingIndicator.css'

/** ThinkingIndicator Props：思考预览文本 */
interface Props {
  text: string
}

/** 流式思考中的流光指示器 */
export function ThinkingIndicator({ text }: Props) {
  const preview = text.trim()

  return (
    <div className="thinking-indicator" aria-live="polite">
      <div className="thinking-indicator-track" aria-hidden>
        <div className="thinking-indicator-sweep" />
      </div>
      <span className="thinking-indicator-label">思考中</span>
      {preview ? <pre className="thinking-indicator-text">{preview}</pre> : null}
    </div>
  )
}
