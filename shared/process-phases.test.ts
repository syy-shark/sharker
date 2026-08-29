import { describe, expect, it } from 'vitest'
import { deriveChronologicalSteps, reuseProcessPhaseSteps } from './process-phases'
import type { TurnSegment } from './types'

describe('process phases privacy', () => {
  it('never exposes raw thinking content as step title', () => {
    const segments: TurnSegment[] = [
      {
        id: 't1',
        kind: 'thinking',
        content: 'The user wants me to read package.json secretly',
        status: 'done',
        startedAt: 1,
        endedAt: 2
      },
      {
        id: 'tool1',
        kind: 'tool',
        toolName: 'read_file',
        toolTitle: '读取文件',
        toolDetail: 'package.json',
        content: '读取文件 · package.json',
        status: 'done',
        startedAt: 3,
        endedAt: 4
      }
    ]
    const steps = deriveChronologicalSteps(segments)
    const think = steps.find((s) => s.kind === 'thinking')
    expect(think?.title).toBe('分析任务目标与约束')
    expect(think?.title).not.toMatch(/package\.json secretly|The user wants/)
    const grown = deriveChronologicalSteps([
      ...segments,
      {
        id: 'tool2',
        kind: 'tool',
        toolName: 'write_file',
        toolTitle: '写入文件',
        toolDetail: 'src/a.ts',
        content: '写入文件 · src/a.ts',
        status: 'active',
        startedAt: 5
      }
    ])
    const reused = reuseProcessPhaseSteps(steps, grown)
    expect(reused[0]).toBe(steps[0])
    expect(reused[1]).toBe(steps[1])
    expect(reused).toHaveLength(3)
    expect(reused[2]).toBe(grown[2])
    const clonedGrown = grown.map((step, index) =>
      index < 2 ? { ...step, segment: { ...step.segment } } : step
    )
    const reusedCloned = reuseProcessPhaseSteps(steps, clonedGrown)
    expect(reusedCloned[0]).toBe(steps[0])
    expect(reusedCloned[1]).toBe(steps[1])
    expect(reusedCloned[2]).toBe(clonedGrown[2])
    const search = deriveChronologicalSteps([
      {
        id: 'ws1',
        kind: 'tool',
        toolName: 'web_search',
        toolTitle: '网页搜索',
        toolArgs: { query: 'codex desktop' },
        status: 'active',
        startedAt: 6
      }
    ])
    expect(search[0]?.title).toBe('Searching the web')
    const searched = deriveChronologicalSteps([
      {
        id: 'ws2',
        kind: 'tool',
        toolName: 'web_search',
        toolTitle: '网页搜索',
        toolArgs: { query: 'codex desktop' },
        status: 'done',
        startedAt: 6,
        endedAt: 7
      }
    ])
    expect(searched[0]?.title).toBe('Searched the web for codex desktop')
    const planning = deriveChronologicalSteps([
      {
        id: 'up1',
        kind: 'tool',
        toolName: 'update_plan',
        toolTitle: '更新计划',
        toolArgs: {
          plan: [
            { step: 'Add types', status: 'completed' },
            { step: 'Wire tool', status: 'in_progress' }
          ]
        },
        status: 'active',
        startedAt: 8
      }
    ])
    expect(planning[0]?.title).toBe('Wire tool')
    const mcpLive = deriveChronologicalSteps([
      {
        id: 'mcp1',
        kind: 'tool',
        toolName: 'mcp_github__search',
        toolTitle: 'mcp_github__search',
        toolArgs: { q: 'codex' },
        resultSummary: '{"items":[1,2,3]}',
        resultOutput: '{"items":[1,2,3]}',
        status: 'active',
        startedAt: 9
      }
    ])
    expect(mcpLive[0]?.title).toBe('Calling github.search({"q":"codex"})')
    expect(mcpLive[0]?.detail).toBeUndefined()
    const mcpDone = deriveChronologicalSteps([
      {
        id: 'mcp2',
        kind: 'tool',
        toolName: 'mcp_call_tool',
        toolTitle: 'MCP 调用',
        toolArgs: { server: 'docs', tool_name: 'lookup', arguments: { q: 'plan' } },
        status: 'done',
        startedAt: 10,
        endedAt: 11
      }
    ])
    expect(mcpDone[0]?.title).toBe('Called docs.lookup({"q":"plan"})')
  })
})
