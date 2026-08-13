import { describe, expect, it } from 'vitest'
import { deriveChronologicalSteps } from './process-phases'
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
  })
})
