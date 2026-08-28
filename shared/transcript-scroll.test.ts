import { describe, expect, it } from 'vitest'
import {
  captureTranscriptScroll,
  resolveRestoredScrollTop,
  shouldDeferScrollRestore
} from './transcript-scroll'

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
  })
})
