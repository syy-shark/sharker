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
import { applyStreamChunk } from './turn-segments'
import { REQUEST_USER_INPUT_TOOL } from './user-input'
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
  findLiveToolInPlaceChange,
  isLiveToolWriteStatAppendChange,
  isLiveWriteStatStatusAppendChange,
  isLiveWriteStatStatusThinkAppendChange,
  isLiveWriteStatStatusAnswerAppendChange,
  isLiveWriteStatThinkAppendChange,
  isLiveWriteStatThinkAnswerAppendChange,
  isLiveStatusThinkAppendChange,
  isLiveStatusAnswerAppendChange,
  isLiveStatusThinkAnswerAppendChange,
  isLiveThinkAnswerAppendChange,
  isLiveWriteStatStatusThinkAnswerAppendChange,
  isLiveThinkDemoFenceAppendChange,
  isLiveStatusDemoFenceAppendChange,
  isLiveStatusThinkDemoFenceAppendChange,
  isLiveWriteStatThinkDemoFenceAppendChange,
  isLiveWriteStatStatusDemoFenceAppendChange,
  isLiveWriteStatStatusThinkDemoFenceAppendChange,
  isLiveStatusToolAppendChange,
  isLiveThinkToolAppendChange,
  isLiveStatusThinkToolAppendChange,
  isLiveWriteStatStatusToolAppendChange,
  isLiveWriteStatThinkToolAppendChange,
  isLiveWriteStatStatusThinkToolAppendChange,
  isLiveStatusDemoAppendChange,
  isLiveThinkDemoAppendChange,
  isLiveStatusThinkDemoAppendChange,
  isLiveWriteStatStatusDemoAppendChange,
  isLiveWriteStatThinkDemoAppendChange,
  isLiveWriteStatStatusThinkDemoAppendChange,
  isLiveStatusErrorAppendChange,
  isLiveThinkErrorAppendChange,
  isLiveStatusThinkErrorAppendChange,
  isLiveWriteStatStatusErrorAppendChange,
  isLiveWriteStatThinkErrorAppendChange,
  isLiveWriteStatStatusThinkErrorAppendChange,
  isLiveStatusCompressAppendChange,
  isLiveThinkCompressAppendChange,
  isLiveStatusThinkCompressAppendChange,
  isLiveWriteStatStatusCompressAppendChange,
  isLiveWriteStatThinkCompressAppendChange,
  isLiveWriteStatStatusThinkCompressAppendChange,
  isLiveStatusCancelAppendChange,
  isLiveThinkCancelAppendChange,
  isLiveStatusThinkCancelAppendChange,
  isLiveWriteStatStatusCancelAppendChange,
  isLiveWriteStatThinkCancelAppendChange,
  isLiveWriteStatStatusThinkCancelAppendChange,
  isLiveThinkStatusAppendChange,
  isLiveStatusThinkStatusAppendChange,
  isLiveWriteStatThinkStatusAppendChange,
  isLiveWriteStatStatusThinkStatusAppendChange,
  isLiveWriteStatAnswerAppendChange,
  isLiveWriteStatDemoFenceAppendChange,
  isLiveWriteStatCompressAppendChange,
  isLiveWriteStatErrorAppendChange,
  isLiveWriteStatDemoAppendChange,
  isLiveThinkAppendChange,
  isLiveAnswerAppendChange,
  isLiveCompressAppendChange,
  isLiveCancelChange,
  isLiveErrorAppendChange,
  isLiveDemoAppendChange,
  isLiveDemoFenceAppendChange,
  findLiveDemoFenceChange,
  isLiveDemoHtmlChange,
  isLiveStatusAppendChange,
  isLiveApprovalNeededChange,
  isLiveApprovalResolvedChange,
  isLiveUserInputNeededChange,
  isLiveAskResolvedSettleChange,
  isLiveStatusSettleChange,
  isLiveThinkOrStatusClose,
  isLiveTextClose,
  isLiveToolSettleChange,
  isLiveMultiToolSettleChange,
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
    ).toBe('text')
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
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, runningPreview])).toBe('tool')
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
    ).toBe(true)
    const processWhilePreview = nextLiveProcessView(processWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, runningPreview]
    })
    expect(processWhilePreview.processForFlow.some((segment) => segment === runningPreview)).toBe(
      true
    )
    expect(processWhilePreview.processForFlow.some((segment) => segment === running)).toBe(false)
    const helloTextPart = answerWhileTool.parts.find((part) => part.type === 'text')
    const answerAfterPreview = nextLiveAnswerView(answerWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, runningPreview]
    })
    expect(answerAfterPreview).not.toBe(answerWhileTool)
    expect(answerAfterPreview.parts.find((part) => part.type === 'text')).toBe(helloTextPart)
    expect(answerAfterPreview.parts.some((part) => part.type === 'diff' && part.id === 'run-1-diff-0')).toBe(
      true
    )
    expect(answerAfterPreview.tail).toBe(answerWhileTool.tail)
    const runningPreviewMore: TurnSegment = {
      ...running,
      editPreview: [
        { path: 'a.ts', stats: { added: 1, removed: 0 } },
        { path: 'b.ts', stats: { added: 1, removed: 0 } }
      ]
    }
    const answerAfterPreviewMore = nextLiveAnswerView(answerAfterPreview, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, runningPreviewMore]
    })
    expect(answerAfterPreviewMore.parts.find((part) => part.type === 'text')).toBe(helloTextPart)
    expect(answerAfterPreviewMore.parts.filter((part) => part.type === 'diff')).toHaveLength(2)
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
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff]
      })
    ).toBe(false)
    expect(
      shouldRetargetLiveProcessOnToolMeta({
        prev: processWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff]
      })
    ).toBe(true)
    const processWhileWriteHold = nextLiveProcessView(processWhileTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processWhileRanDiff = nextLiveProcessView(processWhileWriteHold, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff]
    })
    expect(processWhileRanDiff.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processWhileRanDiff.processForFlow.some((segment) => segment === running)).toBe(false)
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
    const nextGrep: TurnSegment = {
      id: 'run-3',
      kind: 'tool',
      toolName: 'grep',
      status: 'active',
      toolDetail: 'foo'
    }
    expect(isLiveToolAppendChange([hello, ran], [hello, ran, nextCmd, nextGrep])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, ran], [hello, ran, nextCmd, nextGrep])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, ran],
        segments: [hello, ran, nextCmd, nextGrep]
      })
    ).toBe(true)
    const processReadyForParallel = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran]
    })
    const processAfterParallel = nextLiveProcessView(processReadyForParallel, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextCmd, nextGrep]
    })
    expect(processAfterParallel.processForFlow.some((segment) => segment === nextCmd)).toBe(true)
    expect(processAfterParallel.processForFlow.some((segment) => segment === nextGrep)).toBe(true)
    expect(isLiveToolWriteStatAppendChange([hello, running], [hello, ranDiff, nextCmd])).toBe(true)
    expect(isLiveToolAppendChange([hello, running], [hello, ranDiff, nextCmd])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, nextCmd])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, nextCmd]
      })
    ).toBe(false)
    const processReadyForWriteAppend = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteAppend = nextLiveProcessView(processReadyForWriteAppend, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, nextCmd]
    })
    expect(processAfterWriteAppend.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteAppend.processForFlow.some((segment) => segment === nextCmd)).toBe(true)
    expect(isLiveToolAppendChange([hello, running], [hello, ran, nextCmd])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ran, nextCmd])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran, nextCmd]
      })
    ).toBe(true)
    const processReadyForSettleAppend = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterSettleAppend = nextLiveProcessView(processReadyForSettleAppend, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextCmd]
    })
    expect(processAfterSettleAppend.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processAfterSettleAppend.processForFlow.some((segment) => segment === nextCmd)).toBe(true)
    expect(processAfterSettleAppend.processForFlow.some((segment) => segment === running)).toBe(false)
    const helloDone: TurnSegment = { ...hello, status: 'done' }
    expect(isLiveTextClose(hello, helloDone)).toBe(true)
    expect(isLiveToolAppendChange([hello, ran], [helloDone, ran, nextCmd])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, ran], [helloDone, ran, nextCmd])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, ran],
        segments: [helloDone, ran, nextCmd]
      })
    ).toBe(false)
    const answerAfterHello = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran]
    })
    const answerAfterClose = nextLiveAnswerView(answerAfterHello, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [helloDone, ran, nextCmd]
    })
    expect(answerAfterClose.tail).toBeNull()
    expect(answerAfterClose.closed.some((part) => part.id === hello.id && part.content === 'Hello')).toBe(
      true
    )
    const processAfterHello = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran]
    })
    const processAfterClose = nextLiveProcessView(processAfterHello, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [helloDone, ran, nextCmd]
    })
    expect(processAfterClose.processForFlow.some((segment) => segment === nextCmd)).toBe(true)
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
    const nextCmdDone: TurnSegment = { ...nextCmd, status: 'done', resultSummary: 'ok' }
    expect(isLiveToolSettleChange(nextCmd, nextCmdDone)).toBe(true)
    expect(findLiveToolInPlaceChange([hello, running, nextCmd], [hello, ran, nextCmdDone])).toBeNull()
    expect(isLiveMultiToolSettleChange([hello, running, nextCmd], [hello, ran, nextCmdDone])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running, nextCmd], [hello, ran, nextCmdDone])).toBe(
      'tool'
    )
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running, nextCmd],
        segments: [hello, ran, nextCmdDone]
      })
    ).toBe(true)
    expect(
      shouldRetargetLiveProcessOnToolMeta({
        prev: processWhileTwo,
        prevSegments: [hello, running, nextCmd],
        segments: [hello, ran, nextCmdDone]
      })
    ).toBe(true)
    const processWhileBothSettled = nextLiveProcessView(processWhileTwo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextCmdDone]
    })
    expect(processWhileBothSettled.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processWhileBothSettled.processForFlow.some((segment) => segment === nextCmdDone)).toBe(true)
    expect(processWhileBothSettled.processForFlow.some((segment) => segment === running)).toBe(false)
    expect(processWhileBothSettled.processForFlow.some((segment) => segment === nextCmd)).toBe(false)
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
    const helloGrownDone: TurnSegment = { ...hello, status: 'done', content: 'Hello world' }
    expect(isLiveTextClose(hello, helloGrownDone)).toBe(false)
    expect(isLiveToolAppendChange([hello], [helloGrownDone, firstTool])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], [helloGrownDone, firstTool])).toBe('tool')
    const answerWhileHelloOnly = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello]
    })
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileHelloOnly,
        prevSegments: [hello],
        segments: [helloGrownDone, firstTool]
      })
    ).toBe(false)
    const answerAfterGrowClose = nextLiveAnswerView(answerWhileHelloOnly, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [helloGrownDone, firstTool]
    })
    expect(answerAfterGrowClose.tail).toBeNull()
    expect(
      answerAfterGrowClose.closed.some((part) => part.id === hello.id && part.content === 'Hello world')
    ).toBe(true)
    const processWhileHelloOnly = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello]
    })
    const processAfterGrowClose = nextLiveProcessView(processWhileHelloOnly, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [helloGrownDone, firstTool]
    })
    expect(processAfterGrowClose.processForFlow.some((segment) => segment === firstTool)).toBe(true)
    const thinkingGrownDone: TurnSegment = { ...thinking, status: 'done', content: 'Hmm next' }
    expect(isLiveThinkOrStatusClose(thinking, thinkingGrownDone)).toBe(false)
    expect(isLiveToolAppendChange([thinking], [thinkingGrownDone, firstTool])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([thinking], [thinkingGrownDone, firstTool])).toBe('tool')
    expect(nextLiveThinkText('Hmm', [thinking], [thinkingGrownDone, firstTool])).toBe('Hmm next')
    const processWhileThinkForGrow = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinking]
    })
    const processAfterThinkGrow = nextLiveProcessView(processWhileThinkForGrow, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinkingGrownDone, firstTool]
    })
    expect(processAfterThinkGrow.thinkText).toBe(processWhileThinkForGrow.thinkText + ' next')
    expect(processAfterThinkGrow.processForFlow.some((segment) => segment === firstTool)).toBe(true)
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
    const nextThink: TurnSegment = {
      id: 'th-2',
      kind: 'thinking',
      content: 'Next',
      status: 'active'
    }
    expect(isLiveThinkAppendChange([hello, ran], [hello, ran, nextThink])).toBe(true)
    expect(isLiveThinkAppendChange([hello, running], [hello, ran, nextThink])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ran, nextThink])).toBe('think')
    const processReadyForSettleThink = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterSettleThink = nextLiveProcessView(processReadyForSettleThink, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextThink]
    })
    expect(processAfterSettleThink.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processAfterSettleThink.processForFlow.some((segment) => segment === running)).toBe(false)
    expect(processAfterSettleThink.thinkText).toBe(processReadyForSettleThink.thinkText + 'Next')
    expect(shouldSkipLiveStreamDerivation([hello, ran], [hello, ran, nextThink])).toBe('think')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, ran],
        segments: [hello, ran, nextThink]
      })
    ).toBe(true)
    const processWhileRanHold = nextLiveProcessView(processWhileRan, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran]
    })
    const processWhileNextThink = nextLiveProcessView(processWhileRanHold, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextThink]
    })
    expect(processWhileNextThink.processForFlow).toBe(processWhileRanHold.processForFlow)
    expect(processWhileNextThink.thinkText).toBe(processWhileRanHold.thinkText + 'Next')
    const firstReply: TurnSegment = {
      id: 'reply-1',
      kind: 'text',
      status: 'active',
      content: 'Hi'
    }
    const demoStart: TurnSegment = {
      id: 'demo-1',
      kind: 'text',
      status: 'active',
      content: '```demo\n<div>'
    }
    expect(isLiveAnswerAppendChange([ran], [ran, firstReply])).toBe(true)
    expect(isLiveAnswerAppendChange([running], [ran, firstReply])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([running], [ran, firstReply])).toBe('text')
    expect(isLiveAnswerAppendChange([thinking], [thinkingDone, firstReply])).toBe(true)
    expect(isLiveAnswerAppendChange([thinking], [thinkingGrownDone, firstReply])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([thinking], [thinkingGrownDone, firstReply])).toBe('text')
    expect(nextLiveThinkText('Hmm', [thinking], [thinkingGrownDone, firstReply])).toBe('Hmm next')
    const processThinkForAnswer = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinking]
    })
    const processThinkGrownAnswer = nextLiveProcessView(processThinkForAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinkingGrownDone, firstReply]
    })
    expect(processThinkGrownAnswer.thinkText).toBe(processThinkForAnswer.thinkText + ' next')
    expect(processThinkGrownAnswer.answerStreaming).toBe(true)
    const answerThinkOnly = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinking]
    })
    const answerAfterThinkGrow = nextLiveAnswerView(answerThinkOnly, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thinkingGrownDone, firstReply]
    })
    expect(answerAfterThinkGrow.tail?.content).toBe('Hi')
    expect(isLiveDemoFenceAppendChange([thinking], [thinkingGrownDone, demoStart])).toBe(true)
    expect(isLiveAnswerAppendChange([ran], [ran, demoStart])).toBe(false)
    expect(isLiveDemoFenceAppendChange([ran], [ran, demoStart])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([ran], [ran, demoStart])).toBe('text')
    expect(
      findLiveDemoFenceChange(
        [text('Hello')],
        [
          {
            id: 'a1',
            kind: 'text',
            role: 'final',
            status: 'active',
            content: 'Hello\n```demo\n<div>'
          }
        ]
      )
    ).not.toBeNull()
    const processReadyForFence = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const processAfterFence = nextLiveProcessView(processReadyForFence, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, demoStart]
    })
    expect(processAfterFence.processForFlow).toEqual(processReadyForFence.processForFlow)
    expect(processAfterFence.generatingDemo).toBe(true)
    const answerReadyForFence = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const answerAfterFence = nextLiveAnswerView(answerReadyForFence, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, demoStart]
    })
    expect(answerAfterFence.tail?.type).toBe('demo')
    expect(answerAfterFence.tail?.id).toBe('demo-1-demo-stream')
    const demoFenceGrown: TurnSegment = {
      ...demoStart,
      content: '```demo\n<div class="scene"><h1>广义相对论</h1><p>spacetime curvature demo</p></div>'
    }
    expect(findLiveDemoFenceChange([ran, demoStart], [ran, demoFenceGrown])).not.toBeNull()
    expect(shouldSkipLiveStreamDerivation([ran, demoStart], [ran, demoFenceGrown])).toBe('text')
    const processAfterFenceHtml = nextLiveProcessView(processAfterFence, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, demoFenceGrown]
    })
    expect(processAfterFenceHtml.processForFlow).toBe(processAfterFence.processForFlow)
    expect(processAfterFenceHtml.generatingDemo).toBe(false)
    expect(processAfterFenceHtml.contentStreaming).toBe(true)
    const answerAfterFenceHtml = nextLiveAnswerView(answerAfterFence, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, demoFenceGrown]
    })
    expect(answerAfterFenceHtml.tail?.type).toBe('demo')
    if (answerAfterFenceHtml.tail && 'html' in answerAfterFenceHtml.tail) {
      expect(answerAfterFenceHtml.tail.html).toContain('广义相对论')
    }
    expect(shouldSkipLiveStreamDerivation([ran], [ran, firstReply])).toBe('text')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [ran],
        segments: [ran, firstReply]
      })
    ).toBe(false)
    const processToolsOnly = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const processFirstReply = nextLiveProcessView(processToolsOnly, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, firstReply]
    })
    expect(processFirstReply.processForFlow).toBe(processToolsOnly.processForFlow)
    expect(processFirstReply.contentStreaming).toBe(true)
    expect(processFirstReply.answerStreaming).toBe(true)
    const answerToolsOnly = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const answerFirstReply = nextLiveAnswerView(answerToolsOnly, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, firstReply]
    })
    expect(answerFirstReply.tail?.content).toBe('Hi')
    expect(answerFirstReply.show).toBe(true)
    expect(answerFirstReply.closed).toEqual([])
    const inlineDemo: TurnSegment = {
      id: 'demo-tool-1',
      kind: 'tool',
      toolName: 'present_inline_demo',
      status: 'active',
      content: ''
    }
    expect(isLiveToolAppendChange([ran], [ran, inlineDemo])).toBe(false)
    expect(isLiveDemoAppendChange([ran], [ran, inlineDemo])).toBe(true)
    expect(isLiveDemoAppendChange([thinking], [thinkingDone, inlineDemo])).toBe(true)
    expect(isLiveDemoAppendChange([hello], [helloDone, inlineDemo])).toBe(true)
    expect(isLiveAnswerAppendChange([ran], [ran, inlineDemo])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([ran], [ran, inlineDemo])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [ran],
        segments: [ran, inlineDemo]
      })
    ).toBe(false)
    const processReadyForDemo = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const processAfterDemo = nextLiveProcessView(processReadyForDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, inlineDemo]
    })
    expect(processAfterDemo.processForFlow).toEqual(processReadyForDemo.processForFlow)
    expect(
      processAfterDemo.processForFlow.some((segment) => segment.toolName === 'present_inline_demo')
    ).toBe(false)
    expect(processAfterDemo.generatingDemo).toBe(true)
    const answerReadyForDemo = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const answerAfterDemo = nextLiveAnswerView(answerReadyForDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, inlineDemo]
    })
    expect(answerAfterDemo.tail?.type).toBe('demo')
    expect(answerAfterDemo.tail?.id).toBe(inlineDemo.id)
    const demoHtml: TurnSegment = {
      ...inlineDemo,
      content: '<div class="scene"><h1>广义相对论</h1><p>spacetime curvature demo</p></div>'
    }
    expect(isLiveDemoHtmlChange(inlineDemo, demoHtml)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([ran, inlineDemo], [ran, demoHtml])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerAfterDemo,
        prevSegments: [ran, inlineDemo],
        segments: [ran, demoHtml]
      })
    ).toBe(false)
    const processAfterDemoHtml = nextLiveProcessView(processAfterDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, demoHtml]
    })
    expect(processAfterDemoHtml.processForFlow).toBe(processAfterDemo.processForFlow)
    expect(processAfterDemoHtml.generatingDemo).toBe(false)
    expect(processAfterDemoHtml.contentStreaming).toBe(true)
    const answerAfterDemoHtml = nextLiveAnswerView(answerAfterDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, demoHtml]
    })
    expect(answerAfterDemoHtml.tail?.type).toBe('demo')
    expect(answerAfterDemoHtml.tail && 'html' in answerAfterDemoHtml.tail).toBe(true)
    if (answerAfterDemoHtml.tail && 'html' in answerAfterDemoHtml.tail) {
      expect(answerAfterDemoHtml.tail.html).toBe(demoHtml.content)
    }
    const demoDone: TurnSegment = { ...demoHtml, status: 'done' }
    const answerAfterDemoDone = nextLiveAnswerView(answerAfterDemoHtml, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, demoDone]
    })
    expect(answerAfterDemoDone.tail?.type).toBe('demo')
    if (answerAfterDemoDone.tail && 'streaming' in answerAfterDemoDone.tail) {
      expect(answerAfterDemoDone.tail.streaming).toBe(false)
    }
    const answerWithHello = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello]
    })
    const answerHelloThenDemo = nextLiveAnswerView(answerWithHello, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [helloDone, inlineDemo]
    })
    expect(answerHelloThenDemo.closed.some((part) => part.id === hello.id && part.type === 'text')).toBe(
      true
    )
    expect(answerHelloThenDemo.tail?.type).toBe('demo')
    const reconnectStatus: TurnSegment = {
      id: 're-1',
      kind: 'status',
      status: 'active',
      content: 'Reconnecting... 1/5'
    }
    expect(isLiveStatusAppendChange([hello, running, nextCmd], [hello, ran, nextCmdDone, reconnectStatus])).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running, nextCmd], [hello, ran, nextCmdDone, reconnectStatus])).toBe(
      'status'
    )
    expect(isLiveStatusAppendChange([ran], [ran, reconnectStatus])).toBe(true)
    expect(isLiveStatusAppendChange([running], [ran, reconnectStatus])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([running], [ran, reconnectStatus])).toBe('status')
    const processReadyForSettleStatus = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [running]
    })
    const processAfterSettleStatus = nextLiveProcessView(processReadyForSettleStatus, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, reconnectStatus]
    })
    expect(processAfterSettleStatus.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processAfterSettleStatus.processForFlow.some((segment) => segment === reconnectStatus)).toBe(
      true
    )
    expect(isLiveStatusAppendChange([thinking], [thinkingDone, reconnectStatus])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([ran], [ran, reconnectStatus])).toBe('status')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [ran],
        segments: [ran, reconnectStatus]
      })
    ).toBe(true)
    const processReadyForStatus = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const processAfterReconnect = nextLiveProcessView(processReadyForStatus, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, reconnectStatus]
    })
    expect(processAfterReconnect.processForFlow.some((segment) => segment === reconnectStatus)).toBe(true)
    const answerReadyForStatus = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    expect(nextLiveAnswerView(answerReadyForStatus, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, reconnectStatus]
    })).toBe(answerReadyForStatus)
    expect(isLiveWriteStatStatusAppendChange([hello, running], [hello, ranDiff, nextCmd])).toBe(false)
    expect(isLiveWriteStatStatusAppendChange([hello, running], [hello, ranDiff, reconnectStatus])).toBe(true)
    expect(isLiveWriteStatThinkAppendChange([hello, running], [hello, ranDiff, nextThink])).toBe(true)
    expect(isLiveWriteStatAnswerAppendChange([hello, running], [hello, ranDiff, firstReply])).toBe(true)
    expect(
      isLiveWriteStatStatusThinkAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatus, nextThink]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatThinkAnswerAppendChange([hello, running], [hello, ranDiff, nextThink, firstReply])
    ).toBe(true)
    expect(
      isLiveWriteStatStatusAnswerAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatus, firstReply]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, reconnectStatus, nextThink])
    ).toBe('think')
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, nextThink, firstReply])
    ).toBe('text')
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, reconnectStatus, firstReply])
    ).toBe('text')
    expect(
      nextLiveThinkText('Hmm', [hello, running], [hello, ranDiff, reconnectStatus, nextThink])
    ).toBe('HmmNext')
    expect(
      isLiveStatusThinkAppendChange([hello, running], [hello, ran, reconnectStatus, nextThink])
    ).toBe(true)
    expect(
      isLiveThinkAnswerAppendChange([hello, running], [hello, ran, nextThink, firstReply])
    ).toBe(true)
    expect(
      isLiveStatusAnswerAppendChange([hello, running], [hello, ran, reconnectStatus, firstReply])
    ).toBe(true)
    expect(isLiveWriteStatStatusThinkAppendChange([hello, running], [hello, ran, reconnectStatus, nextThink])).toBe(
      false
    )
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ran, reconnectStatus, nextThink])
    ).toBe('think')
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ran, nextThink, firstReply])).toBe(
      'text'
    )
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ran, reconnectStatus, firstReply])
    ).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello, running], [hello, ran, reconnectStatus, nextThink])).toBe(
      'HmmNext'
    )
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran, reconnectStatus, nextThink]
      })
    ).toBe(true)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran, nextThink, firstReply]
      })
    ).toBe(false)
    expect(
      isLiveStatusThinkAppendChange(
        [hello, running, nextCmd],
        [hello, ran, nextCmdDone, reconnectStatus, nextThink]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, running, nextCmd],
        [hello, ran, nextCmdDone, reconnectStatus, nextThink]
      )
    ).toBe('think')
    const reconnectStatusDone: TurnSegment = { ...reconnectStatus, status: 'done' }
    expect(
      isLiveThinkAnswerAppendChange(
        [hello, ran, reconnectStatus],
        [hello, ran, reconnectStatusDone, nextThink, firstReply]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, ran, reconnectStatus],
        [hello, ran, reconnectStatusDone, nextThink, firstReply]
      )
    ).toBe('text')
    const nextThinkDone: TurnSegment = { ...nextThink, status: 'done' }
    expect(
      isLiveThinkAnswerAppendChange([hello, running], [hello, ran, nextThinkDone, firstReply])
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ran, nextThinkDone, firstReply])).toBe(
      'text'
    )
    expect(
      isLiveStatusThinkAnswerAppendChange(
        [hello, running],
        [hello, ran, reconnectStatus, nextThinkDone, firstReply]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, running],
        [hello, ran, reconnectStatus, nextThinkDone, firstReply]
      )
    ).toBe('text')
    expect(
      nextLiveThinkText('Hmm', [hello, running], [hello, ran, reconnectStatus, nextThinkDone, firstReply])
    ).toBe('HmmNext')
    expect(
      isLiveWriteStatStatusThinkAnswerAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatus, nextThinkDone, firstReply]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, running],
        [hello, ranDiff, reconnectStatus, nextThinkDone, firstReply]
      )
    ).toBe('text')
    let streamed = [hello, running]
    streamed = applyStreamChunk(streamed, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'exit 0',
      timestamp: 10
    })
    streamed = applyStreamChunk(streamed, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 11
    })
    const afterPlanStatus = streamed
    streamed = applyStreamChunk(streamed, { type: 'think', content: 'Next', timestamp: 12 })
    streamed = applyStreamChunk(streamed, { type: 'token', content: 'Hi', timestamp: 13 })
    expect(isLiveStatusThinkAnswerAppendChange([hello, running], streamed)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], streamed)).toBe('text')
    let fromPlan = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 12 })
    fromPlan = applyStreamChunk(fromPlan, { type: 'token', content: 'Hi', timestamp: 13 })
    expect(isLiveThinkAnswerAppendChange(afterPlanStatus, fromPlan)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, fromPlan)).toBe('text')
    expect(
      isLiveStatusDemoFenceAppendChange([hello, running], [hello, ran, reconnectStatus, demoStart])
    ).toBe(true)
    expect(
      isLiveThinkDemoFenceAppendChange([hello, running], [hello, ran, nextThinkDone, demoStart])
    ).toBe(true)
    expect(
      isLiveStatusThinkDemoFenceAppendChange(
        [hello, running],
        [hello, ran, reconnectStatus, nextThinkDone, demoStart]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatStatusDemoFenceAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatus, demoStart]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatThinkDemoFenceAppendChange([hello, running], [hello, ranDiff, nextThinkDone, demoStart])
    ).toBe(true)
    expect(
      isLiveWriteStatStatusThinkDemoFenceAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatus, nextThinkDone, demoStart]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ran, reconnectStatus, demoStart])
    ).toBe('text')
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, running],
        [hello, ran, reconnectStatus, nextThinkDone, demoStart]
      )
    ).toBe('text')
    const answerStreamed = applyStreamChunk(afterPlanStatus, { type: 'token', content: 'Hi', timestamp: 14 })
    expect(isLiveStatusAnswerAppendChange([hello, running], answerStreamed)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], answerStreamed)).toBe('text')
    let demoStreamed = applyStreamChunk(afterPlanStatus, { type: 'token', content: '```demo\n<div>', timestamp: 14 })
    expect(isLiveStatusDemoFenceAppendChange([hello, running], demoStreamed)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], demoStreamed)).toBe('text')
    let demoFromPlan = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 15 })
    demoFromPlan = applyStreamChunk(demoFromPlan, { type: 'token', content: '```demo\n<div>', timestamp: 16 })
    expect(isLiveThinkDemoFenceAppendChange(afterPlanStatus, demoFromPlan)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, demoFromPlan)).toBe('text')
    expect(
      isLiveStatusToolAppendChange(
        [hello, running],
        [hello, ran, reconnectStatusDone, nextCmd]
      )
    ).toBe(true)
    expect(
      isLiveThinkToolAppendChange([hello, running], [hello, ran, nextThinkDone, nextCmd])
    ).toBe(true)
    expect(
      isLiveStatusThinkToolAppendChange(
        [hello, running],
        [hello, ran, reconnectStatusDone, nextThinkDone, nextCmd]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatStatusToolAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatusDone, nextCmd]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatThinkToolAppendChange([hello, running], [hello, ranDiff, nextThinkDone, nextCmd])
    ).toBe(true)
    expect(
      isLiveWriteStatStatusThinkToolAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatusDone, nextThinkDone, nextCmd]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ran, reconnectStatusDone, nextCmd])
    ).toBe('tool')
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, running],
        [hello, ran, reconnectStatusDone, nextThinkDone, nextCmd]
      )
    ).toBe('tool')
    expect(
      shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, reconnectStatusDone, nextCmd])
    ).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran, reconnectStatusDone, nextCmd]
      })
    ).toBe(true)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, reconnectStatusDone, nextCmd]
      })
    ).toBe(false)
    expect(
      nextLiveThinkText('Hmm', [hello, running], [hello, ran, nextThinkDone, nextCmd])
    ).toBe('HmmNext')
    expect(
      nextLiveThinkText(
        'Hmm',
        [hello, running],
        [hello, ran, reconnectStatusDone, nextThinkDone, nextCmd]
      )
    ).toBe('HmmNext')
    let nextRound = applyStreamChunk(afterPlanStatus, {
      type: 'tool_start',
      toolName: 'read_file',
      toolArgs: { path: 'src/b.ts' },
      timestamp: 20
    })
    expect(isLiveStatusToolAppendChange([hello, running], nextRound)).toBe(true)
    expect(isLiveToolAppendChange(afterPlanStatus, nextRound)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], nextRound)).toBe('tool')
    let thinkThenTool = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 21 })
    thinkThenTool = applyStreamChunk(thinkThenTool, {
      type: 'tool_start',
      toolName: 'read_file',
      toolArgs: { path: 'src/b.ts' },
      timestamp: 22
    })
    expect(isLiveThinkToolAppendChange(afterPlanStatus, thinkThenTool)).toBe(true)
    expect(isLiveStatusThinkToolAppendChange([hello, running], thinkThenTool)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, thinkThenTool)).toBe('tool')
    expect(shouldSkipLiveStreamDerivation([hello, running], thinkThenTool)).toBe('tool')
    const processReadyForPlanTool = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterPlanTool = nextLiveProcessView(processReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: nextRound
    })
    expect(processAfterPlanTool.processForFlow.some((segment) => segment.kind === 'status')).toBe(true)
    expect(
      processAfterPlanTool.processForFlow.some(
        (segment) => segment.kind === 'tool' && segment.toolName === 'read_file'
      )
    ).toBe(true)
    expect(processAfterPlanTool.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterPlanTool.processForFlow.some((segment) => segment.kind === 'text')).toBe(false)
    const processAfterThinkTool = nextLiveProcessView(processReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenTool
    })
    expect(processAfterThinkTool.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterThinkTool.thinkText).toBe(processReadyForPlanTool.thinkText + 'Next')
    expect(
      processAfterThinkTool.processForFlow.some(
        (segment) => segment.kind === 'tool' && segment.toolName === 'read_file'
      )
    ).toBe(true)
    const answerReadyForPlanTool = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloPlanToolPart = answerReadyForPlanTool.parts.find((part) => part.type === 'text')
    const answerAfterPlanTool = nextLiveAnswerView(answerReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: nextRound
    })
    expect(
      answerAfterPlanTool.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloPlanToolPart)
    const answerAfterWriteStatPlanTool = nextLiveAnswerView(answerReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, reconnectStatusDone, nextCmd]
    })
    expect(
      answerAfterWriteStatPlanTool.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloPlanToolPart)
    expect(
      isLiveStatusDemoAppendChange(
        [hello, running],
        [hello, ran, reconnectStatusDone, inlineDemo]
      )
    ).toBe(true)
    expect(
      isLiveThinkDemoAppendChange([hello, running], [hello, ran, nextThinkDone, inlineDemo])
    ).toBe(true)
    expect(
      isLiveStatusThinkDemoAppendChange(
        [hello, running],
        [hello, ran, reconnectStatusDone, nextThinkDone, inlineDemo]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatStatusDemoAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatusDone, inlineDemo]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatThinkDemoAppendChange(
        [hello, running],
        [hello, ranDiff, nextThinkDone, inlineDemo]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatStatusThinkDemoAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatusDone, nextThinkDone, inlineDemo]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, running],
        [hello, ran, reconnectStatusDone, inlineDemo]
      )
    ).toBe('tool')
    expect(
      nextLiveThinkText(
        'Hmm',
        [hello, running],
        [hello, ran, reconnectStatusDone, nextThinkDone, inlineDemo]
      )
    ).toBe('HmmNext')
    const demoRound = applyStreamChunk(afterPlanStatus, {
      type: 'tool_start',
      toolName: 'present_inline_demo',
      timestamp: 23
    })
    expect(isLiveStatusDemoAppendChange([hello, running], demoRound)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], demoRound)).toBe('tool')
    let thinkThenDemo = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 24 })
    thinkThenDemo = applyStreamChunk(thinkThenDemo, {
      type: 'tool_start',
      toolName: 'present_inline_demo',
      timestamp: 25
    })
    expect(isLiveThinkDemoAppendChange(afterPlanStatus, thinkThenDemo)).toBe(true)
    expect(isLiveStatusThinkDemoAppendChange([hello, running], thinkThenDemo)).toBe(true)
    const processReadyForPlanDemo = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterPlanDemo = nextLiveProcessView(processReadyForPlanDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: demoRound
    })
    expect(processAfterPlanDemo.processForFlow.some((segment) => segment.kind === 'status')).toBe(true)
    expect(
      processAfterPlanDemo.processForFlow.some((segment) => segment.toolName === 'present_inline_demo')
    ).toBe(false)
    expect(processAfterPlanDemo.generatingDemo).toBe(true)
    const processAfterThinkDemo = nextLiveProcessView(processReadyForPlanDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenDemo
    })
    expect(processAfterThinkDemo.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterThinkDemo.thinkText).toBe(processReadyForPlanDemo.thinkText + 'Next')
    expect(processAfterThinkDemo.generatingDemo).toBe(true)
    const answerReadyForPlanDemo = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const answerAfterPlanDemo = nextLiveAnswerView(answerReadyForPlanDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: demoRound
    })
    expect(answerAfterPlanDemo.tail?.type).toBe('demo')
    const errorRound = applyStreamChunk(afterPlanStatus, {
      type: 'error',
      error: 'boom',
      timestamp: 26
    })
    expect(isLiveStatusErrorAppendChange([hello, running], errorRound)).toBe(true)
    expect(isLiveErrorAppendChange(afterPlanStatus, errorRound)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], errorRound)).toBe('text')
    let thinkThenErr = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 27 })
    thinkThenErr = applyStreamChunk(thinkThenErr, { type: 'error', error: 'boom', timestamp: 28 })
    expect(isLiveThinkErrorAppendChange(afterPlanStatus, thinkThenErr)).toBe(true)
    expect(isLiveStatusThinkErrorAppendChange([hello, running], thinkThenErr)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], thinkThenErr)).toBe('text')
    expect(
      nextLiveThinkText('Hmm', [hello, running], thinkThenErr)
    ).toBe('HmmNext')
    const errorTextDone: TurnSegment = {
      id: 'err-plan',
      kind: 'text',
      role: 'final',
      status: 'done',
      content: '**错误**: boom'
    }
    expect(
      isLiveWriteStatStatusErrorAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatusDone, errorTextDone]
      )
    ).toBe(true)
    const processReadyForPlanError = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterPlanError = nextLiveProcessView(processReadyForPlanError, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: errorRound
    })
    expect(processAfterPlanError.processForFlow.some((segment) => segment.kind === 'status')).toBe(
      true
    )
    expect(processAfterPlanError.processForFlow.some((segment) => segment.kind === 'text')).toBe(
      false
    )
    const answerReadyForPlanError = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloPlanErrorPart = answerReadyForPlanError.parts.find((part) => part.type === 'text')
    const answerAfterPlanError = nextLiveAnswerView(answerReadyForPlanError, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: errorRound
    })
    expect(
      answerAfterPlanError.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloPlanErrorPart)
    expect(answerAfterPlanError.tail?.content).toContain('**错误**:')
    const compressPayload = {
      removedCount: 4,
      beforeTokens: 9000,
      afterTokens: 4000,
      limit: 10000,
      messages: [] as []
    }
    const compressRound = applyStreamChunk(afterPlanStatus, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 29
    })
    expect(isLiveStatusCompressAppendChange([hello, running], compressRound)).toBe(true)
    expect(isLiveCompressAppendChange(afterPlanStatus, compressRound)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], compressRound)).toBe('tool')
    let thinkThenCompress = applyStreamChunk(afterPlanStatus, {
      type: 'think',
      content: 'Next',
      timestamp: 30
    })
    thinkThenCompress = applyStreamChunk(thinkThenCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 31
    })
    expect(isLiveThinkCompressAppendChange(afterPlanStatus, thinkThenCompress)).toBe(true)
    expect(isLiveStatusThinkCompressAppendChange([hello, running], thinkThenCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], thinkThenCompress)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], thinkThenCompress)).toBe('HmmNext')
    const compressDone: TurnSegment = {
      id: 'cp-plan',
      kind: 'tool',
      toolName: 'compress',
      toolTitle: 'Context automatically compacted',
      status: 'done'
    }
    expect(
      isLiveWriteStatStatusCompressAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatusDone, compressDone]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatThinkCompressAppendChange(
        [hello, running],
        [hello, ranDiff, nextThinkDone, compressDone]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatStatusThinkCompressAppendChange(
        [hello, running],
        [hello, ranDiff, reconnectStatusDone, nextThinkDone, compressDone]
      )
    ).toBe(true)
    const processReadyForPlanCompress = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterPlanCompress = nextLiveProcessView(processReadyForPlanCompress, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: compressRound
    })
    expect(processAfterPlanCompress.processForFlow.some((segment) => segment.kind === 'status')).toBe(
      true
    )
    expect(
      processAfterPlanCompress.processForFlow.some((segment) => segment.toolName === 'compress')
    ).toBe(true)
    expect(processAfterPlanCompress.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    const processAfterThinkCompress = nextLiveProcessView(processReadyForPlanCompress, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenCompress
    })
    expect(processAfterThinkCompress.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterThinkCompress.thinkText).toBe(processReadyForPlanCompress.thinkText + 'Next')
    expect(
      processAfterThinkCompress.processForFlow.some((segment) => segment.toolName === 'compress')
    ).toBe(true)
    const stopRound = applyStreamChunk(afterPlanStatus, { type: 'turn_cancelled', timestamp: 32 })
    expect(isLiveCancelChange(afterPlanStatus, stopRound)).toBe(true)
    expect(isLiveStatusCancelAppendChange([hello, running], stopRound)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], stopRound)).toBe('text')
    let thinkThenStop = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 33 })
    thinkThenStop = applyStreamChunk(thinkThenStop, { type: 'turn_cancelled', timestamp: 34 })
    expect(isLiveThinkCancelAppendChange(afterPlanStatus, thinkThenStop)).toBe(true)
    expect(isLiveStatusThinkCancelAppendChange([hello, running], thinkThenStop)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], thinkThenStop)).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello, running], thinkThenStop)).toBe('HmmNext')
    const helloCancelled: TurnSegment = { ...hello, status: 'cancelled' }
    const reconnectCancelled: TurnSegment = { ...reconnectStatus, status: 'cancelled' }
    const nextThinkCancelled: TurnSegment = { ...nextThink, status: 'cancelled' }
    expect(
      isLiveWriteStatStatusCancelAppendChange(
        [hello, running],
        [helloCancelled, ranDiff, reconnectCancelled]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatThinkCancelAppendChange(
        [hello, running],
        [helloCancelled, ranDiff, nextThinkCancelled]
      )
    ).toBe(true)
    expect(
      isLiveWriteStatStatusThinkCancelAppendChange(
        [hello, running],
        [helloCancelled, ranDiff, reconnectCancelled, nextThinkCancelled]
      )
    ).toBe(true)
    const processReadyForPlanStop = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterPlanStop = nextLiveProcessView(processReadyForPlanStop, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: stopRound
    })
    expect(processAfterPlanStop.processForFlow.some((segment) => segment.kind === 'status')).toBe(true)
    expect(processAfterPlanStop.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    const processAfterThinkStop = nextLiveProcessView(processReadyForPlanStop, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenStop
    })
    expect(processAfterThinkStop.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterThinkStop.thinkText).toBe(processReadyForPlanStop.thinkText + 'Next')
    const answerReadyForPlanStop = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloPlanStopPart = answerReadyForPlanStop.parts.find((part) => part.type === 'text')
    const answerAfterPlanStop = nextLiveAnswerView(answerReadyForPlanStop, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: stopRound
    })
    expect(
      answerAfterPlanStop.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloPlanStopPart)
    const askNeeded = {
      type: 'user_input_needed' as const,
      toolName: REQUEST_USER_INPUT_TOOL,
      userInput: {
        questions: [
          {
            id: 'q1',
            header: 'API style',
            question: 'Which API?',
            options: [
              { id: 'a', label: 'REST' },
              { id: 'b', label: 'gRPC' }
            ]
          }
        ]
      },
      timestamp: 35
    }
    const askRound = applyStreamChunk(afterPlanStatus, askNeeded)
    expect(isLiveUserInputNeededChange(afterPlanStatus, askRound)).toBe(true)
    expect(isLiveStatusAppendChange(afterPlanStatus, askRound)).toBe(false)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, askRound)).toBe('tool')
    expect(shouldSkipLiveStreamDerivation([hello, running], askRound)).toBe('status')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: afterPlanStatus,
        segments: askRound
      })
    ).toBe(true)
    const approvalRound = applyStreamChunk(afterPlanStatus, {
      type: 'approval_needed',
      approval: { id: 'ap-plan', toolName: 'run_terminal_cmd', title: 'npm test' },
      timestamp: 36
    })
    expect(isLiveApprovalNeededChange(afterPlanStatus, approvalRound)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, approvalRound)).toBe('tool')
    let thinkThenAsk = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 37 })
    thinkThenAsk = applyStreamChunk(thinkThenAsk, { ...askNeeded, timestamp: 38 })
    expect(isLiveThinkStatusAppendChange(afterPlanStatus, thinkThenAsk)).toBe(true)
    expect(isLiveStatusThinkStatusAppendChange([hello, running], thinkThenAsk)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, thinkThenAsk)).toBe('tool')
    expect(shouldSkipLiveStreamDerivation([hello, running], thinkThenAsk)).toBe('tool')
    expect(nextLiveThinkText('Hmm', afterPlanStatus, thinkThenAsk)).toBe('HmmNext')
    expect(nextLiveThinkText('Hmm', [hello, running], thinkThenAsk)).toBe('HmmNext')
    let thinkThenApproval = applyStreamChunk(afterPlanStatus, {
      type: 'think',
      content: 'Next',
      timestamp: 39
    })
    thinkThenApproval = applyStreamChunk(thinkThenApproval, {
      type: 'approval_needed',
      approval: { id: 'ap-think', toolName: 'run_terminal_cmd', title: 'npm test' },
      timestamp: 40
    })
    expect(isLiveThinkStatusAppendChange(afterPlanStatus, thinkThenApproval)).toBe(true)
    expect(isLiveStatusThinkStatusAppendChange([hello, running], thinkThenApproval)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, thinkThenApproval)).toBe('tool')
    const askFromWriteStat = [
      hello,
      ranDiff,
      afterPlanStatus[2]!,
      thinkThenAsk[3]!,
      thinkThenAsk[4]!
    ]
    expect(isLiveWriteStatStatusThinkStatusAppendChange([hello, running], askFromWriteStat)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askFromWriteStat)).toBe('tool')
    expect(
      isLiveWriteStatThinkStatusAppendChange(
        [hello, running],
        [hello, ranDiff, thinkThenAsk[3]!, thinkThenAsk[4]!]
      )
    ).toBe(true)
    const processReadyForPlanAsk = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: afterPlanStatus
    })
    const processAfterPlanAsk = nextLiveProcessView(processReadyForPlanAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askRound
    })
    expect(processAfterPlanAsk.processForFlow.at(-1)?.content).toBe('API style')
    expect(processAfterPlanAsk.processForFlow.at(-1)?.toolName).toBe(REQUEST_USER_INPUT_TOOL)
    const processAfterThinkAsk = nextLiveProcessView(processReadyForPlanAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenAsk
    })
    expect(processAfterThinkAsk.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterThinkAsk.thinkText).toBe(processReadyForPlanAsk.thinkText + 'Next')
    expect(
      processAfterThinkAsk.processForFlow.some(
        (segment) => segment.toolName === REQUEST_USER_INPUT_TOOL
      )
    ).toBe(true)
    const processAfterThinkApproval = nextLiveProcessView(processReadyForPlanAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenApproval
    })
    expect(processAfterThinkApproval.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterThinkApproval.processForFlow.at(-1)?.content).toMatch(/Awaiting approval/)
    const answerReadyForPlanAsk = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: afterPlanStatus
    })
    const helloPlanAskPart = answerReadyForPlanAsk.parts.find((part) => part.type === 'text')
    const answerAfterPlanAsk = nextLiveAnswerView(answerReadyForPlanAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askRound
    })
    expect(
      answerAfterPlanAsk.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloPlanAskPart)
    const answerAfterThinkAsk = nextLiveAnswerView(answerReadyForPlanAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenAsk
    })
    expect(
      answerAfterThinkAsk.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloPlanAskPart)
    let toolThenAsk = applyStreamChunk(afterPlanStatus, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 41
    })
    toolThenAsk = applyStreamChunk(toolThenAsk, { ...askNeeded, timestamp: 42 })
    const askResolvedOnly = applyStreamChunk(toolThenAsk, {
      type: 'user_input_resolved',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 43
    })
    expect(isLiveStatusSettleChange(toolThenAsk, askResolvedOnly)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(toolThenAsk, askResolvedOnly)).toBe('status')
    const askResolvedDone = applyStreamChunk(askResolvedOnly, {
      type: 'tool_done',
      toolName: REQUEST_USER_INPUT_TOOL,
      resultSummary: 'API style',
      timestamp: 44
    })
    expect(isLiveAskResolvedSettleChange(toolThenAsk, askResolvedDone)).toBe(true)
    expect(isLiveStatusSettleChange(toolThenAsk, askResolvedDone)).toBe(false)
    expect(shouldSkipLiveStreamDerivation(toolThenAsk, askResolvedDone)).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: toolThenAsk,
        segments: askResolvedDone
      })
    ).toBe(true)
    const processReadyForToolAskResolve = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: toolThenAsk
    })
    const processAfterAskResolveDone = nextLiveProcessView(processReadyForToolAskResolve, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askResolvedDone
    })
    expect(
      processAfterAskResolveDone.processForFlow.some(
        (segment) => segment.kind === 'tool' && segment.toolName === REQUEST_USER_INPUT_TOOL && segment.status === 'done'
      )
    ).toBe(true)
    expect(
      processAfterAskResolveDone.processForFlow.some(
        (segment) =>
          segment.kind === 'status' &&
          segment.toolName === REQUEST_USER_INPUT_TOOL &&
          segment.status === 'done'
      )
    ).toBe(true)
    const processReadyForDemoFence = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterDemoFence = nextLiveProcessView(processReadyForDemoFence, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: demoStreamed
    })
    expect(processAfterDemoFence.processForFlow.some((segment) => segment.kind === 'status')).toBe(true)
    expect(processAfterDemoFence.processForFlow.some((segment) => segment.kind === 'text')).toBe(false)
    const answerReadyForDemoFence = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloDemoFencePart = answerReadyForDemoFence.parts.find((part) => part.type === 'text')
    const answerAfterDemoFence = nextLiveAnswerView(answerReadyForDemoFence, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: demoStreamed
    })
    expect(
      answerAfterDemoFence.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloDemoFencePart)
    expect(answerAfterDemoFence.tail?.type).toBe('demo')
    const processReadyForTriple = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterTriple = nextLiveProcessView(processReadyForTriple, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: streamed
    })
    expect(processAfterTriple.processForFlow.some((segment) => segment.kind === 'status')).toBe(true)
    expect(processAfterTriple.thinkText).toBe(processReadyForTriple.thinkText + 'Next')
    expect(processAfterTriple.answerStreaming).toBe(true)
    const answerReadyForTriple = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloTriplePart = answerReadyForTriple.parts.find((part) => part.type === 'text')
    const answerAfterTriple = nextLiveAnswerView(answerReadyForTriple, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: streamed
    })
    expect(
      answerAfterTriple.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloTriplePart)
    expect(answerAfterTriple.tail?.content).toBe('Hi')
    const processReadyForWritePair = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatStatusThink = nextLiveProcessView(processReadyForWritePair, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, reconnectStatus, nextThink]
    })
    expect(processAfterWriteStatStatusThink.processForFlow.some((segment) => segment === ranDiff)).toBe(
      true
    )
    expect(
      processAfterWriteStatStatusThink.processForFlow.some((segment) => segment === reconnectStatus)
    ).toBe(true)
    expect(processAfterWriteStatStatusThink.thinkText).toBe(processReadyForWritePair.thinkText + 'Next')
    const answerReadyForWritePair = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloWritePairPart = answerReadyForWritePair.parts.find((part) => part.type === 'text')
    const answerAfterWriteStatThinkAnswer = nextLiveAnswerView(answerReadyForWritePair, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, nextThink, firstReply]
    })
    expect(
      answerAfterWriteStatThinkAnswer.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloWritePairPart)
    expect(answerAfterWriteStatThinkAnswer.tail?.content).toBe('Hi')
    const processReadyForSettlePair = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterSettleStatusThink = nextLiveProcessView(processReadyForSettlePair, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, reconnectStatus, nextThink]
    })
    expect(processAfterSettleStatusThink.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(
      processAfterSettleStatusThink.processForFlow.some((segment) => segment === reconnectStatus)
    ).toBe(true)
    expect(processAfterSettleStatusThink.thinkText).toBe(processReadyForSettlePair.thinkText + 'Next')
    const answerReadyForSettlePair = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloSettlePairPart = answerReadyForSettlePair.parts.find((part) => part.type === 'text')
    const answerAfterSettleThinkAnswer = nextLiveAnswerView(answerReadyForSettlePair, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, nextThink, firstReply]
    })
    expect(
      answerAfterSettleThinkAnswer.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloSettlePairPart)
    expect(answerAfterSettleThinkAnswer.tail?.content).toBe('Hi')
    expect(isLiveWriteStatDemoFenceAppendChange([hello, running], [hello, ranDiff, demoStart])).toBe(true)
    expect(isLiveThinkAppendChange([hello, running], [hello, ranDiff, nextThink])).toBe(false)
    expect(isLiveAnswerAppendChange([hello, running], [hello, ranDiff, firstReply])).toBe(false)
    expect(isLiveDemoFenceAppendChange([hello, running], [hello, ranDiff, demoStart])).toBe(false)
    expect(isLiveStatusAppendChange([hello, running], [hello, ranDiff, reconnectStatus])).toBe(false)
    expect(isLiveToolAppendChange([hello, running], [hello, ranDiff, nextCmd])).toBe(false)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, reconnectStatus]
      })
    ).toBe(false)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, nextThink]
      })
    ).toBe(false)
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, firstReply]
      })
    ).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, reconnectStatus])).toBe(
      'status'
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, nextThink])).toBe('think')
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, firstReply])).toBe('text')
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, demoStart])).toBe('text')
    const processReadyForWriteStat = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatStatus = nextLiveProcessView(processReadyForWriteStat, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, reconnectStatus]
    })
    expect(processAfterWriteStatStatus.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatStatus.processForFlow.some((segment) => segment === reconnectStatus)).toBe(
      true
    )
    expect(processAfterWriteStatStatus.processForFlow.some((segment) => segment === running)).toBe(false)
    const processReadyForWriteStatThink = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatThink = nextLiveProcessView(processReadyForWriteStatThink, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, nextThink]
    })
    expect(processAfterWriteStatThink.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatThink.processForFlow.some((segment) => segment === nextThink)).toBe(false)
    expect(processAfterWriteStatThink.processForFlow.some((segment) => segment === running)).toBe(false)
    expect(processAfterWriteStatThink.thinkText).toBe(processReadyForWriteStatThink.thinkText + 'Next')
    const processReadyForWriteStatAnswer = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatAnswer = nextLiveProcessView(processReadyForWriteStatAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, firstReply]
    })
    expect(processAfterWriteStatAnswer.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatAnswer.processForFlow.some((segment) => segment === firstReply)).toBe(
      false
    )
    expect(processAfterWriteStatAnswer.contentStreaming).toBe(true)
    expect(processAfterWriteStatAnswer.answerStreaming).toBe(true)
    const answerReadyForWriteStat = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloWritePart = answerReadyForWriteStat.parts.find((part) => part.type === 'text')
    const answerAfterWriteStatReply = nextLiveAnswerView(answerReadyForWriteStat, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, firstReply]
    })
    expect(answerAfterWriteStatReply.parts.find((part) => part.type === 'text' && part.id === hello.id)).toBe(
      helloWritePart
    )
    expect(answerAfterWriteStatReply.tail?.content).toBe('Hi')
    const processReadyForWriteStatFence = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatFence = nextLiveProcessView(processReadyForWriteStatFence, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, demoStart]
    })
    expect(processAfterWriteStatFence.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatFence.processForFlow.some((segment) => segment === demoStart)).toBe(false)
    expect(processAfterWriteStatFence.generatingDemo).toBe(true)
    expect(isLiveWriteStatDemoAppendChange([hello, running], [hello, ranDiff, inlineDemo])).toBe(true)
    expect(isLiveDemoAppendChange([hello, running], [hello, ranDiff, inlineDemo])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, inlineDemo])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, inlineDemo]
      })
    ).toBe(false)
    const processReadyForWriteStatDemo = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatDemo = nextLiveProcessView(processReadyForWriteStatDemo, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, inlineDemo]
    })
    expect(processAfterWriteStatDemo.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatDemo.processForFlow.some((segment) => segment === inlineDemo)).toBe(false)
    expect(processAfterWriteStatDemo.generatingDemo).toBe(true)
    const compactStatus: TurnSegment = {
      id: 'compact-1',
      kind: 'status',
      status: 'active',
      content: 'Automatically compacting context'
    }
    expect(isLiveStatusAppendChange([ran], [ran, compactStatus])).toBe(true)
    const compactStatusDone: TurnSegment = { ...compactStatus, status: 'done' }
    const compressTool: TurnSegment = {
      id: 'cp-live',
      kind: 'tool',
      toolName: 'compress',
      toolTitle: 'Context automatically compacted',
      status: 'done'
    }
    expect(isLiveCompressAppendChange([ran, compactStatus], [ran, compactStatusDone, compressTool])).toBe(
      true
    )
    expect(isLiveCompressAppendChange([ran], [ran, compressTool])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([ran, compactStatus], [ran, compactStatusDone, compressTool])).toBe(
      'tool'
    )
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [ran, compactStatus],
        segments: [ran, compactStatusDone, compressTool]
      })
    ).toBe(true)
    const processReadyForCompress = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, compactStatus]
    })
    const processAfterCompressTool = nextLiveProcessView(processReadyForCompress, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, compactStatusDone, compressTool]
    })
    expect(processAfterCompressTool.processForFlow.some((segment) => segment === compactStatusDone)).toBe(
      true
    )
    expect(processAfterCompressTool.processForFlow.some((segment) => segment === compressTool)).toBe(true)
    const processReadyForCompact = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran]
    })
    const processAfterCompact = nextLiveProcessView(processReadyForCompact, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, compactStatus]
    })
    expect(processAfterCompact.processForFlow.some((segment) => segment === compactStatus)).toBe(true)
    expect(isLiveWriteStatCompressAppendChange([hello, running], [hello, ranDiff, compressTool])).toBe(
      true
    )
    expect(isLiveCompressAppendChange([hello, running], [hello, ranDiff, compressTool])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, compressTool])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, compressTool]
      })
    ).toBe(false)
    const processReadyForWriteStatCompress = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatCompress = nextLiveProcessView(processReadyForWriteStatCompress, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, compressTool]
    })
    expect(processAfterWriteStatCompress.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatCompress.processForFlow.some((segment) => segment === compressTool)).toBe(
      true
    )
    expect(processAfterWriteStatCompress.processForFlow.some((segment) => segment === running)).toBe(false)
    expect(isLiveCompressAppendChange([hello, running], [hello, ran, compressTool])).toBe(true)
    expect(isLiveCompressAppendChange([hello, running, compactStatus], [hello, ran, compactStatusDone, compressTool])).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ran, compressTool])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran, compressTool]
      })
    ).toBe(true)
    const processReadyForSettleCompress = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterSettleCompress = nextLiveProcessView(processReadyForSettleCompress, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, compressTool]
    })
    expect(processAfterSettleCompress.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processAfterSettleCompress.processForFlow.some((segment) => segment === compressTool)).toBe(true)
    expect(processAfterSettleCompress.processForFlow.some((segment) => segment === running)).toBe(false)
    const runningCmd: TurnSegment = {
      id: 'run-appr',
      kind: 'tool',
      toolName: 'run_terminal_cmd',
      status: 'active',
      toolArgs: { command: 'rm -rf /tmp/x' }
    }
    const approvalReq = {
      id: 'appr-1',
      title: '执行命令',
      description: 'rm -rf /tmp/x',
      toolName: 'run_terminal_cmd',
      args: { command: 'rm -rf /tmp/x' }
    }
    const cmdAwaiting: TurnSegment = { ...runningCmd, approval: approvalReq }
    const awaitingStatus: TurnSegment = {
      id: 'st-appr',
      kind: 'status',
      status: 'active',
      content: 'Awaiting approval · 执行命令',
      toolName: 'run_terminal_cmd'
    }
    expect(isLiveApprovalNeededChange([runningCmd], [cmdAwaiting, awaitingStatus])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([runningCmd], [cmdAwaiting, awaitingStatus])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [runningCmd],
        segments: [cmdAwaiting, awaitingStatus]
      })
    ).toBe(true)
    const processReadyForApproval = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [runningCmd]
    })
    const processAfterApproval = nextLiveProcessView(processReadyForApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAwaiting, awaitingStatus]
    })
    expect(processAfterApproval.processForFlow.some((segment) => segment === cmdAwaiting)).toBe(true)
    expect(processAfterApproval.processForFlow.some((segment) => segment === awaitingStatus)).toBe(true)
    const answerReadyForApproval = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [runningCmd]
    })
    expect(
      nextLiveAnswerView(answerReadyForApproval, {
        ...EMPTY_LIVE_STREAM_UI,
        liveSegments: [cmdAwaiting, awaitingStatus]
      })
    ).toBe(answerReadyForApproval)
    expect(isLiveToolAppendChange([hello, ran], [hello, ran, cmdAwaiting, awaitingStatus])).toBe(true)
    expect(isLiveApprovalNeededChange([hello, ran], [hello, ran, cmdAwaiting, awaitingStatus])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, ran], [hello, ran, cmdAwaiting, awaitingStatus])).toBe(
      'tool'
    )
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, ran],
        segments: [hello, ran, cmdAwaiting, awaitingStatus]
      })
    ).toBe(true)
    const processReadyForToolApproval = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran]
    })
    const processAfterToolApproval = nextLiveProcessView(processReadyForToolApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, cmdAwaiting, awaitingStatus]
    })
    expect(processAfterToolApproval.processForFlow.some((segment) => segment === cmdAwaiting)).toBe(true)
    expect(processAfterToolApproval.processForFlow.some((segment) => segment === awaitingStatus)).toBe(
      true
    )
    expect(isLiveToolAppendChange([hello, running], [hello, ran, cmdAwaiting, awaitingStatus])).toBe(true)
    expect(isLiveToolWriteStatAppendChange([hello, running], [hello, ranDiff, cmdAwaiting, awaitingStatus])).toBe(
      true
    )
    expect(isLiveToolAppendChange([hello, running], [hello, ranDiff, cmdAwaiting, awaitingStatus])).toBe(
      false
    )
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, cmdAwaiting, awaitingStatus]
      })
    ).toBe(false)
    const processReadyForWriteStatApproval = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatApproval = nextLiveProcessView(processReadyForWriteStatApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, cmdAwaiting, awaitingStatus]
    })
    expect(processAfterWriteStatApproval.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatApproval.processForFlow.some((segment) => segment === cmdAwaiting)).toBe(
      true
    )
    expect(processAfterWriteStatApproval.processForFlow.some((segment) => segment === awaitingStatus)).toBe(
      true
    )
    const awaitingDone: TurnSegment = {
      ...awaitingStatus,
      status: 'done',
      content: '已确认，继续执行'
    }
    const cmdApproved: TurnSegment = { ...runningCmd }
    expect(isLiveApprovalResolvedChange([cmdAwaiting, awaitingStatus], [cmdApproved, awaitingDone])).toBe(
      true
    )
    expect(
      shouldSkipLiveStreamDerivation([cmdAwaiting, awaitingStatus], [cmdApproved, awaitingDone])
    ).toBe('tool')
    const processAfterResolved = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdApproved, awaitingDone]
    })
    expect(processAfterResolved.processForFlow.some((segment) => segment === cmdApproved)).toBe(true)
    expect(processAfterResolved.processForFlow.some((segment) => segment === awaitingDone)).toBe(true)
    const askTool: TurnSegment = {
      id: 'ask-1',
      kind: 'tool',
      toolName: 'request_user_input',
      status: 'active',
      toolTitle: 'Question requested'
    }
    const askReady: TurnSegment = { ...askTool, toolTitle: 'Scope', toolDetail: 'Scope' }
    const askStatus: TurnSegment = {
      id: 'st-ask',
      kind: 'status',
      status: 'active',
      content: 'Scope',
      toolName: 'request_user_input'
    }
    expect(isLiveUserInputNeededChange([askTool], [askReady, askStatus])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([askTool], [askReady, askStatus])).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [askTool],
        segments: [askReady, askStatus]
      })
    ).toBe(true)
    const processReadyForAsk = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [askTool]
    })
    const processAfterAsk = nextLiveProcessView(processReadyForAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [askReady, askStatus]
    })
    expect(processAfterAsk.processForFlow.some((segment) => segment === askReady)).toBe(true)
    expect(processAfterAsk.processForFlow.some((segment) => segment === askStatus)).toBe(true)
    const answerReadyForAsk = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [askTool]
    })
    expect(
      nextLiveAnswerView(answerReadyForAsk, {
        ...EMPTY_LIVE_STREAM_UI,
        liveSegments: [askReady, askStatus]
      })
    ).toBe(answerReadyForAsk)
    expect(isLiveToolAppendChange([hello, ran], [hello, ran, askReady, askStatus])).toBe(true)
    expect(isLiveUserInputNeededChange([hello, ran], [hello, ran, askReady, askStatus])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, ran], [hello, ran, askReady, askStatus])).toBe('tool')
    const processReadyForToolAsk = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran]
    })
    const processAfterToolAsk = nextLiveProcessView(processReadyForToolAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, askReady, askStatus]
    })
    expect(processAfterToolAsk.processForFlow.some((segment) => segment === askReady)).toBe(true)
    expect(processAfterToolAsk.processForFlow.some((segment) => segment === askStatus)).toBe(true)
    const askStatusDone: TurnSegment = { ...askStatus, status: 'done' }
    expect(isLiveStatusSettleChange([askReady, askStatus], [askReady, askStatusDone])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([askReady, askStatus], [askReady, askStatusDone])).toBe(
      'status'
    )
    const processAfterAskDone = nextLiveProcessView(processAfterAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [askReady, askStatusDone]
    })
    expect(processAfterAskDone.processForFlow.some((segment) => segment === askStatusDone)).toBe(true)
    const askToolDone: TurnSegment = { ...askReady, status: 'done', resultSummary: 'Scope' }
    expect(isLiveAskResolvedSettleChange([askReady, askStatus], [askToolDone, askStatusDone])).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([askReady, askStatus], [askToolDone, askStatusDone])).toBe(
      'tool'
    )
    const processAfterAskResolveDoneReady = nextLiveProcessView(processAfterAsk, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [askToolDone, askStatusDone]
    })
    expect(processAfterAskResolveDoneReady.processForFlow.some((segment) => segment === askToolDone)).toBe(
      true
    )
    expect(
      processAfterAskResolveDoneReady.processForFlow.some((segment) => segment === askStatusDone)
    ).toBe(true)
    const runningToCancel: TurnSegment = {
      id: 'run-stop',
      kind: 'tool',
      toolName: 'read_file',
      status: 'active',
      toolDetail: 'src/a.ts'
    }
    const thinkToCancel: TurnSegment = {
      id: 'th-stop',
      kind: 'thinking',
      content: 'Hmm',
      status: 'active'
    }
    const cancelledCmd: TurnSegment = {
      ...runningToCancel,
      status: 'cancelled',
      errorMessage: '任务已停止',
      resultSummary: '已停止'
    }
    const cancelledThink: TurnSegment = { ...thinkToCancel, status: 'cancelled' }
    expect(
      isLiveCancelChange(
        [hello, runningToCancel, thinkToCancel],
        [hello, cancelledCmd, cancelledThink]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [hello, runningToCancel, thinkToCancel],
        [hello, cancelledCmd, cancelledThink]
      )
    ).toBe('tool')
    const processReadyForCancel = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, runningToCancel, thinkToCancel]
    })
    const processAfterCancel = nextLiveProcessView(processReadyForCancel, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, cancelledCmd, cancelledThink]
    })
    expect(processAfterCancel.processForFlow.some((segment) => segment === cancelledCmd)).toBe(true)
    expect(processAfterCancel.processForFlow.some((segment) => segment === runningToCancel)).toBe(false)
    const errorStatus: TurnSegment = {
      id: 'st-err',
      kind: 'status',
      status: 'active',
      content: 'Working'
    }
    const errorStatusDone: TurnSegment = { ...errorStatus, status: 'done' }
    const errorText: TurnSegment = {
      id: 'err-1',
      kind: 'text',
      status: 'done',
      role: 'final',
      content: '**错误**: boom'
    }
    expect(isLiveErrorAppendChange([ran, errorStatus], [ran, errorStatusDone, errorText])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([ran, errorStatus], [ran, errorStatusDone, errorText])).toBe(
      'text'
    )
    const processReadyForError = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, errorStatus]
    })
    const processAfterError = nextLiveProcessView(processReadyForError, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ran, errorStatusDone, errorText]
    })
    expect(processAfterError.processForFlow.some((segment) => segment === errorStatusDone)).toBe(true)
    expect(processAfterError.processForFlow.some((segment) => segment === errorText)).toBe(false)
    expect(isLiveWriteStatErrorAppendChange([hello, running], [hello, ranDiff, errorText])).toBe(true)
    expect(isLiveErrorAppendChange([hello, running], [hello, ranDiff, errorText])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ranDiff, errorText])).toBe('text')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ranDiff, errorText]
      })
    ).toBe(false)
    const processReadyForWriteStatError = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterWriteStatError = nextLiveProcessView(processReadyForWriteStatError, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ranDiff, errorText]
    })
    expect(processAfterWriteStatError.processForFlow.some((segment) => segment === ranDiff)).toBe(true)
    expect(processAfterWriteStatError.processForFlow.some((segment) => segment === errorText)).toBe(false)
    expect(processAfterWriteStatError.processForFlow.some((segment) => segment === running)).toBe(false)
    expect(isLiveErrorAppendChange([hello, running], [hello, ran, errorText])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], [hello, ran, errorText])).toBe('text')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: [hello, ran, errorText]
      })
    ).toBe(false)
    const processReadyForSettleError = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterSettleError = nextLiveProcessView(processReadyForSettleError, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, ran, errorText]
    })
    expect(processAfterSettleError.processForFlow.some((segment) => segment === ran)).toBe(true)
    expect(processAfterSettleError.processForFlow.some((segment) => segment === errorText)).toBe(false)
    expect(processAfterSettleError.processForFlow.some((segment) => segment === running)).toBe(false)
    const liveReply: TurnSegment = { id: 'reply-err', kind: 'text', status: 'active', content: 'Hi' }
    const liveReplyErr: TurnSegment = {
      ...liveReply,
      status: 'done',
      content: 'Hi\n\n**错误**: boom'
    }
    expect(isLiveErrorAppendChange([ran, liveReply], [ran, liveReplyErr])).toBe(true)
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
