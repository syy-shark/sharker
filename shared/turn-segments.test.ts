import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  applyStreamChunk,
  buildAnswerParts,
  extractFinalContent,
  finalizeSegments,
  hasProcessFlow,
  hasStreamingDemoFence,
  hasStreamingDemoFenceGrowth,
  isDemoFenceLangPrefix,
  processSegments,
  reuseAnswerParts
} from './turn-segments'
import { deriveProcessPhases } from './process-phases'
import { TURN_START_LIVE_STATUS } from './live-display'
import {
  canOfferDiffPreviewCollapse,
  estimateDiffBodyHeight,
  liveDiffBodyMinHeight,
  shouldCollapseDiffPreview,
  shouldReserveDiffCollapseFooter,
  continueLiveDiffLines,
  nextClosedDiffLines
} from './line-diff'

describe('turn segment event state machine', () => {
  it('keeps event order, timestamps and real derived phases', () => {
    let segments: TurnSegment[] = []
    segments = applyStreamChunk(segments, { type: 'think', content: '理解需求', timestamp: 10 })
    segments = applyStreamChunk(segments, {
      type: 'tool_start', toolName: 'read_file', toolArgs: { path: 'src/App.tsx' },
      toolCallId: 'read-1', timestamp: 20
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'read_file', toolCallId: 'read-1',
      resultSummary: '读取 42 行', timestamp: 30
    })
    segments = applyStreamChunk(segments, { type: 'token', content: '完成。', timestamp: 40 })

    expect(segments[0]).toMatchObject({ status: 'done', startedAt: 10, endedAt: 20 })
    expect(segments[1]).toMatchObject({ status: 'done', startedAt: 20, endedAt: 30, resultSummary: '读取 42 行' })
    const explore = deriveProcessPhases(segments).groups.find((group) => group.phase === 'explore')
    expect(explore?.steps.some((step) => step.segment.toolCallId === 'read-1')).toBe(true)
  })

  it('models approval, failure, verification and cancellation explicitly', () => {
    let segments: TurnSegment[] = []
    segments = applyStreamChunk(segments, {
      type: 'tool_start', toolName: 'write_file', toolCallId: 'write-1', timestamp: 10
    })
    segments = applyStreamChunk(segments, {
      type: 'approval_needed', timestamp: 11,
      approval: { id: 'a1', title: '确认', description: '写文件', toolName: 'write_file', args: {} }
    })
    expect(segments[0].approval?.id).toBe('a1')
    segments = applyStreamChunk(segments, {
      type: 'approval_resolved', toolName: 'write_file', approved: true, timestamp: 12
    })
    expect(segments[0].approval).toBeUndefined()
    segments = applyStreamChunk(segments, {
      type: 'user_input_needed',
      timestamp: 13,
      toolName: 'request_user_input',
      userInput: {
        id: 'u1',
        questions: [
          {
            id: 'api_style',
            header: 'API style',
            question: 'How should the public API look?',
            options: [
              { label: 'REST (Recommended)', description: 'Familiar HTTP resources.' },
              { label: 'gRPC', description: 'Typed streaming.' }
            ]
          }
        ]
      }
    })
    expect(segments.some((s) => (s.content ?? '') === 'API style' && s.status === 'active')).toBe(
      true
    )
    segments = applyStreamChunk(segments, {
      type: 'user_input_resolved',
      toolName: 'request_user_input',
      timestamp: 14
    })
    expect(segments.some((s) => s.content === 'API style' && s.status === 'done')).toBe(true)
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'write_file', toolCallId: 'write-1',
      toolStatus: 'error', error: '磁盘只读', timestamp: 20
    })
    expect(segments[0]).toMatchObject({ status: 'error', errorMessage: '磁盘只读' })

    segments = applyStreamChunk(segments, {
      type: 'tool_start', toolName: 'run_terminal_cmd', toolCallId: 'verify-1',
      isVerification: true, timestamp: 30
    })
    expect(deriveProcessPhases(segments).groups.find((group) => group.phase === 'verify')?.steps).toHaveLength(1)
    segments = applyStreamChunk(segments, { type: 'turn_cancelled', timestamp: 31 })
    expect(segments.some((s) => s.toolCallId === 'verify-1' && s.status === 'cancelled')).toBe(true)
  })

  it('correlates parallel tools and preserves output metadata', () => {
    let segments: TurnSegment[] = []
    segments = applyStreamChunk(segments, { type: 'tool_start', toolName: 'read_file', toolCallId: 'a', timestamp: 1 })
    segments = applyStreamChunk(segments, { type: 'tool_start', toolName: 'read_file', toolCallId: 'b', timestamp: 2 })
    segments = applyStreamChunk(segments, { type: 'tool_done', toolName: 'read_file', toolCallId: 'a', timestamp: 3 })
    expect(segments.map((segment) => segment.status)).toEqual(['done', 'active'])

    segments = applyStreamChunk(segments, { type: 'tool_start', toolName: 'run_terminal_cmd', toolCallId: 'cmd', timestamp: 4 })
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'run_terminal_cmd', toolCallId: 'cmd', timestamp: 5,
      exitCode: 2, toolStatus: 'error', error: '命令退出码 2', resultOutput: 'failed'
    })
    expect(segments[2]).toMatchObject({ status: 'error', exitCode: 2, resultOutput: 'failed' })
    expect(finalizeSegments(segments, 6)[1].endedAt).toBe(6)
  })


  it('turn_start seeds a waiting status so live UI is never blank', () => {
    let segments: TurnSegment[] = []
    segments = applyStreamChunk(segments, { type: 'turn_start', timestamp: 1 })
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      kind: 'status',
      status: 'active',
      content: TURN_START_LIVE_STATUS
    })
    expect(applyStreamChunk(segments, { type: 'turn_start', timestamp: 4 })).toBe(segments)
    segments = applyStreamChunk(segments, { type: 'think', content: '分析', timestamp: 2 })
    expect(segments[0].status).toBe('done')
    expect(segments.some((s) => s.kind === 'thinking' && s.status === 'active')).toBe(true)
    const closedPrepare = segments[0]
    const firstThink = segments.find((s) => s.kind === 'thinking')
    segments = applyStreamChunk(segments, { type: 'think', content: '下一步', timestamp: 3 })
    expect(segments[0]).toBe(closedPrepare)
    expect(segments.find((s) => s.kind === 'thinking')?.content).toBe('分析下一步')
    expect(segments.find((s) => s.kind === 'thinking')).not.toBe(firstThink)
    let compacting = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    compacting = applyStreamChunk(compacting, {
      type: 'status',
      content: 'Automatically compacting context',
      timestamp: 2
    })
    expect(compacting[0]?.content).toBe('Automatically compacting context')
    expect(compacting[0]?.status).toBe('active')
    let reconnecting = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    reconnecting = applyStreamChunk(reconnecting, {
      type: 'status',
      content: 'Reconnecting... 1/5',
      timestamp: 2
    })
    expect(reconnecting[0]?.content).toBe('Reconnecting... 1/5')
    expect(reconnecting[0]?.status).toBe('active')
    compacting = applyStreamChunk(compacting, {
      type: 'context_compress',
      timestamp: 3,
      contextCompress: {
        removedCount: 4,
        beforeTokens: 9000,
        afterTokens: 4000,
        limit: 10000,
        messages: []
      }
    })
    expect(compacting[0]?.status).toBe('done')
    expect(
      compacting.some(
        (s) =>
          s.toolName === 'compress' &&
          s.status === 'done' &&
          s.toolTitle === 'Context automatically compacted'
      )
    ).toBe(true)
  })

  it('does not mutate previous segment objects when appending tokens', () => {
    let segments: TurnSegment[] = []
    segments = applyStreamChunk(segments, { type: 'token', content: '你好', timestamp: 1 })
    const first = segments[0]
    const snapshot = first.content
    segments = applyStreamChunk(segments, { type: 'token', content: '世界', timestamp: 2 })
    expect(first.content).toBe(snapshot)
    expect(first).not.toBe(segments[0])
    expect(segments[0].content).toBe('你好世界')
    const grownText = segments[0]
    segments = applyStreamChunk(segments, { type: 'token', content: '！', timestamp: 2 })
    expect(grownText).not.toBe(segments[0])
    expect(segments[0].content).toBe('你好世界！')
    expect(segments).toHaveLength(1)
    segments = applyStreamChunk(segments, {
      type: 'tool_start',
      toolName: 'write_file',
      toolCallId: 'w1',
      timestamp: 3
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done',
      toolName: 'write_file',
      toolCallId: 'w1',
      timestamp: 4,
      fileDiff: {
        path: 'a.ts',
        lines: [{ kind: 'add', content: 'hi', newLine: 1 }],
        stats: { added: 1, removed: 0 }
      }
    })
    const liveParts = buildAnswerParts(segments, { isStreaming: true })
    expect(liveParts.some((part) => part.type === 'diff' && part.diff.path === 'a.ts')).toBe(true)

    let pendingSegs: TurnSegment[] = []
    pendingSegs = applyStreamChunk(pendingSegs, {
      type: 'tool_start',
      toolName: 'write_file',
      toolCallId: 'w2',
      timestamp: 5,
      toolArgs: { path: 'b.ts', content: 'one\ntwo\nthree' }
    })
    const pendingParts = buildAnswerParts(pendingSegs, { isStreaming: true })
    const pendingDiff = pendingParts.find((part) => part.type === 'diff')
    expect(pendingDiff).toMatchObject({
      type: 'diff',
      id: `${pendingSegs[0]!.id}-diff-0`,
      diff: {
        path: 'b.ts',
        lines: [
          { kind: 'add', content: 'one', newLine: 1 },
          { kind: 'add', content: 'two', newLine: 2 },
          { kind: 'add', content: 'three', newLine: 3 }
        ],
        stats: { added: 3, removed: 0 }
      }
    })
    pendingSegs = applyStreamChunk(pendingSegs, {
      type: 'tool_done',
      toolName: 'write_file',
      toolCallId: 'w2',
      timestamp: 6,
      fileDiff: {
        path: 'b.ts',
        lines: [
          { kind: 'add', content: 'one', newLine: 1 },
          { kind: 'add', content: 'two', newLine: 2 },
          { kind: 'add', content: 'three', newLine: 3 }
        ],
        stats: { added: 3, removed: 0 }
      }
    })
    const filledParts = buildAnswerParts(pendingSegs, { isStreaming: true })
    expect(filledParts.find((part) => part.type === 'diff')?.id).toBe(`${pendingSegs[0]!.id}-diff-0`)
    expect(filledParts.find((part) => part.type === 'diff' && part.diff.lines.length === 3)).toBeTruthy()

    let previewSegs: TurnSegment[] = []
    previewSegs = applyStreamChunk(previewSegs, {
      type: 'tool_preview',
      toolName: 'write_file',
      toolCallId: 'w3',
      timestamp: 20,
      toolArgs: { path: 'c.ts' }
    })
    const previewId = previewSegs[0]!.id
    const pathOnly = buildAnswerParts(previewSegs, { isStreaming: true }).find((part) => part.type === 'diff')
    expect(pathOnly).toMatchObject({
      type: 'diff',
      id: `${previewId}-diff-0`,
      diff: { path: 'c.ts', lines: [], stats: { added: 0, removed: 0 } }
    })
    previewSegs = applyStreamChunk(previewSegs, {
      type: 'tool_preview',
      toolName: 'write_file',
      toolCallId: 'w3',
      timestamp: 21,
      toolArgs: { path: 'c.ts', content: 'one\ntwo\nthree\nfour' }
    })
    expect(previewSegs).toHaveLength(1)
    expect(previewSegs[0]!.id).toBe(previewId)
    const grownParts = buildAnswerParts(previewSegs, { isStreaming: true })
    expect(grownParts.find((part) => part.type === 'diff')).toMatchObject({
      id: `${previewId}-diff-0`,
      diff: {
        path: 'c.ts',
        lines: [
          { kind: 'add', content: 'one', newLine: 1 },
          { kind: 'add', content: 'two', newLine: 2 },
          { kind: 'add', content: 'three', newLine: 3 },
          { kind: 'add', content: 'four', newLine: 4 }
        ],
        stats: { added: 4, removed: 0 }
      }
    })
    const grownAgain = buildAnswerParts(previewSegs, { isStreaming: true })
    expect(reuseAnswerParts(grownParts, grownAgain)).toBe(grownParts)
    expect(reuseAnswerParts(grownParts, grownAgain)[0]).toBe(grownParts[0])
    if (pathOnly) {
      expect(reuseAnswerParts([pathOnly], grownParts)[0]).not.toBe(pathOnly)
    }
    previewSegs = applyStreamChunk(previewSegs, {
      type: 'tool_start',
      toolName: 'write_file',
      toolCallId: 'w3',
      timestamp: 22,
      toolArgs: { path: 'c.ts', content: 'one\ntwo\nthree\nfour' }
    })
    expect(previewSegs).toHaveLength(1)
    expect(previewSegs[0]!.id).toBe(previewId)
    previewSegs = applyStreamChunk(previewSegs, {
      type: 'tool_done',
      toolName: 'write_file',
      toolCallId: 'w3',
      timestamp: 23,
      fileDiff: {
        path: 'c.ts',
        lines: [
          { kind: 'add', content: 'one', newLine: 1 },
          { kind: 'add', content: 'two', newLine: 2 },
          { kind: 'add', content: 'three', newLine: 3 },
          { kind: 'add', content: 'four', newLine: 4 }
        ],
        stats: { added: 4, removed: 0 }
      }
    })
    const previewFilled = buildAnswerParts(previewSegs, { isStreaming: true }).find((part) => part.type === 'diff')
    expect(previewFilled?.id).toBe(`${previewId}-diff-0`)
    expect(previewFilled?.type === 'diff' && previewFilled.diff.lines.length === 4).toBe(true)

    let patchSegs: TurnSegment[] = []
    patchSegs = applyStreamChunk(patchSegs, {
      type: 'tool_preview',
      toolName: 'apply_patch',
      toolCallId: 'p1',
      timestamp: 30,
      toolArgs: { path: 'd.ts', patch: '*** Update File: d.ts' }
    })
    const patchId = patchSegs[0]!.id
    expect(buildAnswerParts(patchSegs, { isStreaming: true }).find((part) => part.type === 'diff')).toMatchObject({
      id: `${patchId}-diff-0`,
      diff: { path: 'd.ts', lines: [], stats: { added: 0, removed: 0 } }
    })
    patchSegs = applyStreamChunk(patchSegs, {
      type: 'tool_preview',
      toolName: 'apply_patch',
      toolCallId: 'p1',
      timestamp: 31,
      toolArgs: { patch: '*** Update File: d.ts\n@@\n-old\n+new\n' }
    })
    expect(patchSegs[0]!.id).toBe(patchId)
    expect(buildAnswerParts(patchSegs, { isStreaming: true }).find((part) => part.type === 'diff')).toMatchObject({
      id: `${patchId}-diff-0`,
      diff: {
        path: 'd.ts',
        lines: [
          { kind: 'del', content: 'old' },
          { kind: 'add', content: 'new' }
        ],
        stats: { added: 1, removed: 1 }
      }
    })
    const diffFirst = continueLiveDiffLines(null, [
      { kind: 'add', content: 'one', newLine: 1 },
      { kind: 'add', content: 'tw', newLine: 2 }
    ])
    const diffGrown = continueLiveDiffLines(diffFirst, [
      { kind: 'add', content: 'one', newLine: 1 },
      { kind: 'add', content: 'two', newLine: 2 }
    ])
    expect(diffGrown[0]).toBe(diffFirst[0])
    expect(diffGrown[1]).not.toBe(diffFirst[1])
    expect(continueLiveDiffLines(diffGrown, diffGrown)).toBe(diffGrown)
    const closedDiff = nextClosedDiffLines(null, diffFirst)
    expect(closedDiff).toHaveLength(1)
    expect(nextClosedDiffLines(closedDiff, diffGrown)).toBe(closedDiff)
    expect(estimateDiffBodyHeight(0)).toBe(0)
    expect(estimateDiffBodyHeight(3)).toBe(71)
    expect(liveDiffBodyMinHeight(0, 3, 0)).toBe(71)
    expect(liveDiffBodyMinHeight(71, 0, 1)).toBe(71)
    expect(liveDiffBodyMinHeight(33, 0, 5)).toBe(109)
    expect(
      canOfferDiffPreviewCollapse({ live: true, lineCount: 80, previewLimit: 20 })
    ).toBe(false)
    expect(
      canOfferDiffPreviewCollapse({ live: false, lineCount: 80, previewLimit: 20 })
    ).toBe(true)
    expect(
      canOfferDiffPreviewCollapse({ review: true, lineCount: 80, previewLimit: 20 })
    ).toBe(false)
    expect(
      shouldCollapseDiffPreview({
        live: false,
        expanded: false,
        lineCount: 80,
        previewLimit: 20
      })
    ).toBe(true)
    expect(
      shouldCollapseDiffPreview({
        live: true,
        expanded: false,
        lineCount: 80,
        previewLimit: 20
      })
    ).toBe(false)
    expect(
      shouldCollapseDiffPreview({
        live: false,
        expanded: true,
        lineCount: 80,
        previewLimit: 20
      })
    ).toBe(false)
    expect(
      shouldReserveDiffCollapseFooter({ review: false, lineCount: 80, previewLimit: 20 })
    ).toBe(true)
    expect(
      shouldReserveDiffCollapseFooter({ review: false, lineCount: 20, previewLimit: 20 })
    ).toBe(false)
    expect(
      shouldReserveDiffCollapseFooter({ review: true, lineCount: 80, previewLimit: 20 })
    ).toBe(false)

    expect(isDemoFenceLangPrefix('dem')).toBe(true)
    expect(isDemoFenceLangPrefix('viz')).toBe(true)
    expect(isDemoFenceLangPrefix('html-')).toBe(true)
    expect(isDemoFenceLangPrefix('d')).toBe(false)
    expect(isDemoFenceLangPrefix('diff')).toBe(false)
    expect(isDemoFenceLangPrefix('html')).toBe(false)
    expect(isDemoFenceLangPrefix('vim')).toBe(false)
    let demoSegs: TurnSegment[] = []
    demoSegs = applyStreamChunk(demoSegs, {
      type: 'token',
      content: 'See this.\n```dem',
      timestamp: 9
    })
    const pendingDemoId = demoSegs[0]!.id
    expect(buildAnswerParts(demoSegs, { isStreaming: true }).map((part) => `${part.type}:${part.id}`)).toEqual([
      `text:${pendingDemoId}`,
      `demo:${pendingDemoId}-demo-stream`
    ])
    demoSegs = applyStreamChunk(demoSegs, {
      type: 'token',
      content: 'o\n<div>Hi',
      timestamp: 10
    })
    const demoId = pendingDemoId
    const openDemo = buildAnswerParts(demoSegs, { isStreaming: true })
    expect(openDemo.map((part) => `${part.type}:${part.id}`)).toEqual([
      `text:${demoId}`,
      `demo:${demoId}-demo-stream`
    ])
    demoSegs = applyStreamChunk(demoSegs, {
      type: 'token',
      content: '</div>\n```\nNext',
      timestamp: 11
    })
    const closedLive = buildAnswerParts(demoSegs, { isStreaming: true })
    expect(closedLive.map((part) => `${part.type}:${part.id}`)).toEqual([
      `text:${demoId}`,
      `demo:${demoId}-demo-stream`,
      `text:${demoId}-post`
    ])
    expect(closedLive[1]).toMatchObject({ type: 'demo', streaming: false })
    expect(buildAnswerParts(demoSegs, { isStreaming: false }).map((part) => `${part.type}:${part.id}`)).toEqual(
      [`text:${demoId}`, `demo:${demoId}-demo-stream`, `text:${demoId}-post`]
    )
    let toolDemo: TurnSegment[] = []
    toolDemo = applyStreamChunk(toolDemo, {
      type: 'tool_start',
      toolName: 'present_inline_demo',
      toolCallId: 'd1',
      timestamp: 40
    })
    expect(buildAnswerParts(toolDemo, { isStreaming: true }).find((part) => part.type === 'demo')).toMatchObject({
      html: '<!-- streaming -->',
      streaming: true
    })
    let diffFence: TurnSegment[] = []
    diffFence = applyStreamChunk(diffFence, {
      type: 'token',
      content: '```diff\n+ok',
      timestamp: 50
    })
    expect(buildAnswerParts(diffFence, { isStreaming: true }).every((part) => part.type === 'text')).toBe(true)
    expect(hasStreamingDemoFence('See this.\n```dem')).toBe(true)
    expect(hasStreamingDemoFence('```demo\n<div>')).toBe(true)
    expect(hasStreamingDemoFence('Hello world')).toBe(false)
    expect(hasStreamingDemoFence('```diff\n+ok')).toBe(false)
    expect(hasStreamingDemoFenceGrowth('Hello world', 'Hello world!')).toBe(false)
    expect(hasStreamingDemoFenceGrowth('See this.\n', 'See this.\n```dem')).toBe(true)
    expect(hasStreamingDemoFenceGrowth('Hello', '```demo\n<div>')).toBe(true)
  })

  it('keeps finished tool segment identity across token appends', () => {
    let segments: TurnSegment[] = []
    segments = applyStreamChunk(segments, {
      type: 'tool_start',
      toolName: 'read_file',
      toolCallId: 'r1',
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done',
      toolName: 'read_file',
      toolCallId: 'r1',
      resultSummary: 'ok',
      timestamp: 2
    })
    const tool = segments[0]
    segments = applyStreamChunk(segments, { type: 'token', content: 'A', timestamp: 3 })
    segments = applyStreamChunk(segments, { type: 'token', content: 'B', timestamp: 4 })
    expect(segments[0]).toBe(tool)
    expect(segments[1].content).toBe('AB')
    const afterHeartbeat = applyStreamChunk(segments, {
      type: 'status',
      content: '执行中… 2s',
      timestamp: 5
    })
    expect(afterHeartbeat).toBe(segments)
    expect(afterHeartbeat[0]).toBe(tool)
    const afterPreview = applyStreamChunk(afterHeartbeat, {
      type: 'tool_preview',
      toolName: 'write_file',
      toolArgs: { path: 'a.ts', content: 'x' },
      timestamp: 6
    })
    expect(afterPreview[0]).toBe(tool)
    const afterWriteBeat = applyStreamChunk(afterPreview, {
      type: 'status',
      toolName: 'write_file',
      content: '执行中… 3s',
      timestamp: 7
    })
    expect(afterWriteBeat).toBe(afterPreview)
    expect(afterWriteBeat[0]).toBe(tool)
    expect(afterWriteBeat[afterWriteBeat.length - 1]).toBe(afterPreview[afterPreview.length - 1])
    const afterRealDetail = applyStreamChunk(afterWriteBeat, {
      type: 'status',
      toolName: 'write_file',
      content: 'src/b.ts · 3s',
      timestamp: 8
    })
    expect(afterRealDetail).not.toBe(afterWriteBeat)
    expect(afterRealDetail[0]).toBe(tool)
    expect(afterRealDetail[afterRealDetail.length - 1]).not.toBe(afterWriteBeat[afterWriteBeat.length - 1])
    expect(afterRealDetail[afterRealDetail.length - 1].toolDetail).toBe('src/b.ts')
    const afterSameDetail = applyStreamChunk(afterRealDetail, {
      type: 'status',
      toolName: 'write_file',
      content: 'src/b.ts · 4s',
      timestamp: 9
    })
    expect(afterSameDetail).toBe(afterRealDetail)
    const finalized = finalizeSegments(afterSameDetail, 10)
    expect(finalized[0]).toBe(tool)
  })
})

