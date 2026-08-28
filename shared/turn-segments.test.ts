import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  applyStreamChunk,
  finalizeSegments,
  hasProcessFlow,
  processSegments
} from './turn-segments'
import { deriveProcessPhases } from './process-phases'

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
    expect(segments[0]).toMatchObject({ kind: 'status', status: 'active' })
    segments = applyStreamChunk(segments, { type: 'think', content: '分析', timestamp: 2 })
    expect(segments[0].status).toBe('done')
    expect(segments.some((s) => s.kind === 'thinking' && s.status === 'active')).toBe(true)
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
})