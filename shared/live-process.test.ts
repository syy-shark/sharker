import { describe, expect, it } from 'vitest'
import { applyStreamChunk, finalizeSegments, processSegments } from './turn-segments'
import { deriveChronologicalSteps, deriveProcessPhases, summarizeProcessPhases } from './process-phases'

describe('live process seed', () => {
  it('shows waiting status and understand phase on turn_start', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.some((s) => s.status === 'active')).toBe(true)
    const model = deriveProcessPhases(segments, { isStreaming: true })
    expect(model.currentPhase === 'understand' || model.groups.some(g => g.state === 'active')).toBe(true)
  })


  it('generating answer keeps current phase after tools complete', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'tool_start', toolName: 'read_file', toolArgs: { path: 'a.ts' }, toolCallId: 'r1', timestamp: 2
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'read_file', toolCallId: 'r1', resultSummary: 'ok', timestamp: 3
    })
    segments = applyStreamChunk(segments, { type: 'token', content: '结论', timestamp: 4 })
    const model = deriveProcessPhases(segments, { isStreaming: true })
    // 流式写回答时仍应有当前阶段，避免进度轨全部变灰像停住
    expect(model.currentPhase).toBeTruthy()
  })


  it('processSegments keeps seed status for live process panel', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    const process = processSegments(segments, { isStreaming: true })
    expect(process.some((s) => s.kind === 'status' && s.status === 'active')).toBe(true)
  })


  it('approval_needed adds waiting status and keeps live process active', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start', toolName: 'run_terminal_cmd', toolCallId: 'c1', timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'approval_needed',
      timestamp: 2,
      approval: {
        id: 'a1',
        title: '执行命令',
        description: 'rm -rf',
        toolName: 'run_terminal_cmd',
        args: { command: 'rm -rf /tmp/x' }
      }
    })
    expect(segments.some((s) => s.kind === 'status' && s.status === 'active' && (s.content ?? '').includes('等待确认'))).toBe(true)
    const model = deriveProcessPhases(segments, { isStreaming: true })
    expect(model.groups.some((g) => g.state === 'active')).toBe(true)
    segments = applyStreamChunk(segments, {
      type: 'user_input_needed',
      timestamp: 3,
      toolName: 'request_user_input',
      userInput: {
        id: 'u1',
        questions: [
          {
            id: 'scope',
            header: 'Scope',
            question: 'What should we change?',
            options: [
              { label: 'Minimal (Recommended)', description: 'Smallest fix.' },
              { label: 'Rewrite', description: 'Replace the module.' }
            ]
          }
        ]
      }
    })
    expect(segments.some((s) => s.kind === 'status' && s.status === 'active' && (s.content ?? '').includes('等待选择'))).toBe(true)
  })


  it('tool status updates active tool detail for live progress', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'cmd-1',
      toolArgs: { command: 'npm test' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '正在运行测试…',
      timestamp: 2
    })
    const tool = segments.find((s) => s.toolCallId === 'cmd-1')
    expect(tool?.status).toBe('active')
    expect(tool?.toolDetail).toContain('测试')
  })


  it('active tool detail prefers resultSummary for live progress', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'cmd-2',
      toolArgs: { command: 'npm test' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '通过 12 个测试…',
      timestamp: 2
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.detail).toContain('测试')
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '执行中… 3s',
      timestamp: 3
    })
    const clocked = deriveChronologicalSteps(segments, { isStreaming: true }).find(
      (s) => s.status === 'active'
    )
    expect(clocked?.detail || '').not.toMatch(/执行中/)
  })


  it('status without toolName attaches to sole active tool', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'web_search',
      toolCallId: 's1',
      toolArgs: { query: 'test' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      content: 'Searching the web',
      timestamp: 2
    })
    const tool = segments.find((s) => s.toolCallId === 's1')
    expect(tool?.toolDetail).toBe('Searching the web')
    let mcp = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'mcp_github__search',
      toolCallId: 'm1',
      toolArgs: { q: 'codex' },
      timestamp: 3
    })
    const mcpSteps = deriveChronologicalSteps(mcp, { isStreaming: true })
    expect(mcpSteps[0]?.title).toBe('Calling github.search({"q":"codex"})')
  })


  it('seed turn has active chronological step for live placeholder', () => {
    const segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.some((s) => s.status === 'active')).toBe(true)
  })

  it('run_terminal_cmd title keeps shell flags like -rf', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'rm1',
      toolArgs: { command: 'rm -rf /tmp/sharker-apcmd-demo' },
      timestamp: 1
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = [...steps].reverse().find((s) => s.status === 'active')
    expect(active?.title).toMatch(/^Running /)
    expect(active?.title).toMatch(/rm\s+-rf/)
  })

})


  it('tool gap keeps phase active without freezing process model', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'tool_start', toolName: 'read_file', toolArgs: { path: 'a.ts' }, toolCallId: 'r1', timestamp: 2
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'read_file', toolCallId: 'r1', resultSummary: 'ok', timestamp: 3
    })
    // 工具之间空档：尚无最终 token，阶段仍应可派生（UI 侧会显示规划下一步，而不是死寂）
    const model = deriveProcessPhases(segments, { isStreaming: true })
    expect(model.currentPhase).toBeTruthy()
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    expect(steps.some((s) => s.status === 'active')).toBe(false)
    expect(steps.length).toBeGreaterThan(0)
  })



  it('planning status after tools keeps live process active', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'tool_start', toolName: 'read_file', toolArgs: { path: 'a.ts' }, toolCallId: 'r1', timestamp: 2
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'read_file', toolCallId: 'r1', resultSummary: 'ok', timestamp: 3
    })
    segments = applyStreamChunk(segments, {
      type: 'status', content: '根据已完成步骤规划下一步…', timestamp: 4
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    expect(steps.some((s) => s.status === 'active')).toBe(true)
    expect(steps.some((s) => (s.title + (s.detail ?? '')).includes('规划'))).toBe(true)
  })


  it('error outcome summary is not completed', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'error',
      error: 'API 403 未授权',
      timestamp: 2
    })
    const model = deriveProcessPhases(segments, { isStreaming: false })
    const summary = summarizeProcessPhases(model, 6, 'error')
    expect(summary).toContain('未完成')
    expect(summary).not.toMatch(/^完成/)
  })


  it('code-like live summary does not replace path detail', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'read_file',
      toolArgs: { path: 'package.json' },
      toolCallId: 'r-code',
      timestamp: 1
    })
    // simulate mid-status raw first line
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'read_file',
      content: 'L1: {',
      timestamp: 2
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title || '').toMatch(/package\.json|读取/)
    expect(active?.detail || '').not.toMatch(/^L1:/)
  })

  it('planning status title is compact and remains active', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'tool_start', toolName: 'read_file', toolArgs: { path: 'a.ts' }, toolCallId: 'r1', timestamp: 2
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'read_file', toolCallId: 'r1', resultSummary: 'ok', timestamp: 3
    })
    segments = applyStreamChunk(segments, {
      type: 'status', content: '根据已完成步骤规划下一步…', timestamp: 4
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title).toBe('规划下一步')
    expect(steps.some((s) => s.kind === 'tool' && s.title.includes('读取'))).toBe(true)
  })

  it('prepare list_directory status title is compact', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'status',
      content: '正在准备列出目录',
      timestamp: 2
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title).toBe('正在准备列出目录')
  })

  it('approval_resolved marks waiting status done with reject/allow text', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start', toolName: 'run_terminal_cmd', toolCallId: 'c1', timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'approval_needed',
      timestamp: 2,
      approval: {
        id: 'a1',
        title: '高危操作确认',
        description: 'rm -rf',
        toolName: 'run_terminal_cmd',
        args: { command: 'rm -rf /tmp/x' }
      }
    })
    segments = applyStreamChunk(segments, {
      type: 'approval_resolved',
      toolName: 'run_terminal_cmd',
      toolCallId: 'c1',
      approved: false,
      timestamp: 3
    })
    const status = segments.find((s) => s.kind === 'status' && (s.content || '').includes('拒绝'))
    expect(status?.status).toBe('done')
    expect(status?.content || '').toMatch(/拒绝/)
  })

  it('error outcome summary stays unfinished', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'error',
      error: 'API 500',
      timestamp: 2
    })
    const model = deriveProcessPhases(segments, { isStreaming: false })
    const summary = summarizeProcessPhases(model, 3, 'error')
    expect(summary).toContain('未完成')
  })

  it('list_dir titles include target leaf to avoid identical step labels', () => {
    let segments = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segments = applyStreamChunk(segments, {
      type: 'tool_start',
      toolName: 'list_dir',
      toolArgs: { path: 'src' },
      toolCallId: 'l1',
      timestamp: 2
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done', toolName: 'list_dir', toolCallId: 'l1', resultSummary: 'ok', timestamp: 3
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_start',
      toolName: 'list_dir',
      toolArgs: { path: 'docs' },
      toolCallId: 'l2',
      timestamp: 4
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const listSteps = steps.filter((s) => s.kind === 'tool' && (s.title.includes('列出') || s.segment.toolName === 'list_dir'))
    expect(listSteps.length).toBeGreaterThanOrEqual(2)
    // 两个目录步骤标题应可区分
    expect(listSteps[0].title).not.toBe(listSteps[1].title)
    expect(listSteps.some((s) => s.title.includes('src') || (s.detail || '').includes('src'))).toBe(true)
  })

  it('read_file titles include target leaf', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'read_file',
      toolArgs: { path: 'package.json' },
      toolCallId: 'r1',
      timestamp: 1
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title).toMatch(/读取/)
    expect(active?.title).toContain('package.json')
  })

  it('run_terminal_cmd titles include short command leaf', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolArgs: { command: 'npm test -- --runInBand' },
      toolCallId: 'c1',
      timestamp: 1
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title).toMatch(/^Running /)
    // detail/title should carry command hint
    expect(`${active?.title || ''} ${active?.detail || ''}`).toMatch(/npm test/)
  })


