import { describe, expect, it } from 'vitest'
import {
  applyGoalCommand,
  formatGoalChip,
  goalPromptBlock,
  parseGoalCommand
} from './thread-goal'

describe('thread goal', () => {
  it('parses slash args', () => {
    expect(parseGoalCommand('')).toEqual({ type: 'show' })
    expect(parseGoalCommand('clear')).toEqual({ type: 'clear' })
    expect(parseGoalCommand('PAUSE')).toEqual({ type: 'pause' })
    expect(parseGoalCommand('resume')).toEqual({ type: 'resume' })
    expect(parseGoalCommand('修好滚动')).toEqual({ type: 'set', text: '修好滚动' })
  })

  it('sets pauses and clears a goal', () => {
    const set = applyGoalCommand(null, { type: 'set', text: '修好滚动' })
    expect(set.goal).toEqual({ text: '修好滚动', status: 'active' })
    const paused = applyGoalCommand(set.goal, { type: 'pause' })
    expect(paused.goal?.status).toBe('paused')
    expect(goalPromptBlock(paused.goal)).toBeNull()
    const resumed = applyGoalCommand(paused.goal, { type: 'resume' })
    expect(goalPromptBlock(resumed.goal)).toContain('修好滚动')
    expect(applyGoalCommand(resumed.goal, { type: 'clear' }).goal).toBeNull()
  })

  it('formats a composer chip', () => {
    expect(formatGoalChip(null)).toBeNull()
    expect(formatGoalChip({ text: '短', status: 'active' })).toBe('目标 · 短')
    expect(formatGoalChip({ text: '短', status: 'paused' })).toBe('目标已暂停 · 短')
  })
})
