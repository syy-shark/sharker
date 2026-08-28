import { describe, expect, it } from 'vitest'
import {
  filterSubAgentsForParent,
  sortSubAgents,
  subAgentTitle,
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
})