describe('terminal progress title stability', () => {
  it('progress heartbeat keeps command title stable', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'sleep1',
      toolArgs: { command: 'sleep 4; echo done' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '已启动命令…',
      timestamp: 2
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '执行中… 2s',
      timestamp: 3
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title).toMatch(/^Running /)
    expect(active?.title).toMatch(/sleep/)
    expect(active?.title).not.toMatch(/执行中/)
    expect(active?.detail || '').not.toMatch(/执行中|已启动/)
  })

  it('cleanInlineText keeps shell flags in command detail path', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'rm2',
      toolArgs: { command: 'rm -rf /tmp/sharker-demo' },
      timestamp: 1
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title).toMatch(/rm\s+-rf/)
  })

  it('command titles keep underscores from args', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'u1',
      toolArgs: { command: 'echo STOP_TEST_DONE' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '执行中… 2s',
      timestamp: 2
    })
    const steps = deriveChronologicalSteps(segments, { isStreaming: true })
    const active = steps.find((s) => s.status === 'active')
    expect(active?.title).toContain('STOP_TEST_DONE')
    expect(active?.title).not.toContain('STOP TEST DONE')
    expect(active?.detail || '').not.toMatch(/执行中/)
  })
})

describe('finalize interrupted tools', () => {
  it('finalizeSegments marks interrupted tools as cancelled and clears progress summary', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'stop1',
      toolArgs: { command: 'sleep 12; echo STOP_TEST_DONE' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '已启动命令…',
      timestamp: 2
    })
    const finalized = finalizeSegments(segments, 3)
    const tool = finalized.find((s) => s.toolCallId === 'stop1')
    expect(tool?.status).toBe('cancelled')
    expect(tool?.resultSummary).toBe('已停止')
    expect(tool?.toolArgs?.command).toContain('STOP_TEST_DONE')
    const steps = deriveChronologicalSteps(finalized, { isStreaming: false })
    const step = steps.find((s) => s.segment.toolCallId === 'stop1')
    expect(step?.title).toContain('STOP_TEST_DONE')
    expect(step?.detail || '').not.toMatch(/已启动命令/)
  })
})

