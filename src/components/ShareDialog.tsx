/**
 * `/share` 只读快照对话框：对标 Codex 桌面 Share。
 * 打开时用已拍好的 Markdown，不跟直播 token 重绘；只复制本机，不上传。
 * @see src/components/ARCH.md
 */
import { useEffect, useState } from 'react'
import './ShareDialog.css'

interface Props {
  open: boolean
  title?: string
  markdown: string
  redactedCount: number
  messageCount: number
  onClose: () => void
}

/** 官方桌面 Share 打开对话框；Sharker 复制脱敏快照，不外发 */
export function ShareDialog({
  open,
  title,
  markdown,
  redactedCount,
  messageCount,
  onClose
}: Props) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  useEffect(() => {
    if (!open) return
    setCopied(false)
    setCopyError('')
  }, [open, markdown])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const copy = async () => {
    if (!markdown.trim()) return
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setCopyError('')
    } catch {
      setCopyError('无法写入剪贴板，请手动全选复制。')
    }
  }

  return (
    <div className="share-dialog-root" role="presentation">
      <button type="button" className="share-dialog-backdrop" aria-label="关闭分享" onClick={onClose} />
      <div className="share-dialog glass-popover popover-enter" role="dialog" aria-labelledby="share-dialog-title">
        <div className="share-dialog-head">
          <h2 id="share-dialog-title">分享只读快照</h2>
          <p>
            对标 Codex 桌面 <code>/share</code>。收录用户可见消息、思考摘要和改文件
            diff，不含工具调用或命令输出。只复制到剪贴板，不会上传。
          </p>
        </div>
        <p className="share-dialog-meta">
          {title ? <strong>{title}</strong> : '当前对话'}
          {' · '}
          {messageCount} 条
          {redactedCount > 0 ? ` · 已脱敏 ${redactedCount} 处已知密钥` : ''}
        </p>
        <label className="share-dialog-preview">
          预览后再复制。路径等敏感内容可能仍在正文或 diff 里。
          <textarea readOnly value={markdown} spellCheck={false} />
        </label>
        {copied ? <p className="share-dialog-ok">已复制只读快照。</p> : null}
        {copyError ? <p className="share-dialog-err">{copyError}</p> : null}
        <div className="share-dialog-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="is-primary" disabled={!markdown.trim()} onClick={() => void copy()}>
            复制快照
          </button>
        </div>
      </div>
    </div>
  )
}
