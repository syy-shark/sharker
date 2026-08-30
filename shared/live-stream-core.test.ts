import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  hasLiveProcessPhaseGrowHold,
  nextLiveAnswerView,
  nextLiveProcessView,
  shouldPrefetchLiveStreamTable,
  shouldSkipLiveAnswerIdentity,
  shouldSkipLiveStreamDerivation,
  type LiveAnswerView
} from './live-stream-core'
import { EMPTY_LIVE_STREAM_UI } from './live-stream-ui'
import { appendProcessPhaseStepOnToolStart, deriveChronologicalSteps } from './process-phases'

function think(content: string): TurnSegment {
  return { id: 'th1', kind: 'thinking', status: 'active', content }
}

function prose(content: string): TurnSegment {
  return { id: 'a1', kind: 'text', role: 'final', status: 'active', content }
}

function status(content: string): TurnSegment {
  return { id: 'st1', kind: 'status', status: 'active', content }
}

function tool(toolStatus: TurnSegment['status'] = 'active'): TurnSegment {
  return { id: 't1', kind: 'tool', toolName: 'read_file', status: toolStatus, content: '' }
}

const emptyAnswer: LiveAnswerView = {
  parts: [],
  closed: [],
  tail: null,
  show: false,
  copyable: '',
  hasCopyable: false
}

function src(rel: string): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), rel), 'utf8')
}

