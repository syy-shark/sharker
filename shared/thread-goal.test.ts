import { describe, expect, it } from 'vitest'
import {
  applyGoalCommand,
  formatGoalChip,
  formatGoalProgressLabel,
  GOAL_ACTIVE_LABEL,
  GOAL_PAUSED_LABEL,
  goalPromptBlock,
  parseGoalCommand,
  shouldStartGoalTurn
} from './thread-goal'

describe('thread goal', () => {
  it('parses slash args', () => {
    expect(parseGoalCommand('')).toEqual({ type: 'show' })
    expect(parseGoalCommand('clear')).toEqual({ type: 'clear' })
    expect(parseGoalCommand('PAUSE')).toEqual({ type: 'pause' })
    expect(parseGoalCommand('resume')).toEqual({ type: 'resume' })
    expect(parseGoalCommand('修好滚动')).toEqual({ type: 'set', text: '修好滚动' })
    expect(parseGoalCommand('edit')).toEqual({ type: 'edit' })
    expect(parseGoalCommand('edit 改成审查栏')).toEqual({ type: 'edit', text: '改成审查栏' })
    expect(shouldStartGoalTurn({ type: 'set', text: '修好滚动' })).toBe(true)
    expect(shouldStartGoalTurn({ type: 'edit', text: '改成审查栏' })).toBe(false)
    expect(shouldStartGoalTurn({ type: 'show' })).toBe(false)
    expect(shouldStartGoalTurn({ type: 'pause' })).toBe(false)
  })

  it('sets pauses and clears a goal', () => {
    const set = applyGoalCommand(null, { type: 'set', text: '修好滚动' })
    expect(set.goal?.text).toBe('修好滚动')
    expect(set.goal?.status).toBe('active')
    expect(typeof set.goal?.startedAt).toBe('number')
    const paused = applyGoalCommand(set.goal, { type: 'pause' })
    expect(paused.goal?.status).toBe('paused')
    expect(paused.goal?.startedAt).toBe(set.goal?.startedAt)
    expect(goalPromptBlock(paused.goal)).toBeNull()
    const resumed = applyGoalCommand(paused.goal, { type: 'resume' })
    expect(goalPromptBlock(resumed.goal)).toContain('修好滚动')
    expect(applyGoalCommand(resumed.goal, { type: 'clear' }).goal).toBeNull()
    const edited = applyGoalCommand(set.goal, { type: 'edit', text: '改成审查栏' })
    expect(edited.goal?.text).toBe('改成审查栏')
    expect(edited.goal?.status).toBe('active')
    expect(edited.goal?.startedAt).toBe(set.goal?.startedAt)
    expect(shouldStartGoalTurn({ type: 'edit', text: '改成审查栏' })).toBe(false)
    expect(applyGoalCommand(set.goal, { type: 'edit' }).note).toContain('进度行')
    expect(applyGoalCommand(null, { type: 'edit', text: 'x' }).goal).toBeNull()
    const long = applyGoalCommand(null, { type: 'set', text: 'x'.repeat(4001) })
    expect(long.goal?.text).toHaveLength(4000)
  })

  it('formats a composer chip', () => {
    expect(formatGoalChip(null)).toBeNull()
    expect(formatGoalChip({ text: '短', status: 'active' })).toBe('Active · 短')
    expect(formatGoalChip({ text: '短', status: 'paused' })).toBe('Paused · 短')
    expect(formatGoalProgressLabel({ text: '修好滚动', status: 'active' })).toBe('Active')
    expect(formatGoalProgressLabel({ text: '修好滚动', status: 'paused' })).toBe('Paused')
    expect(formatGoalProgressLabel(null)).toBeNull()
    expect(GOAL_ACTIVE_LABEL).toBe('Active')
    expect(GOAL_PAUSED_LABEL).toBe('Paused')
  })
})
