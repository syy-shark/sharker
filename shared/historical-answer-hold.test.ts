import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatMessage, TurnSegment } from './types'
import {
  captureHistoricalAnswerHold,
  historicalProcessForFlow,
  historicalProcessOutcome,
  HISTORICAL_ANSWER_WARM_LIMIT,
  HISTORICAL_ANSWER_WARM_SLICE,
  nextHistoricalAnswerWarmMessages,
  shouldContinueHistoricalAnswerWarm,
  shouldScheduleHistoricalAnswerWarm,
  shouldWarmHistoricalAnswerHold,
  warmHistoricalAnswerHold
} from './historical-answer-hold'
import { TRANSCRIPT_PAGE } from './transcript-window'
import {
  buildAnswerParts,
  clearHistoricalAnswerHolds,
  processSegments,
  seedHistoricalAnswerHold
} from './turn-segments'

describe('historical answer idle warmup', () => {
  afterEach(() => {
    clearHistoricalAnswerHolds()
  })

  it('warms adjacent unmounted assistant rows and seeds the same refs', () => {
    expect(shouldScheduleHistoricalAnswerWarm({ loading: true })).toBe(false)
    expect(shouldScheduleHistoricalAnswerWarm({ loading: false })).toBe(true)
    expect(shouldWarmHistoricalAnswerHold({ role: 'user', hasSegments: true })).toBe(false)
    expect(shouldWarmHistoricalAnswerHold({ loading: true, role: 'assistant', hasSegments: true })).toBe(
      false
    )
    expect(shouldWarmHistoricalAnswerHold({ role: 'assistant', hasSegments: false })).toBe(false)
    expect(shouldWarmHistoricalAnswerHold({ role: 'assistant', hasSegments: true })).toBe(true)
    expect(historicalProcessOutcome({ content: '好', outcome: 'aborted' })).toBe('aborted')
    expect(historicalProcessOutcome({ content: '**错误**: 失败' })).toBe('error')
    expect(historicalProcessOutcome({ content: '好' })).toBe('success')

    const segments: TurnSegment[] = [
      { id: 'think', kind: 'thinking', content: '分析', status: 'done' },
      { id: 'read', kind: 'tool', toolName: 'read_file', status: 'done', content: '' },
      { id: 'final', kind: 'text', role: 'final', content: '完成。', status: 'done' }
    ]
    const answerParts = buildAnswerParts(segments, { isStreaming: false })
    const processOnly = processSegments(segments, { isStreaming: false })
    expect(historicalProcessForFlow(processOnly, answerParts).some((s) => s.kind === 'text')).toBe(
      false
    )

    const older: ChatMessage = {
      id: 'older-assist',
      role: 'assistant',
      content: '完成。',
      meta: { segments, durationSec: 3, outcome: 'success' }
    }
    const user: ChatMessage = { id: 'user-1', role: 'user', content: '继续' }
    const newer: ChatMessage = {
      id: 'newer-assist',
      role: 'assistant',
      content: '完成。',
      meta: { segments, durationSec: 2 }
    }
    const windowed: ChatMessage = {
      id: 'window-assist',
      role: 'assistant',
      content: '在窗内',
      meta: { segments }
    }
    const messages = [older, user, windowed, newer]
    const warmed = nextHistoricalAnswerWarmMessages({
      messages,
      windowStart: 2,
      windowEnd: 3
    })
    expect(warmed.map((m) => m.id)).toEqual(['older-assist', 'newer-assist'])
    expect(
      nextHistoricalAnswerWarmMessages({
        messages,
        windowStart: 2,
        windowEnd: 3,
        limit: 1
      }).map((m) => m.id)
    ).toEqual(['older-assist'])
    expect(HISTORICAL_ANSWER_WARM_LIMIT).toBe(TRANSCRIPT_PAGE)
    expect(HISTORICAL_ANSWER_WARM_SLICE).toBe(1)
    expect(shouldContinueHistoricalAnswerWarm({ remaining: 1 })).toBe(true)
    expect(shouldContinueHistoricalAnswerWarm({ remaining: 0 })).toBe(false)

    expect(
      warmHistoricalAnswerHold({
        messageId: 'empty',
        content: '',
        segments: []
      })
    ).toBeUndefined()

    const captured = captureHistoricalAnswerHold({
      messageId: older.id,
      content: older.content,
      durationSec: older.meta?.durationSec,
      outcome: older.meta?.outcome,
      segments
    })
    const written = warmHistoricalAnswerHold({
      messageId: older.id,
      content: older.content,
      durationSec: older.meta?.durationSec,
      outcome: older.meta?.outcome,
      segments
    })
    expect(written?.stamp).toBe(captured.stamp)
    expect(written?.filesChanged).toEqual(captured.filesChanged)
    expect(written?.hasProcess).toBe(true)
    expect(written?.finalBody.show).toBe(true)
    expect(
      nextHistoricalAnswerWarmMessages({
        messages,
        windowStart: 2,
        windowEnd: 3,
        skipHeld: true
      }).map((m) => m.id)
    ).toEqual(['newer-assist'])
    expect(written?.answerParts).not.toBe(captured.answerParts)
    const seeded = seedHistoricalAnswerHold(older.id, written!.stamp)
    expect(seeded).toBe(written)
    expect(seeded?.processForFlow).toBe(written?.processForFlow)
    expect(seeded?.frozenSteps).toBe(written?.frozenSteps)
    expect(
      warmHistoricalAnswerHold({
        messageId: older.id,
        content: older.content,
        durationSec: older.meta?.durationSec,
        outcome: older.meta?.outcome,
        segments
      })
    ).toBe(written)

    const src = readFileSync(fileURLToPath(new URL('./historical-answer-hold.ts', import.meta.url)), 'utf8')
    expect(src.includes('live-stream-slices')).toBe(false)

    const chat = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ChatView.tsx'),
      'utf8'
    )
    expect(chat).toContain('shouldScheduleHistoricalAnswerWarm')
    expect(chat).toContain('nextHistoricalAnswerWarmMessages')
    expect(chat).toContain('warmHistoricalAnswerHold')
    expect(chat).toContain('HISTORICAL_ANSWER_WARM_SLICE')
    expect(chat).toContain('shouldContinueHistoricalAnswerWarm')
    expect(chat).toContain('skipHeld: true')
    expect(chat).toContain('requestIdleCallback')

    const assistant = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/AssistantMessage.tsx'),
      'utf8'
    )
    expect(assistant).toContain('historicalProcessForFlow')
  })
})
