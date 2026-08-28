import { describe, expect, it } from 'vitest'
import { filterChatList } from './conversation'

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
})
