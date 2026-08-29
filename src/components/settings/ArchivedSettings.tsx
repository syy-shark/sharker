/**
 * 设置 → 已归档：查看已归档对话，可回档或彻底删除
 * @see docs — 主列表只有归档，删除仅在此
 */
import { useCallback, useEffect, useState } from 'react'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { DEFAULT_CONVERSATION_TITLE, type ConversationSummary } from '../../../shared/conversation'
import './ArchivedSettings.css'

function titleOf(c: ConversationSummary): string {
  return (c.customTitle || c.title || DEFAULT_CONVERSATION_TITLE).trim() || DEFAULT_CONVERSATION_TITLE
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

/** 已归档对话列表 */
export function ArchivedSettings() {
  const [items, setItems] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.sharker.listArchivedConversations()
      setItems(list)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleRestore = async (c: ConversationSummary) => {
    setBusyId(c.id)
    try {
      await window.sharker.archiveConversation(c.workspaceId, c.id, false)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (c: ConversationSummary) => {
    const ok = window.confirm(`确定彻底删除「${titleOf(c)}」？此操作不可恢复。`)
    if (!ok) return
    setBusyId(c.id)
    try {
      await window.sharker.deleteConversation(c.workspaceId, c.id)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <p className="archived-empty">加载中…</p>
  }

  if (items.length === 0) {
    return (
      <p className="archived-empty">
        暂无已归档对话。在侧栏对话上悬停并点归档图标，或从项目菜单选 Archive chats，可将对话移到此处。
      </p>
    )
  }

  return (
    <ul className="archived-list">
      {items.map((c) => {
        const busy = busyId === c.id
        return (
          <li key={c.id} className="archived-item glass-tile">
            <div className="archived-item-main">
              <strong className="archived-item-title">{titleOf(c)}</strong>
              <span className="archived-item-meta">
                {c.workspaceLabel ? `${c.workspaceLabel} · ` : ''}
                {formatTime(c.updatedAt)}
                {c.messageCount != null ? ` · ${c.messageCount} 条消息` : ''}
              </span>
            </div>
            <div className="archived-item-actions">
              <button
                type="button"
                className="archived-btn archived-btn--restore"
                disabled={busy}
                title="回档到对话列表"
                onClick={() => void handleRestore(c)}
              >
                <ArchiveRestore size={15} aria-hidden />
                回档
              </button>
              <button
                type="button"
                className="archived-btn archived-btn--delete"
                disabled={busy}
                title="彻底删除"
                onClick={() => void handleDelete(c)}
              >
                <Trash2 size={15} aria-hidden />
                删除
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
