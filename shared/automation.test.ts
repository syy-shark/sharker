import { describe, expect, it } from 'vitest'
import {
  defaultAutomationThreadId,
  normalizeAutomationJob,
  normalizeAutomationJobs,
  parseAutomationDestination,
  resolveAutomationRunPlan
} from './automation'

describe('automation destination', () => {
  it('defaults to a new chat and only binds a thread when asked', () => {
    expect(parseAutomationDestination(undefined)).toBe('new')
    expect(parseAutomationDestination('thread')).toBe('thread')
    expect(parseAutomationDestination('other')).toBe('new')
    const standalone = normalizeAutomationJob({
      id: 'a1',
      title: '日报',
      prompt: '总结',
      cron: '0 9 * * *',
      enabled: true,
      conversationId: 'c-old'
    })
    expect(standalone.destination).toBe('new')
    expect(standalone.conversationId).toBeUndefined()
    const thread = normalizeAutomationJob({
      id: 'a2',
      title: '跟进',
      prompt: '继续',
      cron: '*/15 * * * *',
      enabled: true,
      destination: 'thread',
      conversationId: '  conv-1  '
    })
    expect(thread.destination).toBe('thread')
    expect(thread.conversationId).toBe('conv-1')
    expect(normalizeAutomationJobs([{ title: 'no-id' }, thread])).toEqual([thread])
    expect(defaultAutomationThreadId('conv-1', [{ id: 'conv-2' }, { id: 'conv-1' }])).toBe(
      'conv-1'
    )
    expect(defaultAutomationThreadId('missing', [{ id: 'conv-2' }])).toBe('conv-2')
    expect(resolveAutomationRunPlan({
      destination: 'thread',
      conversationId: 'conv-1',
      conversationExists: false,
      conversationBusy: false
    })).toEqual({ mode: 'new' })
    expect(resolveAutomationRunPlan({
      destination: 'thread',
      conversationId: 'conv-1',
      conversationExists: true,
      conversationBusy: true
    })).toEqual({ mode: 'queue', conversationId: 'conv-1' })
    expect(resolveAutomationRunPlan({
      destination: 'thread',
      conversationId: 'conv-1',
      conversationExists: true,
      conversationBusy: false
    })).toEqual({ mode: 'thread', conversationId: 'conv-1' })
    expect(resolveAutomationRunPlan({
      destination: 'new',
      conversationId: 'conv-1',
      conversationExists: true,
      conversationBusy: false
    })).toEqual({ mode: 'new' })
  })
})
