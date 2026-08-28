import { afterEach, describe, expect, it } from 'vitest'
import {
  enterPlanMode,
  exitPlanMode,
  getHarnessPhase,
  getPlanDocument,
  resetHarnessState,
  togglePlanMode
} from './harness-state'

describe('harness plan mode', () => {
  afterEach(() => {
    resetHarnessState()
  })

  it('isolates plan phase per conversation', () => {
    enterPlanMode('a')
    expect(getHarnessPhase('a')).toBe('plan')
    expect(getHarnessPhase('b')).toBe('normal')
    exitPlanMode({ conversationId: 'a', document: 'do x' })
    expect(getHarnessPhase('a')).toBe('normal')
    expect(getPlanDocument('a').document).toBe('do x')
    expect(getPlanDocument('b').document).toBeNull()
  })

  it('toggles plan mode like Codex /plan', () => {
    expect(togglePlanMode('c')).toBe('plan')
    expect(getHarnessPhase('c')).toBe('plan')
    expect(togglePlanMode('c')).toBe('normal')
    expect(getHarnessPhase('c')).toBe('normal')
  })
})
