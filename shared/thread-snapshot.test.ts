import { describe, expect, it } from 'vitest'
import {
  formatThreadSnapshot,
  replaceInlineImageDataUris,
  snapshotFileDiffs
} from './thread-snapshot'
import type { ChatMessage, TurnSegment } from './types'

describe('thread snapshot', () => {
  it('keeps user-visible turns and file diffs, drops tool I/O, and redacts secrets', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content:
          'fix login, key sk-abcdefghijklmnopqrstuvwxyz012345\n\n![](data:image/png;base64,AAAA)',
        attachments: [{ id: 'a', name: 'shot.png', mimeType: 'image/png', path: '/tmp/shot.png', size: 12, kind: 'image' }]
      },
      {
        id: 't1',
        role: 'assistant',
        content: '',
        meta: {
          browsedFiles: [],
          activities: [],
          hadThinking: true,
          thinkingPreview: 'Check the auth middleware.',
          segments: [
            { id: 'th', kind: 'thinking', content: 'raw hidden chain-of-thought' },
            {
              id: 'tool',
              kind: 'tool',
              toolName: 'shell',
              toolDetail: 'cat ~/.ssh/id_rsa',
              resultOutput: 'SECRET SHELL OUTPUT',
              fileDiff: {
                path: 'src/auth.ts',
                lines: [{ kind: 'add', content: 'return session' }],
                stats: { added: 1, removed: 0 }
              }
            },
            { id: 'ans', kind: 'text', role: 'final', content: 'Patched auth.ts.', status: 'done' }
          ]
        }
      }
    ]
    const live: TurnSegment[] = [
      { id: 'live-th', kind: 'thinking', status: 'active' },
      { id: 'live-txt', kind: 'text', role: 'final', content: 'Still writing…', status: 'active' }
    ]
    expect(snapshotFileDiffs(messages[1]?.meta?.segments).map((d) => d.path)).toEqual(['src/auth.ts'])
    const snap = formatThreadSnapshot({
      title: 'Login fix',
      conversationId: 'c-1',
      messages,
      liveSegments: live,
      truncatedBefore: true,
      capturedAt: '2026-08-29T00:00:00.000Z'
    })
    expect(snap.messageCount).toBe(3)
    expect(snap.redactedCount).toBeGreaterThanOrEqual(1)
    expect(snap.markdown).toContain('# Login fix')
    expect(snap.markdown).toContain('c-1')
    expect(snap.markdown).toContain('### User')
    expect(snap.markdown).toContain('image: shot.png')
    expect(snap.markdown).toContain('Check the auth middleware.')
    expect(snap.markdown).toContain('Patched auth.ts.')
    expect(snap.markdown).toContain('src/auth.ts')
    expect(snap.markdown).toContain('+return session')
    expect(snap.markdown).toContain('### Assistant (live)')
    expect(snap.markdown).toContain('Still writing…')
    expect(snap.markdown).toContain('Older turns are not loaded')
    expect(snap.markdown).toContain('[REDACTED:API_KEY]')
    expect(snap.markdown).not.toContain('sk-abcdefghijklmnopqrstuvwxyz012345')
    expect(snap.markdown).not.toContain('SECRET SHELL OUTPUT')
    expect(snap.markdown).not.toContain('cat ~/.ssh/id_rsa')
    expect(snap.markdown).not.toContain('raw hidden chain-of-thought')
    expect(snap.markdown).not.toContain('data:image/png;base64')
    expect(snap.markdown).toContain('[Image]')
    expect(replaceInlineImageDataUris('see data:image/jpeg;base64,/9j/4AA= done')).toBe(
      'see [Image] done'
    )
  })
})
