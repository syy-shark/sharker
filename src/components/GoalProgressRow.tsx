/**
 * Goal mode 进度行：对标 Codex Goal 模式，放在输入框上方。
 * 耗时用独立秒表；Paused 冻结；不接收直播 token，避免跟流式重绘。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState } from 'react'
import { Check, Pause, Pencil, Play, X } from 'lucide-react'
import {
  CLEAR_LABEL,
  EDIT_LABEL,
  PAUSE_LABEL,
  RESUME_LABEL,
  SAVE_LABEL
} from '../../shared/reveal-in-folder'
import {
  formatGoalProgressLabel,
  GOAL_MODE_LABEL,
  goalClockEndedAt,
  type GoalCommand,
  type ThreadGoal
} from '../../shared/thread-goal'
import { LiveDuration } from './LiveDuration'
import './GoalProgressRow.css'

interface Props {
  goal: ThreadGoal
  onCommand: (command: GoalCommand) => void
  /** `/goal edit` 打开进度行编辑（对标 Codex /goal edit） */
  editTick?: number
}

/** Pause / Resume / Edit / Clear；编辑态不跟直播走 */
export const GoalProgressRow = memo(function GoalProgressRow({
  goal,
  onCommand,
  editTick = 0
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goal.text)

  useEffect(() => {
    if (!editing) setDraft(goal.text)
  }, [editing, goal.text])

  useEffect(() => {
    if (!editTick) return
    setDraft(goal.text)
    setEditing(true)
  }, [editTick, goal.text])

  const status = formatGoalProgressLabel(goal)
  if (!status) return null

  const saveEdit = () => {
    const text = draft.trim()
    if (!text) {
      onCommand({ type: 'clear' })
      setEditing(false)
      return
    }
    if (text !== goal.text.trim()) onCommand({ type: 'edit', text })
    setEditing(false)
  }

  return (
    <div
      className={`goal-progress-row${goal.status === 'paused' ? ' is-paused' : ' is-active'}`}
      role="region"
      aria-label={GOAL_MODE_LABEL}
    >
      <div className="goal-progress-row-main">
        <span className="goal-progress-row-status">{status}</span>
        {goal.startedAt ? (
          <LiveDuration
            startedAt={goal.startedAt}
            endedAt={goalClockEndedAt(goal)}
            paused={goal.status === 'paused'}
            className="goal-progress-row-elapsed"
          />
        ) : null}
        {editing ? (
          <input
            className="goal-progress-row-input"
            value={draft}
            aria-label={EDIT_LABEL}
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
            aria-label={SAVE_LABEL}
            title={SAVE_LABEL}
          >
            <Check size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="goal-progress-row-btn"
              onClick={() => onCommand({ type: goal.status === 'paused' ? 'resume' : 'pause' })}
              aria-label={goal.status === 'paused' ? RESUME_LABEL : PAUSE_LABEL}
              title={goal.status === 'paused' ? RESUME_LABEL : PAUSE_LABEL}
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
              aria-label={EDIT_LABEL}
              title={EDIT_LABEL}
            >
              <Pencil size={14} strokeWidth={2} aria-hidden />
            </button>
          </>
        )}
        <button
          type="button"
          className="goal-progress-row-btn goal-progress-row-btn--clear"
          onClick={() => onCommand({ type: 'clear' })}
          aria-label={CLEAR_LABEL}
          title={CLEAR_LABEL}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  )
})
