import { describe, expect, it } from 'vitest'
import { expandChatReferences } from './chat-refs'

describe('expandChatReferences', () => {
  it('appends a bounded transcript and skips the current thread', async () => {
    const text = await expandChatReferences(
      '对照 @chat/other 和 @chat/mine',
      async (id) => {
        if (id === 'mine') return { title: '当前', messages: [{ id: '1', role: 'user', content: '不该出现' }] }
        return {
          title: '修好滚动',
          messages: [
            { id: '2', role: 'user', content: '卡了' },
            { id: '3', role: 'assistant', content: '贴底' }
          ]
        }
      },
      'mine'
    )
    expect(text).toContain('Attached chats (1)')
    expect(text).toContain('修好滚动')
    expect(text).toContain('贴底')
    expect(text).not.toContain('不该出现')
  })

  it('returns the original text when nothing resolves', async () => {
    const raw = 'see @chat/missing'
    expect(await expandChatReferences(raw, async () => null)).toBe(raw)
  })
})
