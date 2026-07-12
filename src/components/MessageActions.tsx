/**
 * 消息复制等操作按钮
 * @see src/README.md
 */
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import './MessageActions.css'

/** MessageActions Props：消息正文与 ID */
interface Props {
  content: string
  messageId: string
  onRetry?: () => void
}

/** 消息操作区（复制等） */
export function MessageActions({ content, messageId, onRetry }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="message-actions" data-message-id={messageId}>
      <button
        type="button"
        className="message-actions-btn"
        title={copied ? '已复制' : '复制'}
        aria-label="复制"
        onClick={copy}
      >
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      </button>
      {onRetry ? (
        <button
          type="button"
          className="message-actions-btn"
          title="重新运行"
          aria-label="重新运行"
          onClick={onRetry}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M13 7a5 5 0 1 0-1.25 4.25" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
            <path d="M10.5 4.5H13V2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
