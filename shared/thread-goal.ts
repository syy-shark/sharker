/**
 * 线程持久目标（对标 Codex `/goal`）：解析斜杠参数、应用状态、拼进 system。
 * @see shared/ARCH.md
 */

/** 目标是否仍在推进 */
export type ThreadGoalStatus = 'active' | 'paused'

/** Official Goal states (desktop progress row / cookbook active · paused). */
export const GOAL_ACTIVE_LABEL = 'Active'
export const GOAL_PAUSED_LABEL = 'Paused'
/** Official desktop `/goal` (learn.chatgpt.com/docs/reference/slash-commands). */
export const GOAL_MODE_LABEL = 'Goal mode'

/** 一条对话上的持久目标 */
export interface ThreadGoal {
  text: string
  status: ThreadGoalStatus
  /** 设定时刻，进度行显示耗时；不表示自动多小时循环 */
  startedAt?: number
  /** 暂停时刻；有值时秒表冻结，继续时从暂停前累计接上（对标 Codex #29370） */
  pausedAt?: number
}

/** 官方：目标正文最多 4000 字 */
export const GOAL_TEXT_MAX = 4000

/** `/goal` 参数解析结果 */
export type GoalCommand =
  | { type: 'show' }
  | { type: 'clear' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set'; text: string }
  | { type: 'edit'; text?: string }

/** 解析 `/goal` 后的参数（不含命令名） */
export function parseGoalCommand(args: string): GoalCommand {
  const raw = String(args || '').trim()
  if (!raw) return { type: 'show' }
  const key = raw.toLowerCase()
  if (key === 'clear' || key === 'off' || key === 'none') return { type: 'clear' }
  if (key === 'pause' || key === 'stop') return { type: 'pause' }
  if (key === 'resume' || key === 'on') return { type: 'resume' }
  if (key === 'edit' || key.startsWith('edit ') || key.startsWith('edit\n')) {
    const text = raw.replace(/^edit\s*/i, '').trim()
    return { type: 'edit', text: text || undefined }
  }
  return { type: 'set', text: raw }
}

function clampGoalText(text: string): string {
  const next = text.trim()
  return next.length > GOAL_TEXT_MAX ? next.slice(0, GOAL_TEXT_MAX) : next
}

/** Paused 进度行冻结秒表的截止时刻；Active 继续走 `startedAt` */
export function goalClockEndedAt(goal: ThreadGoal | null | undefined): number | undefined {
  if (!goal || goal.status !== 'paused') return undefined
  return goal.pausedAt
}

/** 把命令应用到当前目标，返回下一状态与助手说明 */
export function applyGoalCommand(
  current: ThreadGoal | null,
  command: GoalCommand,
  now = Date.now()
): { goal: ThreadGoal | null; note: string } {
  if (command.type === 'show') {
    if (!current?.text.trim()) {
      return {
        goal: current,
        note: '当前线程没有目标。用法：`/goal 文本` 设定，`/goal edit` 改写，`/goal pause` 暂停，`/goal resume` 继续，`/goal clear` 清除。'
      }
    }
    const state = current.status === 'paused' ? GOAL_PAUSED_LABEL : GOAL_ACTIVE_LABEL
    return { goal: current, note: `**线程目标**（${state}）\n\n${current.text}` }
  }
  if (command.type === 'clear') {
    return { goal: null, note: '已清除线程目标。' }
  }
  if (command.type === 'pause') {
    if (!current?.text.trim()) {
      return { goal: current, note: '没有可暂停的目标。先用 `/goal 文本` 设定。' }
    }
    return {
      goal: {
        ...current,
        status: 'paused',
        startedAt: current.startedAt,
        pausedAt: current.status === 'paused' ? current.pausedAt ?? now : now
      },
      note: `已暂停线程目标：${current.text}`
    }
  }
  if (command.type === 'resume') {
    if (!current?.text.trim()) {
      return { goal: current, note: '没有可继续的目标。先用 `/goal 文本` 设定。' }
    }
    let startedAt = current.startedAt
    if (current.status === 'paused' && startedAt != null) {
      const pausedAt = current.pausedAt ?? now
      startedAt = now - (pausedAt - startedAt)
    }
    return {
      goal: { ...current, status: 'active', startedAt, pausedAt: undefined },
      note: `已继续线程目标：${current.text}`
    }
  }
  if (command.type === 'edit') {
    const nextText = command.text ? clampGoalText(command.text) : ''
    if (!current?.text.trim()) {
      return { goal: current, note: '没有可编辑的目标。先用 `/goal 文本` 设定。' }
    }
    if (!nextText) {
      return { goal: current, note: '在进度行里改目标，或用 `/goal edit 新文本`。' }
    }
    return {
      goal: { ...current, text: nextText },
      note: `已更新线程目标：${nextText}`
    }
  }
  const text = clampGoalText(command.text)
  return {
    goal: { text, status: 'active', startedAt: current?.startedAt ?? now, pausedAt: undefined },
    note: `已设定线程目标：${text}`
  }
}

/** 进行中的目标才注入 system；暂停/空不注入 */
export function goalPromptBlock(goal: ThreadGoal | null | undefined): string | null {
  const text = goal?.text?.trim()
  if (!text || goal.status !== 'active') return null
  return [
    '# Thread goal',
    'The user set a persistent goal for this thread. Keep working toward it until they clear, pause, or replace it with /goal.',
    text
  ].join('\n')
}

/** 官方 `/goal 文本`：目标即首轮提示，不自动多小时循环 */
export function shouldStartGoalTurn(command: GoalCommand): boolean {
  return command.type === 'set'
}

/** Composer 芯片短文案 */
export function formatGoalChip(goal: ThreadGoal | null | undefined): string | null {
  const text = goal?.text?.trim()
  if (!text) return null
  const prefix = goal.status === 'paused' ? GOAL_PAUSED_LABEL : GOAL_ACTIVE_LABEL
  const short = text.length > 24 ? `${text.slice(0, 23)}…` : text
  return `${prefix} · ${short}`
}

/** 进度条状态字（对标 Codex Goal 进度行 Active / Paused） */
export function formatGoalProgressLabel(goal: ThreadGoal | null | undefined): string | null {
  const text = goal?.text?.trim()
  if (!text) return null
  return goal.status === 'paused' ? GOAL_PAUSED_LABEL : GOAL_ACTIVE_LABEL
}
