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
  isLiveSettledToolAppendChange,
  isLiveThinkSettledToolAppendChange,
  isLiveStatusThinkSettledToolAppendChange,
  isLiveAnswerSettledToolAppendChange,
  isLiveWriteStatSettledToolAppendChange,
  isLiveAnswerDemoAppendChange,
  isLiveThinkAnswerSettledToolAppendChange,
  isLiveStatusThinkAnswerSettledToolAppendChange,
  isLiveThinkAnswerDemoAppendChange,
  isLiveWriteStatThinkSettledToolAppendChange,
  isLiveWriteStatAnswerSettledToolAppendChange,
  isLiveWriteStatThinkAnswerSettledToolAppendChange,
  isLiveWriteStatThinkAnswerDemoAppendChange,
  isLiveWriteStatAnswerDemoAppendChange,
  isLiveWriteStatStatusThinkAnswerSettledToolAppendChange,
  isLiveWriteStatStatusThinkSettledToolAppendChange,
  isLiveWriteStatStatusAnswerSettledToolAppendChange,
  isLiveWriteStatStatusThinkAnswerDemoAppendChange,
  isLiveWriteStatStatusAnswerDemoAppendChange,
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
  isLiveApprovalDeniedSettleChange,
  isLiveApprovalDeniedStatusAppendChange,
  isLiveApprovalDeniedToolAppendChange,
  isLiveApprovalAllowedWriteStatChange,
  isLiveApprovalAllowedWriteStatStatusAppendChange,
  isLiveApprovalAllowedWriteStatToolAppendChange,
  isLiveApprovalAllowedSettleChange,
  isLiveApprovalAllowedStatusAppendChange,
  isLiveApprovalAllowedToolAppendChange,
  isLiveApprovalAllowedThinkAppendChange,
  isLiveApprovalAllowedAnswerAppendChange,
  isLiveApprovalAllowedThinkAnswerAppendChange,
  isLiveApprovalAllowedThinkSettledToolAppendChange,
  isLiveApprovalAllowedAnswerSettledToolAppendChange,
  isLiveApprovalAllowedThinkAnswerSettledToolAppendChange,
  isLiveApprovalAllowedAnswerDemoAppendChange,
  isLiveApprovalAllowedThinkAnswerDemoAppendChange,
  isLiveApprovalAllowedWriteStatThinkAppendChange,
  isLiveApprovalAllowedWriteStatAnswerAppendChange,
  isLiveApprovalAllowedWriteStatThinkAnswerAppendChange,
  isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange,
  isLiveApprovalAllowedWriteStatAnswerSettledToolAppendChange,
  isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange,
  isLiveApprovalAllowedWriteStatAnswerDemoAppendChange,
  isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange,
  isLiveApprovalResolvedThinkAppendChange,
  isLiveApprovalResolvedThinkAnswerAppendChange,
  isLiveApprovalResolvedThinkErrorAppendChange,
  isLiveApprovalResolvedThinkAnswerDemoAppendChange,
  isLiveApprovalResolvedThinkAnswerCompressAppendChange,
  isLiveApprovalResolvedAnswerDemoCompressAppendChange,
  isLiveApprovalResolvedThinkSettledToolAppendChange,
  isLiveApprovalResolvedSettledToolAppendChange,
  isLiveApprovalResolvedToolAppendChange,
  isLiveApprovalResolvedAnswerAppendChange,
  isLiveApprovalResolvedErrorAppendChange,
  isLiveApprovalResolvedAnswerDemoAppendChange,
  isLiveApprovalResolvedThinkCompressAppendChange,
  isLiveApprovalResolvedAnswerCompressAppendChange,
  isLiveApprovalResolvedThinkCancelAppendChange,
  isLiveApprovalDeniedSettleCancelChange,
  isLiveApprovalAllowedSettleThinkCancelAppendChange,
  isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange,
  isLiveApprovalAllowedCompressAppendChange,
  isLiveApprovalAllowedCancelChange,
  isLiveApprovalDeniedCompressAppendChange,
  isLiveWriteStatApprovalResolvedThinkCompressAppendChange,
  isLiveWriteStatApprovalResolvedAnswerAppendChange,
  isLiveWriteStatApprovalResolvedErrorAppendChange,
  isLiveWriteStatApprovalResolvedAnswerDemoAppendChange,
  isLiveWriteStatApprovalResolvedThinkCancelAppendChange,
  isLiveStatusApprovalResolvedThinkCompressAppendChange,
  isLiveStatusApprovalResolvedAnswerAppendChange,
  isLiveStatusApprovalResolvedThinkCancelAppendChange,
  isLiveApprovalDeniedThinkAppendChange,
  isLiveApprovalDeniedAnswerAppendChange,
  isLiveApprovalDeniedThinkSettledToolAppendChange,
  isLiveApprovalDeniedAnswerSettledToolAppendChange,
  isLiveApprovalResolvedChange,
  isLiveUserInputNeededChange,
  isLiveAskResolvedSettleChange,
  isLiveAskResolvedCancelAppendChange,
  isLiveAskResolvedThinkCancelAppendChange,
  isLiveAskResolvedAnswerCancelAppendChange,
  isLiveAskResolvedAnswerDemoCompressAppendChange,
  isLiveAskNeededThinkAppendChange,
  isLiveAskNeededAnswerAppendChange,
  isLiveAskNeededThinkAnswerAppendChange,
  isLiveAskNeededThinkSettledToolAppendChange,
  isLiveAskNeededAnswerSettledToolAppendChange,
  isLiveAskNeededAnswerDemoAppendChange,
  isLiveAskNeededThinkAnswerDemoAppendChange,
  isLiveWriteStatAskNeededThinkAppendChange,
  isLiveWriteStatAskNeededAnswerAppendChange,
  isLiveWriteStatAskNeededThinkAnswerAppendChange,
  isLiveWriteStatAskNeededThinkSettledToolAppendChange,
  isLiveWriteStatAskNeededAnswerSettledToolAppendChange,
  isLiveWriteStatAskNeededAnswerDemoAppendChange,
  isLiveWriteStatAskNeededThinkAnswerDemoAppendChange,
  isLiveWriteStatStatusAskNeededThinkAppendChange,
  isLiveWriteStatStatusAskNeededAnswerAppendChange,
  isLiveWriteStatStatusAskNeededThinkAnswerAppendChange,
  isLiveWriteStatStatusAskNeededAnswerDemoAppendChange,
  isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange,
  isLiveAskNeededThinkAnswerSettledToolAppendChange,
  isLiveStatusAskNeededThinkAppendChange,
  isLiveStatusAskNeededAnswerAppendChange,
  isLiveStatusAskNeededThinkAnswerAppendChange,
  isLiveStatusAskNeededAnswerDemoAppendChange,
  isLiveStatusAskNeededThinkAnswerDemoAppendChange,
  isLiveStatusAskNeededThinkSettledToolAppendChange,
  isLiveStatusAskNeededAnswerSettledToolAppendChange,
  isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange,
  isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange,
  isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange,
  isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange,
  isLiveAskNeededCompressAppendChange,
  isLiveWriteStatAskNeededCompressAppendChange,
  isLiveWriteStatStatusAskNeededCompressAppendChange,
  isLiveStatusAskNeededCompressAppendChange,
  isLiveAskNeededCancelAppendChange,
  isLiveAskNeededThinkCancelAppendChange,
  isLiveWriteStatAskNeededCancelAppendChange,
  isLiveWriteStatStatusAskNeededCancelAppendChange,
  isLiveStatusAskNeededCancelAppendChange,
  isLiveWriteStatAskNeededThinkCancelAppendChange,
  isLiveWriteStatStatusAskNeededThinkCancelAppendChange,
  isLiveStatusAskNeededThinkCancelAppendChange,
  isLiveApprovalNeededThinkAppendChange,
  isLiveApprovalNeededAnswerAppendChange,
  isLiveApprovalNeededCompressAppendChange,
  isLiveApprovalNeededThinkCompressAppendChange,
  isLiveApprovalNeededErrorAppendChange,
  isLiveApprovalNeededAnswerDemoAppendChange,
  isLiveWriteStatApprovalNeededCompressAppendChange,
  isLiveWriteStatApprovalNeededCancelAppendChange,
  isLiveStatusApprovalNeededCompressAppendChange,
  isLiveStatusApprovalNeededCancelAppendChange,
  isLiveWriteStatApprovalResolvedCompressAppendChange,
  isLiveWriteStatApprovalResolvedCancelAppendChange,
  isLiveStatusApprovalResolvedCompressAppendChange,
  isLiveStatusApprovalResolvedCancelAppendChange,
  isLiveApprovalResolvedCompressAppendChange,
  isLiveApprovalResolvedCancelAppendChange,
  isLiveApprovalResolvedCancelChange,
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
    const settledRound = applyStreamChunk(nextRound, {
      type: 'tool_done',
      toolName: 'read_file',
      resultSummary: 'ok',
      timestamp: 20.5
    })
    expect(isLiveToolAppendChange(afterPlanStatus, settledRound)).toBe(false)
    expect(isLiveSettledToolAppendChange(afterPlanStatus, settledRound)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, settledRound)).toBe('tool')
    const answerReadyForSettledTool = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: afterPlanStatus
    })
    const helloSettledPart = answerReadyForSettledTool.parts.find(
      (part) => part.type === 'text' && part.id === hello.id
    )
    const answerAfterSettledTool = nextLiveAnswerView(answerReadyForSettledTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: settledRound
    })
    expect(
      answerAfterSettledTool.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloSettledPart)
    const blockedRound = applyStreamChunk(afterPlanStatus, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'blocked-1',
      timestamp: 20.6
    })
    const blockedDone = applyStreamChunk(blockedRound, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      toolCallId: 'blocked-1',
      toolStatus: 'error',
      error: 'blocked',
      timestamp: 20.7
    })
    expect(isLiveSettledToolAppendChange(afterPlanStatus, blockedDone)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, blockedDone)).toBe('tool')
    const helloOnlySettled = applyStreamChunk(
      applyStreamChunk([hello], {
        type: 'tool_start',
        toolName: 'read_file',
        toolCallId: 'fast-1',
        timestamp: 20.8
      }),
      {
        type: 'tool_done',
        toolName: 'read_file',
        toolCallId: 'fast-1',
        resultSummary: 'ok',
        timestamp: 20.9
      }
    )
    expect(isLiveSettledToolAppendChange([hello], helloOnlySettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], helloOnlySettled)).toBe('tool')
    let thinkThenSettled = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 21.1 })
    thinkThenSettled = applyStreamChunk(thinkThenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'think-settle-1',
      timestamp: 21.2
    })
    thinkThenSettled = applyStreamChunk(thinkThenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'think-settle-1',
      resultSummary: 'ok',
      timestamp: 21.3
    })
    expect(isLiveThinkToolAppendChange(afterPlanStatus, thinkThenSettled)).toBe(false)
    expect(isLiveThinkSettledToolAppendChange(afterPlanStatus, thinkThenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, thinkThenSettled)).toBe('tool')
    expect(nextLiveThinkText('Hmm', afterPlanStatus, thinkThenSettled)).toBe('HmmNext')
    let tokenThenSettled = applyStreamChunk(afterPlanStatus, { type: 'token', content: 'Hi', timestamp: 21.4 })
    tokenThenSettled = applyStreamChunk(tokenThenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'token-settle-1',
      timestamp: 21.5
    })
    tokenThenSettled = applyStreamChunk(tokenThenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'token-settle-1',
      resultSummary: 'ok',
      timestamp: 21.6
    })
    expect(isLiveAnswerSettledToolAppendChange(afterPlanStatus, tokenThenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, tokenThenSettled)).toBe('text')
    const answerAfterTokenSettled = nextLiveAnswerView(answerReadyForSettledTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: tokenThenSettled
    })
    expect(
      answerAfterTokenSettled.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloSettledPart)
    expect(answerAfterTokenSettled.parts.some((part) => part.type === 'text' && part.content === 'Hi')).toBe(
      true
    )
    const writeThenSettledNext = applyStreamChunk(
      applyStreamChunk([hello, running], {
        type: 'tool_done',
        toolName: 'run_terminal_cmd',
        fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
        timestamp: 21.7
      }),
      {
        type: 'tool_start',
        toolName: 'read_file',
        toolCallId: 'write-settle-1',
        timestamp: 21.8
      }
    )
    const writeThenSettledDone = applyStreamChunk(writeThenSettledNext, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'write-settle-1',
      resultSummary: 'ok',
      timestamp: 21.9
    })
    expect(isLiveWriteStatSettledToolAppendChange([hello, running], writeThenSettledDone)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writeThenSettledDone)).toBe('tool')
    let demoWithFence = applyStreamChunk([hello], {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 22.1
    })
    demoWithFence = applyStreamChunk(demoWithFence, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 22.2
    })
    expect(isLiveAnswerDemoAppendChange([hello], demoWithFence)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], demoWithFence)).toBe('tool')
    let thinkTokenSettled = applyStreamChunk(afterPlanStatus, { type: 'think', content: 'Next', timestamp: 22.3 })
    thinkTokenSettled = applyStreamChunk(thinkTokenSettled, { type: 'token', content: 'Hi', timestamp: 22.4 })
    thinkTokenSettled = applyStreamChunk(thinkTokenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'think-token-settle-1',
      timestamp: 22.5
    })
    thinkTokenSettled = applyStreamChunk(thinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 22.6
    })
    expect(isLiveThinkAnswerAppendChange(afterPlanStatus, thinkTokenSettled)).toBe(false)
    expect(isLiveThinkSettledToolAppendChange(afterPlanStatus, thinkTokenSettled)).toBe(false)
    expect(isLiveAnswerSettledToolAppendChange(afterPlanStatus, thinkTokenSettled)).toBe(false)
    expect(isLiveThinkAnswerSettledToolAppendChange(afterPlanStatus, thinkTokenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, thinkTokenSettled)).toBe('text')
    expect(nextLiveThinkText('Hmm', afterPlanStatus, thinkTokenSettled)).toBe('HmmNext')
    const answerAfterThinkTokenSettled = nextLiveAnswerView(answerReadyForSettledTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkTokenSettled
    })
    expect(
      answerAfterThinkTokenSettled.parts.find((part) => part.type === 'text' && part.id === hello.id)
    ).toBe(helloSettledPart)
    expect(answerAfterThinkTokenSettled.parts.some((part) => part.type === 'text' && part.content === 'Hi')).toBe(
      true
    )
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerReadyForSettledTool,
        prevSegments: afterPlanStatus,
        segments: thinkTokenSettled
      })
    ).toBe(false)
    let statusThinkTokenSettled = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'exit 0',
      timestamp: 22.61
    })
    statusThinkTokenSettled = applyStreamChunk(statusThinkTokenSettled, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 22.62
    })
    statusThinkTokenSettled = applyStreamChunk(statusThinkTokenSettled, {
      type: 'think',
      content: 'Next',
      timestamp: 22.63
    })
    statusThinkTokenSettled = applyStreamChunk(statusThinkTokenSettled, {
      type: 'token',
      content: 'Hi',
      timestamp: 22.64
    })
    statusThinkTokenSettled = applyStreamChunk(statusThinkTokenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'status-think-token-settle-1',
      timestamp: 22.65
    })
    statusThinkTokenSettled = applyStreamChunk(statusThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'status-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 22.66
    })
    expect(isLiveStatusThinkAnswerAppendChange([hello, running], statusThinkTokenSettled)).toBe(false)
    expect(isLiveStatusThinkAnswerSettledToolAppendChange([hello, running], statusThinkTokenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], statusThinkTokenSettled)).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello, running], statusThinkTokenSettled)).toBe('HmmNext')
    let thinkDemoFenceTool = applyStreamChunk(afterPlanStatus, {
      type: 'think',
      content: 'Next',
      timestamp: 22.7
    })
    thinkDemoFenceTool = applyStreamChunk(thinkDemoFenceTool, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 22.8
    })
    thinkDemoFenceTool = applyStreamChunk(thinkDemoFenceTool, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 22.9
    })
    expect(isLiveThinkDemoAppendChange(afterPlanStatus, thinkDemoFenceTool)).toBe(false)
    expect(isLiveAnswerDemoAppendChange(afterPlanStatus, thinkDemoFenceTool)).toBe(false)
    expect(isLiveThinkAnswerDemoAppendChange(afterPlanStatus, thinkDemoFenceTool)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, thinkDemoFenceTool)).toBe('tool')
    expect(nextLiveThinkText('Hmm', afterPlanStatus, thinkDemoFenceTool)).toBe('HmmNext')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerReadyForSettledTool,
        prevSegments: afterPlanStatus,
        segments: thinkDemoFenceTool
      })
    ).toBe(false)
    let writeThinkSettled = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 23.1
    })
    writeThinkSettled = applyStreamChunk(writeThinkSettled, { type: 'think', content: 'Next', timestamp: 23.2 })
    writeThinkSettled = applyStreamChunk(writeThinkSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'write-think-settle-1',
      timestamp: 23.3
    })
    writeThinkSettled = applyStreamChunk(writeThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'write-think-settle-1',
      resultSummary: 'ok',
      timestamp: 23.4
    })
    expect(isLiveWriteStatThinkToolAppendChange([hello, running], writeThinkSettled)).toBe(false)
    expect(isLiveWriteStatThinkSettledToolAppendChange([hello, running], writeThinkSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writeThinkSettled)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], writeThinkSettled)).toBe('HmmNext')
    let writeTokenSettled = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 23.5
    })
    writeTokenSettled = applyStreamChunk(writeTokenSettled, { type: 'token', content: 'Hi', timestamp: 23.6 })
    writeTokenSettled = applyStreamChunk(writeTokenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'write-token-settle-1',
      timestamp: 23.7
    })
    writeTokenSettled = applyStreamChunk(writeTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'write-token-settle-1',
      resultSummary: 'ok',
      timestamp: 23.8
    })
    expect(isLiveWriteStatAnswerAppendChange([hello, running], writeTokenSettled)).toBe(false)
    expect(isLiveWriteStatAnswerSettledToolAppendChange([hello, running], writeTokenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writeTokenSettled)).toBe('text')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: writeTokenSettled
      })
    ).toBe(false)
    let writeThinkTokenSettled = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 24.1
    })
    writeThinkTokenSettled = applyStreamChunk(writeThinkTokenSettled, {
      type: 'think',
      content: 'Next',
      timestamp: 24.2
    })
    writeThinkTokenSettled = applyStreamChunk(writeThinkTokenSettled, {
      type: 'token',
      content: 'Hi',
      timestamp: 24.3
    })
    writeThinkTokenSettled = applyStreamChunk(writeThinkTokenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'write-think-token-settle-1',
      timestamp: 24.4
    })
    writeThinkTokenSettled = applyStreamChunk(writeThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'write-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 24.5
    })
    expect(isLiveWriteStatThinkAnswerAppendChange([hello, running], writeThinkTokenSettled)).toBe(false)
    expect(isLiveWriteStatThinkAnswerSettledToolAppendChange([hello, running], writeThinkTokenSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], writeThinkTokenSettled)).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello, running], writeThinkTokenSettled)).toBe('HmmNext')
    let writeThinkDemo = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 24.6
    })
    writeThinkDemo = applyStreamChunk(writeThinkDemo, { type: 'think', content: 'Next', timestamp: 24.7 })
    writeThinkDemo = applyStreamChunk(writeThinkDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 24.8
    })
    writeThinkDemo = applyStreamChunk(writeThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 24.9
    })
    expect(isLiveWriteStatThinkDemoAppendChange([hello, running], writeThinkDemo)).toBe(false)
    expect(isLiveWriteStatThinkAnswerDemoAppendChange([hello, running], writeThinkDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writeThinkDemo)).toBe('tool')
    let writeFenceDemo = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 25.1
    })
    writeFenceDemo = applyStreamChunk(writeFenceDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 25.2
    })
    writeFenceDemo = applyStreamChunk(writeFenceDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 25.3
    })
    expect(isLiveWriteStatDemoAppendChange([hello, running], writeFenceDemo)).toBe(false)
    expect(isLiveWriteStatAnswerDemoAppendChange([hello, running], writeFenceDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writeFenceDemo)).toBe('tool')
    let writePlanThinkTokenSettled = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 25.4
    })
    writePlanThinkTokenSettled = applyStreamChunk(writePlanThinkTokenSettled, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 25.5
    })
    writePlanThinkTokenSettled = applyStreamChunk(writePlanThinkTokenSettled, {
      type: 'think',
      content: 'Next',
      timestamp: 25.6
    })
    writePlanThinkTokenSettled = applyStreamChunk(writePlanThinkTokenSettled, {
      type: 'token',
      content: 'Hi',
      timestamp: 25.7
    })
    writePlanThinkTokenSettled = applyStreamChunk(writePlanThinkTokenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'write-plan-think-token-settle-1',
      timestamp: 25.8
    })
    writePlanThinkTokenSettled = applyStreamChunk(writePlanThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'write-plan-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 25.9
    })
    expect(
      isLiveWriteStatStatusThinkAnswerAppendChange([hello, running], writePlanThinkTokenSettled)
    ).toBe(false)
    expect(
      isLiveWriteStatStatusThinkAnswerSettledToolAppendChange([hello, running], writePlanThinkTokenSettled)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writePlanThinkTokenSettled)).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello, running], writePlanThinkTokenSettled)).toBe('HmmNext')
    let writePlanThinkSettled = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 26.1
    })
    writePlanThinkSettled = applyStreamChunk(writePlanThinkSettled, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 26.2
    })
    writePlanThinkSettled = applyStreamChunk(writePlanThinkSettled, {
      type: 'think',
      content: 'Next',
      timestamp: 26.3
    })
    writePlanThinkSettled = applyStreamChunk(writePlanThinkSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'write-plan-think-settle-1',
      timestamp: 26.4
    })
    writePlanThinkSettled = applyStreamChunk(writePlanThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'write-plan-think-settle-1',
      resultSummary: 'ok',
      timestamp: 26.5
    })
    expect(isLiveWriteStatStatusThinkToolAppendChange([hello, running], writePlanThinkSettled)).toBe(false)
    expect(isLiveWriteStatStatusThinkSettledToolAppendChange([hello, running], writePlanThinkSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], writePlanThinkSettled)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], writePlanThinkSettled)).toBe('HmmNext')
    let writePlanTokenSettled = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 26.6
    })
    writePlanTokenSettled = applyStreamChunk(writePlanTokenSettled, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 26.7
    })
    writePlanTokenSettled = applyStreamChunk(writePlanTokenSettled, {
      type: 'token',
      content: 'Hi',
      timestamp: 26.8
    })
    writePlanTokenSettled = applyStreamChunk(writePlanTokenSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'write-plan-token-settle-1',
      timestamp: 26.9
    })
    writePlanTokenSettled = applyStreamChunk(writePlanTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'write-plan-token-settle-1',
      resultSummary: 'ok',
      timestamp: 27.1
    })
    expect(isLiveWriteStatStatusAnswerAppendChange([hello, running], writePlanTokenSettled)).toBe(false)
    expect(isLiveWriteStatStatusAnswerSettledToolAppendChange([hello, running], writePlanTokenSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], writePlanTokenSettled)).toBe('text')
    let writePlanThinkDemo = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 27.2
    })
    writePlanThinkDemo = applyStreamChunk(writePlanThinkDemo, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 27.3
    })
    writePlanThinkDemo = applyStreamChunk(writePlanThinkDemo, {
      type: 'think',
      content: 'Next',
      timestamp: 27.4
    })
    writePlanThinkDemo = applyStreamChunk(writePlanThinkDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 27.5
    })
    writePlanThinkDemo = applyStreamChunk(writePlanThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 27.6
    })
    expect(isLiveWriteStatStatusThinkDemoAppendChange([hello, running], writePlanThinkDemo)).toBe(false)
    expect(isLiveWriteStatStatusThinkAnswerDemoAppendChange([hello, running], writePlanThinkDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writePlanThinkDemo)).toBe('tool')
    let writePlanDemo = applyStreamChunk([hello, running], {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add', content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 27.7
    })
    writePlanDemo = applyStreamChunk(writePlanDemo, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 27.8
    })
    writePlanDemo = applyStreamChunk(writePlanDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 27.9
    })
    writePlanDemo = applyStreamChunk(writePlanDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 28.1
    })
    expect(isLiveWriteStatStatusDemoAppendChange([hello, running], writePlanDemo)).toBe(false)
    expect(isLiveWriteStatStatusAnswerDemoAppendChange([hello, running], writePlanDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], writePlanDemo)).toBe('tool')
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
    const processAfterSettledTool = nextLiveProcessView(processReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: settledRound
    })
    expect(
      processAfterSettledTool.processForFlow.some(
        (segment) => segment.kind === 'tool' && segment.toolName === 'read_file' && segment.status === 'done'
      )
    ).toBe(true)
    const processAfterThinkSettled = nextLiveProcessView(processReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkThenSettled
    })
    expect(processAfterThinkSettled.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(
      processAfterThinkSettled.processForFlow.some(
        (segment) => segment.kind === 'tool' && segment.toolName === 'read_file' && segment.status === 'done'
      )
    ).toBe(true)
    expect(processAfterThinkSettled.thinkText).toBe(processReadyForPlanTool.thinkText + 'Next')
    const processAfterThinkTokenSettled = nextLiveProcessView(processReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkTokenSettled
    })
    expect(processAfterThinkTokenSettled.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterThinkTokenSettled.processForFlow.some((segment) => segment.kind === 'text')).toBe(false)
    expect(
      processAfterThinkTokenSettled.processForFlow.some(
        (segment) => segment.kind === 'tool' && segment.toolName === 'read_file' && segment.status === 'done'
      )
    ).toBe(true)
    expect(processAfterThinkTokenSettled.thinkText).toBe(processReadyForPlanTool.thinkText + 'Next')
    const processAfterThinkDemoFence = nextLiveProcessView(processReadyForPlanTool, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: thinkDemoFenceTool
    })
    expect(processAfterThinkDemoFence.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(
      processAfterThinkDemoFence.processForFlow.some(
        (segment) => segment.toolName === 'present_inline_demo'
      )
    ).toBe(false)
    expect(processAfterThinkDemoFence.thinkText).toBe(processReadyForPlanTool.thinkText + 'Next')
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
    const askHangNeeded = { ...askNeeded, timestamp: 60 }
    let askHangThink = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 60.1
    })
    askHangThink = applyStreamChunk(askHangThink, askHangNeeded)
    askHangThink = applyStreamChunk(askHangThink, { type: 'think', content: 'Next', timestamp: 60.2 })
    expect(isLiveAskNeededThinkAppendChange([hello], askHangThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', [hello], askHangThink)).toBe('HmmNext')
    let askHangToken = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 60.3
    })
    askHangToken = applyStreamChunk(askHangToken, { ...askNeeded, timestamp: 60.4 })
    askHangToken = applyStreamChunk(askHangToken, { type: 'token', content: 'Hi', timestamp: 60.5 })
    expect(isLiveAskNeededAnswerAppendChange([hello], askHangToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangToken)).toBe('text')
    let askHangThinkToken = applyStreamChunk(askHangThink, { type: 'token', content: 'Hi', timestamp: 60.6 })
    expect(isLiveAskNeededThinkAnswerAppendChange([hello], askHangThinkToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangThinkToken)).toBe('text')
    let askHangThinkSettled = applyStreamChunk(askHangThink, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-hang-think-settle-1',
      timestamp: 60.7
    })
    askHangThinkSettled = applyStreamChunk(askHangThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-hang-think-settle-1',
      resultSummary: 'ok',
      timestamp: 60.8
    })
    expect(isLiveAskNeededThinkSettledToolAppendChange([hello], askHangThinkSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangThinkSettled)).toBe('tool')
    let askHangTokenSettled = applyStreamChunk(askHangToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-hang-token-settle-1',
      timestamp: 60.9
    })
    askHangTokenSettled = applyStreamChunk(askHangTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-hang-token-settle-1',
      resultSummary: 'ok',
      timestamp: 61.1
    })
    expect(isLiveAskNeededAnswerSettledToolAppendChange([hello], askHangTokenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangTokenSettled)).toBe('text')
    let askHangDemo = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 61.2
    })
    askHangDemo = applyStreamChunk(askHangDemo, { ...askNeeded, timestamp: 61.3 })
    askHangDemo = applyStreamChunk(askHangDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 61.4
    })
    askHangDemo = applyStreamChunk(askHangDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 61.5
    })
    expect(isLiveAskNeededAnswerDemoAppendChange([hello], askHangDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangDemo)).toBe('tool')
    let askHangThinkDemo = applyStreamChunk(askHangThink, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 61.6
    })
    askHangThinkDemo = applyStreamChunk(askHangThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 61.7
    })
    expect(isLiveAskNeededThinkAnswerDemoAppendChange([hello], askHangThinkDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangThinkDemo)).toBe('tool')
    let askPlanThink = applyStreamChunk(afterPlanStatus, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 61.8
    })
    askPlanThink = applyStreamChunk(askPlanThink, { ...askNeeded, timestamp: 61.9 })
    askPlanThink = applyStreamChunk(askPlanThink, { type: 'think', content: 'Next', timestamp: 62.1 })
    expect(isLiveAskNeededThinkAppendChange(afterPlanStatus, askPlanThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, askPlanThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', afterPlanStatus, askPlanThink)).toBe('HmmNext')
    let askPlanToken = applyStreamChunk(afterPlanStatus, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 62.2
    })
    askPlanToken = applyStreamChunk(askPlanToken, { ...askNeeded, timestamp: 62.3 })
    askPlanToken = applyStreamChunk(askPlanToken, { type: 'token', content: 'Hi', timestamp: 62.4 })
    expect(isLiveAskNeededAnswerAppendChange(afterPlanStatus, askPlanToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, askPlanToken)).toBe('text')
    let askPlanDemo = applyStreamChunk(afterPlanStatus, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 62.5
    })
    askPlanDemo = applyStreamChunk(askPlanDemo, { ...askNeeded, timestamp: 62.6 })
    askPlanDemo = applyStreamChunk(askPlanDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 62.7
    })
    askPlanDemo = applyStreamChunk(askPlanDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 62.8
    })
    expect(isLiveAskNeededAnswerDemoAppendChange(afterPlanStatus, askPlanDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(afterPlanStatus, askPlanDemo)).toBe('tool')
    let askRunThink = applyStreamChunk([hello, running], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 63.1
    })
    askRunThink = applyStreamChunk(askRunThink, { ...askNeeded, timestamp: 63.2 })
    askRunThink = applyStreamChunk(askRunThink, { type: 'think', content: 'Next', timestamp: 63.3 })
    expect(isLiveAskNeededThinkAppendChange([hello, running], askRunThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askRunThink)).toBe('think')
    const writeAskDone = {
      type: 'tool_done' as const,
      toolName: 'run_terminal_cmd',
      fileDiff: {
        path: 'a.ts',
        lines: [{ kind: 'add' as const, content: 'hi' }],
        stats: { added: 1, removed: 0 }
      },
      timestamp: 63.4
    }
    let askWriteThink = applyStreamChunk([hello, running], writeAskDone)
    askWriteThink = applyStreamChunk(askWriteThink, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 63.5
    })
    askWriteThink = applyStreamChunk(askWriteThink, { ...askNeeded, timestamp: 63.6 })
    askWriteThink = applyStreamChunk(askWriteThink, { type: 'think', content: 'Next', timestamp: 63.7 })
    expect(isLiveWriteStatAskNeededThinkAppendChange([hello, running], askWriteThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', [hello, running], askWriteThink)).toBe('HmmNext')
    let askWriteToken = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 63.8 })
    askWriteToken = applyStreamChunk(askWriteToken, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 63.9
    })
    askWriteToken = applyStreamChunk(askWriteToken, { ...askNeeded, timestamp: 64.1 })
    askWriteToken = applyStreamChunk(askWriteToken, { type: 'token', content: 'Hi', timestamp: 64.2 })
    expect(isLiveWriteStatAskNeededAnswerAppendChange([hello, running], askWriteToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteToken)).toBe('text')
    let askWritePlanThink = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 64.3 })
    askWritePlanThink = applyStreamChunk(askWritePlanThink, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 64.4
    })
    askWritePlanThink = applyStreamChunk(askWritePlanThink, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 64.5
    })
    askWritePlanThink = applyStreamChunk(askWritePlanThink, { ...askNeeded, timestamp: 64.6 })
    askWritePlanThink = applyStreamChunk(askWritePlanThink, {
      type: 'think',
      content: 'Next',
      timestamp: 64.7
    })
    expect(isLiveWriteStatStatusAskNeededThinkAppendChange([hello, running], askWritePlanThink)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', [hello, running], askWritePlanThink)).toBe('HmmNext')
    let askHangThinkTokenSettled = applyStreamChunk(askHangThinkToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-hang-think-token-settle-1',
      timestamp: 64.8
    })
    askHangThinkTokenSettled = applyStreamChunk(askHangThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-hang-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 64.9
    })
    expect(isLiveAskNeededThinkAnswerSettledToolAppendChange([hello], askHangThinkTokenSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello], askHangThinkTokenSettled)).toBe('text')
    let askWriteThinkToken = applyStreamChunk(askWriteThink, { type: 'token', content: 'Hi', timestamp: 65.1 })
    expect(isLiveWriteStatAskNeededThinkAnswerAppendChange([hello, running], askWriteThinkToken)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteThinkToken)).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello, running], askWriteThinkToken)).toBe('HmmNext')
    let askWriteDemo = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 65.2 })
    askWriteDemo = applyStreamChunk(askWriteDemo, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 65.3
    })
    askWriteDemo = applyStreamChunk(askWriteDemo, { ...askNeeded, timestamp: 65.4 })
    askWriteDemo = applyStreamChunk(askWriteDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 65.5
    })
    askWriteDemo = applyStreamChunk(askWriteDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 65.6
    })
    expect(isLiveWriteStatAskNeededAnswerDemoAppendChange([hello, running], askWriteDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteDemo)).toBe('tool')
    let askWriteThinkSettled = applyStreamChunk(askWriteThink, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-write-think-settle-1',
      timestamp: 65.7
    })
    askWriteThinkSettled = applyStreamChunk(askWriteThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-write-think-settle-1',
      resultSummary: 'ok',
      timestamp: 65.8
    })
    expect(isLiveWriteStatAskNeededThinkSettledToolAppendChange([hello, running], askWriteThinkSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteThinkSettled)).toBe('tool')
    let askWriteTokenSettled = applyStreamChunk(askWriteToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-write-token-settle-1',
      timestamp: 65.9
    })
    askWriteTokenSettled = applyStreamChunk(askWriteTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-write-token-settle-1',
      resultSummary: 'ok',
      timestamp: 66.1
    })
    expect(
      isLiveWriteStatAskNeededAnswerSettledToolAppendChange([hello, running], askWriteTokenSettled)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteTokenSettled)).toBe('text')
    let askWritePlanToken = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 66.2 })
    askWritePlanToken = applyStreamChunk(askWritePlanToken, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 66.3
    })
    askWritePlanToken = applyStreamChunk(askWritePlanToken, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 66.4
    })
    askWritePlanToken = applyStreamChunk(askWritePlanToken, { ...askNeeded, timestamp: 66.5 })
    askWritePlanToken = applyStreamChunk(askWritePlanToken, { type: 'token', content: 'Hi', timestamp: 66.6 })
    expect(isLiveWriteStatStatusAskNeededAnswerAppendChange([hello, running], askWritePlanToken)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanToken)).toBe('text')
    let askWritePlanThinkToken = applyStreamChunk(askWritePlanThink, {
      type: 'token',
      content: 'Hi',
      timestamp: 66.7
    })
    expect(
      isLiveWriteStatStatusAskNeededThinkAnswerAppendChange([hello, running], askWritePlanThinkToken)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanThinkToken)).toBe('text')
    let askWritePlanDemo = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 66.8 })
    askWritePlanDemo = applyStreamChunk(askWritePlanDemo, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 66.9
    })
    askWritePlanDemo = applyStreamChunk(askWritePlanDemo, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 67.1
    })
    askWritePlanDemo = applyStreamChunk(askWritePlanDemo, { ...askNeeded, timestamp: 67.2 })
    askWritePlanDemo = applyStreamChunk(askWritePlanDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 67.3
    })
    askWritePlanDemo = applyStreamChunk(askWritePlanDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 67.4
    })
    expect(isLiveWriteStatStatusAskNeededAnswerDemoAppendChange([hello, running], askWritePlanDemo)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanDemo)).toBe('tool')
    let askWritePlanThinkSettled = applyStreamChunk(askWritePlanThink, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-write-plan-think-settle-1',
      timestamp: 67.5
    })
    askWritePlanThinkSettled = applyStreamChunk(askWritePlanThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-write-plan-think-settle-1',
      resultSummary: 'ok',
      timestamp: 67.6
    })
    expect(
      isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange(
        [hello, running],
        askWritePlanThinkSettled
      )
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanThinkSettled)).toBe('tool')
    let askReconnectThink = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 67.7
    })
    askReconnectThink = applyStreamChunk(askReconnectThink, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 67.8
    })
    askReconnectThink = applyStreamChunk(askReconnectThink, { ...askNeeded, timestamp: 67.9 })
    askReconnectThink = applyStreamChunk(askReconnectThink, {
      type: 'think',
      content: 'Next',
      timestamp: 68.1
    })
    expect(isLiveStatusAskNeededThinkAppendChange([hello], askReconnectThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', [hello], askReconnectThink)).toBe('HmmNext')
    let askReconnectToken = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 68.2
    })
    askReconnectToken = applyStreamChunk(askReconnectToken, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 68.3
    })
    askReconnectToken = applyStreamChunk(askReconnectToken, { ...askNeeded, timestamp: 68.4 })
    askReconnectToken = applyStreamChunk(askReconnectToken, { type: 'token', content: 'Hi', timestamp: 68.5 })
    expect(isLiveStatusAskNeededAnswerAppendChange([hello], askReconnectToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectToken)).toBe('text')
    let askReconnectThinkToken = applyStreamChunk(askReconnectThink, {
      type: 'token',
      content: 'Hi',
      timestamp: 68.6
    })
    expect(isLiveStatusAskNeededThinkAnswerAppendChange([hello], askReconnectThinkToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectThinkToken)).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello], askReconnectThinkToken)).toBe('HmmNext')
    let askReconnectDemo = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 68.7
    })
    askReconnectDemo = applyStreamChunk(askReconnectDemo, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 68.8
    })
    askReconnectDemo = applyStreamChunk(askReconnectDemo, { ...askNeeded, timestamp: 68.9 })
    askReconnectDemo = applyStreamChunk(askReconnectDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 69.1
    })
    askReconnectDemo = applyStreamChunk(askReconnectDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 69.2
    })
    expect(isLiveStatusAskNeededAnswerDemoAppendChange([hello], askReconnectDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectDemo)).toBe('tool')
    let askReconnectThinkDemo = applyStreamChunk(askReconnectThink, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 69.3
    })
    askReconnectThinkDemo = applyStreamChunk(askReconnectThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 69.4
    })
    expect(isLiveStatusAskNeededThinkAnswerDemoAppendChange([hello], askReconnectThinkDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectThinkDemo)).toBe('tool')
    let askReconnectThinkSettled = applyStreamChunk(askReconnectThink, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-reconnect-think-settle-1',
      timestamp: 69.5
    })
    askReconnectThinkSettled = applyStreamChunk(askReconnectThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-reconnect-think-settle-1',
      resultSummary: 'ok',
      timestamp: 69.6
    })
    expect(isLiveStatusAskNeededThinkSettledToolAppendChange([hello], askReconnectThinkSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectThinkSettled)).toBe('tool')
    let askReconnectTokenSettled = applyStreamChunk(askReconnectToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-reconnect-token-settle-1',
      timestamp: 69.7
    })
    askReconnectTokenSettled = applyStreamChunk(askReconnectTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-reconnect-token-settle-1',
      resultSummary: 'ok',
      timestamp: 69.8
    })
    expect(isLiveStatusAskNeededAnswerSettledToolAppendChange([hello], askReconnectTokenSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectTokenSettled)).toBe('text')
    let askWriteThinkTokenSettled = applyStreamChunk(askWriteThinkToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-write-think-token-settle-1',
      timestamp: 70.1
    })
    askWriteThinkTokenSettled = applyStreamChunk(askWriteThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-write-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 70.2
    })
    expect(
      isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(
        [hello, running],
        askWriteThinkTokenSettled
      )
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteThinkTokenSettled)).toBe('text')
    let askWritePlanThinkDemo = applyStreamChunk(askWritePlanThink, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 70.3
    })
    askWritePlanThinkDemo = applyStreamChunk(askWritePlanThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 70.4
    })
    expect(
      isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange([hello, running], askWritePlanThinkDemo)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanThinkDemo)).toBe('tool')
    let askWritePlanTokenSettled = applyStreamChunk(askWritePlanToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-write-plan-token-settle-1',
      timestamp: 70.5
    })
    askWritePlanTokenSettled = applyStreamChunk(askWritePlanTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-write-plan-token-settle-1',
      resultSummary: 'ok',
      timestamp: 70.6
    })
    expect(
      isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange(
        [hello, running],
        askWritePlanTokenSettled
      )
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanTokenSettled)).toBe('text')
    let askWritePlanThinkTokenSettled = applyStreamChunk(askWritePlanThinkToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'ask-write-plan-think-token-settle-1',
      timestamp: 70.7
    })
    askWritePlanThinkTokenSettled = applyStreamChunk(askWritePlanThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'ask-write-plan-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 70.8
    })
    expect(
      isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(
        [hello, running],
        askWritePlanThinkTokenSettled
      )
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanThinkTokenSettled)).toBe('text')
    let askHangCompress = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.1
    })
    askHangCompress = applyStreamChunk(askHangCompress, { ...askNeeded, timestamp: 71.2 })
    askHangCompress = applyStreamChunk(askHangCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 71.3
    })
    expect(isLiveAskNeededCompressAppendChange([hello], askHangCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangCompress)).toBe('tool')
    let askHangCancel = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.4
    })
    askHangCancel = applyStreamChunk(askHangCancel, { ...askNeeded, timestamp: 71.5 })
    askHangCancel = applyStreamChunk(askHangCancel, { type: 'turn_cancelled', timestamp: 71.6 })
    expect(isLiveAskNeededCancelAppendChange([hello], askHangCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangCancel)).toBe('tool')
    let askResolveCancel = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.61
    })
    askResolveCancel = applyStreamChunk(askResolveCancel, { ...askNeeded, timestamp: 71.62 })
    askResolveCancel = applyStreamChunk(askResolveCancel, {
      type: 'user_input_resolved',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.63
    })
    askResolveCancel = applyStreamChunk(askResolveCancel, { type: 'turn_cancelled', timestamp: 71.64 })
    expect(isLiveAskResolvedCancelAppendChange([hello], askResolveCancel)).toBe(true)
    expect(isLiveAskNeededCancelAppendChange([hello], askResolveCancel)).toBe(false)
    expect(shouldSkipLiveStreamDerivation([hello], askResolveCancel)).toBe('tool')
    let askResolveThinkCancel = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.65
    })
    askResolveThinkCancel = applyStreamChunk(askResolveThinkCancel, { ...askNeeded, timestamp: 71.66 })
    askResolveThinkCancel = applyStreamChunk(askResolveThinkCancel, {
      type: 'user_input_resolved',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.67
    })
    askResolveThinkCancel = applyStreamChunk(askResolveThinkCancel, {
      type: 'think',
      content: 'Next',
      timestamp: 71.68
    })
    askResolveThinkCancel = applyStreamChunk(askResolveThinkCancel, { type: 'turn_cancelled', timestamp: 71.69 })
    expect(isLiveAskResolvedThinkCancelAppendChange([hello], askResolveThinkCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askResolveThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello], askResolveThinkCancel)).toBe('HmmNext')
    let askResolveTokenCancel = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.691
    })
    askResolveTokenCancel = applyStreamChunk(askResolveTokenCancel, { ...askNeeded, timestamp: 71.692 })
    askResolveTokenCancel = applyStreamChunk(askResolveTokenCancel, {
      type: 'user_input_resolved',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.693
    })
    askResolveTokenCancel = applyStreamChunk(askResolveTokenCancel, { type: 'token', content: 'Hi', timestamp: 71.694 })
    askResolveTokenCancel = applyStreamChunk(askResolveTokenCancel, { type: 'turn_cancelled', timestamp: 71.695 })
    expect(isLiveAskResolvedAnswerCancelAppendChange([hello], askResolveTokenCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askResolveTokenCancel)).toBe('text')
    const askHangForResolve = applyStreamChunk(
      applyStreamChunk([hello], {
        type: 'tool_start',
        toolName: REQUEST_USER_INPUT_TOOL,
        timestamp: 71.696
      }),
      { ...askNeeded, timestamp: 71.697 }
    )
    let askHangResolveTokenCancel = applyStreamChunk(askHangForResolve, {
      type: 'user_input_resolved',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.698
    })
    askHangResolveTokenCancel = applyStreamChunk(askHangResolveTokenCancel, {
      type: 'token',
      content: 'Hi',
      timestamp: 71.699
    })
    askHangResolveTokenCancel = applyStreamChunk(askHangResolveTokenCancel, {
      type: 'turn_cancelled',
      timestamp: 71.701
    })
    expect(isLiveAskResolvedAnswerCancelAppendChange(askHangForResolve, askHangResolveTokenCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(askHangForResolve, askHangResolveTokenCancel)).toBe('text')
    let askResolveDemoCompress = applyStreamChunk([hello], {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.702
    })
    askResolveDemoCompress = applyStreamChunk(askResolveDemoCompress, { ...askNeeded, timestamp: 71.703 })
    askResolveDemoCompress = applyStreamChunk(askResolveDemoCompress, {
      type: 'user_input_resolved',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.704
    })
    askResolveDemoCompress = applyStreamChunk(askResolveDemoCompress, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 71.705
    })
    askResolveDemoCompress = applyStreamChunk(askResolveDemoCompress, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 71.706
    })
    askResolveDemoCompress = applyStreamChunk(askResolveDemoCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 71.707
    })
    expect(isLiveAskResolvedAnswerDemoCompressAppendChange([hello], askResolveDemoCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askResolveDemoCompress)).toBe('tool')
    let askHangThinkCancel = applyStreamChunk(askHangThink, { type: 'turn_cancelled', timestamp: 71.7 })
    expect(isLiveAskNeededThinkCancelAppendChange([hello], askHangThinkCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askHangThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello], askHangThinkCancel)).toBe('HmmNext')
    let askWriteCompress = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 71.8 })
    askWriteCompress = applyStreamChunk(askWriteCompress, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 71.9
    })
    askWriteCompress = applyStreamChunk(askWriteCompress, { ...askNeeded, timestamp: 72.1 })
    askWriteCompress = applyStreamChunk(askWriteCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 72.2
    })
    expect(isLiveWriteStatAskNeededCompressAppendChange([hello, running], askWriteCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteCompress)).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: askWriteCompress
      })
    ).toBe(false)
    let askWriteCancel = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 72.3 })
    askWriteCancel = applyStreamChunk(askWriteCancel, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 72.4
    })
    askWriteCancel = applyStreamChunk(askWriteCancel, { ...askNeeded, timestamp: 72.5 })
    askWriteCancel = applyStreamChunk(askWriteCancel, { type: 'turn_cancelled', timestamp: 72.6 })
    expect(isLiveWriteStatAskNeededCancelAppendChange([hello, running], askWriteCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteCancel)).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerWhileTool,
        prevSegments: [hello, running],
        segments: askWriteCancel
      })
    ).toBe(false)
    let askWritePlanCompress = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 72.7 })
    askWritePlanCompress = applyStreamChunk(askWritePlanCompress, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 72.8
    })
    askWritePlanCompress = applyStreamChunk(askWritePlanCompress, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 72.9
    })
    askWritePlanCompress = applyStreamChunk(askWritePlanCompress, { ...askNeeded, timestamp: 73.1 })
    askWritePlanCompress = applyStreamChunk(askWritePlanCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 73.2
    })
    expect(
      isLiveWriteStatStatusAskNeededCompressAppendChange([hello, running], askWritePlanCompress)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanCompress)).toBe('tool')
    let askWritePlanCancel = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 73.3 })
    askWritePlanCancel = applyStreamChunk(askWritePlanCancel, {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      timestamp: 73.4
    })
    askWritePlanCancel = applyStreamChunk(askWritePlanCancel, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 73.5
    })
    askWritePlanCancel = applyStreamChunk(askWritePlanCancel, { ...askNeeded, timestamp: 73.6 })
    askWritePlanCancel = applyStreamChunk(askWritePlanCancel, { type: 'turn_cancelled', timestamp: 73.7 })
    expect(isLiveWriteStatStatusAskNeededCancelAppendChange([hello, running], askWritePlanCancel)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanCancel)).toBe('tool')
    let askReconnectCompress = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 73.8
    })
    askReconnectCompress = applyStreamChunk(askReconnectCompress, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 73.9
    })
    askReconnectCompress = applyStreamChunk(askReconnectCompress, { ...askNeeded, timestamp: 74.1 })
    askReconnectCompress = applyStreamChunk(askReconnectCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 74.2
    })
    expect(isLiveStatusAskNeededCompressAppendChange([hello], askReconnectCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectCompress)).toBe('tool')
    let askReconnectCancel = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 74.3
    })
    askReconnectCancel = applyStreamChunk(askReconnectCancel, {
      type: 'tool_start',
      toolName: REQUEST_USER_INPUT_TOOL,
      timestamp: 74.4
    })
    askReconnectCancel = applyStreamChunk(askReconnectCancel, { ...askNeeded, timestamp: 74.5 })
    askReconnectCancel = applyStreamChunk(askReconnectCancel, { type: 'turn_cancelled', timestamp: 74.6 })
    expect(isLiveStatusAskNeededCancelAppendChange([hello], askReconnectCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectCancel)).toBe('tool')
    let askReconnectThinkCancel = applyStreamChunk(askReconnectThink, {
      type: 'turn_cancelled',
      timestamp: 74.7
    })
    expect(isLiveStatusAskNeededThinkCancelAppendChange([hello], askReconnectThinkCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], askReconnectThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello], askReconnectThinkCancel)).toBe('HmmNext')
    let askWriteThinkCancel = applyStreamChunk(askWriteThink, { type: 'turn_cancelled', timestamp: 74.8 })
    expect(isLiveWriteStatAskNeededThinkCancelAppendChange([hello, running], askWriteThinkCancel)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], askWriteThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], askWriteThinkCancel)).toBe('HmmNext')
    let askWritePlanThinkCancel = applyStreamChunk(askWritePlanThink, {
      type: 'turn_cancelled',
      timestamp: 74.9
    })
    expect(
      isLiveWriteStatStatusAskNeededThinkCancelAppendChange([hello, running], askWritePlanThinkCancel)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], askWritePlanThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], askWritePlanThinkCancel)).toBe('HmmNext')
    const approvalHang = {
      type: 'approval_needed' as const,
      approval: { id: 'ap-hang', toolName: 'run_terminal_cmd', title: 'npm test' }
    }
    let approvalHangThink = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 75.1 })
    approvalHangThink = applyStreamChunk(approvalHangThink, { type: 'think', content: 'Next', timestamp: 75.2 })
    expect(isLiveApprovalNeededThinkAppendChange([hello, running], approvalHangThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalHangThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', [hello, running], approvalHangThink)).toBe('HmmNext')
    let approvalHangToken = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 75.3 })
    approvalHangToken = applyStreamChunk(approvalHangToken, { type: 'token', content: 'Hi', timestamp: 75.4 })
    expect(isLiveApprovalNeededAnswerAppendChange([hello, running], approvalHangToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalHangToken)).toBe('text')
    let approvalHangCompress = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 75.5 })
    approvalHangCompress = applyStreamChunk(approvalHangCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 75.6
    })
    expect(isLiveApprovalNeededCompressAppendChange([hello, running], approvalHangCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalHangCompress)).toBe('tool')
    let approvalHangThinkCompress = applyStreamChunk(approvalHangThink, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 75.7
    })
    expect(isLiveApprovalNeededThinkCompressAppendChange([hello, running], approvalHangThinkCompress)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalHangThinkCompress)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], approvalHangThinkCompress)).toBe('HmmNext')
    let approvalHangError = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 75.8 })
    approvalHangError = applyStreamChunk(approvalHangError, { type: 'error', error: 'boom', timestamp: 75.9 })
    expect(isLiveApprovalNeededErrorAppendChange([hello, running], approvalHangError)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalHangError)).toBe('text')
    let approvalHangDemo = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 76.1 })
    approvalHangDemo = applyStreamChunk(approvalHangDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 76.2
    })
    approvalHangDemo = applyStreamChunk(approvalHangDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 76.3
    })
    expect(isLiveApprovalNeededAnswerDemoAppendChange([hello, running], approvalHangDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalHangDemo)).toBe('tool')
    let approvalWriteCompress = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 76.4 })
    approvalWriteCompress = applyStreamChunk(approvalWriteCompress, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 76.5
    })
    approvalWriteCompress = applyStreamChunk(approvalWriteCompress, { ...approvalHang, timestamp: 76.6 })
    approvalWriteCompress = applyStreamChunk(approvalWriteCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 76.7
    })
    expect(
      isLiveWriteStatApprovalNeededCompressAppendChange([hello, running], approvalWriteCompress)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteCompress)).toBe('tool')
    let approvalWriteCancel = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 76.8 })
    approvalWriteCancel = applyStreamChunk(approvalWriteCancel, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 76.9
    })
    approvalWriteCancel = applyStreamChunk(approvalWriteCancel, { ...approvalHang, timestamp: 77.1 })
    approvalWriteCancel = applyStreamChunk(approvalWriteCancel, { type: 'turn_cancelled', timestamp: 77.2 })
    expect(isLiveWriteStatApprovalNeededCancelAppendChange([hello, running], approvalWriteCancel)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteCancel)).toBe('tool')
    let approvalReconnectCompress = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 77.3
    })
    approvalReconnectCompress = applyStreamChunk(approvalReconnectCompress, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 77.4
    })
    approvalReconnectCompress = applyStreamChunk(approvalReconnectCompress, {
      ...approvalHang,
      timestamp: 77.5
    })
    approvalReconnectCompress = applyStreamChunk(approvalReconnectCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 77.6
    })
    expect(isLiveStatusApprovalNeededCompressAppendChange([hello], approvalReconnectCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], approvalReconnectCompress)).toBe('tool')
    let approvalReconnectCancel = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 77.7
    })
    approvalReconnectCancel = applyStreamChunk(approvalReconnectCancel, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 77.8
    })
    approvalReconnectCancel = applyStreamChunk(approvalReconnectCancel, {
      ...approvalHang,
      timestamp: 77.9
    })
    approvalReconnectCancel = applyStreamChunk(approvalReconnectCancel, {
      type: 'turn_cancelled',
      timestamp: 78.1
    })
    expect(isLiveStatusApprovalNeededCancelAppendChange([hello], approvalReconnectCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], approvalReconnectCancel)).toBe('tool')
    let approvalAllowCompress = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 78.2 })
    approvalAllowCompress = applyStreamChunk(approvalAllowCompress, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 78.3
    })
    approvalAllowCompress = applyStreamChunk(approvalAllowCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 78.4
    })
    expect(isLiveApprovalResolvedCompressAppendChange([hello, running], approvalAllowCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowCompress)).toBe('tool')
    let approvalDenyCompress = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 78.5 })
    approvalDenyCompress = applyStreamChunk(approvalDenyCompress, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: false,
      timestamp: 78.6
    })
    approvalDenyCompress = applyStreamChunk(approvalDenyCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 78.7
    })
    expect(isLiveApprovalResolvedCompressAppendChange([hello, running], approvalDenyCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalDenyCompress)).toBe('tool')
    const approvalAwaiting = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 78.8 })
    let approvalAwaitingAllowCompress = applyStreamChunk(approvalAwaiting, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 78.9
    })
    approvalAwaitingAllowCompress = applyStreamChunk(approvalAwaitingAllowCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 79.1
    })
    expect(isLiveApprovalResolvedCompressAppendChange(approvalAwaiting, approvalAwaitingAllowCompress)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(approvalAwaiting, approvalAwaitingAllowCompress)).toBe('tool')
    let approvalAllowCancel = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 79.2 })
    approvalAllowCancel = applyStreamChunk(approvalAllowCancel, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 79.3
    })
    approvalAllowCancel = applyStreamChunk(approvalAllowCancel, { type: 'turn_cancelled', timestamp: 79.4 })
    expect(isLiveApprovalResolvedCancelAppendChange([hello, running], approvalAllowCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowCancel)).toBe('tool')
    let approvalAwaitingAllowCancel = applyStreamChunk(approvalAwaiting, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 79.5
    })
    approvalAwaitingAllowCancel = applyStreamChunk(approvalAwaitingAllowCancel, {
      type: 'turn_cancelled',
      timestamp: 79.6
    })
    expect(isLiveApprovalResolvedCancelChange(approvalAwaiting, approvalAwaitingAllowCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(approvalAwaiting, approvalAwaitingAllowCancel)).toBe('tool')
    let approvalWriteAllowCompress = applyStreamChunk([hello, running], {
      ...writeAskDone,
      timestamp: 79.7
    })
    approvalWriteAllowCompress = applyStreamChunk(approvalWriteAllowCompress, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 79.8
    })
    approvalWriteAllowCompress = applyStreamChunk(approvalWriteAllowCompress, {
      ...approvalHang,
      timestamp: 79.9
    })
    approvalWriteAllowCompress = applyStreamChunk(approvalWriteAllowCompress, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 80.1
    })
    approvalWriteAllowCompress = applyStreamChunk(approvalWriteAllowCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 80.2
    })
    expect(
      isLiveWriteStatApprovalResolvedCompressAppendChange([hello, running], approvalWriteAllowCompress)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteAllowCompress)).toBe('tool')
    let approvalWriteAllowCancel = applyStreamChunk([hello, running], {
      ...writeAskDone,
      timestamp: 80.3
    })
    approvalWriteAllowCancel = applyStreamChunk(approvalWriteAllowCancel, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 80.4
    })
    approvalWriteAllowCancel = applyStreamChunk(approvalWriteAllowCancel, {
      ...approvalHang,
      timestamp: 80.5
    })
    approvalWriteAllowCancel = applyStreamChunk(approvalWriteAllowCancel, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 80.6
    })
    approvalWriteAllowCancel = applyStreamChunk(approvalWriteAllowCancel, {
      type: 'turn_cancelled',
      timestamp: 80.7
    })
    expect(
      isLiveWriteStatApprovalResolvedCancelAppendChange([hello, running], approvalWriteAllowCancel)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteAllowCancel)).toBe('tool')
    let approvalReconnectAllowCompress = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 80.8
    })
    approvalReconnectAllowCompress = applyStreamChunk(approvalReconnectAllowCompress, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 80.9
    })
    approvalReconnectAllowCompress = applyStreamChunk(approvalReconnectAllowCompress, {
      ...approvalHang,
      timestamp: 81.1
    })
    approvalReconnectAllowCompress = applyStreamChunk(approvalReconnectAllowCompress, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 81.2
    })
    approvalReconnectAllowCompress = applyStreamChunk(approvalReconnectAllowCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 81.3
    })
    expect(isLiveStatusApprovalResolvedCompressAppendChange([hello], approvalReconnectAllowCompress)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello], approvalReconnectAllowCompress)).toBe('tool')
    let approvalReconnectAllowCancel = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 81.4
    })
    approvalReconnectAllowCancel = applyStreamChunk(approvalReconnectAllowCancel, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 81.5
    })
    approvalReconnectAllowCancel = applyStreamChunk(approvalReconnectAllowCancel, {
      ...approvalHang,
      timestamp: 81.6
    })
    approvalReconnectAllowCancel = applyStreamChunk(approvalReconnectAllowCancel, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 81.7
    })
    approvalReconnectAllowCancel = applyStreamChunk(approvalReconnectAllowCancel, {
      type: 'turn_cancelled',
      timestamp: 81.8
    })
    expect(isLiveStatusApprovalResolvedCancelAppendChange([hello], approvalReconnectAllowCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], approvalReconnectAllowCancel)).toBe('tool')
    let approvalAllowThink = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 81.9 })
    approvalAllowThink = applyStreamChunk(approvalAllowThink, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 82.1
    })
    approvalAllowThink = applyStreamChunk(approvalAllowThink, { type: 'think', content: 'Next', timestamp: 82.2 })
    expect(isLiveApprovalResolvedThinkAppendChange([hello, running], approvalAllowThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', [hello, running], approvalAllowThink)).toBe('HmmNext')
    let approvalAllowToken = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 82.3 })
    approvalAllowToken = applyStreamChunk(approvalAllowToken, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 82.4
    })
    approvalAllowToken = applyStreamChunk(approvalAllowToken, { type: 'token', content: 'Hi', timestamp: 82.5 })
    expect(isLiveApprovalResolvedAnswerAppendChange([hello, running], approvalAllowToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowToken)).toBe('text')
    let approvalAllowError = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 82.6 })
    approvalAllowError = applyStreamChunk(approvalAllowError, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 82.7
    })
    approvalAllowError = applyStreamChunk(approvalAllowError, { type: 'error', error: 'boom', timestamp: 82.8 })
    expect(isLiveApprovalResolvedErrorAppendChange([hello, running], approvalAllowError)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowError)).toBe('text')
    let approvalAllowDemo = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 82.9 })
    approvalAllowDemo = applyStreamChunk(approvalAllowDemo, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 83.1
    })
    approvalAllowDemo = applyStreamChunk(approvalAllowDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 83.2
    })
    approvalAllowDemo = applyStreamChunk(approvalAllowDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 83.3
    })
    expect(isLiveApprovalResolvedAnswerDemoAppendChange([hello, running], approvalAllowDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowDemo)).toBe('tool')
    let approvalAllowThinkCompress = applyStreamChunk(approvalAllowThink, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 83.4
    })
    expect(isLiveApprovalResolvedThinkCompressAppendChange([hello, running], approvalAllowThinkCompress)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowThinkCompress)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], approvalAllowThinkCompress)).toBe('HmmNext')
    let approvalAllowThinkCancel = applyStreamChunk(approvalAllowThink, {
      type: 'turn_cancelled',
      timestamp: 83.5
    })
    expect(isLiveApprovalResolvedThinkCancelAppendChange([hello, running], approvalAllowThinkCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowThinkCancel)).toBe('tool')
    let approvalWriteAllowThinkCompress = applyStreamChunk([hello, running], {
      ...writeAskDone,
      timestamp: 83.6
    })
    approvalWriteAllowThinkCompress = applyStreamChunk(approvalWriteAllowThinkCompress, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 83.7
    })
    approvalWriteAllowThinkCompress = applyStreamChunk(approvalWriteAllowThinkCompress, {
      ...approvalHang,
      timestamp: 83.8
    })
    approvalWriteAllowThinkCompress = applyStreamChunk(approvalWriteAllowThinkCompress, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 83.9
    })
    approvalWriteAllowThinkCompress = applyStreamChunk(approvalWriteAllowThinkCompress, {
      type: 'think',
      content: 'Next',
      timestamp: 84.1
    })
    approvalWriteAllowThinkCompress = applyStreamChunk(approvalWriteAllowThinkCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 84.2
    })
    expect(
      isLiveWriteStatApprovalResolvedThinkCompressAppendChange(
        [hello, running],
        approvalWriteAllowThinkCompress
      )
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteAllowThinkCompress)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], approvalWriteAllowThinkCompress)).toBe('HmmNext')
    let approvalReconnectAllowThinkCompress = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 84.3
    })
    approvalReconnectAllowThinkCompress = applyStreamChunk(approvalReconnectAllowThinkCompress, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 84.4
    })
    approvalReconnectAllowThinkCompress = applyStreamChunk(approvalReconnectAllowThinkCompress, {
      ...approvalHang,
      timestamp: 84.5
    })
    approvalReconnectAllowThinkCompress = applyStreamChunk(approvalReconnectAllowThinkCompress, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 84.6
    })
    approvalReconnectAllowThinkCompress = applyStreamChunk(approvalReconnectAllowThinkCompress, {
      type: 'think',
      content: 'Next',
      timestamp: 84.7
    })
    approvalReconnectAllowThinkCompress = applyStreamChunk(approvalReconnectAllowThinkCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 84.8
    })
    expect(
      isLiveStatusApprovalResolvedThinkCompressAppendChange([hello], approvalReconnectAllowThinkCompress)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], approvalReconnectAllowThinkCompress)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello], approvalReconnectAllowThinkCompress)).toBe('HmmNext')
    let approvalAllowThinkToken = applyStreamChunk(approvalAllowThink, {
      type: 'token',
      content: 'Hi',
      timestamp: 84.91
    })
    expect(isLiveApprovalResolvedThinkAnswerAppendChange([hello, running], approvalAllowThinkToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowThinkToken)).toBe('text')
    expect(nextLiveThinkText('Hmm', [hello, running], approvalAllowThinkToken)).toBe('HmmNext')
    let approvalAllowThinkDemo = applyStreamChunk(approvalAllowThink, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 84.92
    })
    approvalAllowThinkDemo = applyStreamChunk(approvalAllowThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 84.93
    })
    expect(isLiveApprovalResolvedThinkAnswerDemoAppendChange([hello, running], approvalAllowThinkDemo)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowThinkDemo)).toBe('tool')
    let approvalAllowNextTool = applyStreamChunk([hello, running], { ...approvalHang, timestamp: 84.94 })
    approvalAllowNextTool = applyStreamChunk(approvalAllowNextTool, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 84.95
    })
    approvalAllowNextTool = applyStreamChunk(approvalAllowNextTool, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'r1',
      timestamp: 84.96
    })
    expect(isLiveApprovalResolvedToolAppendChange([hello, running], approvalAllowNextTool)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowNextTool)).toBe('tool')
    let approvalAllowNextSettled = applyStreamChunk(approvalAllowNextTool, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'r1',
      resultSummary: 'ok',
      timestamp: 84.97
    })
    expect(isLiveApprovalResolvedSettledToolAppendChange([hello, running], approvalAllowNextSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalAllowNextSettled)).toBe('tool')
    let approvalWriteAllowToken = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 85.1 })
    approvalWriteAllowToken = applyStreamChunk(approvalWriteAllowToken, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 85.2
    })
    approvalWriteAllowToken = applyStreamChunk(approvalWriteAllowToken, { ...approvalHang, timestamp: 85.3 })
    approvalWriteAllowToken = applyStreamChunk(approvalWriteAllowToken, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 85.4
    })
    approvalWriteAllowToken = applyStreamChunk(approvalWriteAllowToken, {
      type: 'token',
      content: 'Hi',
      timestamp: 85.5
    })
    expect(isLiveWriteStatApprovalResolvedAnswerAppendChange([hello, running], approvalWriteAllowToken)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteAllowToken)).toBe('text')
    let approvalWriteAllowError = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 85.6 })
    approvalWriteAllowError = applyStreamChunk(approvalWriteAllowError, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 85.7
    })
    approvalWriteAllowError = applyStreamChunk(approvalWriteAllowError, { ...approvalHang, timestamp: 85.8 })
    approvalWriteAllowError = applyStreamChunk(approvalWriteAllowError, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 85.9
    })
    approvalWriteAllowError = applyStreamChunk(approvalWriteAllowError, {
      type: 'error',
      error: 'boom',
      timestamp: 86.1
    })
    expect(isLiveWriteStatApprovalResolvedErrorAppendChange([hello, running], approvalWriteAllowError)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteAllowError)).toBe('text')
    let approvalWriteAllowDemo = applyStreamChunk([hello, running], { ...writeAskDone, timestamp: 86.2 })
    approvalWriteAllowDemo = applyStreamChunk(approvalWriteAllowDemo, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 86.3
    })
    approvalWriteAllowDemo = applyStreamChunk(approvalWriteAllowDemo, { ...approvalHang, timestamp: 86.4 })
    approvalWriteAllowDemo = applyStreamChunk(approvalWriteAllowDemo, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 86.5
    })
    approvalWriteAllowDemo = applyStreamChunk(approvalWriteAllowDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 86.6
    })
    approvalWriteAllowDemo = applyStreamChunk(approvalWriteAllowDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 86.7
    })
    expect(isLiveWriteStatApprovalResolvedAnswerDemoAppendChange([hello, running], approvalWriteAllowDemo)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteAllowDemo)).toBe('tool')
    let approvalWriteAllowThinkCancel = applyStreamChunk([hello, running], {
      ...writeAskDone,
      timestamp: 86.8
    })
    approvalWriteAllowThinkCancel = applyStreamChunk(approvalWriteAllowThinkCancel, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 86.9
    })
    approvalWriteAllowThinkCancel = applyStreamChunk(approvalWriteAllowThinkCancel, {
      ...approvalHang,
      timestamp: 87.1
    })
    approvalWriteAllowThinkCancel = applyStreamChunk(approvalWriteAllowThinkCancel, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 87.2
    })
    approvalWriteAllowThinkCancel = applyStreamChunk(approvalWriteAllowThinkCancel, {
      type: 'think',
      content: 'Next',
      timestamp: 87.3
    })
    approvalWriteAllowThinkCancel = applyStreamChunk(approvalWriteAllowThinkCancel, {
      type: 'turn_cancelled',
      timestamp: 87.4
    })
    expect(
      isLiveWriteStatApprovalResolvedThinkCancelAppendChange([hello, running], approvalWriteAllowThinkCancel)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello, running], approvalWriteAllowThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello, running], approvalWriteAllowThinkCancel)).toBe('HmmNext')
    let approvalReconnectAllowToken = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 87.5
    })
    approvalReconnectAllowToken = applyStreamChunk(approvalReconnectAllowToken, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 87.6
    })
    approvalReconnectAllowToken = applyStreamChunk(approvalReconnectAllowToken, {
      ...approvalHang,
      timestamp: 87.7
    })
    approvalReconnectAllowToken = applyStreamChunk(approvalReconnectAllowToken, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 87.8
    })
    approvalReconnectAllowToken = applyStreamChunk(approvalReconnectAllowToken, {
      type: 'token',
      content: 'Hi',
      timestamp: 87.9
    })
    expect(isLiveStatusApprovalResolvedAnswerAppendChange([hello], approvalReconnectAllowToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation([hello], approvalReconnectAllowToken)).toBe('text')
    let approvalReconnectAllowThinkCancel = applyStreamChunk([hello], {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 88.1
    })
    approvalReconnectAllowThinkCancel = applyStreamChunk(approvalReconnectAllowThinkCancel, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      timestamp: 88.2
    })
    approvalReconnectAllowThinkCancel = applyStreamChunk(approvalReconnectAllowThinkCancel, {
      ...approvalHang,
      timestamp: 88.3
    })
    approvalReconnectAllowThinkCancel = applyStreamChunk(approvalReconnectAllowThinkCancel, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 88.4
    })
    approvalReconnectAllowThinkCancel = applyStreamChunk(approvalReconnectAllowThinkCancel, {
      type: 'think',
      content: 'Next',
      timestamp: 88.5
    })
    approvalReconnectAllowThinkCancel = applyStreamChunk(approvalReconnectAllowThinkCancel, {
      type: 'turn_cancelled',
      timestamp: 88.6
    })
    expect(isLiveStatusApprovalResolvedThinkCancelAppendChange([hello], approvalReconnectAllowThinkCancel)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation([hello], approvalReconnectAllowThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', [hello], approvalReconnectAllowThinkCancel)).toBe('HmmNext')
    const processReadyForAskHang = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello]
    })
    const processAfterAskHangThink = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangThink
    })
    expect(
      processAfterAskHangThink.processForFlow.some(
        (segment) => segment.toolName === REQUEST_USER_INPUT_TOOL
      )
    ).toBe(true)
    expect(processAfterAskHangThink.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(
      false
    )
    expect(processAfterAskHangThink.thinkText).toBe(processReadyForAskHang.thinkText + 'Next')
    const processAfterAskHangToken = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangToken
    })
    expect(processAfterAskHangToken.contentStreaming).toBe(true)
    expect(
      processAfterAskHangToken.processForFlow.some((segment) => segment.kind === 'text')
    ).toBe(false)
    const processAfterAskHangDemo = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangDemo
    })
    expect(
      processAfterAskHangDemo.processForFlow.some(
        (segment) => segment.toolName === 'present_inline_demo'
      )
    ).toBe(false)
    const processReadyForAskWrite = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const processAfterAskWriteThink = nextLiveProcessView(processReadyForAskWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askWriteThink
    })
    expect(processAfterAskWriteThink.thinkText).toBe(processReadyForAskWrite.thinkText + 'Next')
    expect(
      processAfterAskWriteThink.processForFlow.some(
        (segment) => segment.toolName === REQUEST_USER_INPUT_TOOL
      )
    ).toBe(true)
    const answerReadyForAskHang = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello]
    })
    const helloAskHangPart = answerReadyForAskHang.parts.find((part) => part.type === 'text')
    const answerAfterAskHangThink = nextLiveAnswerView(answerReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangThink
    })
    expect(
      answerAfterAskHangThink.parts.find((part) => part.type === 'text' && part.id === hello.id)
        ?.content
    ).toBe(helloAskHangPart?.content)
    const answerAfterAskHangToken = nextLiveAnswerView(answerReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangToken
    })
    expect(
      answerAfterAskHangToken.parts.some((part) => part.type === 'text' && part.content.includes('Hi'))
    ).toBe(true)
    const answerAfterAskHangDemo = nextLiveAnswerView(answerReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangDemo
    })
    expect(answerAfterAskHangDemo.parts.some((part) => part.type === 'demo')).toBe(true)
    const processAfterAskReconnectToken = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askReconnectToken
    })
    expect(processAfterAskReconnectToken.contentStreaming).toBe(true)
    expect(
      processAfterAskReconnectToken.processForFlow.some(
        (segment) => segment.toolName === REQUEST_USER_INPUT_TOOL
      )
    ).toBe(true)
    expect(processAfterAskReconnectToken.processForFlow.some((segment) => segment.kind === 'text')).toBe(
      false
    )
    const answerAfterAskReconnectToken = nextLiveAnswerView(answerReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askReconnectToken
    })
    expect(
      answerAfterAskReconnectToken.parts.some(
        (part) => part.type === 'text' && part.content.includes('Hi')
      )
    ).toBe(true)
    const processAfterAskHangCompress = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangCompress
    })
    expect(
      processAfterAskHangCompress.processForFlow.some((segment) => segment.toolName === 'compress')
    ).toBe(true)
    expect(
      processAfterAskHangCompress.processForFlow.some(
        (segment) => segment.toolName === REQUEST_USER_INPUT_TOOL
      )
    ).toBe(true)
    const answerAfterAskHangCompress = nextLiveAnswerView(answerReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangCompress
    })
    expect(
      answerAfterAskHangCompress.parts.find((part) => part.type === 'text' && part.id === hello.id)
        ?.content
    ).toBe(helloAskHangPart?.content)
    const processAfterAskHangCancel = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangCancel
    })
    expect(
      processAfterAskHangCancel.processForFlow.some(
        (segment) =>
          segment.toolName === REQUEST_USER_INPUT_TOOL && segment.status === 'cancelled'
      )
    ).toBe(true)
    const answerAfterAskHangCancel = nextLiveAnswerView(answerReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangCancel
    })
    expect(
      answerAfterAskHangCancel.parts.find((part) => part.type === 'text' && part.id === hello.id)
        ?.content
    ).toBe(helloAskHangPart?.content)
    const processAfterAskHangThinkCancel = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askHangThinkCancel
    })
    expect(processAfterAskHangThinkCancel.thinkText).toBe(processReadyForAskHang.thinkText + 'Next')
    expect(
      processAfterAskHangThinkCancel.processForFlow.some((segment) => segment.kind === 'thinking')
    ).toBe(false)
    const processAfterAskWriteCompress = nextLiveProcessView(processReadyForAskWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askWriteCompress
    })
    expect(
      processAfterAskWriteCompress.processForFlow.some((segment) => segment.toolName === 'compress')
    ).toBe(true)
    const processAfterAskReconnectCompress = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askReconnectCompress
    })
    expect(
      processAfterAskReconnectCompress.processForFlow.some((segment) => segment.toolName === 'compress')
    ).toBe(true)
    expect(
      processAfterAskReconnectCompress.processForFlow.some(
        (segment) => segment.toolName === REQUEST_USER_INPUT_TOOL
      )
    ).toBe(true)
    const processAfterAskReconnectThinkCancel = nextLiveProcessView(processReadyForAskHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askReconnectThinkCancel
    })
    expect(processAfterAskReconnectThinkCancel.thinkText).toBe(
      processReadyForAskHang.thinkText + 'Next'
    )
    expect(
      processAfterAskReconnectThinkCancel.processForFlow.some((segment) => segment.kind === 'thinking')
    ).toBe(false)
    const processAfterAskWriteThinkCancel = nextLiveProcessView(processReadyForAskWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: askWriteThinkCancel
    })
    expect(processAfterAskWriteThinkCancel.thinkText).toBe(processReadyForAskWrite.thinkText + 'Next')
    expect(
      processAfterAskWriteThinkCancel.processForFlow.some((segment) => segment.kind === 'thinking')
    ).toBe(false)
    const processAfterApprovalHangThink = nextLiveProcessView(processReadyForAskWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: approvalHangThink
    })
    expect(processAfterApprovalHangThink.thinkText).toBe(processReadyForAskWrite.thinkText + 'Next')
    expect(
      processAfterApprovalHangThink.processForFlow.some((segment) => segment.kind === 'thinking')
    ).toBe(false)
    expect(
      processAfterApprovalHangThink.processForFlow.some((segment) =>
        /Awaiting approval/i.test(segment.content ?? '')
      )
    ).toBe(true)
    const processAfterApprovalHangToken = nextLiveProcessView(processReadyForAskWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: approvalHangToken
    })
    expect(processAfterApprovalHangToken.contentStreaming).toBe(true)
    expect(
      processAfterApprovalHangToken.processForFlow.some((segment) => segment.kind === 'text')
    ).toBe(false)
    const processAfterApprovalHangCompress = nextLiveProcessView(processReadyForAskWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: approvalHangCompress
    })
    expect(
      processAfterApprovalHangCompress.processForFlow.some((segment) => segment.toolName === 'compress')
    ).toBe(true)
    const answerReadyForApprovalHang = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, running]
    })
    const helloApprovalHangPart = answerReadyForApprovalHang.parts.find((part) => part.type === 'text')
    const answerAfterApprovalHangThink = nextLiveAnswerView(answerReadyForApprovalHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: approvalHangThink
    })
    expect(
      answerAfterApprovalHangThink.parts.find((part) => part.type === 'text' && part.id === hello.id)
        ?.content
    ).toBe(helloApprovalHangPart?.content)
    const answerAfterApprovalHangToken = nextLiveAnswerView(answerReadyForApprovalHang, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: approvalHangToken
    })
    expect(
      answerAfterApprovalHangToken.parts.some((part) => part.type === 'text' && part.content.includes('Hi'))
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
    const awaitingDenied: TurnSegment = {
      ...awaitingStatus,
      status: 'done',
      content: '已拒绝该操作'
    }
    const cmdDenied: TurnSegment = {
      ...cmdAwaiting,
      status: 'error',
      errorMessage: '用户拒绝了此操作'
    }
    expect(isLiveApprovalDeniedSettleChange([cmdAwaiting, awaitingStatus], [cmdDenied, awaitingDenied])).toBe(
      true
    )
    expect(isLiveApprovalResolvedChange([cmdAwaiting, awaitingStatus], [cmdDenied, awaitingDenied])).toBe(
      false
    )
    expect(
      shouldSkipLiveStreamDerivation([cmdAwaiting, awaitingStatus], [cmdDenied, awaitingDenied])
    ).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [cmdAwaiting, awaitingStatus],
        segments: [cmdDenied, awaitingDenied]
      })
    ).toBe(true)
    const processAfterDenied = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdDenied, awaitingDenied]
    })
    expect(processAfterDenied.processForFlow.some((segment) => segment === cmdDenied)).toBe(true)
    expect(processAfterDenied.processForFlow.some((segment) => segment === awaitingDenied)).toBe(true)
    const planAfterDeny: TurnSegment = {
      id: 'st-plan-deny',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…'
    }
    expect(
      isLiveApprovalDeniedStatusAppendChange(
        [cmdAwaiting, awaitingStatus],
        [cmdDenied, awaitingDenied, planAfterDeny]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdDenied, awaitingDenied, planAfterDeny]
      )
    ).toBe('status')
    const processAfterDeniedPlan = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdDenied, awaitingDenied, planAfterDeny]
    })
    expect(processAfterDeniedPlan.processForFlow.some((segment) => segment === cmdDenied)).toBe(true)
    expect(processAfterDeniedPlan.processForFlow.some((segment) => segment === planAfterDeny)).toBe(true)
    const nextAfterDeny: TurnSegment = {
      id: 'read-after-deny',
      kind: 'tool',
      toolName: 'read_file',
      status: 'active',
      toolDetail: 'src/a.ts'
    }
    expect(
      isLiveApprovalDeniedToolAppendChange(
        [cmdAwaiting, awaitingStatus],
        [cmdDenied, awaitingDenied, nextAfterDeny]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdDenied, awaitingDenied, nextAfterDeny]
      )
    ).toBe('tool')
    const processAfterDeniedTool = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdDenied, awaitingDenied, nextAfterDeny]
    })
    expect(processAfterDeniedTool.processForFlow.some((segment) => segment === cmdDenied)).toBe(true)
    expect(processAfterDeniedTool.processForFlow.some((segment) => segment === nextAfterDeny)).toBe(true)
    const cmdAllowedPreview: TurnSegment = {
      ...cmdApproved,
      editPreview: [{ path: 'a.ts', stats: { added: 1, removed: 0 } }]
    }
    expect(
      isLiveApprovalAllowedWriteStatChange(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone]
      )
    ).toBe(true)
    expect(
      isLiveApprovalResolvedChange([cmdAwaiting, awaitingStatus], [cmdAllowedPreview, awaitingDone])
    ).toBe(false)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone]
      )
    ).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [cmdAwaiting, awaitingStatus],
        segments: [cmdAllowedPreview, awaitingDone]
      })
    ).toBe(false)
    const processAfterAllowedWrite = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedPreview, awaitingDone]
    })
    expect(processAfterAllowedWrite.processForFlow.some((segment) => segment === cmdAllowedPreview)).toBe(
      true
    )
    expect(processAfterAllowedWrite.processForFlow.some((segment) => segment === awaitingDone)).toBe(true)
    const answerReadyForAllowedWrite = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAwaiting, awaitingStatus]
    })
    const answerAfterAllowedWrite = nextLiveAnswerView(answerReadyForAllowedWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedPreview, awaitingDone]
    })
    expect(answerAfterAllowedWrite).not.toBe(answerReadyForAllowedWrite)
    expect(
      answerAfterAllowedWrite.parts.some((part) => part.type === 'diff' && part.id === 'run-appr-diff-0')
    ).toBe(true)
    const planAfterAllowWrite: TurnSegment = {
      id: 'st-plan-allow-write',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…'
    }
    expect(
      isLiveApprovalAllowedWriteStatStatusAppendChange(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone, planAfterAllowWrite]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone, planAfterAllowWrite]
      )
    ).toBe('status')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [cmdAwaiting, awaitingStatus],
        segments: [cmdAllowedPreview, awaitingDone, planAfterAllowWrite]
      })
    ).toBe(false)
    const processAfterAllowedWritePlan = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedPreview, awaitingDone, planAfterAllowWrite]
    })
    expect(
      processAfterAllowedWritePlan.processForFlow.some((segment) => segment === cmdAllowedPreview)
    ).toBe(true)
    expect(
      processAfterAllowedWritePlan.processForFlow.some((segment) => segment === planAfterAllowWrite)
    ).toBe(true)
    const answerAfterAllowedWritePlan = nextLiveAnswerView(answerReadyForAllowedWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedPreview, awaitingDone, planAfterAllowWrite]
    })
    expect(answerAfterAllowedWritePlan).not.toBe(answerReadyForAllowedWrite)
    expect(
      answerAfterAllowedWritePlan.parts.some((part) => part.type === 'diff' && part.id === 'run-appr-diff-0')
    ).toBe(true)
    const nextAfterAllowWrite: TurnSegment = {
      id: 'read-after-allow-write',
      kind: 'tool',
      toolName: 'read_file',
      status: 'active',
      toolDetail: 'src/a.ts'
    }
    expect(
      isLiveApprovalAllowedWriteStatToolAppendChange(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone, nextAfterAllowWrite]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone, nextAfterAllowWrite]
      )
    ).toBe('tool')
    const processAfterAllowedWriteNext = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedPreview, awaitingDone, nextAfterAllowWrite]
    })
    expect(
      processAfterAllowedWriteNext.processForFlow.some((segment) => segment === cmdAllowedPreview)
    ).toBe(true)
    expect(
      processAfterAllowedWriteNext.processForFlow.some((segment) => segment === nextAfterAllowWrite)
    ).toBe(true)
    const cmdAllowedSettled: TurnSegment = {
      ...cmdApproved,
      status: 'done',
      resultSummary: 'exit 0'
    }
    expect(
      isLiveApprovalAllowedSettleChange(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedSettled, awaitingDone]
      )
    ).toBe(true)
    expect(
      isLiveApprovalResolvedChange([cmdAwaiting, awaitingStatus], [cmdAllowedSettled, awaitingDone])
    ).toBe(false)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedSettled, awaitingDone]
      )
    ).toBe('tool')
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: answerToolsOnly,
        prevSegments: [cmdAwaiting, awaitingStatus],
        segments: [cmdAllowedSettled, awaitingDone]
      })
    ).toBe(true)
    const processAfterAllowedSettle = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedSettled, awaitingDone]
    })
    expect(processAfterAllowedSettle.processForFlow.some((segment) => segment === cmdAllowedSettled)).toBe(
      true
    )
    expect(processAfterAllowedSettle.processForFlow.some((segment) => segment === awaitingDone)).toBe(true)
    const planAfterAllow: TurnSegment = {
      id: 'st-plan-allow',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…'
    }
    expect(
      isLiveApprovalAllowedStatusAppendChange(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedSettled, awaitingDone, planAfterAllow]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedSettled, awaitingDone, planAfterAllow]
      )
    ).toBe('status')
    const processAfterAllowedPlan = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedSettled, awaitingDone, planAfterAllow]
    })
    expect(processAfterAllowedPlan.processForFlow.some((segment) => segment === cmdAllowedSettled)).toBe(
      true
    )
    expect(processAfterAllowedPlan.processForFlow.some((segment) => segment === planAfterAllow)).toBe(true)
    const nextAfterAllow: TurnSegment = {
      id: 'read-after-allow',
      kind: 'tool',
      toolName: 'read_file',
      status: 'active',
      toolDetail: 'src/a.ts'
    }
    expect(
      isLiveApprovalAllowedToolAppendChange(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedSettled, awaitingDone, nextAfterAllow]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedSettled, awaitingDone, nextAfterAllow]
      )
    ).toBe('tool')
    const processAfterAllowedTool = nextLiveProcessView(processAfterApproval, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [cmdAllowedSettled, awaitingDone, nextAfterAllow]
    })
    expect(processAfterAllowedTool.processForFlow.some((segment) => segment === cmdAllowedSettled)).toBe(
      true
    )
    expect(processAfterAllowedTool.processForFlow.some((segment) => segment === nextAfterAllow)).toBe(true)
    const awaitingLive = [cmdAwaiting, awaitingStatus]
    let allowThink = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 50.1
    })
    allowThink = applyStreamChunk(allowThink, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'ok',
      timestamp: 50.2
    })
    allowThink = applyStreamChunk(allowThink, { type: 'think', content: 'Next', timestamp: 50.3 })
    expect(isLiveApprovalAllowedThinkAppendChange(awaitingLive, allowThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', awaitingLive, allowThink)).toBe('HmmNext')
    let allowToken = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 50.4
    })
    allowToken = applyStreamChunk(allowToken, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'ok',
      timestamp: 50.5
    })
    allowToken = applyStreamChunk(allowToken, { type: 'token', content: 'Hi', timestamp: 50.6 })
    expect(isLiveApprovalAllowedAnswerAppendChange(awaitingLive, allowToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowToken)).toBe('text')
    let allowThinkToken = applyStreamChunk(allowThink, { type: 'token', content: 'Hi', timestamp: 50.7 })
    expect(isLiveApprovalAllowedThinkAnswerAppendChange(awaitingLive, allowThinkToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowThinkToken)).toBe('text')
    let allowThinkSettled = applyStreamChunk(allowThink, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'allow-think-settle-1',
      timestamp: 50.8
    })
    allowThinkSettled = applyStreamChunk(allowThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'allow-think-settle-1',
      resultSummary: 'ok',
      timestamp: 50.9
    })
    expect(isLiveApprovalAllowedThinkSettledToolAppendChange(awaitingLive, allowThinkSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowThinkSettled)).toBe('tool')
    let allowTokenSettled = applyStreamChunk(allowToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'allow-token-settle-1',
      timestamp: 51.1
    })
    allowTokenSettled = applyStreamChunk(allowTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'allow-token-settle-1',
      resultSummary: 'ok',
      timestamp: 51.2
    })
    expect(isLiveApprovalAllowedAnswerSettledToolAppendChange(awaitingLive, allowTokenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowTokenSettled)).toBe('text')
    let allowThinkTokenSettled = applyStreamChunk(allowThinkToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'allow-think-token-settle-1',
      timestamp: 51.3
    })
    allowThinkTokenSettled = applyStreamChunk(allowThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'allow-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 51.4
    })
    expect(isLiveApprovalAllowedThinkAnswerSettledToolAppendChange(awaitingLive, allowThinkTokenSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowThinkTokenSettled)).toBe('text')
    let allowDemo = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 51.5
    })
    allowDemo = applyStreamChunk(allowDemo, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'ok',
      timestamp: 51.6
    })
    allowDemo = applyStreamChunk(allowDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 51.7
    })
    allowDemo = applyStreamChunk(allowDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 51.8
    })
    expect(isLiveApprovalAllowedAnswerDemoAppendChange(awaitingLive, allowDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowDemo)).toBe('tool')
    let allowThinkDemo = applyStreamChunk(allowThink, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 51.9
    })
    allowThinkDemo = applyStreamChunk(allowThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 52.1
    })
    expect(isLiveApprovalAllowedThinkAnswerDemoAppendChange(awaitingLive, allowThinkDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowThinkDemo)).toBe('tool')
    let allowResolvedThink = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.2
    })
    allowResolvedThink = applyStreamChunk(allowResolvedThink, {
      type: 'think',
      content: 'Next',
      timestamp: 52.4
    })
    expect(isLiveApprovalResolvedThinkAppendChange(awaitingLive, allowResolvedThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedThink)).toBe('think')
    expect(nextLiveThinkText('Hmm', awaitingLive, allowResolvedThink)).toBe('HmmNext')
    let allowResolvedToken = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.41
    })
    allowResolvedToken = applyStreamChunk(allowResolvedToken, { type: 'token', content: 'Hi', timestamp: 52.42 })
    expect(isLiveApprovalResolvedAnswerAppendChange(awaitingLive, allowResolvedToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedToken)).toBe('text')
    let allowResolvedError = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.43
    })
    allowResolvedError = applyStreamChunk(allowResolvedError, { type: 'error', error: 'boom', timestamp: 52.44 })
    expect(isLiveApprovalResolvedErrorAppendChange(awaitingLive, allowResolvedError)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedError)).toBe('text')
    let allowResolvedDemo = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.45
    })
    allowResolvedDemo = applyStreamChunk(allowResolvedDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 52.46
    })
    allowResolvedDemo = applyStreamChunk(allowResolvedDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 52.47
    })
    expect(isLiveApprovalResolvedAnswerDemoAppendChange(awaitingLive, allowResolvedDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedDemo)).toBe('tool')
    let allowResolvedThinkCompress = applyStreamChunk(allowResolvedThink, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.48
    })
    expect(isLiveApprovalResolvedThinkCompressAppendChange(awaitingLive, allowResolvedThinkCompress)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedThinkCompress)).toBe('tool')
    expect(nextLiveThinkText('Hmm', awaitingLive, allowResolvedThinkCompress)).toBe('HmmNext')
    let allowResolvedTokenCompress = applyStreamChunk(allowResolvedToken, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.49
    })
    expect(isLiveApprovalResolvedAnswerCompressAppendChange(awaitingLive, allowResolvedTokenCompress)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedTokenCompress)).toBe('text')
    let allowSettleCompress = applyStreamChunk(allowThink, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.51
    })
    expect(isLiveApprovalAllowedCompressAppendChange(awaitingLive, allowSettleCompress)).toBe(false)
    let allowSettledCompress = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.52
    })
    allowSettledCompress = applyStreamChunk(allowSettledCompress, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'ok',
      timestamp: 52.53
    })
    allowSettledCompress = applyStreamChunk(allowSettledCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.54
    })
    expect(isLiveApprovalAllowedCompressAppendChange(awaitingLive, allowSettledCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowSettledCompress)).toBe('tool')
    const awaitingWithHello = [hello, ...awaitingLive]
    let allowSettledCancel = applyStreamChunk(awaitingWithHello, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.55
    })
    allowSettledCancel = applyStreamChunk(allowSettledCancel, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'ok',
      timestamp: 52.56
    })
    allowSettledCancel = applyStreamChunk(allowSettledCancel, { type: 'turn_cancelled', timestamp: 52.57 })
    expect(isLiveApprovalAllowedCancelChange(awaitingWithHello, allowSettledCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingWithHello, allowSettledCancel)).toBe('tool')
    let denySettledCompress = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: false,
      timestamp: 52.58
    })
    denySettledCompress = applyStreamChunk(denySettledCompress, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      toolStatus: 'error',
      resultSummary: 'denied',
      timestamp: 52.59
    })
    denySettledCompress = applyStreamChunk(denySettledCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.61
    })
    expect(isLiveApprovalDeniedCompressAppendChange(awaitingLive, denySettledCompress)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, denySettledCompress)).toBe('tool')
    let denyResolvedThinkCancel = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: false,
      timestamp: 52.62
    })
    denyResolvedThinkCancel = applyStreamChunk(denyResolvedThinkCancel, {
      type: 'think',
      content: 'Next',
      timestamp: 52.63
    })
    denyResolvedThinkCancel = applyStreamChunk(denyResolvedThinkCancel, {
      type: 'turn_cancelled',
      timestamp: 52.64
    })
    expect(isLiveApprovalResolvedThinkCancelAppendChange(awaitingLive, denyResolvedThinkCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, denyResolvedThinkCancel)).toBe('tool')
    let allowResolvedThinkToken = applyStreamChunk(allowResolvedThink, {
      type: 'token',
      content: 'Hi',
      timestamp: 52.65
    })
    expect(isLiveApprovalResolvedThinkAnswerAppendChange(awaitingLive, allowResolvedThinkToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedThinkToken)).toBe('text')
    expect(nextLiveThinkText('Hmm', awaitingLive, allowResolvedThinkToken)).toBe('HmmNext')
    let allowResolvedThinkError = applyStreamChunk(allowResolvedThink, {
      type: 'error',
      error: 'boom',
      timestamp: 52.66
    })
    expect(isLiveApprovalResolvedThinkErrorAppendChange(awaitingLive, allowResolvedThinkError)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedThinkError)).toBe('text')
    let allowResolvedThinkDemo = applyStreamChunk(allowResolvedThink, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 52.67
    })
    allowResolvedThinkDemo = applyStreamChunk(allowResolvedThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 52.68
    })
    expect(isLiveApprovalResolvedThinkAnswerDemoAppendChange(awaitingLive, allowResolvedThinkDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedThinkDemo)).toBe('tool')
    let allowResolvedThinkTokenCompress = applyStreamChunk(allowResolvedThinkToken, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.69
    })
    expect(
      isLiveApprovalResolvedThinkAnswerCompressAppendChange(awaitingLive, allowResolvedThinkTokenCompress)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedThinkTokenCompress)).toBe('text')
    let allowResolvedDemoCompress = applyStreamChunk(allowResolvedDemo, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.71
    })
    expect(isLiveApprovalResolvedAnswerDemoCompressAppendChange(awaitingLive, allowResolvedDemoCompress)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedDemoCompress)).toBe('tool')
    let denyResolvedThinkToken = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: false,
      timestamp: 52.72
    })
    denyResolvedThinkToken = applyStreamChunk(denyResolvedThinkToken, {
      type: 'think',
      content: 'Next',
      timestamp: 52.73
    })
    denyResolvedThinkToken = applyStreamChunk(denyResolvedThinkToken, {
      type: 'token',
      content: 'Hi',
      timestamp: 52.74
    })
    expect(isLiveApprovalResolvedThinkAnswerAppendChange(awaitingLive, denyResolvedThinkToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, denyResolvedThinkToken)).toBe('text')
    let denySettledCancel = applyStreamChunk(awaitingWithHello, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: false,
      timestamp: 52.75
    })
    denySettledCancel = applyStreamChunk(denySettledCancel, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      toolStatus: 'error',
      resultSummary: 'denied',
      timestamp: 52.76
    })
    denySettledCancel = applyStreamChunk(denySettledCancel, { type: 'turn_cancelled', timestamp: 52.77 })
    expect(isLiveApprovalDeniedSettleCancelChange(awaitingWithHello, denySettledCancel)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingWithHello, denySettledCancel)).toBe('tool')
    let allowSettledThinkCancel = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.78
    })
    allowSettledThinkCancel = applyStreamChunk(allowSettledThinkCancel, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'ok',
      timestamp: 52.79
    })
    allowSettledThinkCancel = applyStreamChunk(allowSettledThinkCancel, {
      type: 'think',
      content: 'Next',
      timestamp: 52.81
    })
    allowSettledThinkCancel = applyStreamChunk(allowSettledThinkCancel, {
      type: 'turn_cancelled',
      timestamp: 52.82
    })
    expect(isLiveApprovalAllowedSettleThinkCancelAppendChange(awaitingLive, allowSettledThinkCancel)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowSettledThinkCancel)).toBe('tool')
    expect(nextLiveThinkText('Hmm', awaitingLive, allowSettledThinkCancel)).toBe('HmmNext')
    let allowSettledDemoCompress = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 52.83
    })
    allowSettledDemoCompress = applyStreamChunk(allowSettledDemoCompress, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      resultSummary: 'ok',
      timestamp: 52.84
    })
    allowSettledDemoCompress = applyStreamChunk(allowSettledDemoCompress, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 52.85
    })
    allowSettledDemoCompress = applyStreamChunk(allowSettledDemoCompress, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 52.86
    })
    allowSettledDemoCompress = applyStreamChunk(allowSettledDemoCompress, {
      type: 'context_compress',
      contextCompress: compressPayload,
      timestamp: 52.87
    })
    expect(
      isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange(awaitingLive, allowSettledDemoCompress)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowSettledDemoCompress)).toBe('tool')
    let allowResolvedThinkSettled = applyStreamChunk(allowResolvedThink, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'r2',
      timestamp: 52.88
    })
    allowResolvedThinkSettled = applyStreamChunk(allowResolvedThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'r2',
      resultSummary: 'ok',
      timestamp: 52.89
    })
    expect(isLiveApprovalResolvedThinkSettledToolAppendChange(awaitingLive, allowResolvedThinkSettled)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowResolvedThinkSettled)).toBe('tool')
    const thinkAfterAllowWrite: TurnSegment = {
      id: 'th-allow-write',
      kind: 'thinking',
      status: 'active',
      content: 'Next'
    }
    expect(
      isLiveApprovalAllowedWriteStatThinkAppendChange(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone, thinkAfterAllowWrite]
      )
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [cmdAwaiting, awaitingStatus],
        [cmdAllowedPreview, awaitingDone, thinkAfterAllowWrite]
      )
    ).toBe('think')
    const writeDone = {
      type: 'tool_done' as const,
      toolName: 'run_terminal_cmd',
      fileDiff: { path: 'a.ts', lines: [{ kind: 'add' as const, content: 'hi' }], stats: { added: 1, removed: 0 } },
      timestamp: 54.1
    }
    let allowWriteToken = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 54
    })
    allowWriteToken = applyStreamChunk(allowWriteToken, writeDone)
    allowWriteToken = applyStreamChunk(allowWriteToken, { type: 'token', content: 'Hi', timestamp: 54.2 })
    expect(isLiveApprovalAllowedWriteStatAnswerAppendChange(awaitingLive, allowWriteToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowWriteToken)).toBe('text')
    let allowWriteThinkToken = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 54.3
    })
    allowWriteThinkToken = applyStreamChunk(allowWriteThinkToken, { ...writeDone, timestamp: 54.4 })
    allowWriteThinkToken = applyStreamChunk(allowWriteThinkToken, {
      type: 'think',
      content: 'Next',
      timestamp: 54.5
    })
    allowWriteThinkToken = applyStreamChunk(allowWriteThinkToken, {
      type: 'token',
      content: 'Hi',
      timestamp: 54.6
    })
    expect(isLiveApprovalAllowedWriteStatThinkAnswerAppendChange(awaitingLive, allowWriteThinkToken)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowWriteThinkToken)).toBe('text')
    let allowWriteThinkSettled = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 54.7
    })
    allowWriteThinkSettled = applyStreamChunk(allowWriteThinkSettled, { ...writeDone, timestamp: 54.8 })
    allowWriteThinkSettled = applyStreamChunk(allowWriteThinkSettled, {
      type: 'think',
      content: 'Next',
      timestamp: 54.9
    })
    allowWriteThinkSettled = applyStreamChunk(allowWriteThinkSettled, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'allow-write-think-settle-1',
      timestamp: 55.1
    })
    allowWriteThinkSettled = applyStreamChunk(allowWriteThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'allow-write-think-settle-1',
      resultSummary: 'ok',
      timestamp: 55.2
    })
    expect(
      isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange(awaitingLive, allowWriteThinkSettled)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowWriteThinkSettled)).toBe('tool')
    let allowWriteTokenSettled = applyStreamChunk(allowWriteToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'allow-write-token-settle-1',
      timestamp: 55.3
    })
    allowWriteTokenSettled = applyStreamChunk(allowWriteTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'allow-write-token-settle-1',
      resultSummary: 'ok',
      timestamp: 55.4
    })
    expect(
      isLiveApprovalAllowedWriteStatAnswerSettledToolAppendChange(awaitingLive, allowWriteTokenSettled)
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowWriteTokenSettled)).toBe('text')
    let allowWriteThinkTokenSettled = applyStreamChunk(allowWriteThinkToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'allow-write-think-token-settle-1',
      timestamp: 55.5
    })
    allowWriteThinkTokenSettled = applyStreamChunk(allowWriteThinkTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'allow-write-think-token-settle-1',
      resultSummary: 'ok',
      timestamp: 55.6
    })
    expect(
      isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange(
        awaitingLive,
        allowWriteThinkTokenSettled
      )
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowWriteThinkTokenSettled)).toBe('text')
    let allowWriteDemo = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 55.7
    })
    allowWriteDemo = applyStreamChunk(allowWriteDemo, { ...writeDone, timestamp: 55.8 })
    allowWriteDemo = applyStreamChunk(allowWriteDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 55.9
    })
    allowWriteDemo = applyStreamChunk(allowWriteDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 56.1
    })
    expect(isLiveApprovalAllowedWriteStatAnswerDemoAppendChange(awaitingLive, allowWriteDemo)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowWriteDemo)).toBe('tool')
    let allowWriteThinkDemo = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: true,
      timestamp: 56.2
    })
    allowWriteThinkDemo = applyStreamChunk(allowWriteThinkDemo, { ...writeDone, timestamp: 56.3 })
    allowWriteThinkDemo = applyStreamChunk(allowWriteThinkDemo, {
      type: 'think',
      content: 'Next',
      timestamp: 56.4
    })
    allowWriteThinkDemo = applyStreamChunk(allowWriteThinkDemo, {
      type: 'token',
      content: '\n```demo\n<div>x',
      timestamp: 56.5
    })
    allowWriteThinkDemo = applyStreamChunk(allowWriteThinkDemo, {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      content: '<div>x',
      timestamp: 56.6
    })
    expect(isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange(awaitingLive, allowWriteThinkDemo)).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(awaitingLive, allowWriteThinkDemo)).toBe('tool')
    let denyThink = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: false,
      timestamp: 52.5
    })
    denyThink = applyStreamChunk(denyThink, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      toolStatus: 'error',
      error: 'denied',
      timestamp: 52.6
    })
    denyThink = applyStreamChunk(denyThink, { type: 'think', content: 'Next', timestamp: 52.7 })
    expect(isLiveApprovalDeniedThinkAppendChange(awaitingLive, denyThink)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, denyThink)).toBe('think')
    let denyToken = applyStreamChunk(awaitingLive, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      approved: false,
      timestamp: 52.8
    })
    denyToken = applyStreamChunk(denyToken, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      toolStatus: 'error',
      error: 'denied',
      timestamp: 52.9
    })
    denyToken = applyStreamChunk(denyToken, { type: 'token', content: 'Hi', timestamp: 53.1 })
    expect(isLiveApprovalDeniedAnswerAppendChange(awaitingLive, denyToken)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, denyToken)).toBe('text')
    let denyThinkSettled = applyStreamChunk(denyThink, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'deny-think-settle-1',
      timestamp: 53.2
    })
    denyThinkSettled = applyStreamChunk(denyThinkSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'deny-think-settle-1',
      resultSummary: 'ok',
      timestamp: 53.3
    })
    expect(isLiveApprovalDeniedThinkSettledToolAppendChange(awaitingLive, denyThinkSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, denyThinkSettled)).toBe('tool')
    let denyTokenSettled = applyStreamChunk(denyToken, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'deny-token-settle-1',
      timestamp: 53.4
    })
    denyTokenSettled = applyStreamChunk(denyTokenSettled, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'deny-token-settle-1',
      resultSummary: 'ok',
      timestamp: 53.5
    })
    expect(isLiveApprovalDeniedAnswerSettledToolAppendChange(awaitingLive, denyTokenSettled)).toBe(true)
    expect(shouldSkipLiveStreamDerivation(awaitingLive, denyTokenSettled)).toBe('text')
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