describe('completed command detail dedupe', () => {
  it('completed command detail does not repeat title command', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'c-done',
      toolArgs: { command: 'sleep 12; echo STOP_TEST_DONE' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '已启动命令…',
      timestamp: 2
    })
    segments = finalizeSegments(segments, 3)
    const steps = deriveChronologicalSteps(segments, { isStreaming: false })
    const step = steps.find((s) => s.segment.toolCallId === 'c-done')
    expect(step?.title).toContain('STOP_TEST_DONE')
    // detail 不应再重复整段 command
    expect(step?.detail === undefined || !step.title.includes(step.detail)).toBe(true)
    expect(step?.detail || '').not.toMatch(/已启动命令/)
  })
})

describe('command totals', () => {
  it('cancelled commands are not counted in totals', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'c-cancel',
      toolArgs: { command: 'sleep 3' },
      timestamp: 1
    })
    segments = finalizeSegments(segments, 2)
    const model = deriveProcessPhases(segments, { isStreaming: false })
    expect(model.totals.commands).toBe(0)
  })

  it('completed commands are counted once', () => {
    let segments = applyStreamChunk([], {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'c-ok',
      toolArgs: { command: 'echo ok' },
      timestamp: 1
    })
    segments = applyStreamChunk(segments, {
      type: 'tool_done',
      toolName: 'run_terminal_cmd',
      toolCallId: 'c-ok',
      resultSummary: 'ok',
      timestamp: 2
    })
    const model = deriveProcessPhases(segments, { isStreaming: false })
    expect(model.totals.commands).toBe(1)
  })
})

describe('status bridge command totals', () => {
  it('status bridge steps do not inflate command totals on abort', () => {
    let segs = applyStreamChunk([], { type: 'turn_start', timestamp: 1 })
    segs = applyStreamChunk(segs, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '正在准备运行命令',
      timestamp: 2
    })
    segs = applyStreamChunk(segs, {
      type: 'tool_start',
      toolName: 'run_terminal_cmd',
      toolCallId: 'c-bridge',
      toolArgs: { command: 'sleep 10; echo STOP_ZERO_COUNT' },
      timestamp: 3
    })
    segs = applyStreamChunk(segs, {
      type: 'status',
      toolName: 'run_terminal_cmd',
      content: '已启动命令…',
      timestamp: 4
    })
    segs = applyStreamChunk(segs, { type: 'turn_cancelled', timestamp: 5 })
    segs = finalizeSegments(segs, 6)
    const model = deriveProcessPhases(segs, { isStreaming: false })
    expect(model.totals.commands).toBe(0)
    expect(summarizeProcessPhases(model, 3, 'aborted')).not.toMatch(/运行 \d+ 个命令/)
  })
})
