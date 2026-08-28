import { describe, expect, it } from 'vitest'
import {
  applyQueueTriageAction,
  attachQueueChangedPaths,
  enqueueAutomationRun,
  markQueueItem,
  resolveQueueTriagePaths,
  sortAutomationQueue,
  unreadQueueCount
} from './automation-queue'

describe('automation queue', () => {
  it('enqueues unread items and counts them', () => {
    const item = enqueueAutomationRun(
      { id: 'j1', title: 'CI 摘要', prompt: '总结失败' },
      'c1',
      new Date('2026-08-28T00:00:00.000Z')
    )
    expect(item.status).toBe('unread')
    expect(item.conversationId).toBe('c1')
    expect(unreadQueueCount([item])).toBe(1)
    expect(unreadQueueCount(markQueueItem([item], item.id, 'read'))).toBe(0)
  })

  it('sorts unread before read and archived', () => {
    const unread = enqueueAutomationRun({ id: 'a', title: 'a', prompt: 'a' })
    const read = { ...unread, id: 'r', status: 'read' as const, createdAt: '2020-01-01T00:00:00.000Z' }
    const archived = { ...unread, id: 'z', status: 'archived' as const }
    expect(sortAutomationQueue([archived, read, unread]).map((i) => i.id)).toEqual([
      unread.id,
      'r',
      'z'
    ])
  })

  it('maps triage actions to read or archived', () => {
    const item = enqueueAutomationRun({ id: 'j', title: 't', prompt: 'p' }, 'c1')
    expect(applyQueueTriageAction([item], item.id, 'approve')[0]?.status).toBe('read')
    expect(applyQueueTriageAction([item], item.id, 'revise')[0]?.status).toBe('read')
    expect(applyQueueTriageAction([item], item.id, 'reject')[0]?.status).toBe('archived')
  })

  it('stores workspace extras and only triages recorded paths', () => {
    const item = enqueueAutomationRun(
      { id: 'j', title: 't', prompt: 'p' },
      'c1',
      new Date('2026-08-28T00:00:00.000Z'),
      { workspaceId: 'ws', workspacePath: '/repo' }
    )
    expect(item.workspaceId).toBe('ws')
    expect(item.workspacePath).toBe('/repo')
    const withPaths = attachQueueChangedPaths([item], 'c1', ['src/a.ts', '../etc/passwd', 'src/a.ts'])
    expect(withPaths[0]?.changedPaths).toEqual(['src/a.ts'])
    expect(resolveQueueTriagePaths(withPaths[0]!, ['other.ts'])).toEqual(['src/a.ts'])
    expect(resolveQueueTriagePaths(item, ['fallback.ts'])).toEqual(['fallback.ts'])
  })
})
