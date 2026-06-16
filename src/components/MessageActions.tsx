/**
 * 消息复制等操作按钮
 * @see src/README.md
 */
import { useState } from 'react'
import './MessageActions.css'

/** MessageActions Props：消息正文与 ID */
interface Props {
  content: string
  messageId: string
}

/** 消息操作区（复制等） */
export function MessageActions({ content, messageId }: Props) {
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
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M3 8.5 6.5 12 13 4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <rect
              x="5"
              y="5"
              width="8"
              height="9"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.25"
              fill="none"
            />
            <path
              d="M4 11H3a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 3 1.5h7A1.5 1.5 0 0 1 11.5 3V4"
              stroke="currentColor"
              strokeWidth="1.25"
              fill="none"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
