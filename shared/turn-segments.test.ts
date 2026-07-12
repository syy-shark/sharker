import { describe, expect, it } from 'vitest'
import { applyStreamChunk, finalizeSegments } from './turn-segments'
import { deriveProcessPhases } from './process-phases'
import type { TurnSegment } from './types'

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
    expect(segments[1].status).toBe('cancelled')
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
})
