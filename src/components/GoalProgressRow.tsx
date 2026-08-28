/**
 * 线程目标进度行：对标 Codex Goal 模式，放在输入框上方。
 * 耗时用独立秒表；不接收直播 token，避免跟流式重绘。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState } from 'react'
import { Check, Pause, Pencil, Play, X } from 'lucide-react'
import {
  formatGoalProgressLabel,
  type GoalCommand,
  type ThreadGoal
} from '../../shared/thread-goal'
import { LiveDuration } from './LiveDuration'
import './GoalProgressRow.css'

interface Props {
  goal: ThreadGoal
  onCommand: (command: GoalCommand) => void
}

/** 暂停 / 继续 / 编辑 / 清除；编辑态不跟直播走 */
export const GoalProgressRow = memo(function GoalProgressRow({ goal, onCommand }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goal.text)

  useEffect(() => {
    if (!editing) setDraft(goal.text)
  }, [editing, goal.text])

  const status = formatGoalProgressLabel(goal)
  if (!status) return null

  const saveEdit = () => {
    const text = draft.trim()
    if (!text) {
      onCommand({ type: 'clear' })
      setEditing(false)
      return
    }
    if (text !== goal.text.trim()) onCommand({ type: 'set', text })
    setEditing(false)
  }

  return (
    <div
      className={`goal-progress-row${goal.status === 'paused' ? ' is-paused' : ' is-active'}`}
      role="region"
      aria-label="线程目标"
    >
      <div className="goal-progress-row-main">
        <span className="goal-progress-row-status">{status}</span>
        {goal.startedAt ? (
          <LiveDuration startedAt={goal.startedAt} className="goal-progress-row-elapsed" />
        ) : null}
        {editing ? (
          <input
            className="goal-progress-row-input"
            value={draft}
            aria-label="编辑线程目标"
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                saveEdit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setDraft(goal.text)
                setEditing(false)
              }
            }}
          />
        ) : (
          <p className="goal-progress-row-text" title={goal.text}>
            {goal.text}
          </p>
        )}
      </div>
      <div className="goal-progress-row-actions">
        {editing ? (
          <button
            type="button"
            className="goal-progress-row-btn"
            onClick={saveEdit}
            aria-label="保存目标"
            title="保存"
          >
            <Check size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="goal-progress-row-btn"
              onClick={() => onCommand({ type: goal.status === 'paused' ? 'resume' : 'pause' })}
              aria-label={goal.status === 'paused' ? '继续目标' : '暂停目标'}
              title={goal.status === 'paused' ? '继续' : '暂停'}
            >
              {goal.status === 'paused' ? (
                <Play size={14} strokeWidth={2} aria-hidden />
              ) : (
                <Pause size={14} strokeWidth={2} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="goal-progress-row-btn"
              onClick={() => setEditing(true)}
              aria-label="编辑目标"
              title="编辑"
            >
              <Pencil size={14} strokeWidth={2} aria-hidden />
            </button>
          </>
        )}
        <button
          type="button"
          className="goal-progress-row-btn goal-progress-row-btn--clear"
          onClick={() => onCommand({ type: 'clear' })}
          aria-label="清除目标"
          title="清除"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  )
})
