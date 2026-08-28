import { afterEach, describe, expect, it } from 'vitest'
import { goalTextForConversation, loadThreadGoal, saveThreadGoal } from './thread-goal'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
    clear: () => memory.clear()
  }
})

afterEach(() => {
  memory.clear()
})

describe('thread goal storage', () => {
  it('round-trips an active goal and injects only the active one', () => {
    saveThreadGoal('a', { text: '修好滚动', status: 'active' })
    saveThreadGoal('bg', { text: '后台目标', status: 'paused' })
    expect(loadThreadGoal('a')?.text).toBe('修好滚动')
    expect(goalTextForConversation('a', 'a', { text: '修好滚动', status: 'active' })).toContain(
      '修好滚动'
    )
    expect(goalTextForConversation('bg', 'a', { text: '修好滚动', status: 'active' })).toBeUndefined()
  })

  it('clears storage when goal is empty', () => {
    saveThreadGoal('a', { text: 'x', status: 'active' })
    saveThreadGoal('a', null)
    expect(loadThreadGoal('a')).toBeNull()
  })

  it('persists startedAt for the goal progress clock', () => {
    saveThreadGoal('a', { text: '修好滚动', status: 'active', startedAt: 1_700_000_000_000 })
    expect(loadThreadGoal('a')?.startedAt).toBe(1_700_000_000_000)
  })
})
