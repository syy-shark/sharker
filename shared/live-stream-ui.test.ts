import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  EMPTY_LIVE_STREAM_UI,
  nextLiveStreamUi,
  sameLiveStreamUi
} from './live-stream-ui'
import {
  nextLiveAnswerActions,
  nextLiveAnswerView,
  nextLiveProcessView
} from './live-stream-slices'

describe('live stream ui snapshot', () => {
  it('reuses the previous object when token fields do not change', () => {
    const segs: TurnSegment[] = [{ id: 's1', kind: 'text', content: 'hi' }]
    const prev = nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, {
      streaming: 'hi',
      liveSegments: segs,
      turnThinking: '',
      activeTool: null
    })
    expect(sameLiveStreamUi(EMPTY_LIVE_STREAM_UI, prev)).toBe(false)
    expect(
      nextLiveStreamUi(prev, {
        streaming: 'hi',
        liveSegments: segs,
        turnThinking: '',
        activeTool: null
      })
    ).toBe(prev)
    const grown = nextLiveStreamUi(prev, { streaming: 'hi!' })
    expect(grown).not.toBe(prev)
    expect(grown.streaming).toBe('hi!')
    expect(grown.liveSegments).toBe(segs)
    expect(grown.liveTurnMeta).toBe(null)
    expect(nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, {})).toBe(EMPTY_LIVE_STREAM_UI)
    const meta = { browsedFiles: ['a.ts'], activities: [{ kind: 'tool' as const, label: 'read' }] }
    const withMeta = nextLiveStreamUi(grown, { liveTurnMeta: meta, turnStartedAt: 42 })
    expect(withMeta).not.toBe(grown)
    expect(withMeta.streaming).toBe('hi!')
    expect(withMeta.liveSegments).toBe(segs)
    expect(
      nextLiveStreamUi(withMeta, {
        streaming: 'hi!',
        liveSegments: segs,
        liveTurnMeta: meta,
        turnStartedAt: 42
      })
    ).toBe(withMeta)
    const tokenKeepMeta = nextLiveStreamUi(withMeta, { streaming: 'hi!!' })
    expect(tokenKeepMeta.liveTurnMeta).toBe(meta)
    expect(tokenKeepMeta.turnStartedAt).toBe(42)
    expect(tokenKeepMeta.liveSegments).toBe(segs)
    const tool: TurnSegment = {
      id: 't1',
      kind: 'tool',
      toolName: 'read_file',
      status: 'done',
      content: ''
    }
    const text = (content: string): TurnSegment => ({
      id: 'a1',
      kind: 'text',
      role: 'final',
      status: 'active',
      content
    })
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [tool, text('Hello')],
      streaming: 'Hello'
    })
    const still = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [tool, text('Hello world')],
      streaming: 'Hello world'
    })
    expect(still).toBe(first)
    expect(still.processForFlow[0]).toBe(tool)
    const a1 = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [tool, text('Hello')],
      streaming: 'Hello'
    })
    const a2 = nextLiveAnswerView(a1, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [tool, text('Hello world')],
      streaming: 'Hello world'
    })
    expect(a2).not.toBe(a1)
    expect(a2.copyable).toBe('Hello world')
    expect(a2.closed).toEqual([])
    expect(a2.tail?.type).toBe('text')
    const sealed: TurnSegment = {
      id: 'd1',
      kind: 'tool',
      toolName: 'write_file',
      status: 'done',
      content: ''
    }
    const withDiff = (body: string): TurnSegment[] => [
      tool,
      { id: 'intro', kind: 'text', role: 'final', status: 'done', content: 'Intro' },
      sealed,
      { id: 'tail', kind: 'text', role: 'final', status: 'active', content: body }
    ]
    const c1 = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: withDiff('Hi'),
      streaming: 'Hi'
    })
    const c2 = nextLiveAnswerView(c1, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: withDiff('Hi there'),
      streaming: 'Hi there'
    })
    expect(c2.closed).toBe(c1.closed)
    expect(c2.tail).not.toBe(c1.tail)
    const act1 = nextLiveAnswerActions(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [tool, text('Hello')],
      streaming: 'Hello'
    })
    const act2 = nextLiveAnswerActions(act1, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [tool, text('Hello world')],
      streaming: 'Hello world'
    })
    expect(act2).toBe(act1)
    expect(act2.reserved).toBe(false)
    const answerSnap = {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [tool, text('Hello world')],
      streaming: 'Hello world',
      liveTurnMeta: meta,
      turnStartedAt: 42
    }
    const processOnMeta = nextLiveProcessView(still, answerSnap)
    expect(processOnMeta).toBe(still)
    const answerOnMeta = nextLiveAnswerView(a2, answerSnap)
    expect(answerOnMeta).toBe(a2)
    expect(nextLiveAnswerActions(act2, answerSnap)).toBe(act2)
  })
})
