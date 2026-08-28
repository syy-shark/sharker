import { afterEach, describe, expect, it } from 'vitest'
import { getHarnessPhase, resetHarnessState } from '../tools/harness-state'
import { matchSlashCommand } from './commands'

afterEach(() => {
  resetHarnessState()
})

describe('slash command matching', () => {
  it('treats /plan-mode as /plan', () => {
    const plan = matchSlashCommand('/plan 修好滚动')
    const alias = matchSlashCommand('/plan-mode 修好滚动')
    expect(plan?.shouldQuery).toBe(true)
    expect(alias?.rewrittenText).toBe(plan?.rewrittenText)
    expect(alias?.rewrittenText).toContain('用户补充：修好滚动')
    expect(plan?.harnessPhase).toBe('plan')
  })

  it('toggles plan mode when /plan has no args', () => {
    const on = matchSlashCommand('/plan', 'conv-1')
    expect(on?.shouldQuery).toBeFalsy()
    expect(on?.harnessPhase).toBe('plan')
    expect(on?.reply).toContain('计划模式')
    const off = matchSlashCommand('/plan', 'conv-1')
    expect(off?.harnessPhase).toBe('normal')
  })

  it('keeps plan toggle isolated per conversation', () => {
    expect(matchSlashCommand('/plan', 'a')?.harnessPhase).toBe('plan')
    expect(matchSlashCommand('/plan', 'b')?.harnessPhase).toBe('plan')
    expect(matchSlashCommand('/plan', 'a')?.harnessPhase).toBe('normal')
    expect(getHarnessPhase('a')).toBe('normal')
    expect(getHarnessPhase('b')).toBe('plan')
  })
})
