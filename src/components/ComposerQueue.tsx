/**
 * 输入框上方的排队条：注入预览 / 排队后续（对标 Codex pending steer + queued follow-ups）。
 * 不接收直播 token，只跟队列 props 更新。
 * @see src/components/ARCH.md
 */
import { memo, useState } from 'react'
import type { QueuedPrompt } from '../types/chat'
import { clampPendingInputPreview, pendingPreviewNeedsClamp } from '../../shared/pending-preview'
import { normalizeStreamingText } from '../../shared/streaming-markdown'
import './ComposerQueue.css'

interface Props {
  /** 已接受、下一工具/采样后写入当前回合 */
  steers?: QueuedPrompt[]
  items: QueuedPrompt[]
  onEdit: (id: string, text: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onSend: (id: string) => void
  onCancel: (id: string) => void
  /** 直播中排队芯片主操作是注入（对标 Codex Steer），不得中止当前回合 */
  busy?: boolean
}

function QueueRow({
  item,
  index,
  kind,
  editing,
  draft,
  canMoveUp,
  canMoveDown,
  onDraft,
  onStartEdit,
  onCommit,
  onCancelEdit,
  onMove,
  onSend,
  onCancel,
  sendLabel
}: {
  item: QueuedPrompt
  index: number
  kind: 'steer' | 'queue'
  editing: boolean
  draft: string
  canMoveUp: boolean
  canMoveDown: boolean
  onDraft: (text: string) => void
  onStartEdit: () => void
  onCommit: () => void
  onCancelEdit: () => void
  onMove: (direction: -1 | 1) => void
  onSend: () => void
  onCancel: () => void
  sendLabel: string
}) {
  return (
    <div className="composer-queue-item glass-tile" role="listitem">
      <span className={`composer-queue-badge${kind === 'steer' ? ' composer-queue-badge--steer' : ''}`}>
        {kind === 'steer' ? '注入' : `排队 ${index + 1}`}
      </span>
      {editing ? (
        <textarea
          className="composer-queue-edit"
          value={draft}
          aria-label={kind === 'steer' ? '编辑注入消息' : '编辑排队消息'}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancelEdit()
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onCommit()
            }
          }}
          autoFocus
        />
      ) : (
        <p
          className="composer-queue-text"
          title={pendingPreviewNeedsClamp(item.text) ? item.text : undefined}
        >
          {clampPendingInputPreview(normalizeStreamingText(item.text))}
        </p>
      )}
      <div className="composer-queue-actions">
        {editing ? (
          <button
            type="button"
            className="composer-queue-btn"
            disabled={!draft.trim()}
            onClick={onCommit}
          >
            保存
          </button>
        ) : (
          <button type="button" className="composer-queue-btn" onClick={onStartEdit}>
            编辑
          </button>
        )}
        {kind === 'queue' ? (
          <>
            <button
              type="button"
              className="composer-queue-btn"
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
              aria-label="上移"
            >
              ↑
            </button>
            <button
              type="button"
              className="composer-queue-btn"
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
              aria-label="下移"
            >
              ↓
            </button>
            <button
              type="button"
              className="composer-queue-btn composer-queue-btn--primary"
              onClick={onSend}
              aria-label={sendLabel === '注入' ? '注入当前回合' : '立即发送'}
            >
              {sendLabel}
            </button>
          </>
        ) : null}
        <button type="button" className="composer-queue-btn" onClick={onCancel}>
          删除
        </button>
      </div>
    </div>
  )
}

/** 注入在上、排队在下：挂在输入框上方，不进对话滚动区 */
export const ComposerQueue = memo(function ComposerQueue({
  steers = [],
  items,
  onEdit,
  onMove,
  onSend,
  onCancel,
  busy = false
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  if (steers.length === 0 && items.length === 0) return null

  const commitEdit = (id: string) => {
    const text = draft.trim()
    if (text) onEdit(id, text)
    setEditingId(null)
    setDraft('')
  }

  return (
    <div className="composer-queue" role="list" aria-label="注入与排队中的后续消息">
      {steers.map((item, index) => {
        const editing = editingId === item.id
        return (
          <QueueRow
            key={item.id}
            item={item}
            index={index}
            kind="steer"
            editing={editing}
            draft={draft}
            canMoveUp={false}
            canMoveDown={false}
            onDraft={setDraft}
            onStartEdit={() => {
              setEditingId(item.id)
              setDraft(item.text)
            }}
            onCommit={() => commitEdit(item.id)}
            onCancelEdit={() => {
              setEditingId(null)
              setDraft('')
            }}
            onMove={() => undefined}
            onSend={() => undefined}
            onCancel={() => onCancel(item.id)}
            sendLabel="发送"
          />
        )
      })}
      {items.map((item, index) => {
        const editing = editingId === item.id
        return (
          <QueueRow
            key={item.id}
            item={item}
            index={index}
            kind="queue"
            editing={editing}
            draft={draft}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
            onDraft={setDraft}
            onStartEdit={() => {
              setEditingId(item.id)
              setDraft(item.text)
            }}
            onCommit={() => commitEdit(item.id)}
            onCancelEdit={() => {
              setEditingId(null)
              setDraft('')
            }}
            onMove={(direction) => onMove(item.id, direction)}
            onSend={() => onSend(item.id)}
            onCancel={() => onCancel(item.id)}
            sendLabel={busy ? '注入' : '发送'}
          />
        )
      })}
    </div>
  )
})
