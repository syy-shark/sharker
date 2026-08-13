/**
 * 多会话 turn 队列：不同 conversation 可并行，同会话串行。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetTurnPipelineForTests,
  abortActiveTurn,
  executeUserInput,
  getActiveTurnConversationId,
  hasActiveTurn
} from './pipeline'
import type { AppSettings } from '../shared/types'

const baseSettings = {
  activeWorkspaceId: 'ws',
  workspacePath: '/tmp',
  workspaces: [],
  providers: [],
  activeProviderId: '',
  permissionMode: 'ask',
  networkMode: 'allow',
  workspaceProfile: 'default',
  computerUseEnabled: false,
  browserUseEnabled: false,
  uiTheme: 'light',
  uiGlass: 0.82
} as unknown as AppSettings

describe('per-conversation turn concurrency', () => {
  beforeEach(() => {
    __resetTurnPipelineForTests()
  })

  it('different conversations can start overlapping turns', async () => {
    const events: string[] = []
    let releaseA!: () => void
    let releaseB!: () => void
    const gateA = new Promise<void>((r) => {
      releaseA = r
    })
    const gateB = new Promise<void>((r) => {
      releaseB = r
    })

    const turnA = executeUserInput({
      settings: baseSettings,
      history: [],
      userText: 'hello-a',
      onApproval: async () => ({ decision: 'deny' as const }),
      send: (c) => events.push(`A:${c.type}`),
      reloadSettings: async () => {
        events.push('A:start')
        await gateA
        return baseSettings
      },
      conversationId: 'conv-a'
    })

    const turnB = executeUserInput({
      settings: baseSettings,
      history: [],
      userText: 'hello-b',
      onApproval: async () => ({ decision: 'deny' as const }),
      send: (c) => events.push(`B:${c.type}`),
      reloadSettings: async () => {
        events.push('B:start')
        await gateB
        return baseSettings
      },
      conversationId: 'conv-b'
    })

    await new Promise((r) => setTimeout(r, 30))
    expect(events).toEqual(expect.arrayContaining(['A:start', 'B:start']))

    // 放开后无 provider 会快速 error/done；再 abort 兜底
    releaseA()
    releaseB()
    abortActiveTurn('conv-a')
    abortActiveTurn('conv-b')
    await Promise.allSettled([turnA, turnB])
    expect(hasActiveTurn()).toBe(false)
  }, 15_000)

  it('same conversation stays serial', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r
    })

    const t1 = executeUserInput({
      settings: baseSettings,
      history: [],
      userText: 'one',
      onApproval: async () => ({ decision: 'deny' as const }),
      send: () => {},
      reloadSettings: async () => {
        order.push('1-start')
        await firstGate
        order.push('1-end')
        return baseSettings
      },
      conversationId: 'conv-same'
    })

    const t2 = executeUserInput({
      settings: baseSettings,
      history: [],
      userText: 'two',
      onApproval: async () => ({ decision: 'deny' as const }),
      send: () => {},
      reloadSettings: async () => {
        order.push('2-start')
        order.push('2-end')
        return baseSettings
      },
      conversationId: 'conv-same'
    })

    await new Promise((r) => setTimeout(r, 30))
    expect(order).toEqual(['1-start'])
    releaseFirst()
    await Promise.allSettled([t1, t2])
    expect(order[0]).toBe('1-start')
    expect(order[1]).toBe('1-end')
    expect(order[2]).toBe('2-start')
  }, 15_000)

  it('scoped abort still targets only requested conversation id', () => {
    expect(abortActiveTurn('conv-x')).toBe('conv-x')
    expect(hasActiveTurn()).toBe(false)
    expect(getActiveTurnConversationId()).toBeNull()
  })
})