describe('live-stream-core (16ms path without combinatorial table)', () => {
  it('skips derivation on think / status / prose growth without treating it as a new tool', () => {
    expect(shouldSkipLiveStreamDerivation([think('Hmm')], [think('Hmm more')])).toBe('think')
    expect(shouldSkipLiveStreamDerivation([status('Preparing')], [status('Preparing…')])).toBe(
      'status'
    )
    expect(shouldSkipLiveStreamDerivation([prose('Hello')], [prose('Hello world')])).toBe('text')
  })

  it('classifies a newly appended tool after closed no-fence prose without the table', () => {
    const hello = prose('Hello')
    const closed: TurnSegment = { ...hello, status: 'done' }
    const nextTool = tool('active')
    expect(shouldSkipLiveStreamDerivation([hello], [closed, nextTool])).toBe('tool')
    expect(hasLiveProcessPhaseGrowHold([hello], [closed, nextTool])).toBe(true)
  })

  it('classifies a newly appended tool after think, tool, and streaming no-fence prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, reading, reply, nextTool])
    ).toBe('tool')
    expect(
      hasLiveProcessPhaseGrowHold([thought, reading, reply], [thought, reading, reply, nextTool])
    ).toBe(true)
  })

  it('classifies an in-place regular tool settle after no-fence prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const settled: TurnSegment = { ...reading, status: 'done', toolDetail: '12 lines' }
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, settled, reply])
    ).toBe('tool')
    expect(hasLiveProcessPhaseGrowHold([thought, reading, reply], [thought, settled, reply])).toBe(
      true
    )
    const demo: TurnSegment = {
      id: 'd1',
      kind: 'tool',
      toolName: 'present_inline_demo',
      status: 'active',
      content: ''
    }
    const demoDone: TurnSegment = { ...demo, status: 'done' }
    expect(shouldSkipLiveStreamDerivation([demo, reply], [demoDone, reply])).toBe('text')
  })

  it('classifies parallel in-place tool settles after no-fence prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const listing: TurnSegment = { ...tool('active'), id: 't2', toolName: 'list_dir' }
    const reply = prose('Hi')
    const readingDone: TurnSegment = { ...reading, status: 'done' }
    const listingDone: TurnSegment = { ...listing, status: 'done' }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, listing, reply],
        [thought, readingDone, listingDone, reply]
      )
    ).toBe('tool')
    expect(
      hasLiveProcessPhaseGrowHold(
        [thought, reading, listing, reply],
        [thought, readingDone, listingDone, reply]
      )
    ).toBe(true)
  })

  it('classifies an in-place status settle after no-fence prose without the table', () => {
    const thought = think('Hmm')
    const plan = status('根据已完成步骤规划下一步…')
    const reply = prose('Hi')
    const done: TurnSegment = { ...plan, status: 'done' }
    expect(shouldSkipLiveStreamDerivation([thought, plan, reply], [thought, done, reply])).toBe(
      'status'
    )
    expect(hasLiveProcessPhaseGrowHold([thought, plan, reply], [thought, done, reply])).toBe(true)
    const ask: TurnSegment = { ...plan, content: 'API style', toolName: 'request_user_input' }
    expect(shouldSkipLiveStreamDerivation([thought, plan, reply], [thought, ask, reply])).toBeNull()
    const reconnect = status('Reconnecting... 1/5')
    const reconnect2: TurnSegment = { ...reconnect, content: 'Reconnecting... 2/5' }
    expect(shouldSkipLiveStreamDerivation([reconnect], [reconnect2])).toBe('status')
    expect(
      shouldSkipLiveStreamDerivation([thought, reconnect, reply], [thought, reconnect2, reply])
    ).toBe('status')
  })

  it('classifies a settled prefix tool plus a newly appended tool after no-fence prose', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const settled: TurnSegment = { ...reading, status: 'done' }
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, settled, reply, nextTool])
    ).toBe('tool')
  })

  it('classifies Awaiting approval or Ask User extras after no-fence prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const awaiting = status('Awaiting approval')
    const ask: TurnSegment = {
      id: 'ask1',
      kind: 'tool',
      toolName: 'request_user_input',
      status: 'active',
      content: '',
      toolTitle: 'Question requested'
    }
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, reading, reply, awaiting])
    ).toBe('status')
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, reading, reply, ask])
    ).toBe('tool')
  })

  it('classifies a second no-fence text after existing prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const extraText: TurnSegment = {
      id: 'a2',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'Error: boom'
    }
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, reading, reply, extraText])
    ).toBe('text')
    expect(
      hasLiveProcessPhaseGrowHold([thought, reading, reply], [thought, reading, reply, extraText])
    ).toBe(true)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, extraText]
    })
    expect(nextAnswer.closed.some((part) => part.type === 'text' && part.content === 'Hi')).toBe(
      true
    )
    expect(nextAnswer.tail?.content).toBe('Error: boom')
    expect(nextAnswer.copyable).toContain('Hi')
    expect(nextAnswer.copyable).toContain('Error: boom')
  })

  it('classifies a second no-fence text plus tool or status after existing prose', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const extraText: TurnSegment = {
      id: 'a2',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'Error: boom'
    }
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    const reconnect = status('Reconnecting... 1/5')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply],
        [thought, reading, reply, extraText, nextTool]
      )
    ).toBe('tool')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply],
        [thought, reading, reply, extraText, reconnect]
      )
    ).toBe('status')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply],
        [thought, reading, reply, nextTool, extraText]
      )
    ).toBe('text')
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const withTool = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, extraText, nextTool]
    })
    expect(withTool.tail?.content).toBe('Error: boom')
    expect(withTool.copyable).toContain('Hi')
    const firstProcess = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const nextProcess = nextLiveProcessView(firstProcess, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, extraText, nextTool]
    })
    expect(nextProcess.processForFlow.at(-1)).toBe(nextTool)
  })

  it('classifies extras after a tool that already followed no-fence prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    const extraText: TurnSegment = {
      id: 'a2',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'Next'
    }
    const thirdTool: TurnSegment = { ...tool('active'), id: 't3' }
    const reconnect = status('Reconnecting... 1/5')
    const settled: TurnSegment = { ...nextTool, status: 'done' }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply, nextTool],
        [thought, reading, reply, nextTool, extraText]
      )
    ).toBe('text')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply, nextTool],
        [thought, reading, reply, nextTool, thirdTool]
      )
    ).toBe('tool')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply, nextTool],
        [thought, reading, reply, nextTool, reconnect]
      )
    ).toBe('status')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply, nextTool],
        [thought, reading, reply, settled, extraText]
      )
    ).toBe('text')
    expect(
      hasLiveProcessPhaseGrowHold(
        [thought, reading, reply, nextTool],
        [thought, reading, reply, nextTool, extraText]
      )
    ).toBe(true)
    const demo: TurnSegment = {
      id: 'd1',
      kind: 'tool',
      toolName: 'present_inline_demo',
      status: 'active',
      content: ''
    }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply, nextTool],
        [thought, reading, reply, nextTool, demo]
      )
    ).toBe('text')
    const plan = status('根据已完成步骤规划下一步…')
    const ask: TurnSegment = { ...plan, content: 'API style', toolName: 'request_user_input' }
    expect(
      shouldSkipLiveStreamDerivation([thought, plan, reply], [thought, ask, reply, extraText])
    ).toBeNull()
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool]
    })
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool, extraText]
    })
    expect(nextAnswer.closed.some((part) => part.type === 'text' && part.content === 'Hi')).toBe(
      true
    )
    expect(nextAnswer.tail?.content).toBe('Next')
    const firstProcess = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool]
    })
    const nextProcess = nextLiveProcessView(firstProcess, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool, thirdTool]
    })
    expect(nextProcess.processForFlow.at(-1)).toBe(thirdTool)
    const settledProcess = nextLiveProcessView(firstProcess, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, settled, extraText]
    })
    expect(settledProcess.contentStreaming).toBe(true)
    expect(settledProcess.processForFlow).toContain(settled)
  })

  it('classifies two extra no-fence texts in one flush without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const extraText: TurnSegment = {
      id: 'a2',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'Next'
    }
    const thirdText: TurnSegment = {
      id: 'a3',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'Done'
    }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading],
        [thought, reading, reply, extraText]
      )
    ).toBe('text')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply],
        [thought, reading, reply, extraText, thirdText]
      )
    ).toBe('text')
    expect(
      hasLiveProcessPhaseGrowHold(
        [thought, reading, reply],
        [thought, reading, reply, extraText, thirdText]
      )
    ).toBe(true)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const bothFromTools = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, extraText]
    })
    expect(bothFromTools.closed.some((part) => part.type === 'text' && part.content === 'Hi')).toBe(
      true
    )
    expect(bothFromTools.tail?.content).toBe('Next')
    expect(bothFromTools.copyable).toContain('Hi')
    expect(bothFromTools.copyable).toContain('Next')
    const afterProse = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const twoMore = nextLiveAnswerView(afterProse, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, extraText, thirdText]
    })
    expect(twoMore.closed.filter((part) => part.type === 'text').map((part) => part.content)).toEqual(
      ['Hi', 'Next']
    )
    expect(twoMore.tail?.content).toBe('Done')
    expect(twoMore.copyable).toContain('Done')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, reply],
        [thought, reading, reply, extraText, thirdText, nextTool]
      )
    ).toBe('tool')
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading],
        [thought, reading, nextTool, reply, extraText]
      )
    ).toBe('text')
    const firstProcess = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const processThenTexts = nextLiveProcessView(firstProcess, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, nextTool, reply, extraText]
    })
    expect(processThenTexts.processForFlow.at(-1)).toBe(nextTool)
    expect(processThenTexts.contentStreaming).toBe(true)
    expect(processThenTexts.answerStreaming).toBe(true)
  })

  it('classifies a newly appended tool after demo-fence prose without the table', () => {
    const demoFence = prose('```demo\n<div>demo</div>\n```')
    expect(
      shouldSkipLiveStreamDerivation([demoFence], [demoFence, tool('active')])
    ).toBe('tool')
    expect(hasLiveProcessPhaseGrowHold([demoFence], [demoFence, tool('active')])).toBe(true)
  })

  it('classifies a same-flush first no-fence answer plus tool without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    expect(
      shouldSkipLiveStreamDerivation([thought, reading], [thought, reading, reply, nextTool])
    ).toBe('tool')
    expect(
      hasLiveProcessPhaseGrowHold([thought, reading], [thought, reading, reply, nextTool])
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([], [reply, nextTool])).toBe('tool')
  })

  it('classifies think or reconnect status after existing no-fence prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const moreThink: TurnSegment = { ...think('Next'), id: 'th2' }
    const reconnect = status('Reconnecting... 1/5')
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, reading, reply, moreThink])
    ).toBe('think')
    expect(
      shouldSkipLiveStreamDerivation([thought, reading, reply], [thought, reading, reply, reconnect])
    ).toBe('status')
    expect(
      shouldSkipLiveStreamDerivation([thought, reading], [thought, reading, reply, reconnect])
    ).toBe('status')
    expect(hasLiveProcessPhaseGrowHold([thought, reading], [thought, reading, reply, reconnect])).toBe(
      true
    )
  })

  it('classifies first-stream tools without waiting for the table', () => {
    expect(shouldSkipLiveStreamDerivation([think('Hmm')], [think('Hmm'), tool('active')])).toBe(
      'tool'
    )
    expect(hasLiveProcessPhaseGrowHold([think('Hmm')], [think('Hmm'), tool('active')])).toBe(true)
    expect(shouldSkipLiveStreamDerivation([], [tool('active')])).toBe('tool')
    expect(hasLiveProcessPhaseGrowHold([], [tool('active')])).toBe(true)
    expect(hasLiveProcessPhaseGrowHold(null, [tool('active')])).toBe(false)
    expect(shouldSkipLiveStreamDerivation([], [think('Hmm'), tool('active')])).toBe('tool')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    expect(
      shouldSkipLiveStreamDerivation([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), nextTool])
    ).toBe('tool')
    expect(
      hasLiveProcessPhaseGrowHold([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), nextTool])
    ).toBe(true)
    const demo: TurnSegment = {
      id: 'd1',
      kind: 'tool',
      toolName: 'present_inline_demo',
      status: 'active',
      content: ''
    }
    expect(shouldSkipLiveStreamDerivation([tool('active')], [tool('active'), demo])).toBe('text')
  })

  it('skips process derivation for the first answer token after tools without the table', () => {
    expect(
      shouldSkipLiveStreamDerivation(
        [think('Hmm'), tool('active')],
        [think('Hmm'), tool('active'), prose('Hi')]
      )
    ).toBe('text')
    expect(
      hasLiveProcessPhaseGrowHold(
        [think('Hmm'), tool('active')],
        [think('Hmm'), tool('active'), prose('Hi')]
      )
    ).toBe(true)
    expect(shouldSkipLiveStreamDerivation([], [prose('Hi')])).toBe('text')
    expect(hasLiveProcessPhaseGrowHold([], [prose('Hi')])).toBe(true)
    expect(hasLiveProcessPhaseGrowHold(null, [prose('Hi')])).toBe(false)
    const moreThink: TurnSegment = { ...think('Next'), id: 'th2' }
    expect(
      shouldSkipLiveStreamDerivation([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), moreThink])
    ).toBe('think')
    expect(
      hasLiveProcessPhaseGrowHold([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), moreThink])
    ).toBe(true)
    const reconnect = status('Reconnecting... 1/5')
    expect(
      shouldSkipLiveStreamDerivation([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), reconnect])
    ).toBe('status')
    expect(
      hasLiveProcessPhaseGrowHold([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), reconnect])
    ).toBe(true)
    expect(
      shouldSkipLiveStreamDerivation(
        [think('Hmm'), tool('active')],
        [think('Hmm'), tool('active'), reconnect, moreThink]
      )
    ).toBe('status')
    expect(
      hasLiveProcessPhaseGrowHold(
        [think('Hmm'), tool('active')],
        [think('Hmm'), tool('active'), reconnect, moreThink]
      )
    ).toBe(true)
  })

  it('skips derivation when a tool and the first answer arrive in the same flush', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    const reply = prose('Hi')
    const moreThink: TurnSegment = { ...think('Next'), id: 'th2' }
    expect(
      shouldSkipLiveStreamDerivation([thought, reading], [thought, reading, nextTool, reply])
    ).toBe('text')
    expect(hasLiveProcessPhaseGrowHold([thought, reading], [thought, reading, nextTool, reply])).toBe(
      true
    )
    expect(
      shouldSkipLiveStreamDerivation([thought, reading], [thought, reading, moreThink, reply])
    ).toBe('text')
    const demoFence = prose('```demo\n<div>demo</div>\n```')
    expect(
      shouldSkipLiveStreamDerivation([thought, reading], [thought, reading, nextTool, demoFence])
    ).toBe('text')
  })

  it('opens a first demo-fence answer after tools without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const demoFence = prose('```demo\n<div>demo</div>\n```')
    expect(
      shouldSkipLiveStreamDerivation([thought, reading], [thought, reading, demoFence])
    ).toBe('text')
    expect(hasLiveProcessPhaseGrowHold([thought, reading], [thought, reading, demoFence])).toBe(true)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, demoFence]
    })
    expect(nextAnswer.parts.some((part) => part.type === 'demo')).toBe(true)
    expect(nextAnswer.show).toBe(true)
    const grown: TurnSegment = {
      ...demoFence,
      content: '```demo\n<div>demo</div>\n<p>more</p>\n```'
    }
    expect(shouldSkipLiveStreamDerivation([thought, reading, demoFence], [thought, reading, grown])).toBe(
      'text'
    )
    const grownAnswer = nextLiveAnswerView(nextAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, grown]
    })
    const demoPart = grownAnswer.parts.find((part) => part.type === 'demo')
    expect(demoPart?.type === 'demo' && demoPart.html.includes('more')).toBe(true)
    const firstProcess = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const nextProcess = nextLiveProcessView(firstProcess, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, demoFence]
    })
    expect(nextProcess.processForFlow).toEqual(firstProcess.processForFlow)
    expect(nextProcess.answerStreaming).toBe(true)
    expect(nextProcess.processForFlow.some((segment) => segment.toolName === 'present_inline_demo')).toBe(
      false
    )
  })

  it('reuses process steps when the first answer token arrives after tools', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const steps = deriveChronologicalSteps([thought, reading], { isStreaming: true })
    const next = appendProcessPhaseStepOnToolStart(
      steps,
      [thought, reading],
      [thought, reading, reply],
      true
    )
    expect(next).not.toBeNull()
    expect(next).toHaveLength(steps.length)
    expect(next!.some((step) => step.segment === reply)).toBe(false)
    const demoFence = prose('```demo\n<div>demo</div>\n```')
    const afterDemo = appendProcessPhaseStepOnToolStart(
      steps,
      [thought, reading],
      [thought, reading, demoFence],
      true
    )
    expect(afterDemo).toEqual(steps)
    expect(afterDemo!.some((step) => step.segment === demoFence)).toBe(false)
    const demoTool: TurnSegment = {
      id: 'd1',
      kind: 'tool',
      toolName: 'present_inline_demo',
      status: 'active',
      content: ''
    }
    const afterDemoTool = appendProcessPhaseStepOnToolStart(
      steps,
      [thought, reading],
      [thought, reading, demoTool],
      true
    )
    expect(afterDemoTool).toEqual(steps)
    expect(afterDemoTool!.some((step) => step.segment === demoTool)).toBe(false)
  })

  it('holds processForFlow when the first answer token arrives after tools', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    expect(next.processForFlow).toBe(first.processForFlow)
    expect(next.contentStreaming).toBe(true)
    expect(next.answerStreaming).toBe(true)
  })

  it('appends a same-flush tool and opens the answer tail without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    const reply = prose('Hi')
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, nextTool, reply]
    })
    expect(next.processForFlow[0]).toBe(first.processForFlow[0])
    expect(next.processForFlow.at(-1)).toBe(nextTool)
    expect(next.contentStreaming).toBe(true)
    expect(next.answerStreaming).toBe(true)
    const steps = deriveChronologicalSteps([thought, reading], { isStreaming: true })
    const appended = appendProcessPhaseStepOnToolStart(
      steps,
      [thought, reading],
      [thought, reading, nextTool, reply],
      true
    )
    expect(appended).not.toBeNull()
    expect(appended!.at(-1)?.segment).toBe(nextTool)
    expect(appended!.some((step) => step.segment === reply)).toBe(false)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, nextTool, reply]
    })
    expect(nextAnswer.tail?.content).toBe('Hi')
    expect(nextAnswer.show).toBe(true)
  })

  it('holds processForFlow when a later think segment arrives after tools', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const moreThink: TurnSegment = { ...think('Next'), id: 'th2' }
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, moreThink]
    })
    expect(next.processForFlow).toBe(first.processForFlow)
    expect(next.thinkText).toBe(`${thought.content}${moreThink.content}`)
  })

  it('appends a later tool to processForFlow without rebuilding', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, nextTool]
    })
    expect(next.processForFlow[0]).toBe(first.processForFlow[0])
    expect(next.processForFlow.at(-1)).toBe(nextTool)
    expect(next.processForFlow).toHaveLength(first.processForFlow.length + 1)
  })

  it('drops thinking from processForFlow when the first tool arrives', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought]
    })
    expect(first.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(true)
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    expect(next.processForFlow.some((segment) => segment.kind === 'thinking')).toBe(false)
    expect(next.processForFlow.at(-1)).toBe(reading)
  })

  it('appends reconnect status after tools without rebuilding the prefix', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reconnect = status('Reconnecting... 1/5')
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reconnect]
    })
    expect(next.processForFlow[0]).toBe(first.processForFlow[0])
    expect(next.processForFlow.at(-1)).toBe(reconnect)
  })

  it('appends reconnect status and later think in the same flush without rebuilding', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reconnect = status('Reconnecting... 1/5')
    const moreThink: TurnSegment = { ...think('Next'), id: 'th2' }
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reconnect, moreThink]
    })
    expect(next.processForFlow[0]).toBe(first.processForFlow[0])
    expect(next.processForFlow.at(-1)).toBe(reconnect)
    expect(next.thinkText).toBe(`${thought.content}${moreThink.content}`)
    const steps = deriveChronologicalSteps([thought, reading], { isStreaming: true })
    const appended = appendProcessPhaseStepOnToolStart(
      steps,
      [thought, reading],
      [thought, reading, reconnect, moreThink],
      true
    )
    expect(appended).not.toBeNull()
    expect(appended!.at(-1)?.segment).toBe(reconnect)
    expect(appended!.some((step) => step.segment === moreThink)).toBe(false)
  })

  it('appends a tool onto processForFlow after existing no-fence prose without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const withAnswer = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const next = nextLiveProcessView(withAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool]
    })
    expect(next.processForFlow[0]).toBe(withAnswer.processForFlow[0])
    expect(next.processForFlow.at(-1)).toBe(nextTool)
    expect(next.processForFlow).toHaveLength(withAnswer.processForFlow.length + 1)
    const steps = deriveChronologicalSteps([thought, reading], { isStreaming: true })
    const afterAnswer = appendProcessPhaseStepOnToolStart(
      steps,
      [thought, reading],
      [thought, reading, reply],
      true
    )
    const appended = appendProcessPhaseStepOnToolStart(
      afterAnswer ?? steps,
      [thought, reading, reply],
      [thought, reading, reply, nextTool],
      true
    )
    expect(appended).not.toBeNull()
    expect(appended!.at(-1)?.segment).toBe(nextTool)
    expect(appended!.some((step) => step.segment === reply)).toBe(false)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const heldAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool]
    })
    expect(heldAnswer).toBe(firstAnswer)
    expect(heldAnswer.tail?.content).toBe('Hi')
  })

  it('appends a same-flush first answer and tool without rebuilding the answer tail', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const nextTool: TurnSegment = { ...tool('active'), id: 't2' }
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool]
    })
    expect(next.processForFlow[0]).toBe(first.processForFlow[0])
    expect(next.processForFlow.at(-1)).toBe(nextTool)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, nextTool]
    })
    expect(nextAnswer.tail?.content).toBe('Hi')
    expect(nextAnswer.show).toBe(true)
  })

  it('holds the answer tail when reconnect status arrives after no-fence prose', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const reconnect = status('Reconnecting... 1/5')
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const withAnswer = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const next = nextLiveProcessView(withAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, reconnect]
    })
    expect(next.processForFlow[0]).toBe(withAnswer.processForFlow[0])
    expect(next.processForFlow.at(-1)).toBe(reconnect)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const heldAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply, reconnect]
    })
    expect(heldAnswer).toBe(firstAnswer)
  })

  it('retargets an in-place tool settle after no-fence prose without rebuilding the answer', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const settled: TurnSegment = { ...reading, status: 'done', toolDetail: '12 lines' }
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, settled, reply]
    })
    expect(next.processForFlow.some((segment) => segment === settled)).toBe(true)
    expect(next.processForFlow.some((segment) => segment === reading)).toBe(false)
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    const heldAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, settled, reply]
    })
    expect(heldAnswer).toBe(firstAnswer)
  })

  it('retargets parallel tool settles after no-fence prose without rebuilding the answer', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const listing: TurnSegment = { ...tool('active'), id: 't2', toolName: 'list_dir' }
    const reply = prose('Hi')
    const readingDone: TurnSegment = { ...reading, status: 'done' }
    const listingDone: TurnSegment = { ...listing, status: 'done' }
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, listing, reply]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, readingDone, listingDone, reply]
    })
    expect(next.processForFlow).toEqual(
      first.processForFlow.map((segment) =>
        segment === reading ? readingDone : segment === listing ? listingDone : segment
      )
    )
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, listing, reply]
    })
    const heldAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, readingDone, listingDone, reply]
    })
    expect(heldAnswer).toBe(firstAnswer)
  })

  it('retargets write-stat diffs after no-fence prose without rebuilding the answer tail', () => {
    const thought = think('Hmm')
    const writing: TurnSegment = {
      id: 'w1',
      kind: 'tool',
      toolName: 'write_file',
      status: 'active',
      content: '',
      fileDiff: {
        path: 'a.ts',
        lines: [{ kind: 'add', content: 'hi' }],
        stats: { added: 1, removed: 0 }
      }
    }
    const reply = prose('Hi')
    const nextDiff = {
      path: 'a.ts',
      lines: [
        { kind: 'add' as const, content: 'hi' },
        { kind: 'add' as const, content: 'there' }
      ],
      stats: { added: 2, removed: 0 }
    }
    const written: TurnSegment = { ...writing, fileDiff: nextDiff, fileDiffs: [nextDiff] }
    expect(
      shouldSkipLiveStreamDerivation([thought, writing, reply], [thought, written, reply])
    ).toBe('tool')
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, writing, reply]
    })
    expect(firstAnswer.parts.some((part) => part.type === 'diff')).toBe(true)
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, written, reply]
    })
    expect(nextAnswer.tail).toBe(firstAnswer.tail)
    const diff = nextAnswer.parts.find((part) => part.type === 'diff')
    expect(diff?.type === 'diff' && diff.diff.stats?.added).toBe(2)
    expect(nextAnswer.parts.filter((part) => part.type === 'text')).toEqual(
      firstAnswer.parts.filter((part) => part.type === 'text')
    )
  })

  it('retargets two write-stat tools and extra file diffs without rebuilding the answer tail', () => {
    const thought = think('Hmm')
    const writing: TurnSegment = {
      id: 'w1',
      kind: 'tool',
      toolName: 'write_file',
      status: 'active',
      content: '',
      fileDiff: {
        path: 'a.ts',
        lines: [{ kind: 'add', content: 'hi' }],
        stats: { added: 1, removed: 0 }
      }
    }
    const writingB: TurnSegment = {
      id: 'w2',
      kind: 'tool',
      toolName: 'write_file',
      status: 'active',
      content: '',
      fileDiff: {
        path: 'b.ts',
        lines: [{ kind: 'add', content: 'yo' }],
        stats: { added: 1, removed: 0 }
      }
    }
    const reply = prose('Hi')
    const nextA = {
      path: 'a.ts',
      lines: [
        { kind: 'add' as const, content: 'hi' },
        { kind: 'add' as const, content: 'there' }
      ],
      stats: { added: 2, removed: 0 }
    }
    const nextB = {
      path: 'b.ts',
      lines: [
        { kind: 'add' as const, content: 'yo' },
        { kind: 'add' as const, content: 'there' }
      ],
      stats: { added: 2, removed: 0 }
    }
    const extraA = {
      path: 'a2.ts',
      lines: [{ kind: 'add' as const, content: 'more' }],
      stats: { added: 1, removed: 0 }
    }
    const writtenA: TurnSegment = { ...writing, fileDiff: nextA, fileDiffs: [nextA] }
    const writtenB: TurnSegment = { ...writingB, fileDiff: nextB, fileDiffs: [nextB] }
    const multiA: TurnSegment = { ...writing, fileDiff: nextA, fileDiffs: [nextA, extraA] }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, writing, writingB, reply],
        [thought, writtenA, writtenB, reply]
      )
    ).toBe('tool')
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, writing, writingB, reply]
    })
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, writtenA, writtenB, reply]
    })
    expect(nextAnswer.tail).toBe(firstAnswer.tail)
    const diffs = nextAnswer.parts.filter((part) => part.type === 'diff')
    expect(diffs).toHaveLength(2)
    expect(diffs.every((part) => part.type === 'diff' && part.diff.stats?.added === 2)).toBe(true)
    expect(nextAnswer.parts.filter((part) => part.type === 'text')).toEqual(
      firstAnswer.parts.filter((part) => part.type === 'text')
    )
    const oneFile = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, writing, reply]
    })
    const twoFiles = nextLiveAnswerView(oneFile, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, multiA, reply]
    })
    expect(twoFiles.tail).toBe(oneFile.tail)
    expect(twoFiles.parts.filter((part) => part.type === 'diff')).toHaveLength(2)
  })

  it('opens the answer tail from the first prose after tools without the table', () => {
    const thought = think('Hmm')
    const reading = tool('active')
    const reply = prose('Hi')
    const first = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading]
    })
    const next = nextLiveAnswerView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, reply]
    })
    expect(next.tail?.content).toBe('Hi')
    expect(next.show).toBe(true)
    expect(next.closed).toEqual([])
    expect(next.copyable).toBe('Hi')
  })

  it('does not grow-hold process phases on same-length think tokens', () => {
    expect(hasLiveProcessPhaseGrowHold([think('Hmm')], [think('Hmm more')])).toBe(false)
  })

  it('does not treat in-place plan status rewrite as a token', () => {
    const plan: TurnSegment = {
      id: 'st-plan',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…'
    }
    const ask: TurnSegment = { ...plan, content: 'API style', toolName: 'request_user_input' }
    expect(shouldSkipLiveStreamDerivation([plan], [ask])).not.toBe('status')
    expect(hasLiveProcessPhaseGrowHold([plan], [ask])).toBe(true)
  })

  it('does not skip answer identity on prose tokens so the tail can grow', () => {
    expect(
      shouldSkipLiveAnswerIdentity({
        prev: emptyAnswer,
        prevSegments: [prose('Hello')],
        segments: [prose('Hello world')]
      })
    ).toBe(false)
  })

  it('does not prefetch the detector table on first paint or during a live turn', () => {
    expect(shouldPrefetchLiveStreamTable({ loading: false, hadLiveTurn: false })).toBe(false)
    expect(shouldPrefetchLiveStreamTable({ loading: true, hadLiveTurn: true })).toBe(false)
    expect(shouldPrefetchLiveStreamTable({ loading: false, hadLiveTurn: true })).toBe(true)
  })

  it('keeps first-paint UI and process-phases off the slices table', () => {
    const coreSrc = src('live-stream-core.ts')
    expect(coreSrc.includes("from './live-stream-slices'")).toBe(false)
    expect(coreSrc).toContain("import('./live-stream-slices')")

    expect(src('../src/App.tsx')).toContain("from '../shared/live-stream-core'")
    expect(src('../src/App.tsx').includes("from '../shared/live-stream-slices'")).toBe(false)
    expect(src('../src/App.tsx')).toContain('prefetchLiveStreamTable')
    expect(src('../src/App.tsx')).toContain('shouldPrefetchLiveStreamTable')
    expect(src('../src/App.tsx')).toContain('LAST_TURN_UI_FLUSH_MS')

    expect(src('../src/components/ChatView.tsx')).toContain(
      "from '../../shared/live-stream-core'"
    )
    expect(src('../src/components/ChatView.tsx').includes('live-stream-slices')).toBe(false)

    expect(src('../src/components/TurnFlow.tsx')).toContain(
      "from '../../shared/live-stream-core'"
    )
    expect(src('../src/components/TurnFlow.tsx').includes('live-stream-slices')).toBe(false)

    expect(src('../src/components/LiveAssistantParts.tsx')).toContain(
      "from '../../shared/live-stream-core'"
    )
    expect(src('../src/components/LiveAssistantParts.tsx').includes('live-stream-slices')).toBe(
      false
    )

    expect(src('process-phases.ts')).toContain("from './live-stream-core'")
    expect(src('process-phases.ts').includes('live-stream-slices')).toBe(false)
  })
})
