import { describe, expect, it } from 'vitest'
import {
  findInReviewDiffs,
  isReviewFindFocus,
  sameReviewFindMatch,
  shouldHandleReviewFindShortcut,
  splitFindHighlights,
  wrapFindIndex
} from './review-diff-search'
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
    const reviewHits = findInReviewDiffs(
      [
        {
          fileKey: 'repo\0a.ts',
          filePath: 'a.ts',
          diff: {
            path: 'a.ts',
            lines: [
              { kind: 'ctx', content: 'please Review the pane' },
              { kind: 'add', content: 'REVIEW later' }
            ],
            stats: { added: 1, removed: 0 }
          }
        },
        { fileKey: 'repo\0b.ts', filePath: 'b.ts', diff: undefined }
      ],
      'review'
    )
    expect(reviewHits.map((h) => `${h.filePath}:${h.lineIndex}:${h.start}`)).toEqual([
      'a.ts:0:7',
      'a.ts:1:0'
    ])
    expect(wrapFindIndex(0, 3, 1)).toBe(1)
    expect(wrapFindIndex(0, 3, -1)).toBe(2)
    expect(shouldHandleReviewFindShortcut({ focusInsideReview: true })).toBe(true)
    expect(shouldHandleReviewFindShortcut({ focusInsideReview: false })).toBe(false)
    expect(sameReviewFindMatch(reviewHits[0], reviewHits[0])).toBe(true)
    expect(sameReviewFindMatch(reviewHits[0], reviewHits[1])).toBe(false)
  })

  it('returns nothing for empty query', () => {
    expect(findInThread([{ id: '1', content: 'hello' }], '   ')).toEqual([])
    expect(seedFindQuery('  review\nthe pane  ')).toBe('review the pane')
    expect(seedFindQuery('   ')).toBe('')
    expect(seedFindQuery('abcdefghijklmnopqrstuvwxyz', 5)).toBe('abcde')
    expect(findInReviewDiffs([{ fileKey: 'k', filePath: 'a.ts', diff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hello' }], stats: { added: 1, removed: 0 } } }], '   ')).toEqual([])
    expect(splitFindHighlights('Hello HELLO', 'hello')).toEqual([
      { text: 'Hello', hit: true, start: 0 },
      { text: ' ', hit: false, start: 5 },
      { text: 'HELLO', hit: true, start: 6 }
    ])
    expect(isReviewFindFocus(null)).toBe(false)
  })
})
