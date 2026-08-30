/**
 * `/feedback` 对话框：对标 Codex 桌面反馈窗（分类 / 说明 / 附带会话）。
 * 只复制本机诊断，不上传。
 * @see src/components/ARCH.md
 */
import { useEffect, useRef, useState } from 'react'
import {
  FEEDBACK_CLASSIFICATIONS,
  formatFeedbackBundle,
  type FeedbackBundleInfo,
  type FeedbackClassification
} from '../../shared/feedback-bundle'
import {
  FILE_CLOSE_LABEL,
  INCLUDE_CURRENT_SESSION_LOGS_LABEL,
  SHARE_FEEDBACK_LABEL
} from '../../shared/reveal-in-folder'
import './FeedbackDialog.css'

interface Props {
  open: boolean
  info: FeedbackBundleInfo | null
  onClose: () => void
}

/** 官方桌面 `/feedback` 打开对话框；Sharker 复制本地包，不外发 */
export function FeedbackDialog({ open, info, onClose }: Props) {
  const [classification, setClassification] = useState<FeedbackClassification>('bug')
  const [reason, setReason] = useState('')
  const [includeSession, setIncludeSession] = useState(true)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setClassification('bug')
    setReason('')
    setIncludeSession(true)
    setCopied(false)
    setCopyError('')
    const id = window.setTimeout(() => reasonRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

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

  const sessionId = info?.conversationId ?? ''
  const bundle = info
    ? formatFeedbackBundle({
        ...info,
        classification,
        reason,
        includeSession
      })
    : ''

  const copy = async () => {
    if (!bundle) return
    try {
      await navigator.clipboard.writeText(bundle)
      setCopied(true)
      setCopyError('')
    } catch {
      setCopyError('无法写入剪贴板，请手动全选复制。')
    }
  }

  return (
    <div className="feedback-dialog-root" role="presentation">
      <button type="button" className="feedback-dialog-backdrop" aria-label={FILE_CLOSE_LABEL} onClick={onClose} />
      <div className="feedback-dialog glass-popover popover-enter" role="dialog" aria-labelledby="feedback-dialog-title">
        <header className="feedback-dialog-head">
          <h2 id="feedback-dialog-title">{SHARE_FEEDBACK_LABEL}</h2>
          <p>Opens the official `/feedback` form. Copies local diagnostics; does not upload.</p>
        </header>
        <div className="feedback-dialog-kinds" role="radiogroup" aria-label="反馈类型">
          {FEEDBACK_CLASSIFICATIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={classification === item.id}
              className={classification === item.id ? 'is-on' : undefined}
              onClick={() => setClassification(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
        <label className="feedback-dialog-reason">
          <span>说明</span>
          <textarea
            ref={reasonRef}
            rows={4}
            value={reason}
            placeholder="复现步骤或期望行为（可选）"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="feedback-dialog-session">
          <input
            type="checkbox"
            checked={includeSession}
            onChange={(event) => setIncludeSession(event.target.checked)}
          />
          <span>{INCLUDE_CURRENT_SESSION_LOGS_LABEL}</span>
        </label>
        {sessionId ? (
          <p className="feedback-dialog-id">
            会话 ID <code>{sessionId}</code>
          </p>
        ) : (
          <p className="feedback-dialog-id">当前没有会话 ID，仍可复制本机状态。</p>
        )}
        {copied ? <p className="feedback-dialog-ok">已复制。把会话 ID 发给维护者即可。</p> : null}
        {copyError ? <p className="feedback-dialog-err">{copyError}</p> : null}
        <footer className="feedback-dialog-actions">
          <button type="button" onClick={onClose}>
            {FILE_CLOSE_LABEL}
          </button>
          <button type="button" className="is-primary" disabled={!info} onClick={() => void copy()}>
            {info ? '复制诊断' : '正在收集…'}
          </button>
        </footer>
      </div>
    </div>
  )
}
