import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  hasLiveProcessPhaseGrowHold,
  shouldSkipLiveAnswerIdentity,
  shouldSkipLiveStreamDerivation
} from './live-stream-slices'
import type { LiveAnswerView } from './live-stream-slices'

function think(content: string): TurnSegment {
  return { id: 'th1', kind: 'thinking', status: 'active', content }
}

function prose(content: string): TurnSegment {
  return { id: 'a1', kind: 'text', role: 'final', status: 'active', content }
}

function status(content: string): TurnSegment {
  return { id: 'st1', kind: 'status', status: 'active', content }
}

function tool(status: TurnSegment['status'] = 'active'): TurnSegment {
  return { id: 't1', kind: 'tool', toolName: 'read_file', status, content: '' }
}

const emptyAnswer: LiveAnswerView = {
  parts: [],
  closed: [],
  tail: null,
  show: false,
  copyable: '',
  hasCopyable: false
}

describe('live same-length skip (16ms token path)', () => {
  it('skips derivation on think / status / prose growth without treating it as a new tool', () => {
    expect(shouldSkipLiveStreamDerivation([think('Hmm')], [think('Hmm more')])).toBe('think')
    expect(shouldSkipLiveStreamDerivation([status('Preparing')], [status('Preparing…')])).toBe(
      'status'
    )
    expect(shouldSkipLiveStreamDerivation([prose('Hello')], [prose('Hello world')])).toBe('text')
  })

  it('still classifies a newly appended tool after closed prose', () => {
    const closed: TurnSegment = { ...prose('Hello'), status: 'done' }
    expect(shouldSkipLiveStreamDerivation([prose('Hello')], [closed, tool('active')])).toBe('tool')
  })

  it('does not grow-hold process phases on same-length think tokens', () => {
    expect(hasLiveProcessPhaseGrowHold([think('Hmm')], [think('Hmm more')])).toBe(false)
  })

  it('holds answer identity on same-length prose growth', () => {
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: emptyAnswer,
        prevSegments: [prose('Hello')],
        segments: [prose('Hello world')]
      })
    ).toBe(true)
  })
})
