import { describe, expect, it } from 'vitest'
import {
  applyQueueTriageAction,
  attachQueueChangedPaths,
  enqueueAutomationRun,
  archiveEligibleQueueRuns,
  eligibleQueueArchiveCount,
  markAllQueueRead,
  markQueueItem,
  createPrAfterApprovePush,
  pushAfterApproveCommit,
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
    expect(unreadQueueCount(markAllQueueRead([item, { ...item, id: 'b' }]))).toBe(0)
    expect(eligibleQueueArchiveCount([{ ...item, status: 'read' }, item])).toBe(1)
    expect(
      archiveEligibleQueueRuns([{ ...item, id: 'r', status: 'read' }, item]).map((row) => row.status)
    ).toEqual(['archived', 'unread'])
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

  it('pushes only after a successful approve commit', async () => {
    expect(await pushAfterApproveCommit({ committed: false, push: async () => ({ ok: true }) })).toBe(
      'skipped'
    )
    expect(await pushAfterApproveCommit({ committed: true })).toBe('skipped')
    expect(await pushAfterApproveCommit({ committed: true, push: async () => ({ ok: true }) })).toBe(
      'pushed'
    )
    expect(
      await pushAfterApproveCommit({ committed: true, push: async () => ({ ok: false, error: 'no remote' }) })
    ).toBe('push_failed')
    expect(
      await pushAfterApproveCommit({
        committed: true,
        push: async () => {
          throw new Error('network')
        }
      })
    ).toBe('push_failed')
  })

  it('creates a PR only after a successful push when none exists', async () => {
    expect(
      await createPrAfterApprovePush({
        pushed: 'push_failed',
        createPr: async () => ({ ok: true, url: 'https://example.com/p' })
      })
    ).toBe('skipped')
    expect(
      await createPrAfterApprovePush({
        pushed: 'pushed',
        hasExistingPr: async () => true,
        createPr: async () => ({ ok: true, url: 'https://example.com/p' })
      })
    ).toBe('exists')
    expect(
      await createPrAfterApprovePush({
        pushed: 'pushed',
        hasExistingPr: async () => false,
        createPr: async () => ({ ok: true, url: 'https://example.com/p' })
      })
    ).toBe('created')
    expect(
      await createPrAfterApprovePush({
        pushed: 'pushed',
        createPr: async () => ({ ok: false, error: 'no gh' })
      })
    ).toBe('create_failed')
  })
})
