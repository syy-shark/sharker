import { afterEach, describe, expect, it } from 'vitest'
import { getHarnessPhase, resetHarnessState } from '../tools/harness-state'
import { processUserInput } from './pipeline'

afterEach(() => {
  resetHarnessState()
})

describe('processUserInput plan mode', () => {
  it('toggles empty /plan without querying', () => {
    const on = processUserInput('/plan', 'c1')
    expect(on.shouldQuery).toBe(false)
    expect(on.harnessPhase).toBe('plan')
    expect(on.localReply).toContain('计划模式')
    expect(getHarnessPhase('c1')).toBe('plan')
    expect(getHarnessPhase('c2')).toBe('normal')

    const off = processUserInput('/plan', 'c1')
    expect(off.shouldQuery).toBe(false)
    expect(off.harnessPhase).toBe('normal')
    expect(getHarnessPhase('c1')).toBe('normal')
  })

  it('starts a planning query when /plan has a description', () => {
    const started = processUserInput('/plan 修好滚动', 'c1')
    expect(started.shouldQuery).toBe(true)
    expect(started.harnessPhase).toBe('plan')
    expect(started.userText).toContain('用户补充：修好滚动')
    expect(getHarnessPhase('c1')).toBe('plan')
  })

  it('turns the plan chip off when Build starts', () => {
    processUserInput('/plan 调研', 'c1')
    const built = processUserInput('__SHARKER_BUILD__\n按计划实施', 'c1')
    expect(built.shouldQuery).toBe(true)
    expect(built.harnessPhase).toBe('normal')
    expect(getHarnessPhase('c1')).toBe('build')
  })
})
