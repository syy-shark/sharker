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
import { AUTO_COMPACT_LIVE_STATUS, shouldRewriteVisibleTranscript } from './context-compress'
import { LAST_TURN_UI_FLUSH_MS, shouldDeferLastTurnUi } from './last-turn-flush'
import { streamReconnectLiveStatus } from './stream-reconnect'
import { TURN_START_LIVE_STATUS } from './live-display'
import {
  liveAnswerGrowState,
  liveAnswerViewFromSnap,
  liveProcessIdentity,
  nextLiveThinkText,
  nextLiveAnswerActions,
  nextLiveAnswerView,
  nextLiveProcessTimeline,
  nextLiveProcessView,
  shouldGrowLiveAnswerTail,
  shouldReuseLiveProcessView,
  isLiveLastLineOnlyToolChange,
  isLiveToolAppendChange,
  isLiveThinkOrStatusClose,
  isLiveToolSettleChange,
  shouldSkipLiveStreamPublish,
  shouldRetargetLiveProcessOnToolMeta,
  shouldSkipLiveAnswerIdentity,
  shouldSkipLiveProcessIdentity,
  shouldSkipLiveStreamDerivation
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
    const processId = liveProcessIdentity([tool, text('Hello')])
    expect(processId).toBe(liveProcessIdentity([tool, text('Hello world')]))
    expect(
      shouldReuseLiveProcessView({
        prev: first,
        identity: processId,
        prevIdentity: processId
      })
    ).toBe(true)
    expect(
      shouldReuseLiveProcessView({
        prev: first,
        identity: liveProcessIdentity([
          tool,
          { id: 't2', kind: 'tool', toolName: 'write_file', status: 'active', content: '' },
          text('Hello world')
        ]),
        prevIdentity: processId
      })
    ).toBe(false)
    const grownProcess = [tool, text('Hello world')]
    expect(
      shouldSkipLiveProcessIdentity({
        prev: first,
        prevSegments: [tool, text('Hello')],
        segments: grownProcess,
        prevAnswerTailPlain: true
      })
    ).toBe(true)
    expect(
      nextLiveProcessView(first, { ...EMPTY_LIVE_STREAM_UI, liveSegments: grownProcess })
    ).toBe(first)
    expect(
      shouldSkipLiveProcessIdentity({
        prev: first,
        prevSegments: [tool, text('Hello')],
        segments: [
          tool,
          { id: 't2', kind: 'tool', toolName: 'write_file', status: 'active', content: '' },
          text('Hello world')
        ]
      })
    ).toBe(false)
    const think = (content: string): TurnSegment => ({
      id: 'th1',
      kind: 'thinking',
      status: 'active',
      content
    })
    const thinkingFirst = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [think('Hmm')]
    })
    const thinkingGrown = nextLiveProcessView(thinkingFirst, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [think('Hmm more')]
    })
    expect(thinkingGrown.processForFlow).toBe(thinkingFirst.processForFlow)
    expect(thinkingGrown.thinkText).toBe('Hmm more')
    expect(thinkingGrown).not.toBe(thinkingFirst)
    const thinkSnap1 = { ...EMPTY_LIVE_STREAM_UI, liveSegments: [think('Hmm')] }
    const thinkSnap2 = { ...EMPTY_LIVE_STREAM_UI, liveSegments: [think('Hmm more')] }
    const timelineFirst = nextLiveProcessTimeline(null, thinkSnap1)
    expect(nextLiveProcessTimeline(timelineFirst, thinkSnap2)).toBe(timelineFirst)
    expect(timelineFirst.hasThought).toBe(true)
    expect(
      shouldSkipLiveProcessIdentity({
        prev: thinkingFirst,
        prevSegments: [think('Hmm')],
        segments: [think('Hmm more')]
      })
    ).toBe(true)
    expect(liveProcessIdentity([think('Hmm')])).toBe(liveProcessIdentity([think('Hmm more')]))
    expect(nextLiveThinkText('Hmm', [think('Hmm')], [think('Hmm more')])).toBe('Hmm more')
    expect(shouldSkipLiveStreamDerivation([think('Hmm')], [think('Hmm more')])).toBe('think')
    expect(shouldSkipLiveStreamDerivation([think('Hmm')], [tool])).toBe(null)
    expect(shouldSkipLiveStreamDerivation([text('Hello')], [text('Hello world')])).toBe('text')
    expect(
      shouldSkipLiveStreamDerivation([text('Hello')], [
        {
          id: 'a1',
          kind: 'text',
          role: 'final',
          status: 'active',
          content: 'Hello\n```demo\n<div>'
        }
      ])
    ).toBe(null)
    const answerWhileThink = nextLiveAnswerView(null, thinkSnap1)
    expect(nextLiveAnswerView(answerWhileThink, thinkSnap2)).toBe(answerWhileThink)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileThink,
        prevSegments: [think('Hmm')],
        segments: [think('Hmm more')]
      })
    ).toBe(true)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileThink,
        prevSegments: [think('Hmm')],
        segments: [tool]
      })
    ).toBe(false)
    const statusGrow = (body: string): TurnSegment => ({
      id: 'st1',
      kind: 'status',
      status: 'active',
      content: body
    })
    const statusSnap1 = { ...EMPTY_LIVE_STREAM_UI, liveSegments: [statusGrow('Preparing')] }
    const statusSnap2 = { ...EMPTY_LIVE_STREAM_UI, liveSegments: [statusGrow('Preparing…')] }
    const answerWhileStatus = nextLiveAnswerView(null, statusSnap1)
    expect(nextLiveAnswerView(answerWhileStatus, statusSnap2)).toBe(answerWhileStatus)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileStatus,
        prevSegments: [statusGrow('Preparing')],
        segments: [statusGrow('Preparing…')]
      })
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation([statusGrow('Preparing')], [statusGrow('Preparing…')])
    ).toBe('status')
    const hello = text('Hello')
    const running: TurnSegment = {
      id: 'run-1',
      kind: 'tool',
      toolName: 'run_terminal_cmd',
      status: 'active',
      toolDetail: 'npm test'
    }
    const runningLine: TurnSegment = { ...running, toolDetail: 'PASS src/a.test.ts' }
    const runningPreview: TurnSegment = {
      ...running,
      editPreview: [{ path: 'a.ts', stats: { added: 1, removed: 0 } }]
    }
    const answerWhileTool = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    expect(nextLiveAnswerView(answerWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, runningLine]
    })).toBe(answerWhileTool)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, runningLine]
      })
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, runningLine])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, runningPreview]
      })
    ).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, runningPreview])).toBe(null)
    const processWhileTool = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processWhileLine = nextLiveProcessView(processWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, runningLine]
    })
    expect(
      shouldRetargetLiveProcessOnToolMeta({
        prev: processWhileTool,
        prevSegments: [hello, running],
        segments: [hello, runningLine]
      })
    ).toBe(true)
    expect(
      shouldRetargetLiveProcessOnToolMeta({
        prev: processWhileTool,
        prevSegments: [hello, running],
        segments: [hello, runningPreview]
      })
    ).toBe(false)
    expect(isLiveLastLineOnlyToolChange(running, runningLine)).toBe(true)
    expect(isLiveLastLineOnlyToolChange(running, runningPreview)).toBe(false)
    expect(shouldSkipLiveStreamPublish([hello, running], [hello, runningLine])).toBe(true)
    expect(shouldSkipLiveStreamPublish([hello, running], [hello, runningPreview])).toBe(false)
    expect(shouldSkipLiveStreamPublish([hello, running], [hello, running])).toBe(true)
    expect(processWhileLine).toBe(processWhileTool)
    expect(processWhileLine.processForFlow).toBe(processWhileTool.processForFlow)
    const runningPath: TurnSegment = { ...running, toolDetail: 'src/a.ts' }
    const processWhilePath = nextLiveProcessView(processWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, runningPath]
    })
    expect(processWhilePath).not.toBe(processWhileTool)
    expect(processWhilePath.processForFlow.some((segment) => segment === runningPath)).toBe(true)
    expect(processWhilePath.processForFlow.some((segment) => segment === running)).toBe(false)
    const prevKept = processWhileTool.processForFlow.filter((segment) => segment !== running)
    const nextKept = processWhilePath.processForFlow.filter((segment) => segment !== runningPath)
    expect(nextKept.length).toBe(prevKept.length)
    prevKept.forEach((segment, index) => expect(segment).toBe(nextKept[index]))
    const ran: TurnSegment = { ...running, status: 'done', resultSummary: 'exit 0' }
    const ranDiff: TurnSegment = {
      ...ran,
      fileDiff: { path: 'a.ts', lines: [], stats: { added: 1, removed: 0 } }
    }
    expect(isLiveToolSettleChange(running, ran)).toBe(true)
    expect(isLiveToolSettleChange(running, ranDiff)).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ran])).toBe('tool')
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff])).toBe(null)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran]
      })
    ).toBe(true)
    expect(shouldSkipLiveStreamPublish([hello, running], [hello, ran])).toBe(false)
    expect(
      shouldRetargetLiveProcessOnToolMeta({
        prev: processWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran]
      })
    ).toBe(true)
    const processWhileRan = nextLiveProcessView(processWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran]
    })
    expect(processWhileRan).not.toBe(processWhileTool)
    expect(processWhileRan.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processWhileRan.processForFlow.some((segment) => segment === running)).toBe(false)
    const nextCmd: TurnSegment = {
      id: 'run-2',
      kind: 'tool',
      toolName: 'read_file',
      status: 'active',
      toolDetail: 'src/b.ts'
    }
    expect(isLiveToolAppendChange([hello, ran], [hello, ran, nextCmd])).toBe(true)
    expect(isLiveToolAppendChange([hello, running], [hello, ran, nextCmd])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, ran], [hello, ran, nextCmd])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, ran],
        segments: [hello, ran, nextCmd]
      })
    ).toBe(true)
    expect(shouldSkipLiveStreamPublish([hello, ran], [hello, ran, nextCmd])).toBe(false)
    const processWhileNext = nextLiveProcessView(processWhileRan, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextCmd]
    })
    expect(processWhileNext).not.toBe(processWhileRan)
    expect(processWhileNext.processForFlow.some((segment) => segment === nextCmd)).toBe(true)
    expect(processWhileNext.processForFlow.some((segment) => segment === ran)).toBe(true)
    const processWhileTwo = nextLiveProcessView(processWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running, nextCmd]
    })
    expect(shouldSkipLiveStreamDerivation([hello, running, nextCmd], [hello, ran, nextCmd])).toBe(
      'tool'
    )
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running, nextCmd],
        segments: [hello, ran, nextCmd]
      })
    ).toBe(true)
    expect(
      shouldRetargetLiveProcessOnToolMeta({
        prev: processWhileTwo,
        prevSegments: [hello, running, nextCmd],
        segments: [hello, ran, nextCmd]
      })
    ).toBe(true)
    const processWhileEarlier = nextLiveProcessView(processWhileTwo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextCmd]
    })
    expect(processWhileEarlier.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processWhileEarlier.processForFlow.some((segment) => segment === nextCmd)).toBe(true)
    expect(processWhileEarlier.processForFlow.some((segment) => segment === running)).toBe(false)
    const thinking: TurnSegment = {
      id: 'th-1',
      kind: 'thinking',
      content: 'Hmm',
      status: 'active'
    }
    const thinkingDone: TurnSegment = { ...thinking, status: 'done' }
    const firstTool: TurnSegment = {
      id: 'read-1',
      kind: 'tool',
      toolName: 'read_file',
      status: 'active',
      toolDetail: 'src/a.ts'
    }
    expect(isLiveThinkOrStatusClose(thinking, thinkingDone)).toBe(true)
    expect(isLiveToolAppendChange([thinking], [thinkingDone, firstTool])).toBe(true)
    expect(isLiveToolAppendChange([thinking], [thinking, firstTool])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([thinking], [thinkingDone, firstTool])).toBe('tool')
    const processWhileThink = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinking]
    })
    const processWhileFirst = nextLiveProcessView(processWhileThink, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinkingDone, firstTool]
    })
    expect(processWhileFirst.processForFlow.some((segment) => segment === firstTool)).toBe(true)
    expect(processWhileFirst.thinkText).toBe(processWhileThink.thinkText)
    const sharedSegs = [tool, text('Same ref')]
    const answerSameRef = liveAnswerViewFromSnap({
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: sharedSegs,
      streaming: 'Same ref'
    })
    expect(
      liveAnswerViewFromSnap({
        ...EMPTY_LIVE_STREAM_UI,
        liveSegments: sharedSegs,
        streaming: 'Same ref and more'
      })
    ).toBe(answerSameRef)
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
    expect(a2.closed).toBe(a1.closed)
    expect(a2.tail?.type).toBe('text')
    const grownPrefix = [tool]
    const grownTail = text('Hello world')
    const grownSegs = [...grownPrefix, grownTail]
    expect(liveAnswerGrowState(grownSegs).tail?.id).toBe('a1')
    expect(
      shouldGrowLiveAnswerTail({
        prev: a1,
        prevSegments: grownSegs,
        segments: grownSegs,
        tail: grownTail
      })
    ).toBe(true)
    expect(
      shouldGrowLiveAnswerTail({
        prev: a1,
        prevSegments: grownSegs,
        segments: grownSegs,
        tail: {
          id: 'a1',
          kind: 'text',
          role: 'final',
          status: 'active',
          content: 'Hello\n```demo\n<div>'
        }
      })
    ).toBe(false)
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
        content: TURN_START_LIVE_STATUS,
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
          content: TURN_START_LIVE_STATUS,
          status: 'active',
          startedAt: 7
        }
      ],
      { streaming: '', activeTool: null, turnStartedAt: 7 }
    )
    const preparingSnap = nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, preparing)
    expect(preparingSnap.liveSegments).toHaveLength(1)
    expect(preparingSnap.liveSegments[0]?.content).toBe(TURN_START_LIVE_STATUS)
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
    expect(compactSnap.liveSegments[0]?.content).toBe('Compacting context')
    expect(nextLiveProcessView(null, compactSnap).processForFlow[0]?.kind).toBe('status')
    const autoCompact = liveStreamPatchFromSegments(
      [{ id: 'auto', kind: 'status', content: AUTO_COMPACT_LIVE_STATUS, status: 'active', startedAt: 3 }],
      { streaming: '', activeTool: null, turnStartedAt: 3 }
    )
    expect(autoCompact.liveSegments?.[0]?.content).toBe('Automatically compacting context')
    expect(nextLiveProcessView(null, nextLiveStreamUi(EMPTY_LIVE_STREAM_UI, autoCompact)).processForFlow[0]?.kind).toBe(
      'status'
    )
    expect(shouldRewriteVisibleTranscript('auto')).toBe(false)
    expect(shouldRewriteVisibleTranscript('slash')).toBe(true)
    const reconnectPatch = liveStreamPatchFromSegments(
      [{ id: 're', kind: 'status', content: streamReconnectLiveStatus(2), status: 'active', startedAt: 4 }],
      { streaming: '', activeTool: null, turnStartedAt: 4 }
    )
    expect(reconnectPatch.liveSegments?.[0]?.content).toBe('Reconnecting... 2/5')
    const appSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'), 'utf8')
    expect(appSrc).toContain('shouldRewriteVisibleTranscript')
    expect(appSrc.includes('setLiveSegments')).toBe(false)
    expect(appSrc.includes('setStreaming(')).toBe(false)
    expect(appSrc.includes('setTurnThinking(')).toBe(false)
    expect(appSrc.includes('setActiveTool(')).toBe(false)
    expect(appSrc).toContain('publishLiveStreamUi')
    expect(appSrc).toContain('shouldSkipLiveStreamDerivation')
    expect(appSrc).toContain("skip === 'tool'")
    expect(appSrc).toContain('shouldSkipLiveStreamPublish')
    expect(appSrc).toContain('activeTool: activeToolSeg?.toolName ?? null')
    expect(appSrc).toContain('segmentsRef.current !== prevLiveSegments')
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
    const chatSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ChatView.tsx'),
      'utf8'
    )
    expect(chatSrc).toContain('shouldObserveRowIntrinsicHeight')
    expect(chatSrc).toContain('nextLiveFindHits')
    expect(chatSrc).toContain('shouldRepaintLiveFindHighlight')
    expect(chatSrc).toContain('shouldWatchLiveJumpProgress')
    expect(chatSrc).toContain('mutation.addedNodes')
    const fenceSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/CodeArtifactBlock.tsx'),
      'utf8'
    )
    expect(fenceSrc).toContain('growRef')
    expect(fenceSrc).toContain('code-artifact-grow')
    expect(fenceSrc).not.toContain('[followTail, children]')
    const demoSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/InlineDemo.tsx'),
      'utf8'
    )
    expect(demoSrc).toContain('shouldMeasureInlineDemoInParent')
    expect(demoSrc).toContain('shouldMountInlineDemoFrame')
    expect(demoSrc).toContain('shouldWalkInlineDemoTree')
    expect(demoSrc).toContain('buildLiveHeightScript')
    expect(demoSrc).toContain('liveInlineDemoPaintDelay')
    expect(demoSrc).toContain('hostThemeCss')
    expect(demoSrc).toContain('hostTermCss')
    expect(demoSrc).toContain('var walkTree')
    expect(demoSrc).toContain('katex@0.16.11')
    expect(demoSrc).toMatch(/shouldWalkInlineDemoTree\(\{ streaming \}\)/)
  })
})
