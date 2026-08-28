/**
 * 消息复制等操作按钮
 * @see src/ARCH.md
 */
import { useState } from 'react'
import { Check, Copy, Pencil, RotateCcw } from 'lucide-react'
import './MessageActions.css'

/** MessageActions Props：消息正文与 ID */
interface Props {
  content: string
  messageId: string
  onRetry?: () => void
  onEdit?: () => void
}

/** 消息操作区（复制 / 编辑 / 重试） */
export function MessageActions({ content, messageId, onRetry, onEdit }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
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
        title={copied ? '已复制' : '复制'}
        aria-label={copied ? '已复制' : '复制'}
        onClick={copy}
      >
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      </button>
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
