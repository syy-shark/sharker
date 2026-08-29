/**
 * `/share` 只读快照对话框：对标 Codex 桌面 Share。
 * 打开时用已拍好的 Markdown，不跟直播 token 重绘；只复制本机，不上传。
 * 文案用官方快照说明；按钮用 Close / Copy as Markdown，不发明 Who has access / Copy link。
 * @see src/components/ARCH.md
 */
import { useEffect, useState } from 'react'
import {
  COPY_AS_MARKDOWN_LABEL,
  FILE_CLOSE_LABEL,
  SHARE_LABEL,
  SHARE_LOCAL_COPY_NOTE,
  SHARE_SNAPSHOT_CONTENTS,
  SHARE_SNAPSHOT_INTRO,
  SHARE_SNAPSHOT_REVIEW
} from '../../shared/reveal-in-folder'
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
  const [copyError, setCopyError] = useState('')

  useEffect(() => {
    if (!open) return
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
      setCopyError('')
    } catch {
      setCopyError('Could not write to the clipboard.')
    }
  }

  return (
    <div className="share-dialog-root" role="presentation">
      <button type="button" className="share-dialog-backdrop" aria-label={FILE_CLOSE_LABEL} onClick={onClose} />
      <div className="share-dialog glass-popover popover-enter" role="dialog" aria-labelledby="share-dialog-title">
        <div className="share-dialog-head">
          <h2 id="share-dialog-title">{SHARE_LABEL}</h2>
          <p>
            {SHARE_SNAPSHOT_INTRO} {SHARE_SNAPSHOT_CONTENTS} {SHARE_LOCAL_COPY_NOTE}
          </p>
        </div>
        <p className="share-dialog-meta">
          {title ? <strong>{title}</strong> : null}
          {title ? ' · ' : ''}
          {messageCount}
          {redactedCount > 0 ? ` · Redacted ${redactedCount} known secret patterns` : ''}
        </p>
        <label className="share-dialog-preview">
          {SHARE_SNAPSHOT_REVIEW}
          <textarea readOnly value={markdown} spellCheck={false} />
        </label>
        {copyError ? <p className="share-dialog-err">{copyError}</p> : null}
        <div className="share-dialog-actions">
          <button type="button" onClick={onClose}>
            {FILE_CLOSE_LABEL}
          </button>
          <button type="button" className="is-primary" disabled={!markdown.trim()} onClick={() => void copy()}>
            {COPY_AS_MARKDOWN_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
