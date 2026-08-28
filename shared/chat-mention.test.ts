import { describe, expect, it } from 'vitest'
import {
  chatMentionToken,
  filterChatMentions,
  parseChatMentionIds,
  summarizeMentionedChat
} from './chat-mention'

describe('chat mentions', () => {
  it('parses up to two unique @chat/ids', () => {
    expect(parseChatMentionIds('see @chat/aaa and @chat/bbb and @chat/ccc')).toEqual(['aaa', 'bbb'])
    expect(parseChatMentionIds('see @chat/aaa and @chat/aaa')).toEqual(['aaa'])
    expect(parseChatMentionIds('no chats')).toEqual([])
  })

  it('filters other threads and strips the chat/ prefix', () => {
    const items = [
      { id: 'cur', title: '当前' },
      { id: 'a1', title: '修好滚动' },
      { id: 'b2', title: '审查 PR' }
    ]
    expect(filterChatMentions(items, '滚动', 'cur').map((c) => c.id)).toEqual(['a1'])
    expect(filterChatMentions(items, 'chat/a1', 'cur').map((c) => c.id)).toEqual(['a1'])
    expect(filterChatMentions(items, '', 'cur').map((c) => c.id)).toEqual(['a1', 'b2'])
  })

  it('summarizes only the recent bounded transcript', () => {
    const text = summarizeMentionedChat({
      id: 'x1',
      title: '修好滚动',
      messages: [
        { role: 'system', content: 'ignore' },
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
        { role: 'user', content: '第二问' },
        { role: 'assistant', content: 'x'.repeat(2000) }
      ]
    })
    expect(text).toContain('修好滚动')
    expect(text).toContain('第二问')
    expect(text).not.toContain('ignore')
    expect(text.length).toBeLessThan(4000)
    expect(chatMentionToken('x1')).toBe('chat/x1')
  })
})
