import { describe, expect, it } from 'vitest'
import {
  clearComposerDraft,
  composerDraftKey,
  loadComposerDraft,
  resetComposerDraftsForTest,
  saveComposerDraft
} from './composer-draft'

describe('composer-draft', () => {
  it('keys drafts by chat or empty workspace and evicts the oldest', () => {
    resetComposerDraftsForTest()
    expect(composerDraftKey('c1', 'ws')).toBe('chat:c1')
    expect(composerDraftKey(null, 'ws')).toBe('new:ws')
    expect(composerDraftKey('', '')).toBe('')
    saveComposerDraft('chat:a', { text: 'hello', attachments: [] })
    expect(loadComposerDraft('chat:a').text).toBe('hello')
    saveComposerDraft('chat:a', { text: '   ', attachments: [] })
    expect(loadComposerDraft('chat:a').text).toBe('')
    saveComposerDraft('chat:a', {
      text: 'keep',
      attachments: [{ id: '1', name: 'a.png', mimeType: 'image/png', path: '/a.png', size: 1, kind: 'image' }]
    })
    expect(loadComposerDraft('chat:a').attachments).toHaveLength(1)
    clearComposerDraft('chat:a')
    expect(loadComposerDraft('chat:a').attachments).toEqual([])
    for (let i = 0; i < 41; i += 1) {
      saveComposerDraft(`k${i}`, { text: `t${i}`, attachments: [] })
    }
    expect(loadComposerDraft('k0').text).toBe('')
    expect(loadComposerDraft('k40').text).toBe('t40')
  })
})
