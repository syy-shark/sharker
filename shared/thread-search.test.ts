import { describe, expect, it } from 'vitest'
import { findInThread } from './thread-search'

describe('thread search', () => {
  it('finds messages case-insensitively', () => {
    const hits = findInThread(
      [
        { id: 'u1', content: 'Please review the pane' },
        { id: 'a1', content: 'Done.' },
        { id: 'u2', content: 'REVIEW later' }
      ],
      'review'
    )
    expect(hits.map((h) => h.messageId)).toEqual(['u1', 'u2'])
  })

  it('returns nothing for empty query', () => {
    expect(findInThread([{ id: '1', content: 'hello' }], '   ')).toEqual([])
  })
})
