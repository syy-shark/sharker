import { describe, expect, it } from 'vitest'
import {
  applyScheduledTaskAction,
  defaultAutomationThreadId,
  normalizeAutomationJob,
  normalizeAutomationJobs,
  parseAutomationDestination,
  parseAutomationRunIn,
  resolveAutomationRunPlan,
  shouldPrepareAutomationWorktree
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
    expect(parseAutomationRunIn(undefined)).toBe('worktree')
    expect(parseAutomationRunIn('local')).toBe('local')
    expect(shouldPrepareAutomationWorktree({ runMode: 'new', runIn: 'worktree' })).toBe(true)
    expect(shouldPrepareAutomationWorktree({ runMode: 'new', runIn: 'local' })).toBe(false)
    expect(shouldPrepareAutomationWorktree({ runMode: 'thread', runIn: 'worktree' })).toBe(false)
    const created = applyScheduledTaskAction([], {
      op: 'create',
      id: 'job-1',
      title: '跟进部署',
      prompt: '检查部署',
      cron: '*/15 * * * *',
      destination: 'thread',
      runIn: 'local'
    }, { currentConversationId: 'conv-1' })
    expect(created.changed).toBe(true)
    expect(created.jobs[0]).toMatchObject({
      id: 'job-1',
      destination: 'thread',
      conversationId: 'conv-1',
      runIn: 'local'
    })
    expect(
      applyScheduledTaskAction(created.jobs, { op: 'pause', id: 'job-1' }).jobs[0]?.enabled
    ).toBe(false)
    expect(applyScheduledTaskAction(created.jobs, { op: 'list' }).changed).toBe(false)
  })
})
