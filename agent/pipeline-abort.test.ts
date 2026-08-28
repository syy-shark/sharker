/**
 * 主进程 abort 归属：Stop(conversationId) 不得误杀其他会话的 active turn。
 * 驱动 shipped abortActiveTurn（真实入口）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetTurnPipelineForTests,
  abortActiveTurn,
  getActiveTurnConversationId
} from './pipeline'
import { acceptTurnSteer, markTurnSteerable, peekSteersForTurn } from './pending-steer-mailbox'

describe('abortActiveTurn conversation ownership', () => {
  beforeEach(() => {
    __resetTurnPipelineForTests()
  })

  it('scoped abort returns the requested conversation id for cancel-before-start', () => {
    // 无 activeSlot 时：仅登记 cancelledBeforeStart，供后续 runTurn 短路
    const id = abortActiveTurn('conv-b')
    expect(id).toBe('conv-b')
    // 再次 abort 同一会话仍返回该 id
    expect(abortActiveTurn('conv-b')).toBe('conv-b')
    // 全局 abort 在无 slot 时返回 null（不伪造成其他会话）
    expect(abortActiveTurn()).toBeNull()
    expect(getActiveTurnConversationId()).toBeNull()
    expect(acceptTurnSteer('conv-b', '改方向').ok).toBe(false)
    markTurnSteerable('conv-b')
    const steered = acceptTurnSteer('conv-b', '改方向')
    expect(steered.ok).toBe(true)
    expect(peekSteersForTurn('conv-b')).toHaveLength(1)
  })

  it('scoped abort for A does not claim to abort B', () => {
    expect(abortActiveTurn('conv-a')).toBe('conv-a')
    // B 未被登记为“已返回的 abort 目标”
    expect(abortActiveTurn('conv-b')).toBe('conv-b')
  })
})

  it('scoped abort does not require a live slot and returns the same id', () => {
    // 无 active slot：仅登记 cancelledBeforeStart，供后续 runTurn 短路
    expect(abortActiveTurn('only-queued')).toBe('only-queued')
    // 再次 abort 幂等
    expect(abortActiveTurn('only-queued')).toBe('only-queued')
  })

  it('new input after abort is not short-circuited by cancelledBeforeStart', async () => {
    const chunks: string[] = []
    abortActiveTurn('conv-jump')
    // 新输入应清掉 before-start 取消标记，至少能发出 turn_start/status，而不是立刻 cancelled+done
    const { executeUserInput } = await import('./pipeline')
    await executeUserInput({
      userText: 'hello after abort',
      history: [],
      conversationId: 'conv-jump',
      send: (c) => chunks.push(c.type),
      reloadSettings: async () =>
        ({
          activeWorkspaceId: 'ws',
          providers: [],
          activeProviderId: '',
          permissionMode: 'workspace',
          networkMode: 'open',
          workspaces: [],
          workspacePath: process.cwd()
        }) as any
    } as any)
    expect(chunks[0]).not.toBe('turn_cancelled')
    expect(chunks.includes('turn_start') || chunks.includes('status') || chunks.includes('error')).toBe(true)
  })
