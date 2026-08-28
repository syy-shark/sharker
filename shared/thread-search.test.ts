import { describe, expect, it } from 'vitest'
import { findAllOccurrences, findInThread, locateFlatRange, seedFindQuery } from './thread-search'

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
    const multi = findInThread([{ id: 'a', content: 'review then REVIEW' }], 'review')
    expect(multi).toHaveLength(2)
    expect(multi[0]?.start).toBe(0)
    expect(multi[1]?.start).toBe(12)
    expect(findAllOccurrences('Aaa a', 'a')).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
      { start: 4, end: 5 }
    ])
    expect(locateFlatRange([3, 2], 2, 4)).toEqual({
      startIndex: 0,
      startOffset: 2,
      endIndex: 1,
      endOffset: 1
    })
  })

  it('returns nothing for empty query', () => {
    expect(findInThread([{ id: '1', content: 'hello' }], '   ')).toEqual([])
    expect(seedFindQuery('  review\nthe pane  ')).toBe('review the pane')
    expect(seedFindQuery('   ')).toBe('')
    expect(seedFindQuery('abcdefghijklmnopqrstuvwxyz', 5)).toBe('abcde')
  })
})
