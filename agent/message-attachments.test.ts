import { describe, expect, it } from 'vitest'
import { appendTextAttachments, userMessageContentWithAttachments } from './message-attachments'
import type { ChatAttachment } from '../shared/types'

describe('message attachments', () => {
  it('folds pasted text into the user prompt', async () => {
    const atts: ChatAttachment[] = [
      {
        id: 't1',
        name: 'Pasted text.txt',
        mimeType: 'text/plain',
        path: '/tmp/missing.txt',
        size: 12,
        kind: 'text',
        text: '把侧栏做成玻璃'
      }
    ]
    expect(await appendTextAttachments('按附件做', atts)).toContain('【附件 Pasted text.txt】')
    expect(await appendTextAttachments('按附件做', atts)).toContain('把侧栏做成玻璃')
    expect(await userMessageContentWithAttachments('', atts)).toBe(
      '【附件 Pasted text.txt】\n把侧栏做成玻璃'
    )
  })

  it('returns plain text when there are no image attachments', async () => {
    expect(await userMessageContentWithAttachments('hello')).toBe('hello')
  })
})
