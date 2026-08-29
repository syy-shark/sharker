import { describe, expect, it } from 'vitest'
import {
  captureTranscriptScroll,
  resolveRestoredScrollTop,
  shouldDeferScrollRestore
} from './transcript-scroll'
import type { ChatMessage } from './types'
import {
  DEFER_THINKING_CHARS,
  DEFER_TOOL_OUTPUT_CHARS,
  messageHasDeferredHydration,
  messageHasDeferredThinking,
  mergeHydratedMessage,
  segmentHasDeferredOutput,
  shouldReloadUnslimmedHistory,
  slimMessagesForUi,
  utf8ByteLength
} from './transcript-hydrate'
import {
  TRANSCRIPT_MAX_MOUNTED,
  effectiveTranscriptWindowEnd,
  effectiveTranscriptWindowStart,
  headRangeForFindHit,
  headRangeForJumpTop,
  mergeConversationHistory,
  nextHeadRange,
  nextHistoryStartSeq,
  prependHistoryPage,
  prevHeadRange,
  revealNewerWindowStart,
  revealOlderWindowStart,
  restoreTranscriptWindowStart,
  shiftPinnedStartAfterPrepend,
  shouldFetchOlderHistoryPage,
  shouldFetchSlimHistoryOnJumpTop,
  shouldRevealNewerTranscript,
  shouldRevealOlderTranscript,
  slideHeadAfterAppend,
  slideHeadAfterPrepend,
  stickTranscriptWindowStart,
  windowIncludesLatest,
  windowStartToCoverIndex,
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
    expect(effectiveTranscriptWindowEnd(50, 0)).toBe(50)
    expect(effectiveTranscriptWindowEnd(400, 0)).toBe(TRANSCRIPT_MAX_MOUNTED)
    expect(effectiveTranscriptWindowEnd(400, 360)).toBe(400)
    expect(windowIncludesLatest(400, 70)).toBe(false)
    expect(windowIncludesLatest(400, 400)).toBe(true)
    expect(revealNewerWindowStart(0, 400)).toBe(30)
    expect(revealNewerWindowStart(350, 400)).toBe(360)
    expect(
      shouldRevealNewerTranscript({
        distanceFromBottom: 12,
        locked: true,
        canReveal: true
      })
    ).toBe(true)
    expect(
      shouldRevealNewerTranscript({
        distanceFromBottom: 12,
        locked: false,
        canReveal: true
      })
    ).toBe(false)
    expect(windowStartToCoverIndex(400, 0, 12)).toBe(0)
    expect(windowStartToCoverIndex(400, 0, 200)).toBe(200)
    expect(windowStartToCoverIndex(400, 0, 390)).toBe(360)
    expect(shouldFetchSlimHistoryOnJumpTop({ hasOlder: true, loading: false })).toBe(true)
    expect(shouldFetchSlimHistoryOnJumpTop({ hasOlder: true, loading: true })).toBe(false)
    expect(shouldFetchSlimHistoryOnJumpTop({ hasOlder: false, loading: false })).toBe(false)
    expect(
      shouldFetchSlimHistoryOnJumpTop({ hasOlder: true, loading: false, alreadyAtHead: true })
    ).toBe(false)
    expect(headRangeForJumpTop(0)).toBeNull()
    expect(headRangeForJumpTop(400)).toEqual({ fromSeq: 0, toSeq: TRANSCRIPT_MAX_MOUNTED })
    expect(headRangeForJumpTop(20)).toEqual({ fromSeq: 0, toSeq: 20 })
    expect(headRangeForFindHit(12, 400)).toEqual({ fromSeq: 12, toSeq: 12 + TRANSCRIPT_MAX_MOUNTED })
    expect(headRangeForFindHit(390, 400)).toEqual({ fromSeq: 390, toSeq: 400 })
    expect(headRangeForFindHit(400, 400)).toBeNull()
    expect(nextHeadRange(70, 400)).toEqual({ fromSeq: 70, toSeq: 100 })
    expect(nextHeadRange(390, 400)).toEqual({ fromSeq: 390, toSeq: 400 })
    expect(nextHeadRange(400, 400)).toBeNull()
    expect(prevHeadRange(0)).toBeNull()
    expect(prevHeadRange(70)).toEqual({ fromSeq: 40, toSeq: 70 })
    expect(prevHeadRange(20)).toEqual({ fromSeq: 0, toSeq: 20 })
    expect(slideHeadAfterAppend(0, 70, 30)).toEqual({ startSeq: 30, keepFrom: 30 })
    expect(slideHeadAfterAppend(0, 40, 20)).toEqual({ startSeq: 0, keepFrom: 0 })
    expect(slideHeadAfterPrepend(70, 70, 30)).toEqual({ endSeq: 40, keepLen: TRANSCRIPT_MAX_MOUNTED })
    expect(slideHeadAfterPrepend(70, 40, 20)).toEqual({ endSeq: 70, keepLen: 60 })
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

    const hugeOutput = 'x'.repeat(DEFER_TOOL_OUTPUT_CHARS + 80)
    const hugeThink = '想'.repeat(DEFER_THINKING_CHARS + 20)
    const fat: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '回答正文应走快路径',
      meta: {
        browsedFiles: [],
        activities: [],
        thinkingPreview: hugeThink,
        segments: [
          { id: 'th', kind: 'thinking', content: hugeThink, status: 'done' },
          {
            id: 'cmd',
            kind: 'tool',
            toolName: 'run_command',
            resultSummary: 'ok',
            resultOutput: hugeOutput,
            status: 'done'
          }
        ]
      }
    }
    const slimed = slimMessagesForUi([fat])[0]
    expect(slimed.content).toBe('回答正文应走快路径')
    expect(slimed.meta?.thinkingPreview).toBeUndefined()
    expect(slimed.meta?.thinkingPreviewDeferred).toBe(utf8ByteLength(hugeThink))
    expect(slimed.meta?.segments?.[0].content).toBe('')
    expect(slimed.meta?.segments?.[0].contentDeferred).toBe(utf8ByteLength(hugeThink))
    expect(slimed.meta?.segments?.[1].resultOutput).toBe('')
    expect(slimed.meta?.segments?.[1].resultOutputDeferred).toBe(utf8ByteLength(hugeOutput))
    expect(messageHasDeferredHydration(slimed)).toBe(true)
    expect(messageHasDeferredThinking(slimed)).toBe(true)
    expect(segmentHasDeferredOutput(slimed.meta!.segments![1])).toBe(true)
    expect(messageHasDeferredHydration(fat)).toBe(false)
    const hydrated = mergeHydratedMessage(slimed, fat)
    expect(hydrated.meta?.segments?.[1].resultOutput).toBe(hugeOutput)
    expect(hydrated.meta?.thinkingPreview).toBe(hugeThink)
    expect(messageHasDeferredHydration(hydrated)).toBe(false)

    const compact: ChatMessage = {
      id: 'a2',
      role: 'assistant',
      content: '短',
      meta: {
        browsedFiles: [],
        activities: [],
        thinkingPreview: '短想',
        segments: [
          { id: 'th2', kind: 'thinking', content: '短想', status: 'done' },
          {
            id: 'cmd2',
            kind: 'tool',
            resultSummary: 'ok',
            resultOutput: 'ls\n',
            status: 'done'
          }
        ]
      }
    }
    const kept = slimMessagesForUi([compact])[0]
    expect(kept).toBe(compact)
    expect(messageHasDeferredHydration(kept)).toBe(false)
    expect(shouldReloadUnslimmedHistory({ historyStartSeq: 40, messages: [kept] })).toBe(true)
    expect(shouldReloadUnslimmedHistory({ historyStartSeq: 0, messages: [kept] })).toBe(false)
    expect(shouldReloadUnslimmedHistory({ historyStartSeq: 0, messages: [slimed] })).toBe(true)
  })
})
