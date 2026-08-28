import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  hydrateSubAgents,
  listSubAgentSnapshots,
  resetSubAgentsForTest,
  spawnSubAgent,
  stopSubAgent
} from './coordinator'
import { DEFAULT_SETTINGS } from '../shared/types'
import { SUBAGENT_PERSIST_INTERRUPTED } from '../shared/subagent'

describe('subagent coordinator', () => {
  beforeEach(() => {
    resetSubAgentsForTest()
  })

  afterEach(() => {
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

  it('hydrates snapshots and interrupts running children', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-subagents-'))
    const file = path.join(dir, 'subagents.json')
    await writeFile(
      file,
      JSON.stringify({
        sessions: [
          {
            id: 'run1',
            parentConversationId: 'conv-1',
            prompt: '还在跑',
            status: 'running',
            result: '',
            streaming: 'partial',
            createdAt: 1,
            updatedAt: 2
          },
          {
            id: 'done1',
            parentConversationId: 'conv-1',
            prompt: '已完成',
            status: 'done',
            result: 'ok',
            streaming: '',
            createdAt: 1,
            updatedAt: 3
          }
        ]
      }),
      'utf8'
    )
    expect(await hydrateSubAgents(file)).toBe(2)
    const rows = listSubAgentSnapshots('conv-1')
    const running = rows.find((s) => s.id === 'run1')
    const done = rows.find((s) => s.id === 'done1')
    expect(running?.status).toBe('failed')
    expect(running?.result).toBe(SUBAGENT_PERSIST_INTERRUPTED)
    expect(done?.status).toBe('done')
    expect(done?.result).toBe('ok')
  })

  it('persists after spawn when hydrated', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-subagents-'))
    const file = path.join(dir, 'subagents.json')
    await hydrateSubAgents(file)
    const session = await spawnSubAgent(DEFAULT_SETTINGS, '落盘', undefined, undefined, 'conv-2')
    await new Promise((r) => setTimeout(r, 50))
    const raw = JSON.parse(await readFile(file, 'utf8')) as { sessions: Array<{ id: string }> }
    expect(raw.sessions.some((s) => s.id === session.id)).toBe(true)
    stopSubAgent(session.id)
  })
})
