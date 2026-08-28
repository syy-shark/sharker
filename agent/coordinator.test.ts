import { describe, expect, it, beforeEach } from 'vitest'
import {
  listSubAgentSnapshots,
  resetSubAgentsForTest,
  spawnSubAgent,
  stopSubAgent
} from './coordinator'
import { DEFAULT_SETTINGS } from '../shared/types'

describe('subagent coordinator', () => {
  beforeEach(() => {
    resetSubAgentsForTest()
  })

  it('registers a running child under the parent conversation', async () => {
    const session = await spawnSubAgent(DEFAULT_SETTINGS, '探活', undefined, undefined, 'conv-1')
    expect(session.parentConversationId).toBe('conv-1')
    expect(session.status).toBe('running')
    expect(listSubAgentSnapshots('conv-1').some((s) => s.id === session.id)).toBe(true)
    expect(listSubAgentSnapshots('other')).toEqual([])
    expect(stopSubAgent(session.id)).toBe(true)
    expect(listSubAgentSnapshots('conv-1')[0]?.status).toBe('failed')
  })
})
