import { describe, expect, it } from 'vitest'
import {
  captureTranscriptScroll,
  resolveRestoredScrollTop,
  shouldDeferScrollRestore
} from './transcript-scroll'
import {
  effectiveTranscriptWindowStart,
  mergeConversationHistory,
  nextHistoryStartSeq,
  prependHistoryPage,
  revealOlderWindowStart,
  restoreTranscriptWindowStart,
  shiftPinnedStartAfterPrepend,
  shouldFetchOlderHistoryPage,
  shouldRevealOlderTranscript,
  stickTranscriptWindowStart,
  windowStartToIncludeIndex
} from './transcript-window'

describe('transcript scroll restore', () => {
  it('remembers mid-thread position per conversation and sticks when that was the last view', () => {
    const mid = captureTranscriptScroll(
      { scrollTop: 420, scrollHeight: 2400, clientHeight: 800 },
      false,
      true
    )
    expect(mid).toMatchObject({
      scrollTop: 420,
      distanceFromBottom: 1180,
      scrollHeight: 2400,
      stickToBottom: false,
      userLocked: true
    })
    expect(
      resolveRestoredScrollTop({ scrollHeight: 2400, clientHeight: 800 }, mid)
    ).toEqual({ scrollTop: 420, stickToBottom: false, userLocked: true })

    const grown = resolveRestoredScrollTop({ scrollHeight: 3200, clientHeight: 800 }, mid)
    expect(grown).toEqual({ scrollTop: 420, stickToBottom: false, userLocked: true })

    const short = { scrollHeight: 900, clientHeight: 800 }
    expect(shouldDeferScrollRestore(short, mid)).toBe(true)
    expect(resolveRestoredScrollTop(short, mid)).toEqual({
      scrollTop: 0,
      stickToBottom: false,
      userLocked: true
    })
    expect(shouldDeferScrollRestore({ scrollHeight: 2400, clientHeight: 800 }, mid)).toBe(false)

    const stick = captureTranscriptScroll(
      { scrollTop: 1600, scrollHeight: 2400, clientHeight: 800 },
      true,
      false
    )
    expect(stick.distanceFromBottom).toBe(0)
    expect(
      resolveRestoredScrollTop({ scrollHeight: 4000, clientHeight: 800 }, stick)
    ).toEqual({ scrollTop: 3200, stickToBottom: true, userLocked: false })
    expect(shouldDeferScrollRestore({ scrollHeight: 100, clientHeight: 800 }, stick)).toBe(false)

    expect(resolveRestoredScrollTop({ scrollHeight: 1800, clientHeight: 600 }, null)).toEqual({
      scrollTop: 1200,
      stickToBottom: true,
      userLocked: false
    })

    const clamped = resolveRestoredScrollTop(
      { scrollHeight: 500, clientHeight: 400 },
      { ...mid, scrollHeight: 500, scrollTop: 999 }
    )
    expect(clamped.scrollTop).toBe(100)
    expect(clamped.userLocked).toBe(true)

    const withWindow = captureTranscriptScroll(
      { scrollTop: 420, scrollHeight: 2400, clientHeight: 800 },
      false,
      true,
      30
    )
    expect(withWindow.transcriptWindowStart).toBe(30)
    expect(restoreTranscriptWindowStart(withWindow)).toBe(30)
    expect(
      restoreTranscriptWindowStart({
        stickToBottom: true,
        userLocked: false,
        transcriptWindowStart: 30
      })
    ).toBeNull()
    expect(restoreTranscriptWindowStart(null)).toBeNull()

    expect(stickTranscriptWindowStart(12)).toBe(0)
    expect(stickTranscriptWindowStart(80)).toBe(40)
    expect(effectiveTranscriptWindowStart(80, null)).toBe(40)
    expect(effectiveTranscriptWindowStart(80, 10)).toBe(10)
    expect(effectiveTranscriptWindowStart(80, 99)).toBe(40)
    expect(revealOlderWindowStart(40)).toBe(10)
    expect(revealOlderWindowStart(10)).toBe(0)
    expect(windowStartToIncludeIndex(40, 7)).toBe(7)
    expect(windowStartToIncludeIndex(40, 55)).toBe(40)
    expect(windowStartToIncludeIndex(40, -1)).toBe(40)
    expect(
      shouldRevealOlderTranscript({ scrollTop: 12, locked: true, canReveal: true })
    ).toBe(true)
    expect(
      shouldRevealOlderTranscript({ scrollTop: 12, locked: false, canReveal: true })
    ).toBe(false)
    expect(
      shouldRevealOlderTranscript({ scrollTop: 12, locked: true, canReveal: false })
    ).toBe(false)
    expect(
      shouldRevealOlderTranscript({ scrollTop: 200, locked: true, canReveal: true })
    ).toBe(false)
    expect(
      shouldFetchOlderHistoryPage({
        scrollTop: 8,
        locked: true,
        windowStart: 0,
        hasOlder: true
      })
    ).toBe(true)
    expect(
      shouldFetchOlderHistoryPage({
        scrollTop: 8,
        locked: true,
        windowStart: 12,
        hasOlder: true
      })
    ).toBe(false)
    expect(prependHistoryPage([{ id: 'b' }, { id: 'c' }], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' }
    ])
    expect(mergeConversationHistory([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' }
    ])
    expect(shiftPinnedStartAfterPrepend(10, 30)).toBe(40)
    expect(shiftPinnedStartAfterPrepend(null, 30)).toBeNull()
    expect(nextHistoryStartSeq(160, 30)).toBe(130)
    expect(nextHistoryStartSeq(10, 30)).toBe(0)
  })
})
