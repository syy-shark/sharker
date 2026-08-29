import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  EMPTY_LIVE_STREAM_UI,
  liveStreamPatchFromSegments,
  nextLiveStreamUi,
  sameLiveStreamUi,
  shouldPublishTurnMetaReset,
  COMPACT_LIVE_STATUS,
  liveCompactStatusSegment
} from './live-stream-ui'
import { AUTO_COMPACT_LIVE_STATUS } from './context-compress'
import { LAST_TURN_UI_FLUSH_MS, shouldDeferLastTurnUi } from './last-turn-flush'
import { streamReconnectLiveStatus } from './stream-reconnect'
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
    const seedSegs: TurnSegment[] = [
      {
        id: 'prep',
        kind: 'status',
        content: '连接模型并准备任务…',
        status: 'active',
        startedAt: 1
      },
      {
        id: 'read',
        kind: 'tool',
        toolName: 'read_file',
        status: 'active',
        content: ''
      }
    ]
    const seedPatch = liveStreamPatchFromSegments(seedSegs, { turnStartedAt: 99 })
    const seeded = nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, seedPatch)
    expect(seeded.liveSegments).toBe(seedSegs)
    expect(seeded.activeTool).toBe('read_file')
    expect(seeded.turnStartedAt).toBe(99)
    expect(seeded.streaming).toBe('')
    const answerSeed = liveStreamPatchFromSegments(
      [
        ...seedSegs,
        { id: 'txt', kind: 'text', role: 'final', status: 'active', content: '正在整理结果…' }
      ],
      { turnStartedAt: 99 }
    )
    expect(answerSeed.streaming).toBe('正在整理结果…')
    expect(nextLiveProcessView(null, nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, seedPatch)).processForFlow).toHaveLength(
      2
    )
    const preparing = liveStreamPatchFromSegments(
      [
        {
          id: 'status-local-start',
          kind: 'status',
          content: '连接模型并准备任务…',
          status: 'active',
          startedAt: 7
        }
      ],
      { streaming: '', activeTool: null, turnStartedAt: 7 }
    )
    const preparingSnap = nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, preparing)
    expect(preparingSnap.liveSegments).toHaveLength(1)
    expect(preparingSnap.liveSegments[0]?.content).toBe('连接模型并准备任务…')
    expect(preparingSnap.turnStartedAt).toBe(7)
    expect(nextLiveProcessView(null, preparingSnap).processForFlow[0]?.kind).toBe('status')
    const doneSegs: TurnSegment[] = [
      { id: 't-done', kind: 'tool', toolName: 'read_file', status: 'done', content: '' },
      { id: 'txt-done', kind: 'text', role: 'final', status: 'done', content: 'Hello world' }
    ]
    const donePatch = liveStreamPatchFromSegments(doneSegs, {
      streaming: 'Hello world',
      activeTool: null,
      turnStartedAt: 42,
      liveTurnMeta: meta,
      turnHadThinking: false
    })
    const doneSnap = nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, donePatch)
    expect(doneSnap.streaming).toBe('Hello world')
    expect(doneSnap.activeTool).toBe(null)
    expect(doneSnap.liveSegments).toBe(doneSegs)
    expect(doneSnap.liveTurnMeta).toBe(meta)
    expect(doneSnap.turnStartedAt).toBe(42)
    expect(nextLiveAnswerView(null, doneSnap).copyable).toBe('Hello world')
    expect(nextLiveProcessView(null, doneSnap).processForFlow[0]).toBe(doneSegs[0])
    expect(shouldPublishTurnMetaReset('commit')).toBe(false)
    expect(shouldPublishTurnMetaReset('clear')).toBe(true)
    const compactSeg = liveCompactStatusSegment(11)
    expect(compactSeg.content).toBe(COMPACT_LIVE_STATUS)
    expect(compactSeg.status).toBe('active')
    const compactSnap = nextLiveStreamUi(
      EMPTY_LIVE_STREAM_UI,
      liveStreamPatchFromSegments([compactSeg], {
        streaming: '',
        activeTool: null,
        turnStartedAt: 11
      })
    )
    expect(compactSnap.liveSegments[0]?.content).toBe('正在压缩上下文…')
    expect(nextLiveProcessView(null, compactSnap).processForFlow[0]?.kind).toBe('status')
    const autoCompact = liveStreamPatchFromSegments(
      [{ id: 'auto', kind: 'status', content: AUTO_COMPACT_LIVE_STATUS, status: 'active', startedAt: 3 }],
      { streaming: '', activeTool: null, turnStartedAt: 3 }
    )
    expect(autoCompact.liveSegments?.[0]?.content).toBe('正在自动压缩上下文…')
    expect(nextLiveProcessView(null, nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, autoCompact)).processForFlow[0]?.kind).toBe(
      'status'
    )
    const reconnectPatch = liveStreamPatchFromSegments(
      [{ id: 're', kind: 'status', content: streamReconnectLiveStatus(2), status: 'active', startedAt: 4 }],
      { streaming: '', activeTool: null, turnStartedAt: 4 }
    )
    expect(reconnectPatch.liveSegments?.[0]?.content).toBe('正在重新连接… 2/5')
    const appSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'), 'utf8')
    expect(appSrc.includes('setLiveSegments')).toBe(false)
    expect(appSrc.includes('setStreaming(')).toBe(false)
    expect(appSrc.includes('setTurnThinking(')).toBe(false)
    expect(appSrc.includes('setActiveTool(')).toBe(false)
    expect(appSrc).toContain('publishLiveStreamUi')
    expect(appSrc).toContain('shouldDeferLastTurnUi')
    expect(appSrc.includes('refreshOpenPreviewRef')).toBe(false)
    expect(appSrc).toContain('bumpChangesSoon')
    expect(shouldDeferLastTurnUi(true)).toBe(true)
    expect(shouldDeferLastTurnUi(true, true)).toBe(false)
    expect(shouldDeferLastTurnUi(false)).toBe(false)
    expect(LAST_TURN_UI_FLUSH_MS).toBe(400)
    const treeSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/FileTree.tsx'),
      'utf8'
    )
    expect(treeSrc).toContain('shouldRereadOpenPreviewOnReload')
    expect(treeSrc).toContain('keepIfClosed')
  })
})
