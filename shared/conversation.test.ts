import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONVERSATION_TITLE,
  buildForkedConversation,
  createEmptyConversation,
  filterChatList,
  forkConversationTitle,
  nextLiveConversationId,
  splitLiveConversations
} from './conversation'

describe('conversation search', () => {
  it('filters chats by title or id', () => {
    const items = [
      { id: 'c1', title: '修好滚动' },
      { id: 'c2', title: '审查队列' }
    ]
    expect(filterChatList(items, '滚动').map((c) => c.id)).toEqual(['c1'])
    expect(filterChatList(items, 'c2').map((c) => c.id)).toEqual(['c2'])
    expect(filterChatList(items, '')).toEqual(items)
    expect(filterChatList(items, 'zzz')).toEqual([])
  })

  it('names a forked thread', () => {
    expect(forkConversationTitle('修好滚动')).toBe('修好滚动（分叉）')
    expect(forkConversationTitle('修好滚动（分叉）')).toBe('修好滚动（分叉）')
    expect(forkConversationTitle('  ')).toBe(`${DEFAULT_CONVERSATION_TITLE}（分叉）`)
  })

  it('copies messages into a new conversation without sharing objects', () => {
    const created = createEmptyConversation('ws')
    const sourceMsg = { id: 'm1', role: 'user' as const, content: '先改滚动' }
    const forked = buildForkedConversation(created, {
      title: '修好滚动',
      messages: [sourceMsg]
    })
    expect(forked.id).toBe(created.id)
    expect(forked.title).toBe('修好滚动（分叉）')
    expect(forked.messages[0]).toEqual(sourceMsg)
    expect(forked.messages[0]).not.toBe(sourceMsg)
  })

  it('cycles the next live conversation needing attention', () => {
    expect(nextLiveConversationId(['a', 'b', 'c'], 'b')).toBe('c')
    expect(nextLiveConversationId(['a', 'b', 'c'], 'c')).toBe('a')
    expect(nextLiveConversationId(['a'], 'a')).toBe('a')
    expect(nextLiveConversationId([], 'a')).toBeNull()
  })

  it('splits live conversations into a first-class task list', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(splitLiveConversations(items, ['b', 'c'])).toEqual({
      live: [{ id: 'b' }, { id: 'c' }],
      rest: [{ id: 'a' }]
    })
  })
})
