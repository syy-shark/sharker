import { describe, expect, it } from 'vitest'
import {
  appendProcessPhaseStepOnToolStart,
  deriveChronologicalSteps,
  retargetProcessPhaseStepsOnToolMeta,
  reuseProcessPhaseSteps
} from './process-phases'
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
    const cmdRunning: TurnSegment = {
      id: 'cmd1',
      kind: 'tool',
      toolName: 'run_terminal_cmd',
      toolArgs: { command: 'npm test' },
      status: 'active',
      startedAt: 8
    }
    const cmdLine: TurnSegment = { ...cmdRunning, toolDetail: 'PASS src/a.test.ts' }
    const cmdSteps = deriveChronologicalSteps([cmdRunning], { isStreaming: true })
    const retargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdLine],
      true
    )
    expect(retargeted).toBe(cmdSteps)
    const cmdPath: TurnSegment = { ...cmdRunning, toolDetail: 'src/a.ts' }
    const pathRetargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdPath],
      true
    )
    expect(pathRetargeted).not.toBeNull()
    expect(pathRetargeted).not.toBe(cmdSteps)
    expect(pathRetargeted![0].segment).toBe(cmdPath)
    expect(pathRetargeted![0].title).toBe(cmdSteps[0].title)
    expect(pathRetargeted![0]).toMatchObject({ id: cmdSteps[0].id, phase: cmdSteps[0].phase })
    const cmdPreview: TurnSegment = {
      ...cmdRunning,
      editPreview: [{ path: 'a.ts', stats: { added: 1, removed: 0 } }]
    }
    expect(
      retargetProcessPhaseStepsOnToolMeta(cmdSteps, [cmdRunning], [cmdPreview], true)
    ).toBeNull()
    const cmdDone: TurnSegment = { ...cmdRunning, status: 'done' }
    const doneRetargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdDone],
      true
    )
    expect(doneRetargeted).not.toBeNull()
    expect(doneRetargeted).not.toBe(cmdSteps)
    expect(doneRetargeted![0].status).toBe('done')
    expect(doneRetargeted![0].segment).toBe(cmdDone)
    expect(doneRetargeted![0].id).toBe(cmdSteps[0].id)
    const cmdNext: TurnSegment = {
      id: 'read1',
      kind: 'tool',
      toolName: 'read_file',
      toolTitle: '读取文件',
      toolDetail: 'src/b.ts',
      status: 'active',
      startedAt: 9
    }
    const appended = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, cmdNext],
      true
    )
    expect(appended).not.toBeNull()
    expect(appended).toHaveLength(2)
    expect(appended![0]).toBe(doneRetargeted![0])
    expect(appended![1].segment).toBe(cmdNext)
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
    expect(searched[0]?.title).toBe('Searched')
    expect(searched[0]?.detail).toBe('codex desktop')
    expect(search[0]?.detail).toBe('codex desktop')
    const fetching = deriveChronologicalSteps([
      {
        id: 'wf1',
        kind: 'tool',
        toolName: 'web_fetch',
        toolTitle: '抓取网页',
        toolArgs: { url: 'https://example.com/docs' },
        status: 'active',
        startedAt: 8
      }
    ])
    expect(fetching[0]?.title).toBe('Searching the web')
    expect(fetching[0]?.detail).toBe('https://example.com/docs')
    const fetched = deriveChronologicalSteps([
      {
        id: 'wf2',
        kind: 'tool',
        toolName: 'web_fetch',
        toolTitle: '抓取网页',
        toolArgs: { url: 'https://example.com/docs' },
        status: 'done',
        startedAt: 8,
        endedAt: 9
      }
    ])
    expect(fetched[0]?.title).toBe('Searched')
    expect(fetched[0]?.detail).toBe('https://example.com/docs')
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
    const running = deriveChronologicalSteps([
      {
        id: 'ex1',
        kind: 'tool',
        toolName: 'run_terminal_cmd',
        toolTitle: '运行命令',
        toolArgs: { command: 'rm -rf /tmp/demo' },
        status: 'active',
        startedAt: 12
      }
    ])
    expect(running[0]?.title).toBe('Running rm -rf /tmp/demo')
    const ran = deriveChronologicalSteps([
      {
        id: 'ex2',
        kind: 'tool',
        toolName: 'run_terminal_cmd',
        toolTitle: '运行命令',
        toolArgs: { command: 'sleep 2' },
        status: 'done',
        startedAt: 13,
        endedAt: 14
      }
    ])
    expect(ran[0]?.title).toBe('Ran sleep 2')
    const reading = deriveChronologicalSteps([
      {
        id: 'rd1',
        kind: 'tool',
        toolName: 'read_file',
        toolTitle: '读取文件',
        toolArgs: { path: 'src/App.tsx' },
        toolDetail: 'src/App.tsx',
        status: 'active',
        startedAt: 15
      }
    ])
    expect(reading[0]?.title).toBe('Read App.tsx')
    expect(reading[0]?.detail).toBeUndefined()
    const listing = deriveChronologicalSteps([
      {
        id: 'ls1',
        kind: 'tool',
        toolName: 'list_dir',
        toolTitle: '列出目录',
        toolArgs: { path: 'src' },
        status: 'done',
        startedAt: 16,
        endedAt: 17
      }
    ])
    expect(listing[0]?.title).toBe('List src')
    const searching = deriveChronologicalSteps([
      {
        id: 'gr1',
        kind: 'tool',
        toolName: 'grep',
        toolTitle: '搜索内容',
        toolArgs: { pattern: 'LiveHead', path: 'shared' },
        status: 'done',
        startedAt: 18,
        endedAt: 19
      }
    ])
    expect(searching[0]?.title).toBe('Search LiveHead in shared')
    const editing = deriveChronologicalSteps([
      {
        id: 'ed1',
        kind: 'tool',
        toolName: 'write_file',
        toolTitle: '写入文件',
        toolArgs: { path: 'src/a.ts' },
        toolDetail: 'src/a.ts',
        status: 'active',
        startedAt: 20
      }
    ])
    expect(editing[0]?.title).toBe('Edited a.ts')
    const deleted = deriveChronologicalSteps([
      {
        id: 'del1',
        kind: 'tool',
        toolName: 'delete_path',
        toolTitle: '删除路径',
        toolArgs: { path: 'src/gone.ts' },
        status: 'done',
        startedAt: 21,
        endedAt: 22
      }
    ])
    expect(deleted[0]?.title).toBe('Deleted gone.ts')
    const failedPatch = deriveChronologicalSteps([
      {
        id: 'pt1',
        kind: 'tool',
        toolName: 'apply_patch',
        toolTitle: '应用补丁',
        status: 'error',
        startedAt: 23,
        endedAt: 24
      }
    ])
    expect(failedPatch[0]?.title).toBe('Failed to apply patch')
    const compacting = deriveChronologicalSteps([
      {
        id: 'cp1',
        kind: 'tool',
        toolName: 'compress',
        toolTitle: 'Automatically compacting context',
        status: 'active',
        startedAt: 25
      }
    ])
    expect(compacting[0]?.title).toBe('Automatically compacting context')
    const compacted = deriveChronologicalSteps([
      {
        id: 'cp2',
        kind: 'tool',
        toolName: 'compress',
        toolTitle: 'Automatically compacting context',
        status: 'done',
        startedAt: 26,
        endedAt: 27
      }
    ])
    expect(compacted[0]?.title).toBe('Context automatically compacted')
    const asking = deriveChronologicalSteps([
      {
        id: 'ask1',
        kind: 'tool',
        toolName: 'request_user_input',
        toolTitle: '询问用户',
        toolArgs: {
          questions: [
            {
              id: 'scope',
              header: 'Scope',
              question: 'What should we change?',
              options: [
                { label: 'Minimal', description: 'Smallest fix.' },
                { label: 'Rewrite', description: 'Replace the module.' }
              ]
            }
          ]
        },
        status: 'active',
        startedAt: 28
      }
    ])
    expect(asking[0]?.title).toBe('Scope')
    const askingMany = deriveChronologicalSteps([
      {
        id: 'ask2',
        kind: 'tool',
        toolName: 'request_user_input',
        toolTitle: '询问用户',
        toolArgs: {
          questions: [
            {
              id: 'a',
              header: 'One',
              question: 'First?',
              options: [
                { label: 'A', description: 'a' },
                { label: 'B', description: 'b' }
              ]
            },
            {
              id: 'b',
              header: 'Two',
              question: 'Second?',
              options: [
                { label: 'C', description: 'c' },
                { label: 'D', description: 'd' }
              ]
            }
          ]
        },
        status: 'done',
        startedAt: 29,
        endedAt: 30
      }
    ])
    expect(askingMany[0]?.title).toBe('2 questions requested')
    const viewing = deriveChronologicalSteps([
      {
        id: 'img1',
        kind: 'tool',
        toolName: 'view_image',
        toolTitle: '查看图片',
        toolArgs: { path: '/tmp/shot.png' },
        toolDetail: '/tmp/shot.png',
        resultSummary: 'Viewed image: /tmp/shot.png',
        resultOutput: 'Viewed image: /tmp/shot.png\npath: /tmp/shot.png\nbytes: 12',
        status: 'done',
        startedAt: 31,
        endedAt: 32
      }
    ])
    expect(viewing[0]?.title).toBe('Viewed Image')
    expect(viewing[0]?.detail).toBe('shot.png')
    const reconnecting = deriveChronologicalSteps([
      {
        id: 're1',
        kind: 'status',
        content: '正在重新连接… 2/5',
        status: 'active',
        startedAt: 33
      }
    ])
    expect(reconnecting[0]?.title).toBe('Reconnecting... 2/5')
    const reconnectOfficial = deriveChronologicalSteps([
      {
        id: 're2',
        kind: 'status',
        content: 'Reconnecting... 4/5',
        status: 'active',
        startedAt: 34
      }
    ])
    expect(reconnectOfficial[0]?.title).toBe('Reconnecting... 4/5')
    const connecting = deriveChronologicalSteps([
      {
        id: 'cn1',
        kind: 'status',
        content: '连接模型并准备任务…',
        status: 'active',
        startedAt: 35
      }
    ])
    expect(connecting[0]?.title).toBe('Thinking')
    const connectingOfficial = deriveChronologicalSteps([
      {
        id: 'cn2',
        kind: 'status',
        content: 'Thinking',
        status: 'active',
        startedAt: 36
      }
    ])
    expect(connectingOfficial[0]?.title).toBe('Thinking')
  })
})
