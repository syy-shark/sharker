/**
 * 输入框上方的排队条：编辑 / 重排 / 立即发送 / 删除（对标 Codex queued messages）。
 * 不接收直播 token，只跟队列 props 更新。
 * @see src/components/ARCH.md
 */
import { memo, useState } from 'react'
import type { QueuedPrompt } from '../types/chat'
import { normalizeStreamingText } from '../../shared/streaming-markdown'
import './ComposerQueue.css'

interface Props {
  items: QueuedPrompt[]
  onEdit: (id: string, text: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onSend: (id: string) => void
  onCancel: (id: string) => void
}

/** 排队列表：挂在输入框上方，不进对话滚动区，避免直播贴底跳动 */
export const ComposerQueue = memo(function ComposerQueue({
  items,
  onEdit,
  onMove,
  onSend,
  onCancel
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  if (items.length === 0) return null

  const commitEdit = (id: string) => {
    const text = draft.trim()
    if (text) onEdit(id, text)
    setEditingId(null)
    setDraft('')
  }

  return (
    <div className="composer-queue" role="list" aria-label="排队中的后续消息">
      {items.map((item, index) => {
        const editing = editingId === item.id
        return (
          <div key={item.id} className="composer-queue-item glass-tile" role="listitem">
            <span className="composer-queue-badge">排队 {index + 1}</span>
            {editing ? (
              <textarea
                className="composer-queue-edit"
                value={draft}
                aria-label="编辑排队消息"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditingId(null)
                    setDraft('')
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    commitEdit(item.id)
                  }
                }}
                autoFocus
              />
            ) : (
              <p className="composer-queue-text">{normalizeStreamingText(item.text)}</p>
            )}
            <div className="composer-queue-actions">
              {editing ? (
                <button
                  type="button"
                  className="composer-queue-btn"
                  disabled={!draft.trim()}
                  onClick={() => commitEdit(item.id)}
                >
                  保存
                </button>
              ) : (
                <button
                  type="button"
                  className="composer-queue-btn"
                  onClick={() => {
                    setEditingId(item.id)
                    setDraft(item.text)
                  }}
                >
                  编辑
                </button>
              )}
              <button
                type="button"
                className="composer-queue-btn"
                disabled={index === 0}
                onClick={() => onMove(item.id, -1)}
                aria-label="上移"
              >
                ↑
              </button>
              <button
                type="button"
                className="composer-queue-btn"
                disabled={index === items.length - 1}
                onClick={() => onMove(item.id, 1)}
                aria-label="下移"
              >
                ↓
              </button>
              <button
                type="button"
                className="composer-queue-btn composer-queue-btn--primary"
                onClick={() => onSend(item.id)}
              >
                发送
              </button>
              <button
                type="button"
                className="composer-queue-btn"
                onClick={() => onCancel(item.id)}
              >
                删除
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
})
