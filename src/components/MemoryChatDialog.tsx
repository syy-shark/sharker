/**
 * `/memories` 空参数先选本对话记忆（对标 Codex use / generate / disabled）。
 * 选定前不改全局设置。
 * @see src/components/ARCH.md
 */
import { useEffect } from 'react'
import {
  DISABLED_MEMORIES_CHAT_HINT,
  DISABLED_MEMORIES_LABEL,
  GENERATE_MEMORIES_CHAT_HINT,
  GENERATE_MEMORIES_LABEL,
  INHERIT_MEMORIES_CHAT_HINT,
  INHERIT_MEMORIES_LABEL,
  MEMORIES_CHAT_INTRO,
  USE_MEMORIES_CHAT_HINT,
  USE_MEMORIES_LABEL,
  type MemoryChatPick
} from '../../shared/memory-command'
import './MemoryChatDialog.css'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (pick: MemoryChatPick) => void
}

/** 官方 /memories 为本对话选使用已有 / 写入新 / 关闭 */
export function MemoryChatDialog({ open, onClose, onPick }: Props) {
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

  return (
    <div className="memory-chat-root" role="presentation">
      <button
        type="button"
        className="memory-chat-backdrop"
        aria-label="关闭记忆选择"
        onClick={onClose}
      />
      <div
        className="memory-chat-dialog glass-popover popover-enter"
        role="dialog"
        aria-labelledby="memory-chat-title"
      >
        <div className="memory-chat-head">
          <h2 id="memory-chat-title">/memories</h2>
          <p>{MEMORIES_CHAT_INTRO}</p>
        </div>
        <div className="memory-chat-choices">
          <button type="button" onClick={() => onPick('use')}>
            <strong>{USE_MEMORIES_LABEL}</strong>
            <span>{USE_MEMORIES_CHAT_HINT}</span>
          </button>
          <button type="button" onClick={() => onPick('generate')}>
            <strong>{GENERATE_MEMORIES_LABEL}</strong>
            <span>{GENERATE_MEMORIES_CHAT_HINT}</span>
          </button>
          <button type="button" onClick={() => onPick('off')}>
            <strong>{DISABLED_MEMORIES_LABEL}</strong>
            <span>{DISABLED_MEMORIES_CHAT_HINT}</span>
          </button>
          <button type="button" onClick={() => onPick('inherit')}>
            <strong>{INHERIT_MEMORIES_LABEL}</strong>
            <span>{INHERIT_MEMORIES_CHAT_HINT}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
