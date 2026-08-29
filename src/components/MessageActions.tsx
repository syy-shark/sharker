/**
 * 消息 Copy / Fork 等操作按钮（对标 Codex hover Copy / Fork）
 * @see src/ARCH.md
 */
import { useState } from 'react'
import { Check, Copy, GitFork, Pencil, RotateCcw } from 'lucide-react'
import { COPY_LABEL } from '../../shared/reveal-in-folder'
import './MessageActions.css'

/** MessageActions Props：消息正文与 ID */
interface Props {
  content: string
  /** 直播复制点按时再读，避免每枚 token 把操作条重绘一遍 */
  getContent?: () => string
  messageId: string
  onRetry?: () => void
  onEdit?: () => void
  /** 从此条分叉到新线程（对标 Codex fork from an earlier message） */
  onFork?: () => void
  /** 直播正文槽已上、尚无可复制正文：占同一高度，避免第一句回答再冒出 */
  reserved?: boolean
}

/** 消息操作区（复制 / 分叉 / 编辑 / 重试） */
export function MessageActions({
  content,
  getContent,
  messageId,
  onRetry,
  onEdit,
  onFork,
  reserved = false
}: Props) {
  const [copied, setCopied] = useState(false)

  if (reserved) {
    return (
      <div
        className="message-actions message-actions--reserved"
        data-message-id={messageId}
        aria-hidden
      />
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getContent ? getContent() : content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="message-actions" data-message-id={messageId}>
      <button
        type="button"
        className={`message-actions-btn${copied ? ' message-actions-btn--copied' : ''}`}
        title={COPY_LABEL}
        aria-label={COPY_LABEL}
        onClick={copy}
      >
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      </button>
      {onFork ? (
        <button
          type="button"
          className="message-actions-btn"
          title="Fork"
          aria-label="Fork from this message"
          onClick={onFork}
        >
          <GitFork size={16} aria-hidden />
        </button>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          className="message-actions-btn"
          title="编辑并重发"
          aria-label="编辑并重发"
          onClick={onEdit}
        >
          <Pencil size={16} aria-hidden />
        </button>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          className="message-actions-btn"
          title="重新运行"
          aria-label="重新运行"
          onClick={onRetry}
        >
          <RotateCcw size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
