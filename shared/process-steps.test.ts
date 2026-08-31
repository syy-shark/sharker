import { describe, expect, it } from 'vitest'
import { buildProcessSteps } from './process-steps'

describe('process-steps identity', () => {
  it('keeps think and tool keys when labels grow or Running becomes Ran', () => {
    const waiting = buildProcessSteps({
      activities: [],
      isStreaming: true
    })
    expect(waiting[0]?.id).toBe('think')
    const thinking = buildProcessSteps({
      activities: [],
      hadThinking: true,
      thinkingText: '正在分析任务目标与约束',
      isStreaming: true,
      isThinkingLive: true
    })
    expect(thinking[0]?.id).toBe('think')

    const running = buildProcessSteps({
      activities: [{ kind: 'tool', label: 'run_terminal_cmd · sl' }],
      isStreaming: true,
      activeTool: 'run_terminal_cmd'
    })
    const grown = buildProcessSteps({
      activities: [{ kind: 'tool', label: 'run_terminal_cmd · sleep 2' }],
      isStreaming: true,
      activeTool: 'run_terminal_cmd'
    })
    expect(running[0]?.id).toBe('tool-0')
    expect(grown[0]?.id).toBe(running[0]?.id)
    expect(grown[0]?.title).toBe('Running sleep 2')

    const ran = buildProcessSteps({
      activities: [{ kind: 'tool', label: 'run_terminal_cmd · sleep 2' }]
    })
    expect(ran[0]?.id).toBe(grown[0]?.id)
    expect(ran[0]?.title).toBe('Ran sleep 2')
    expect(ran[0]?.id).not.toContain('sleep 2')
  })
})
