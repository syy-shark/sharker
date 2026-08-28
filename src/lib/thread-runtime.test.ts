import { afterEach, describe, expect, it } from 'vitest'
import {
  loadThreadRuntime,
  runtimeForConversation,
  saveThreadRuntime
} from './thread-runtime'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    clear: () => memory.clear()
  }
})

afterEach(() => {
  memory.clear()
})

describe('thread runtime', () => {
  it('uses the active in-memory runtime for the current conversation', () => {
    const active = { mode: 'worktree' as const, worktreePath: '/tmp/active' }
    expect(runtimeForConversation('a', 'a', active)).toEqual(active)
  })

  it('loads stored runtime for a background conversation', () => {
    saveThreadRuntime('bg', { mode: 'worktree', worktreePath: '/tmp/auto' })
    expect(
      runtimeForConversation('bg', 'a', { mode: 'local' })
    ).toEqual({ mode: 'worktree', worktreePath: '/tmp/auto' })
    expect(loadThreadRuntime('missing').mode).toBe('local')
  })

  it('keeps the associated worktree after handing off to local', () => {
    saveThreadRuntime('c1', { mode: 'local', worktreePath: '/tmp/wt' })
    expect(loadThreadRuntime('c1')).toEqual({ mode: 'local', worktreePath: '/tmp/wt' })
  })
})
