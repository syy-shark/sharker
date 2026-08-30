import { describe, expect, it } from 'vitest'
import {
  findInReviewDiffs,
  isReviewFindFocus,
  sameReviewFindMatch,
  shouldHandleReviewFindShortcut,
  splitFindHighlights,
  wrapFindIndex
} from './review-diff-search'
import {
  escapeLikePattern,
  appendLiveFindHits,
  findAllOccurrences,
  findHitMessageIds,
  findHitNeedsHistory,
  findInThread,
  formatFindHitCount,
  liveFindSuffixMayAddHit,
  locateFlatRange,
  mergeThreadSearchHits,
  nextLiveFindHits,
  sameThreadSearchHits,
  shouldRepaintLiveFindHighlight,
  resolveFindHitIndex,
  seedFindQuery
} from './thread-search'

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
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
    const memory = findInThread(
      [{ id: 'tail', content: 'review tail', seq: 40 }],
      'review'
    )
    const disk = [
      ...findInThread([{ id: 'old', content: 'review old', seq: 2 }], 'review'),
      ...findInThread([{ id: 'tail', content: 'review tail', seq: 40 }], 'review')
    ]
    expect(mergeThreadSearchHits(memory, disk).map((h) => h.messageId)).toEqual(['old', 'tail'])
    expect(findHitNeedsHistory(disk[0], ['tail'])).toBe(true)
    expect(findHitNeedsHistory(memory[0], ['tail'])).toBe(false)
    expect(resolveFindHitIndex(mergeThreadSearchHits(memory, disk), memory[0], 0)).toBe(1)
    const historical = findInThread([{ id: 'old', content: 'review old', seq: 2 }], 'review')
    const liveEmpty: typeof historical = []
    const liveHit = findInThread([{ id: 'live', content: 'review now', seq: 41 }], 'review')
    expect(appendLiveFindHits(historical, liveEmpty)).toBe(historical)
    expect(appendLiveFindHits(historical, liveHit).map((h) => h.messageId)).toEqual([
      'old',
      'live'
    ])
    expect([...findHitMessageIds(historical)]).toEqual(['old'])
    expect(sameThreadSearchHits(liveHit, liveHit)).toBe(true)
    expect(sameThreadSearchHits(liveHit, findInThread([{ id: 'live', content: 'review now', seq: 41 }], 'review'))).toBe(
      true
    )
    expect(sameThreadSearchHits(liveHit, findInThread([{ id: 'live', content: 'review now more', seq: 41 }], 'review'))).toBe(
      true
    )
    expect(liveFindSuffixMayAddHit('review now more tokens here', 10, 'review')).toBe(false)
    expect(liveFindSuffixMayAddHit('review now review', 10, 'review')).toBe(true)
    const first = nextLiveFindHits({
      prev: null,
      prevContentLen: 0,
      content: 'review now',
      messageId: 'live',
      seq: 41,
      query: 'review'
    })
    const reused = nextLiveFindHits({
      prev: first.hits,
      prevContentLen: first.contentLen,
      content: 'review now more tokens here',
      messageId: 'live',
      seq: 41,
      query: 'review'
    })
    expect(reused.hits).toBe(first.hits)
    expect(
      shouldRepaintLiveFindHighlight({ prevLen: 10, nextLen: 24, matchStart: 0, matchEnd: 6 })
    ).toBe(false)
    expect(
      shouldRepaintLiveFindHighlight({ prevLen: 3, nextLen: 10, matchStart: 0, matchEnd: 6 })
    ).toBe(true)
    expect(sameThreadSearchHits(liveHit, findInThread([{ id: 'live', content: 'review now review', seq: 41 }], 'review'))).toBe(
      false
    )
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
    expect(formatFindHitCount(0, 0)).toBe('0/0')
    expect(formatFindHitCount(2, 5)).toBe('3/5')
    expect(formatFindHitCount(-1, 2)).toBe('1/2')
  })
})
