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
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      </button>
    </div>
  )
}
