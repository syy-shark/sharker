/**
 * `/memories` 空参数先选本对话记忆（对标 Codex use / generate / disabled）。
 * 选定前不改全局设置。
 * @see src/components/ARCH.md
 */
import { useEffect } from 'react'
import {
  ENABLE_MEMORIES_LABEL,
  GENERATE_MEMORIES_LABEL,
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
          <h2 id="memory-chat-title">本对话记忆</h2>
          <p>
            对标 Codex <code>/memories</code>
            ：只改当前对话，不改设置 → 个性化的 {ENABLE_MEMORIES_LABEL}。功能关闭时本对话选择会记下，打开后才 Use / Generate。
          </p>
        </div>
        <div className="memory-chat-choices">
          <button type="button" onClick={() => onPick('use')}>
            <strong>{USE_MEMORIES_LABEL}</strong>
            <span>本对话使用已有条目，不把本轮写成新记忆</span>
          </button>
          <button type="button" onClick={() => onPick('generate')}>
            <strong>{GENERATE_MEMORIES_LABEL}</strong>
            <span>使用已有条目，并允许本对话贡献新记忆</span>
          </button>
          <button type="button" onClick={() => onPick('off')}>
            <strong>Disabled</strong>
            <span>本对话不 Use、不 Generate（官方 disabled）</span>
          </button>
          <button type="button" onClick={() => onPick('inherit')}>
            <strong>Inherit</strong>
            <span>清掉本对话覆盖，回到设置 → Personalization</span>
          </button>
        </div>
      </div>
    </div>
  )
}