describe('process flow visibility', () => {
  it('hasProcessFlow hides thinking-only completed turns', () => {
    const segments: TurnSegment[] = [
      {
        id: 's1',
        kind: 'status',
        content: '连接模型并准备任务…',
        status: 'done'
      },
      {
        id: 't1',
        kind: 'thinking',
        content: 'The user wants me to do secret things',
        status: 'done'
      },
      {
        id: 'f1',
        kind: 'text',
        role: 'final',
        content: '完成了',
        status: 'done'
      }
    ]
    expect(hasProcessFlow(segments, { isStreaming: false })).toBe(false)
    expect(processSegments(segments, { isStreaming: false }).some((s) => s.kind === 'thinking')).toBe(
      false
    )
  })

  it('keeps tool steps for completed process flow', () => {
    const segments: TurnSegment[] = [
      {
        id: 'tool1',
        kind: 'tool',
        toolName: 'read_file',
        toolTitle: '读取文件',
        toolDetail: 'package.json',
        content: '读取文件 · package.json',
        status: 'done'
      },
      {
        id: 'f1',
        kind: 'text',
        role: 'final',
        content: '好了',
        status: 'done'
      }
    ]
    expect(hasProcessFlow(segments, { isStreaming: false })).toBe(true)
    expect(processSegments(segments, { isStreaming: false }).some((s) => s.kind === 'tool')).toBe(
      true
    )
  })

  it('extractFinalContent scans last-to-first without copying the array', () => {
    const segments: TurnSegment[] = [
      { id: 'n', kind: 'text', role: 'narration', content: '旁白', status: 'done' },
      { id: 'f', kind: 'text', role: 'final', content: '最终回答', status: 'done' }
    ]
    expect(extractFinalContent(segments)).toBe('最终回答')
    expect(extractFinalContent(segments, { isStreaming: true })).toBe('最终回答')
    const live: TurnSegment[] = [
      { id: 't', kind: 'tool', status: 'active', toolName: 'read_file' },
      { id: 'a', kind: 'text', role: 'final', content: '正在写', status: 'active' }
    ]
    expect(extractFinalContent(live, { isStreaming: true })).toBe('正在写')
  })

  it('does not clone segments for harness_mode control chunks', () => {
    const segments: TurnSegment[] = [
      { id: 't', kind: 'text', role: 'final', content: '已有', status: 'active' }
    ]
    const next = applyStreamChunk(segments, { type: 'harness_mode', harnessPhase: 'plan' })
    expect(next).toBe(segments)
  })
})