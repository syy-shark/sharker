/**
 * 对话渲染图：悬停复制 / 保存（对标 Codex Save or copy rendered images）。
 * @see src/components/ARCH.md
 */
import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { canExportChatImage, type ChatImageExportInput } from '../../shared/chat-image'
import './MessageActions.css'
import './ChatImage.css'

export function ChatImage({
  src,
  alt,
  title,
  filePath,
  name
}: {
  src: string
  alt?: string
  title?: string
  filePath?: string
  name?: string
}) {
  const [copied, setCopied] = useState(false)
  const input: ChatImageExportInput = { src, filePath, name, alt }
  const canExport = canExportChatImage(input)

  const copy = async () => {
    if (!canExport || !window.sharker?.copyChatImage) return
    const result = await window.sharker.copyChatImage(input)
    if (!result?.ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const save = async () => {
    if (!canExport || !window.sharker?.saveChatImage) return
    await window.sharker.saveChatImage(input)
  }

  return (
    <span className="chat-image">
      <img src={src} alt={alt ?? ''} title={title} loading="lazy" />
      {canExport ? (
        <span className="chat-image-actions" role="group" aria-label="图片操作">
          <button
            type="button"
            className={`message-actions-btn${copied ? ' message-actions-btn--copied' : ''}`}
            title={copied ? '已复制' : '复制图片'}
            aria-label={copied ? '已复制' : '复制图片'}
            onClick={() => void copy()}
          >
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          </button>
          <button
            type="button"
            className="message-actions-btn"
            title="保存图片"
            aria-label="保存图片"
            onClick={() => void save()}
          >
            <Download size={16} aria-hidden />
          </button>
        </span>
      ) : null}
    </span>
  )
}
