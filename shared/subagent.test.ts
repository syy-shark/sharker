import { describe, expect, it } from 'vitest'
import {
  capSubAgentSnapshot,
  filterSubAgentsForParent,
  interruptRunningSubAgent,
  parsePersistedSubAgents,
  parseSubAgentId,
  sortSubAgents,
  stampSubAgentActivity,
  stampSubAgentIdOnLabel,
  subAgentIdFromTool,
  subAgentTitle,
  SUBAGENT_PERSIST_INTERRUPTED,
  type SubAgentSnapshot
} from './subagent'

function snap(partial: Partial<SubAgentSnapshot> & Pick<SubAgentSnapshot, 'id'>): SubAgentSnapshot {
  return {
    parentConversationId: 'p1',
    prompt: 'task',
    status: 'done',
    result: '',
    streaming: '',
    createdAt: 1,
    updatedAt: 1,
    ...partial
  }
}

describe('subagent snapshots', () => {
  it('filters children to the parent thread', () => {
    const items = [snap({ id: 'a', parentConversationId: 'p1' }), snap({ id: 'b', parentConversationId: 'p2' })]
    expect(filterSubAgentsForParent(items, 'p1').map((s) => s.id)).toEqual(['a'])
    expect(filterSubAgentsForParent(items, null)).toEqual(items)
  })

  it('sorts running before failed and done', () => {
    const items = [
      snap({ id: 'd', status: 'done', updatedAt: 3 }),
      snap({ id: 'r', status: 'running', updatedAt: 1 }),
      snap({ id: 'f', status: 'failed', updatedAt: 2 })
    ]
    expect(sortSubAgents(items).map((s) => s.id)).toEqual(['r', 'f', 'd'])
  })

  it('truncates titles', () => {
    expect(subAgentTitle('  修好滚动  ')).toBe('修好滚动')
    expect(subAgentTitle('x'.repeat(50)).endsWith('…')).toBe(true)
  })

  it('parses spawn / steer / list ids', () => {
    expect(parseSubAgentId('Sub-agent ab12cd34 started (task t1). Use agent_get_result to poll.')).toBe(
      'ab12cd34'
    )
    expect(parseSubAgentId('Sub-agent zz99 steered.')).toBe('zz99')
    expect(parseSubAgentId('New sub-agent aa11bb22 started for follow-up.')).toBe('aa11bb22')
    expect(parseSubAgentId('ab12cd34 [running] 修好滚动')).toBe('ab12cd34')
    expect(parseSubAgentId('no agent here')).toBe(null)
  })

  it('reads id from tool args or output', () => {
    expect(
      subAgentIdFromTool('agent_get_result', { agent_id: 'ab12cd34' }, 'Status: running')
    ).toBe('ab12cd34')
    expect(subAgentIdFromTool('read_file', { agent_id: 'ab12cd34' })).toBe(null)
    expect(subAgentIdFromTool('agent_spawn', {}, 'Sub-agent deadbeef started (task 1).')).toBe(
      'deadbeef'
    )
    expect(subAgentIdFromTool('agent_spawn', {}, 'agent_spawn · 修好滚动 · deadbeef')).toBe(
      'deadbeef'
    )
  })

  it('stamps the last matching activity with the id', () => {
    const acts = [{ kind: 'tool', label: 'agent_spawn · 修好滚动' }]
    expect(stampSubAgentActivity(acts, 'agent_spawn', {}, 'Sub-agent deadbeef started (task 1).')).toBe(
      true
    )
    expect(acts[0].label).toBe('agent_spawn · 修好滚动 · deadbeef')
    expect(stampSubAgentIdOnLabel(acts[0].label, 'deadbeef')).toBe(acts[0].label)
  })

  it('interrupts running snapshots on restore', () => {
    const running = snap({ id: 'r', status: 'running', streaming: 'hi', result: '' })
    const next = interruptRunningSubAgent(running, 99)
    expect(next.status).toBe('failed')
    expect(next.streaming).toBe('')
    expect(next.result).toBe(SUBAGENT_PERSIST_INTERRUPTED)
    expect(next.updatedAt).toBe(99)
    expect(interruptRunningSubAgent(snap({ id: 'd', status: 'done', result: 'ok' })).status).toBe(
      'done'
    )
  })

  it('parses persisted store and caps long transcripts', () => {
    expect(
      parsePersistedSubAgents({
        sessions: [{ id: ' a ', status: 'running', prompt: 't', parentConversationId: 'p1' }]
      })[0]
    ).toMatchObject({ id: 'a', status: 'running', parentConversationId: 'p1' })
    expect(parsePersistedSubAgents({ sessions: [{ prompt: 'no-id' }] })).toEqual([])
    const capped = capSubAgentSnapshot(snap({ id: 'x', streaming: 's'.repeat(5000), result: 'r'.repeat(30_000) }))
    expect(capped.streaming.length).toBe(4000)
    expect(capped.result.length).toBe(20_000)
  })
})
