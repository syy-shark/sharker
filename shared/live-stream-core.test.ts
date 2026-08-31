import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { StreamChunk, TurnSegment } from './types'
import {
  hasLiveProcessPhaseGrowHold,
  isLiveSameLengthTokenGrow,
  nextLiveAnswerRenderParts,
  nextLiveAnswerView,
  nextLivePublishedStreaming,
  nextLiveProcessView,
  nextLiveThinkText,
  liveAnswerViewFromSnap,
  resetLiveAnswerViewHold,
  shouldPrefetchLiveStreamTable,
  shouldReusePublishedActiveTool,
  shouldSkipLiveAnswerIdentity,
  shouldSkipLiveStreamDerivation,
  type LiveAnswerView
} from './live-stream-core'
import { EMPTY_LIVE_STREAM_UI, shouldResetLiveStreamUiWhenLoadingStops } from './live-stream-ui'
import { appendProcessPhaseStepOnToolStart, deriveChronologicalSteps } from './process-phases'
import { applyStreamChunk, finalizeSegments } from './turn-segments'

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
    expect(shouldReusePublishedActiveTool('think')).toBe(true)
    expect(shouldReusePublishedActiveTool('status')).toBe(true)
    expect(shouldReusePublishedActiveTool('text')).toBe(true)
    expect(shouldReusePublishedActiveTool('tool')).toBe(false)
    expect(shouldReusePublishedActiveTool(null)).toBe(false)
    const thought = think('Hmm')
    const reading = tool('done')
    const reply = prose('Hello')
    const replyGrown = prose('Hello world')
    expect(nextLiveThinkText('Hmm', [thought, reading, reply], [thought, reading, replyGrown])).toBe(
      'Hmm'
    )
    expect(nextLiveThinkText('Hmm', [thought, reading], [thought, reading, reply])).toBe('Hmm')
    const moreThink: TurnSegment = { id: 'th2', kind: 'thinking', status: 'active', content: 'Next' }
    expect(nextLiveThinkText('Hmm', [thought, reading], [thought, reading, moreThink, reply])).toBe(
      'HmmNext'
    )
  })

  it('classifies a newly appended tool after closed no-fence prose without the table', () => {
    const hello = prose('Hello')
    const closed: TurnSegment = { ...hello, status: 'done' }
    const nextTool = tool('active')
    expect(shouldSkipLiveStreamDerivation([hello], [closed, nextTool])).toBe('tool')
    expect(hasLiveProcessPhaseGrowHold([hello], [closed, nextTool])).toBe(true)
    const streamed: TurnSegment = { id: 'a2', kind: 'text', status: 'active', content: 'Hello' }
    const streamedClosed: TurnSegment = { ...streamed, status: 'done' }
    expect(shouldSkipLiveStreamDerivation([streamed], [streamedClosed, nextTool])).toBe('tool')
    expect(hasLiveProcessPhaseGrowHold([streamed], [streamedClosed, nextTool])).toBe(true)
    expect(nextLivePublishedStreaming([streamedClosed, nextTool], '')).toBe('Hello')
    const firstStream = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [streamed]
    })
    const afterTool = nextLiveProcessView(firstStream, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [streamedClosed, nextTool]
    })
    expect(afterTool.contentStreaming).toBe(true)
    expect(afterTool.answerStreaming).toBe(true)
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
    expect(shouldSkipLiveStreamDerivation([thought, plan, reply], [thought, ask, reply])).toBe(
      'status'
    )
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
    ).toBe('text')
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

  it('reuses unchanged write-stat diff parts when only another file grows', () => {
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
    const nextB = {
      path: 'b.ts',
      lines: [
        { kind: 'add' as const, content: 'yo' },
        { kind: 'add' as const, content: 'there' }
      ],
      stats: { added: 2, removed: 0 }
    }
    const grownB: TurnSegment = { ...writingB, fileDiff: nextB, fileDiffs: [nextB] }
    const firstAnswer = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, writing, writingB, reply]
    })
    const nextAnswer = nextLiveAnswerView(firstAnswer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, writing, grownB, reply]
    })
    const firstA = firstAnswer.parts.find((part) => part.type === 'diff' && part.id.startsWith('w1-'))
    const nextA = nextAnswer.parts.find((part) => part.type === 'diff' && part.id.startsWith('w1-'))
    expect(nextA).toBe(firstA)

    const fresh = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, writing, writingB, reply]
    })
    const settled: TurnSegment = {
      ...writing,
      toolArgs: { path: 'a.ts', content: 'hi' },
      editPreview: [{ path: 'a.ts', stats: { added: 1, removed: 0 } }]
    }
    const afterStart = nextLiveAnswerView(fresh, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, settled, writingB, reply]
    })
    expect(
      afterStart.parts.find((part) => part.type === 'diff' && part.id.startsWith('w1-'))
    ).toBe(fresh.parts.find((part) => part.type === 'diff' && part.id.startsWith('w1-')))
    expect(afterStart).toBe(fresh)
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

  it('grows copyable from the sealed prefix without rebuilding closed text', () => {
    resetLiveAnswerViewHold()
    const hello: TurnSegment = { ...prose('Hello'), status: 'done' }
    const next: TurnSegment = {
      id: 'a2',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'World'
    }
    const first = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello]
    })
    const two = nextLiveAnswerView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, next]
    })
    expect(two.copyable).toBe('Hello\n\nWorld')
    const grown: TurnSegment = { ...next, content: 'World!' }
    const after = nextLiveAnswerView(two, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [hello, grown]
    })
    expect(after.closed).toBe(two.closed)
    expect(after.copyable).toBe('Hello\n\nWorld!')
    resetLiveAnswerViewHold()
    const padded: TurnSegment = { ...hello, content: '  Hello  ' }
    const padFirst = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [padded]
    })
    const padTwo = nextLiveAnswerView(padFirst, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [padded, next]
    })
    expect(padTwo.copyable).toBe('Hello  \n\nWorld')
  })

  it('does not grow-hold process phases on same-length think tokens', () => {
    expect(hasLiveProcessPhaseGrowHold([think('Hmm')], [think('Hmm more')])).toBe(false)
  })

  it('classifies an in-place plan-to-Ask rewrite without treating it as a token grow', () => {
    const plan: TurnSegment = {
      id: 'st-plan',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…'
    }
    const ask: TurnSegment = { ...plan, content: 'API style', toolName: 'request_user_input' }
    expect(shouldSkipLiveStreamDerivation([plan], [ask])).toBe('status')
    expect(hasLiveProcessPhaseGrowHold([plan], [ask])).toBe(true)
    expect(isLiveSameLengthTokenGrow([plan], [ask])).toBe(false)
    const renamed: TurnSegment = { ...plan, toolName: 'compress' }
    expect(shouldSkipLiveStreamDerivation([plan], [renamed])).toBeNull()
    const first = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [plan]
    })
    const next = nextLiveProcessView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [ask]
    })
    expect(next.processForFlow).toEqual([ask])
    const awaiting: TurnSegment = {
      ...plan,
      content: 'Awaiting approval · 执行命令',
      toolName: 'run_terminal_cmd'
    }
    expect(shouldSkipLiveStreamDerivation([plan], [awaiting])).toBe('status')
    expect(hasLiveProcessPhaseGrowHold([plan], [awaiting])).toBe(true)
    const running = tool('active')
    const hung: TurnSegment = { ...running, toolDetail: 'needs approval' }
    const hungStatus: TurnSegment = {
      ...plan,
      content: 'Awaiting approval · 读文件',
      toolName: 'read_file'
    }
    expect(
      shouldSkipLiveStreamDerivation([think('Hmm'), running, plan], [think('Hmm'), hung, hungStatus])
    ).toBe('tool')
  })

  it('classifies Allow/Deny, Stop, compress, and error-on-text without the table', () => {
    const running = tool('active')
    const approval = {
      id: 'appr-1',
      title: '读文件',
      description: '',
      toolName: 'read_file',
      args: {}
    }
    const awaiting: TurnSegment = {
      id: 'st-await',
      kind: 'status',
      status: 'active',
      content: 'Awaiting approval · 读文件',
      toolName: 'read_file',
      approval
    }
    const hung: TurnSegment = { ...running, approval: awaiting.approval }
    const allowed: TurnSegment = { ...hung, approval: undefined }
    const confirmed: TurnSegment = {
      ...awaiting,
      status: 'done',
      content: '已确认，继续执行',
      approval: undefined
    }
    expect(
      shouldSkipLiveStreamDerivation([think('Hmm'), hung, awaiting], [think('Hmm'), allowed, confirmed])
    ).toBe('tool')
    const denied: TurnSegment = {
      ...awaiting,
      status: 'done',
      content: '已拒绝该操作'
    }
    expect(
      shouldSkipLiveStreamDerivation([think('Hmm'), hung, awaiting], [think('Hmm'), hung, denied])
    ).toBe('status')
    const firstAwait = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [think('Hmm'), hung, awaiting]
    })
    const afterAllow = nextLiveProcessView(firstAwait, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [think('Hmm'), allowed, confirmed]
    })
    expect(afterAllow.processForFlow).toEqual([allowed, confirmed])

    const thought = think('Hmm')
    const reading = tool('active')
    const plan = status('根据已完成步骤规划下一步…')
    const cancelledThought: TurnSegment = { ...thought, status: 'cancelled' }
    const cancelledTool: TurnSegment = {
      ...reading,
      status: 'cancelled',
      errorMessage: '任务已停止',
      resultSummary: '已停止'
    }
    const cancelledPlan: TurnSegment = { ...plan, status: 'cancelled' }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, plan],
        [cancelledThought, cancelledTool, cancelledPlan]
      )
    ).toBe('tool')

    const compacting: TurnSegment = {
      id: 'st-compact',
      kind: 'status',
      status: 'active',
      content: 'Compacting context'
    }
    const compacted: TurnSegment = { ...compacting, status: 'done' }
    const compress: TurnSegment = {
      id: 'compress-1',
      kind: 'tool',
      toolName: 'compress',
      status: 'done',
      toolTitle: 'Compacting context',
      content: ''
    }
    expect(
      shouldSkipLiveStreamDerivation(
        [thought, reading, compacting],
        [thought, reading, compacted, compress]
      )
    ).toBe('tool')
    const firstCompact = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, compacting]
    })
    const afterCompress = nextLiveProcessView(firstCompact, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reading, compacted, compress]
    })
    expect(afterCompress.processForFlow.at(-1)).toEqual(compress)

    const reply = prose('Hello')
    const errored: TurnSegment = {
      ...reply,
      status: 'done',
      content: 'Hello\n\n**错误**: boom'
    }
    expect(shouldSkipLiveStreamDerivation([reply], [errored])).toBe('text')
    const firstReply = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [reply]
    })
    const afterError = nextLiveAnswerView(firstReply, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [errored]
    })
    expect(afterError.tail?.type === 'text' && afterError.tail.content).toBe(
      'Hello\n\n**错误**: boom'
    )

    const ask: TurnSegment = {
      id: 'st-ask',
      kind: 'status',
      status: 'active',
      content: 'API style',
      toolName: 'request_user_input'
    }
    const askDone: TurnSegment = { ...ask, status: 'done' }
    expect(shouldSkipLiveStreamDerivation([ask], [askDone])).toBe('status')

    const preparing = status('Preparing')
    const preparingDone: TurnSegment = { ...preparing, status: 'done' }
    const errText: TurnSegment = {
      id: 'err1',
      kind: 'text',
      role: 'final',
      status: 'done',
      content: '**错误**: boom'
    }
    expect(shouldSkipLiveStreamDerivation([preparing], [preparingDone, errText])).toBe('text')
    const firstStatus = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [preparing]
    })
    const afterStatusError = nextLiveAnswerView(firstStatus, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [preparingDone, errText]
    })
    expect(afterStatusError.tail?.type === 'text' && afterStatusError.tail.content).toBe(
      '**错误**: boom'
    )
  })

  it('opens write-stat diffs from the first extra write tool without the table', () => {
    const thought = think('Hmm')
    const thoughtDone: TurnSegment = { ...thought, status: 'done' }
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
    expect(shouldSkipLiveStreamDerivation([thought], [thoughtDone, writing])).toBe('tool')
    expect(hasLiveProcessPhaseGrowHold([thought], [thoughtDone, writing])).toBe(true)
    const firstProcess = nextLiveProcessView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought]
    })
    const nextProcess = nextLiveProcessView(firstProcess, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thoughtDone, writing]
    })
    expect(nextProcess.contentStreaming).toBe(true)
    expect(nextProcess.answerStreaming).toBe(true)
    const first = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought]
    })
    expect(first.parts.some((part) => part.type === 'diff')).toBe(false)
    const next = nextLiveAnswerView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thoughtDone, writing]
    })
    expect(next.parts.some((part) => part.type === 'diff')).toBe(true)
    const reply = prose('Hi')
    const replyDone: TurnSegment = { ...reply, status: 'done' }
    const afterProse = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reply]
    })
    expect(
      shouldSkipLiveStreamDerivation([thought, reply], [thoughtDone, replyDone, writing])
    ).toBe('tool')
    const withDiff = nextLiveAnswerView(afterProse, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thoughtDone, replyDone, writing]
    })
    expect(withDiff.tail).toEqual(afterProse.tail)
    expect(withDiff.parts.some((part) => part.type === 'diff')).toBe(true)
    const afterWrite = nextLiveAnswerView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thoughtDone, writing]
    })
    const hello: TurnSegment = { id: 'a2', kind: 'text', status: 'active', content: 'Hello' }
    expect(
      shouldSkipLiveStreamDerivation([thoughtDone, writing], [thoughtDone, writing, hello])
    ).toBe('text')
    const afterHello = nextLiveAnswerView(afterWrite, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thoughtDone, writing, hello]
    })
    expect(afterHello.parts.some((part) => part.type === 'diff')).toBe(true)
    expect(afterHello.tail?.type === 'text' && afterHello.tail.content).toBe('Hello')
  })

  it('grows a held no-fence tail when think tokens arrive in the same flush', () => {
    const thought = think('Hmm')
    const reply = prose('Hi')
    expect(
      shouldSkipLiveStreamDerivation([thought, reply], [think('Hmm more'), prose('Hi there')])
    ).toBe('think')
    const first = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [thought, reply]
    })
    const next = nextLiveAnswerView(first, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [think('Hmm more'), prose('Hi there')]
    })
    expect(next.tail?.type === 'text' && next.tail.content).toBe('Hi there')
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

  it('clears answer grow-hold so the next turn does not reuse the prior view', () => {
    const reply = prose('Hello world')
    const snapA = { ...EMPTY_LIVE_STREAM_UI, liveSegments: [reply] }
    const viewA = liveAnswerViewFromSnap(snapA)
    expect(viewA.show).toBe(true)
    resetLiveAnswerViewHold()
    const seed: TurnSegment = {
      id: 'status-local',
      kind: 'status',
      status: 'active',
      content: 'Thinking'
    }
    const viewB = liveAnswerViewFromSnap({
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: [seed]
    })
    expect(viewB.show).toBe(false)
    expect(viewB.parts).toHaveLength(0)
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
    expect(src('../src/App.tsx')).toContain('nextLivePublishedStreaming')
    expect(src('../src/App.tsx')).toContain('shouldReusePublishedActiveTool')
    expect(src('../src/App.tsx')).toContain('LAST_TURN_UI_FLUSH_MS')
    expect(src('../src/App.tsx')).toContain('shouldResetLiveStreamUiWhenLoadingStops')
    expect(src('../src/App.tsx')).toContain('schedulePrefetchLiveAnswerPaint')
    expect(src('../src/App.tsx')).toContain('liveSegments: []')
    expect(shouldResetLiveStreamUiWhenLoadingStops()).toBe(false)

    expect(src('../src/components/ChatView.tsx')).toContain(
      "from '../../shared/live-stream-core'"
    )
    expect(src('../src/components/ChatView.tsx').includes('live-stream-slices')).toBe(false)
    expect(src('../src/components/ChatView.tsx')).toContain('loading || reservedInHistory')
    expect(src('../src/components/ChatView.tsx')).toContain('isStreaming={liveStreaming}')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldStreamLiveAssistant')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldMountLiveHandoffThinking')
    expect(src('../src/components/ChatView.tsx')).toContain('holdAlreadyRetired')
    expect(src('../src/components/ChatView.tsx')).toContain('nextPinnedTranscriptGaps')
    expect(src('../src/components/ChatView.tsx')).toContain('nextPinnedLiveAssistantIds')
    expect(src('../src/components/ChatView.tsx')).toContain('pinnedLiveRows')
    expect(src('../src/components/ChatView.tsx')).toContain('pinnedLiveSlots')
    expect(src('../src/components/ChatView.tsx')).toContain('nextPinnedLiveSlots')
    expect(src('../src/components/ChatView.tsx')).toContain('EMPTY_PINNED_LIVE_SLOTS')
    expect(src('../src/components/ChatView.tsx')).not.toContain('frozenPinnedSlots')
    expect(src('../src/components/ChatView.tsx')).not.toContain('activePinnedLiveSlots')
    expect(src('../src/components/ChatView.tsx')).not.toContain('nextFrozenPinnedLiveSlots')
    expect(src('../src/components/ChatView.tsx')).not.toContain('nextActivePinnedLiveSlots')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'frozen ? (frozenPinnedSlots.get(id)'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('shouldAttachLiveApprovalToPinnedSlot')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldAttachLiveLoadingToPinnedSlot')
    expect(src('../src/components/ChatView.tsx')).toContain('liveHandoffId')
    expect(src('../src/components/ChatView.tsx')).toContain(
      'shouldAttachLiveLoadingToPinnedSlot({\n              pinnedId: id,\n              liveAssistantId,\n              liveHandoffId'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('loading={identity?.loading ?? false}')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'loading={identity?.loading ?? loading}'
    )
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'identities.set(id, {\n        loading,\n        isStreaming:'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('nextPinnedLiveRowNodes')
    expect(src('../src/components/ChatView.tsx')).toContain('nextTranscriptRowNodes')
    expect(src('../src/components/ChatView.tsx')).toContain('{transcriptRows}')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      '{historicalRows}\n\n            {pinnedLiveRows.length ? pinnedLiveRows : unpinnedLiveRow}'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('<LiveAssistantSlot\n            key={id}')
    expect(src('../src/components/ChatView.tsx')).toContain('liveDiff={false}')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      '<LiveAssistantArticle\n          messageId={id}'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('EMPTY_PINNED_LIVE_ROW_HOLD')
    expect(src('../src/components/ChatView.tsx')).toContain('nextHistoricalRowNodes')
    expect(src('../src/components/ChatView.tsx')).toContain('historicalRowsHeldRef')
    expect(src('../src/components/ChatView.tsx')).toContain('EMPTY_HISTORICAL_ROW_HOLD')
    expect(src('../src/components/ChatView.tsx')).toContain('nextPinnedAfterRowNodes')
    expect(src('../src/components/ChatView.tsx')).toContain('pinnedAfterRowsHeldRef')
    expect(src('../src/components/ChatView.tsx')).toContain('EMPTY_PINNED_AFTER_ROW_HOLD')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'return afterGaps.map((gap) =>'
    )
    expect(src('../src/components/ChatView.tsx')).toContain(
      'sessionKey,\n      currentFindMessageId'
    )
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'return historicalSource.map((m, index, rows) =>'
    )
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'liveStreaming,\n    loading,\n    modelLabel,\n    onApproval,\n    onNeedFullMessage,\n    onOpenSubAgent,\n    onUserInput,\n    pinnedLiveSlots'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('loading: frozen\n          ? false')
    expect(src('../src/components/ChatView.tsx')).toContain('isStreaming: frozen\n          ? false')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'sessionKey,\n    toolOutputDisplay,\n    loading'
    )
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'historyHasReserved={historyHasReserved}'
    )
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'historyHasReserved={Boolean('
    )
    expect(src('../src/components/ChatView.tsx')).toContain('EMPTY_PINNED_LIVE_ROWS')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      '? pinnedLiveIds.map((id, index) => {'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('pinnedGapsHeldRef')
    expect(src('../src/components/ChatView.tsx')).toContain('renderFrozenEjectedArticle,\n      historicalSource')
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'renderFrozenEjectedArticle,\n      hideReservedLive,\n      historicalSource'
    )
    expect(src('../src/components/ChatView.tsx')).not.toContain(
      'historicalSource,\n      liveAssistantId,\n      preserveLiveDiffsId,\n      windowedMessages'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('nextPinnedAfterGaps')
    expect(src('../src/components/ChatView.tsx')).toContain('pinnedAfterRows')
    expect(src('../src/components/ChatView.tsx')).toContain('EMPTY_HISTORICAL_MESSAGES')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldMountLiveAssistantSlot')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldMountUnpinnedLiveSlot')
    expect(src('../src/components/ChatView.tsx')).toContain('unpinnedLiveRow')
    expect(src('../src/components/ChatView.tsx')).toContain('liveHandoffRow')
    expect(src('../src/components/ChatView.tsx')).toContain('activeLiveRow')
    expect(src('../src/components/ThinkingIndicator.tsx')).toContain(
      'memo(function ThinkingIndicator'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('shouldFlushRowIntrinsicHeight')
    expect(src('../src/components/ChatView.tsx')).toContain('cachedIdCallback')
    expect(src('../src/components/ChatView.tsx')).toContain('cachedIdArgCallback')
    expect(src('../src/components/ChatView.tsx').includes('() => onForkFromMessage(m.id)')).toBe(
      false
    )
    expect(src('../src/components/ChatView.tsx').includes('(text) => onEditUserMessage(m.id, text)')).toBe(
      false
    )
    expect(src('../src/components/TurnFlow.tsx')).toContain(
      'out.every((step, index) => step === prev[index])'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('nextRevealPreserveScrollTop')
    expect(src('../src/components/ChatView.tsx')).toContain('commitAboveFoldHeightScroll')
    expect(src('../src/components/ChatView.tsx')).toContain('applyRowIntrinsicSizeStyle')
    expect(src('../src/components/ChatView.tsx')).not.toContain('setIntrinsicHeights')
    expect(src('../src/components/ChatView.tsx').includes('trimTopIdsRef')).toBe(false)
    expect(src('../src/components/ChatView.tsx')).toContain('requestAnimationFrame(flush)')
    expect(src('../src/components/ChatView.tsx')).toContain('nextPinnedLiveAssistantIds')
    expect(src('../src/components/ChatView.tsx')).toContain('pinnedLiveIdsHeldRef')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldMountActiveLiveSlot')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldPinActiveLiveAssistant')
    expect(src('../src/components/ChatView.tsx')).toContain('pinActiveLive')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldStreamPinnedLiveAssistant')
    expect(src('../src/components/ChatView.tsx')).toContain('<LiveAssistantSlot\n            key={id}')
    expect(src('../src/components/ChatView.tsx')).not.toContain('key={liveRowId}\n      id={`msg-${liveRowId}`}')
    expect(src('../src/App.tsx')).toContain('shouldHoldLiveHandoff')
    expect(src('../src/App.tsx')).toContain('shouldRetireLiveOnHandoffHold')
    expect(src('../src/App.tsx')).toContain('shouldReserveLiveAfterHandoffHold')
    expect(src('../src/App.tsx')).toContain('shouldReuseReservedLiveOnHandoffAdopt')
    expect(src('../src/App.tsx')).toContain('shouldRestoreHeldLiveOnHandoffCancel')
    expect(src('../src/App.tsx')).toContain('shouldDeferLiveHandoffSeedPublish')
    expect(src('../src/App.tsx')).toContain('shouldPublishPendingLiveOnHandoffRestore')
    expect(src('../src/App.tsx')).toContain('cloneRetiredLiveArticles')
    expect(src('../src/App.tsx')).toContain('cloneEjectedLiveHeights')
    expect(src('../src/App.tsx')).toContain('ejectedLiveHeightsRef')
    expect(src('../src/App.tsx')).toContain('cloneEjectedLiveHeights(buf.ejectedLiveHeights)')
    expect(src('../src/App.tsx')).toContain(
      'ejectedLiveHeights: cloneEjectedLiveHeights(ejectedLiveHeightsRef.current)'
    )
    expect(src('../src/App.tsx')).toContain('pendingHandoffSeedPublishRef')
    expect(src('../src/App.tsx')).toContain('useLayoutEffect')
    expect(src('../src/App.tsx')).toContain('cancelLiveHandoffWithoutCommit')
    expect(src('../src/App.tsx')).toContain('commitRetiredLiveFromStore')
    expect(src('../src/App.tsx')).toContain('beginTurnMeta()')
    expect(src('../src/App.tsx')).toContain('holdAlreadyRetired')
    expect(src('../src/App.tsx')).toContain('retiredLiveArticle(retiredLiveArticlesRef.current')
    expect(src('../src/App.tsx')).toContain('shouldBeginNewLiveReservation')
    expect(src('../src/App.tsx')).toContain('shouldPublishEmptyLiveBodyOnBeginTurn')
    expect(src('../src/App.tsx')).toContain('reuseReservedLiveId')
    expect(src('../src/App.tsx')).toContain('先预留直播 id 再抬 loading')
    expect(src('../src/App.tsx')).toContain('shouldAdoptLiveHandoff')
    expect(src('../src/App.tsx')).toContain('adoptLiveHandoff')
    expect(src('../src/App.tsx')).toContain('nextLiveAnswerRenderParts')
    expect(src('../src/App.tsx')).toContain('resetLiveAnswerViewHold')
    expect(src('live-stream-core.ts')).toContain('copyableClosedHold')
    expect(src('live-stream-core.ts')).toContain('copyableFromClosedAndTail')
    expect(src('live-stream-core.ts')).toContain('prefixThinkGrew')
    expect(src('../src/App.tsx')).toContain('setRetiredLiveId')
    expect(src('../src/App.tsx')).toContain('retireLiveArticle')
    expect(src('../src/App.tsx')).toContain('snapshotRetiredLiveProcess')
    expect(src('../src/App.tsx')).toContain('liveProcessViewFromSnap')
    expect(src('../src/App.tsx')).toContain('snapshotFrozenProcessSteps')
    expect(src('../src/App.tsx')).toContain('takeEjectedLiveOverflow')
    expect(src('../src/App.tsx')).toContain('nextArchivedLiveArticles')
    expect(src('session-runtime.ts')).toContain('reusePinnedTranscriptGaps')
    expect(src('session-runtime.ts')).toContain('reusePinnedLiveIds')
    expect(src('session-runtime.ts')).toContain('nextPinnedLiveAssistantIds')
    expect(src('session-runtime.ts')).toContain('nextFrozenPinnedLiveSlots')
    expect(src('session-runtime.ts')).toContain('sameFrozenPinnedLiveSlotIdentity')
    expect(src('session-runtime.ts')).toContain('nextPinnedLiveSlots')
    expect(src('session-runtime.ts')).toContain('samePinnedLiveSlotIdentity')
    expect(src('session-runtime.ts')).toContain('nextPinnedLiveRowNodes')
    expect(src('session-runtime.ts')).toContain('nextTranscriptRowNodes')
    expect(src('session-runtime.ts')).toContain('nextHistoricalRowNodes')
    expect(src('session-runtime.ts')).toContain('sameHistoricalRowIdentity')
    expect(src('session-runtime.ts')).toContain('nextPinnedAfterRowNodes')
    expect(src('session-runtime.ts')).toContain('shouldAttachLiveApprovalToPinnedSlot')
    expect(src('session-runtime.ts')).toContain('shouldAttachLiveLoadingToPinnedSlot')
    expect(src('session-runtime.ts')).toContain('shouldRetireLiveOnHandoffHold')
    expect(src('session-runtime.ts')).toContain('shouldReserveLiveAfterHandoffHold')
    expect(src('session-runtime.ts')).toContain('shouldReuseReservedLiveOnHandoffAdopt')
    expect(src('session-runtime.ts')).toContain('shouldRestoreHeldLiveOnHandoffCancel')
    expect(src('session-runtime.ts')).toContain('shouldDeferLiveHandoffSeedPublish')
    expect(src('session-runtime.ts')).toContain('shouldPublishPendingLiveOnHandoffRestore')
    expect(src('session-runtime.ts')).toContain('cloneRetiredLiveArticles')
    expect(src('session-runtime.ts')).toContain('shouldMountLiveHandoffThinking')
    expect(src('session-runtime.ts')).toContain('nextActivePinnedLiveSlots')
    expect(src('session-runtime.ts')).toContain('sameActivePinnedLiveSlotIdentity')
    expect(src('session-runtime.ts')).toContain('historyHasReserved 仍接调用方')
    expect(src('session-runtime.ts')).not.toContain(
      'if (options.historyHasReserved === false) return false'
    )
    expect(src('session-runtime.ts')).not.toContain('ARCHIVED_LIVE_PARTS_LIMIT')
    expect(src('../src/App.tsx')).toContain('readMountedMessageRowHeight')
    expect(src('../src/components/ChatView.tsx')).toContain('ejectedLiveArticles')
    expect(src('../src/components/ChatView.tsx')).toContain(
      'mergeSeededRowHeights(measuredRowHeightsRef.current, ejectedLiveHeights)'
    )
    expect(src('../src/components/ChatView.tsx')).toContain(
      'mergeSeededRowHeights(measuredRowHeightsRef.current, scrollSnapshot?.rowHeights ?? {})'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('withTranscriptRowHeights')
    expect(src('../src/components/ChatView.tsx')).toContain(
      '不订 ejectedLiveHeights / scrollSnapshot.rowHeights'
    )
    expect(src('../src/components/ChatView.tsx')).toContain('resolvePreviousRowIntrinsicSize')
    expect(src('../src/components/ChatView.tsx')).toContain(
      'intrinsicHeightsRef.current = new Map(measuredRowHeightsRef.current)'
    )
    expect(src('../src/components/ChatView.tsx')).not.toContain('FAR_ROW_INTRINSIC_GUESS')
    expect(src('../src/components/ChatView.tsx')).toContain('archivedLiveArticles')
    expect(src('../src/components/ChatView.tsx')).toContain('frozenHistoricalArticle')
    expect(src('../src/components/ChatView.tsx')).toContain('liveDiff={false}')
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('liveDiff={liveDiff}')
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('frozenParts')
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('frozenProcess')
    expect(src('../src/components/ChatView.tsx')).toContain('frozenProcess')
    expect(src('../src/components/TurnFlow.tsx')).toContain('frozenThinkText')
    expect(src('../src/components/TurnFlow.tsx')).toContain('frozenSteps')
    expect(src('../src/components/TurnFlow.tsx')).toContain('shouldUseFrozenProcessSteps')
    expect(src('../src/components/TurnFlow.tsx')).toContain('instanceId={step.id}')
    expect(src('../src/components/TurnFlow.tsx')).toContain('live={live}')
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain(
      'frozenSteps={frozenProcess?.steps}\n          live'
    )
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('frozenSteps')
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('useLiveStreamUiSelectWhen')

    expect(src('../src/components/TurnFlow.tsx').includes("from '../../shared/live-stream-core'")).toBe(
      false
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

    expect(src('../src/components/AssistantMessage.tsx')).toContain('wrapLines={!streaming}')
    expect(src('../src/components/AssistantMessage.tsx')).toContain('seedHistoricalAnswerHold')
    expect(src('../src/components/AssistantMessage.tsx')).toContain('frozenSteps={frozenSteps}')
    expect(src('../src/components/ChatView.tsx')).toContain('clearHistoricalAnswerHolds')
    expect(src('../src/components/ChatView.tsx')).toContain('shouldPrefetchOlderHistoryPage')
    expect(src('../src/App.tsx')).toContain('ensureOlderHistoryPage')
    expect(src('../src/App.tsx')).toContain('handlePrefetchOlderHistory')
    expect(src('../src/components/ChatView.tsx')).toContain('warmHistoricalAnswerHold')
    expect(src('../src/components/ChatView.tsx')).toContain('HISTORICAL_ANSWER_WARM_SLICE')
    expect(src('../src/components/ChatView.tsx')).toContain('skipHeld: true')
    expect(src('../src/components/ChatView.tsx')).toContain('requestIdleCallback')
    expect(src('historical-answer-hold.ts').includes('live-stream-slices')).toBe(false)
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('liveDiff = true')
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('isStreaming={isStreaming}')
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain(
      'streaming={options.markdownStreaming}'
    )
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('nextLiveAnswerRenderParts')
    expect(src('../src/components/LiveAssistantParts.tsx')).not.toContain('LiveStoreAnswerTail')
    expect(src('../src/components/LiveAssistantParts.tsx')).not.toContain('LiveStoreClosedAnswer')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('FenceImmediateHighlightContext')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('COPY_LABEL')
    expect(src('../src/components/CodeArtifactBlock.tsx').includes('复制代码')).toBe(false)
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('shouldHighlightLiveFence')
    expect(src('../src/components/ChatView.tsx')).toContain('FenceImmediateHighlightContext')
    expect(src('../src/components/ChatView.tsx')).toContain('rememberNearLiveHighlightPreference')
    expect(src('../src/components/ChatView.tsx')).toContain('nearLiveImmediateIdsRef')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('shouldAllowLiveFenceHighlight')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('shouldPaintLiveFenceHighlight')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('shouldWarmLiveFenceHighlight')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('queueMicrotask')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('hasCachedFenceHighlight')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('LiveMarkdownStreamingContext')
    expect(src('../src/components/CodeArtifactBlock.tsx')).toContain('liveFenceLineHtml(html, text)')
    expect(src('../src/components/CodeArtifactBlock.tsx')).not.toContain('html != null ?')
    expect(src('live-display.ts')).toContain('export function liveFenceLineHtml')
    expect(src('../src/components/StreamingMarkdown.tsx')).toContain(
      '开标加长到 ```demo / mermaid 就挂 InlineDemo'
    )
    expect(src('streaming-markdown.ts')).toContain('fenceLangFromOpenTail(rest)')
    expect(src('streaming-markdown.ts')).not.toContain('tailLang: prev.tailLang')
    expect(src('../src/components/StreamingMarkdown.tsx')).toContain('seedStreamingMarkdownHold')
    expect(src('../src/components/StreamingMarkdown.tsx')).toContain('writeStreamingMarkdownHold')
    expect(src('../src/components/StreamingMarkdown.tsx')).toContain('LiveMarkdownLiveContext.Provider')
    expect(src('../src/components/StreamingMarkdown.tsx')).toContain(
      'LiveMarkdownStreamingContext.Provider'
    )
    expect(src('../src/components/StreamingMarkdown.tsx')).not.toMatch(
      /<InlineDemo[^>]*\sstreaming\s/
    )
    expect(src('../src/components/InlineDemo.tsx')).toContain('LiveMarkdownLiveContext')
    expect(src('../src/components/InlineDemo.tsx')).toContain('shouldWalkInlineDemoTree({ live:')
    expect(src('../src/components/InlineDemo.tsx')).toContain('resolveInlineDemoSrcDoc')
    expect(src('../src/components/InlineDemo.tsx')).toContain('adoptInlineDemoFrame')
    expect(src('../src/components/InlineDemo.tsx')).toContain('inlineDemoStableId')
    expect(src('../src/components/ChatView.tsx')).toContain('clearInlineDemoFramePool')
    expect(src('../src/components/InlineDemo.tsx')).toContain('inlineDemoThemeCacheKey')
    expect(src('../src/components/LiveAssistantParts.tsx')).toMatch(
      /<InlineDemo[\s\S]{0,240}\blive\b/
    )
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('instanceId={part.id}')
    expect(src('../src/components/InlineDemo.tsx')).toContain('shouldUseLiveInlineDemoStableId')
    expect(src('../src/components/InlineDemo.tsx')).toContain('liveInlineDemoStableId')
    expect(src('live-display.ts')).toContain('shouldUseLiveInlineDemoStableId')
    expect(src('live-display.ts')).toContain('liveInlineDemoStableId')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('shouldRenderLiveMermaid')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('shouldWarmLiveMermaid')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('renderMermaidSvg')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('resolveLiveMermaidSvg')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('shouldShowMermaidSvg')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('className="mermaid-slot"')
    expect(src('../src/components/MermaidBlock.tsx')).not.toContain('if (!closed || !source.trim() || failed || !shownSvg)')
    expect(src('../src/components/MermaidBlock.tsx')).not.toContain('return shell(')
    expect(src('mermaid-fence.ts')).toContain('export function shouldShowMermaidSvg')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('shouldStartMermaidPaintJob')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('shouldDeferMermaidPaintJob')
    expect(src('../src/components/MermaidBlock.tsx')).toContain('FenceImmediateHighlightContext')
    expect(src('live-answer-prefetch.ts')).toContain('prefetchMermaidSvgs')
    expect(src('live-answer-prefetch.ts')).toContain('prefetchChatImageSizes')
    expect(src('live-answer-prefetch.ts')).toContain('collectClosedLiveChatImagesFromAnswer')
    expect(src('../src/components/ChatImage.tsx')).toContain('prefetchRemoteChatImageSize')
    expect(src('../src/components/ChatImage.tsx')).toContain('shouldRenderLiveChatImage')
    expect(src('../src/components/ChatImage.tsx')).toContain('shouldWarmLiveChatImage')
    expect(src('../src/components/ChatImage.tsx')).toContain('shouldStartChatImageSizeTick')
    expect(src('../src/components/ChatImage.tsx')).toContain('shouldApplyCachedWorkspaceImage')
    expect(src('../src/components/ChatImage.tsx')).toContain('shouldDeferChatImagePrefetch')
    expect(src('../src/components/ChatImage.tsx')).toContain('FenceImmediateHighlightContext')
    expect(src('../src/components/ChatImage.tsx')).toContain('COPY_LABEL')
    expect(src('../src/components/ChatImage.tsx').includes('复制图片')).toBe(false)
    expect(src('../src/components/ChatImage.tsx')).toContain('resolveLiveChatImageSrc')
    expect(src('../src/components/ChatImage.tsx')).toContain('LiveMarkdownStreamingContext')
    expect(src('../src/components/TurnFlow.tsx')).toContain('streaming={isStreaming}')
    expect(src('../src/components/TurnFlow.tsx')).toContain('nextTurnFlowVisibleSteps')
    expect(src('../src/components/TurnFlow.tsx')).toContain('visibleSteps.map')
    expect((src('../src/components/TurnFlow.tsx').match(/className="turn-flow-steps"/g) || []).length).toBe(1)
    expect(src('../src/components/TurnFlow.tsx')).not.toContain('{showStepList ? (')
    expect(src('../src/components/TurnFlow.tsx')).not.toContain('{showPinnedSteps ? (')
    expect(src('../src/components/TurnFlow.tsx')).toContain('shouldShowLiveThought')
    expect(src('../src/components/TurnFlow.tsx')).toContain('shouldKeepCompletedLiveTurnFlow')
    expect(src('../src/components/TurnFlow.tsx')).toContain('remapProcessPhaseStepsOnStreamEnd')
    expect(src('process-phases.ts')).toContain('remapProcessPhaseStepsOnStreamEnd')
    expect(src('../src/components/TurnFlow.tsx')).toContain('useLiveStreamUiSelectWhen')
    expect(src('../src/components/TurnFlow.tsx')).toContain('(snap) => snap.turnThinking')
    expect(src('../src/components/TurnFlow.tsx').includes('liveProcessViewFromSnap')).toBe(false)
    expect(src('../src/components/LiveAssistantParts.tsx')).toContain('frozen={frozen}')
    expect(src('../src/components/ChatMath.tsx')).toContain('shouldRenderLiveChatMath')
    expect(src('../src/components/ChatMath.tsx')).toContain('shouldWarmLiveChatMath')
    expect(src('../src/components/ChatMath.tsx')).toContain('shouldStartChatMathPaintJob')
    expect(src('../src/components/ChatMath.tsx')).toContain('shouldDeferChatMathPaintJob')
    expect(src('../src/components/ChatMath.tsx')).toContain('FenceImmediateHighlightContext')
    expect(src('../src/components/ChatMath.tsx')).toContain('queueMicrotask')
    expect(src('../src/components/ChatMath.tsx')).toContain('liveChatMathClassName')
    expect(src('../src/components/ChatMath.tsx')).toContain('peekChatMathHtml')
    expect(src('../src/components/ChatMath.tsx')).toContain('resolveLiveChatMathHtml')
    expect(src('../src/components/ChatMath.tsx')).toContain('liveChatMathPaintHtml(painted, tex, fence)')
    expect(src('../src/components/ChatMath.tsx')).not.toContain('{chatMathSource(tex, fence)}')
    expect(src('../src/components/ChatMath.tsx')).not.toContain('if (!painted)')
    expect(src('chat-math.ts')).toContain('export function liveChatMathPaintHtml')
    expect(src('../src/components/ChatMath.tsx')).toContain('LiveMarkdownStreamingContext')
    expect(src('../src/components/ChatMath.tsx')).toContain('useEffect')
  })

  it('keeps the sealed first-text part object when a later token opens a new tail', () => {
    let prev: TurnSegment[] = []
    let parts = nextLiveAnswerRenderParts(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const step = (chunk: StreamChunk) => {
      const next = applyStreamChunk(prev, chunk)
      if (next === prev) return
      parts = nextLiveAnswerRenderParts(parts, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }
    step({ type: 'turn_start' })
    step({ type: 'token', content: 'Hello' })
    const first = parts.find((part) => part.type === 'text')
    expect(first?.type).toBe('text')
    expect(first && first.type === 'text' ? first.content : '').toBe('Hello')
    step({ type: 'tool_start', toolName: 'read_file', toolCallId: 'seal-1' })
    step({ type: 'tool_done', toolName: 'read_file', toolCallId: 'seal-1' })
    step({ type: 'token', content: 'More' })
    expect(parts[0]).toBe(first)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[parts.length - 1]).not.toBe(first)
  })

  it('keeps a harness first-stream walk off the combinatorial table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const step = (label: string, chunk: StreamChunk) => {
      const next = applyStreamChunk(prev, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) misses.push(`${label}: ${prev.map((s) => s.kind).join('+')} → ${next.map((s) => `${s.kind}:${s.toolName ?? s.status}`).join(',')}`)
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    step('turn_start', { type: 'turn_start' })
    step('think', { type: 'think', content: 'Hmm' })
    step('think-grow', { type: 'think', content: ' more' })
    step('read', { type: 'tool_start', toolName: 'read_file', toolCallId: 'c1', toolArgs: { path: 'a.ts' } })
    step('heartbeat', { type: 'status', content: '执行中… 1s', toolName: 'read_file' })
    step('read-done', { type: 'tool_done', toolName: 'read_file', toolCallId: 'c1', resultSummary: '12 lines' })
    step('list', { type: 'tool_start', toolName: 'list_dir', toolCallId: 'c2' })
    step('list-done', { type: 'tool_done', toolName: 'list_dir', toolCallId: 'c2' })
    step('write-preview', {
      type: 'tool_preview',
      toolName: 'write_file',
      toolCallId: 'c3',
      toolArgs: { path: 'a.ts', content: 'hi' }
    })
    step('write-grow', {
      type: 'tool_preview',
      toolName: 'write_file',
      toolCallId: 'c3',
      toolArgs: { path: 'a.ts', content: 'hi there' }
    })
    step('write-start', {
      type: 'tool_start',
      toolName: 'write_file',
      toolCallId: 'c3',
      toolArgs: { path: 'a.ts', content: 'hi there' }
    })
    step('write-done', {
      type: 'tool_done',
      toolName: 'write_file',
      toolCallId: 'c3',
      fileDiff: {
        path: 'a.ts',
        lines: [{ kind: 'add', content: 'hi there' }],
        stats: { added: 1, removed: 0 }
      }
    })
    step('token', { type: 'token', content: 'Hello' })
    step('token-grow', { type: 'token', content: ' world' })
    step('run', { type: 'tool_start', toolName: 'run_terminal_cmd', toolCallId: 'c4', toolArgs: { command: 'ls' } })
    step('await', {
      type: 'approval_needed',
      toolName: 'run_terminal_cmd',
      approval: {
        id: 'appr-1',
        title: 'ls',
        description: '',
        toolName: 'run_terminal_cmd',
        args: { command: 'ls' }
      }
    })
    step('allow', { type: 'approval_resolved', toolName: 'run_terminal_cmd', approved: true })
    step('run-done', { type: 'tool_done', toolName: 'run_terminal_cmd', toolCallId: 'c4', resultSummary: 'ok' })
    step('token2', { type: 'token', content: ' Next' })
    step('plan', { type: 'status', content: '根据已完成步骤规划下一步…' })
    step('ask-tool', { type: 'tool_start', toolName: 'request_user_input', toolCallId: 'c5' })
    step('ask', {
      type: 'user_input_needed',
      toolName: 'request_user_input',
      userInput: {
        id: 'ask-1',
        questions: [
          {
            id: 'q1',
            header: 'API style',
            question: 'Which style?',
            options: [{ label: 'REST', description: '' }]
          }
        ]
      }
    })
    step('ask-done', { type: 'user_input_resolved', toolName: 'request_user_input' })
    step('ask-tool-done', { type: 'tool_done', toolName: 'request_user_input', toolCallId: 'c5' })
    step('compact-status', { type: 'status', content: 'Automatically compacting context' })
    step('compress', {
      type: 'context_compress',
      contextCompress: { removedCount: 3, beforeTokens: 80, afterTokens: 40 }
    })
    step('demo-fence', { type: 'token', content: '\n```demo\n<div>' })
    step('demo-html', { type: 'token', content: 'Hi</div>\n```' })
    step('inline-demo', {
      type: 'tool_preview',
      toolName: 'present_inline_demo',
      toolCallId: 'c6',
      content: '<p>card</p>',
      toolArgs: { caption: 'card' }
    })

    expect(misses).toEqual([])
    expect(answer.parts.some((part) => part.type === 'diff')).toBe(true)
    expect(answer.parts.some((part) => part.type === 'demo')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'compress')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'present_inline_demo')).toBe(
      false
    )
  })

  it('keeps same-flush harness batches off the combinatorial table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [
      { type: 'turn_start' },
      { type: 'think', content: 'Hmm' },
      { type: 'think', content: ' more' }
    ])
    flush('think-and-read', [
      { type: 'think', content: ' then read' },
      { type: 'tool_start', toolName: 'read_file', toolCallId: 'p1', toolArgs: { path: 'a.ts' } },
      { type: 'tool_start', toolName: 'list_dir', toolCallId: 'p2' }
    ])
    flush('parallel-done', [
      { type: 'tool_done', toolName: 'read_file', toolCallId: 'p1', resultSummary: '12 lines' },
      { type: 'tool_done', toolName: 'list_dir', toolCallId: 'p2' }
    ])
    flush('write-and-token', [
      {
        type: 'tool_preview',
        toolName: 'write_file',
        toolCallId: 'p3',
        toolArgs: { path: 'a.ts', content: 'hi' }
      },
      {
        type: 'tool_done',
        toolName: 'write_file',
        toolCallId: 'p3',
        fileDiff: {
          path: 'a.ts',
          lines: [{ kind: 'add', content: 'hi' }],
          stats: { added: 1, removed: 0 }
        }
      },
      { type: 'token', content: 'Hello' }
    ])
    flush('token-and-run', [
      { type: 'token', content: ' world' },
      {
        type: 'tool_start',
        toolName: 'run_terminal_cmd',
        toolCallId: 'p4',
        toolArgs: { command: 'ls' }
      },
      {
        type: 'approval_needed',
        toolName: 'run_terminal_cmd',
        approval: {
          id: 'appr-2',
          title: 'ls',
          description: '',
          toolName: 'run_terminal_cmd',
          args: { command: 'ls' }
        }
      }
    ])
    flush('deny-error', [
      { type: 'approval_resolved', toolName: 'run_terminal_cmd', approved: false },
      {
        type: 'tool_done',
        toolName: 'run_terminal_cmd',
        toolCallId: 'p4',
        toolStatus: 'error',
        error: 'denied'
      }
    ])
    flush('reconnect-and-patch', [
      { type: 'status', content: 'Reconnecting... 1/5' },
      { type: 'status', content: 'Reconnecting... 2/5' },
      {
        type: 'tool_preview',
        toolName: 'search_replace',
        toolCallId: 'p5',
        toolArgs: { path: 'b.ts', old_string: 'a', new_string: 'b' }
      }
    ])
    flush('patch-done-and-demo', [
      {
        type: 'tool_done',
        toolName: 'search_replace',
        toolCallId: 'p5',
        fileDiff: {
          path: 'b.ts',
          lines: [{ kind: 'add', content: 'b' }],
          stats: { added: 1, removed: 0 }
        }
      },
      { type: 'token', content: '\n```demo\n<div>' }
    ])
    flush('stop', [{ type: 'turn_cancelled' }])
    flush('error-after-status', [
      { type: 'status', content: 'Preparing' },
      { type: 'error', error: 'boom' }
    ])

    expect(misses).toEqual([])
    expect(answer.parts.some((part) => part.type === 'diff')).toBe(true)
    expect(answer.parts.some((part) => part.type === 'demo' || part.type === 'text')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'search_replace')).toBe(true)
  })

  it('keeps one-shot tools, apply_patch, and mixed write-stat flushes off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('one-shot-read', [
      { type: 'turn_start' },
      { type: 'think', content: 'Scan' },
      { type: 'tool_start', toolName: 'read_file', toolCallId: 'o1', toolArgs: { path: 'a.ts' } },
      { type: 'tool_done', toolName: 'read_file', toolCallId: 'o1', resultSummary: '12 lines' }
    ])
    flush('patch-preview', [
      {
        type: 'tool_preview',
        toolName: 'apply_patch',
        toolCallId: 'o2',
        toolArgs: {
          patch: '*** Update File: a.ts\n@@ -1 +1 @@\n-old\n+new'
        }
      }
    ])
    flush('patch-grow-second-file', [
      {
        type: 'tool_preview',
        toolName: 'apply_patch',
        toolCallId: 'o2',
        toolArgs: {
          patch:
            '*** Update File: a.ts\n@@ -1 +1 @@\n-old\n+new\n*** Add File: b.ts\n@@\n+hello'
        }
      }
    ])
    flush('patch-done-think-token', [
      {
        type: 'tool_done',
        toolName: 'apply_patch',
        toolCallId: 'o2',
        fileDiffs: [
          {
            path: 'a.ts',
            lines: [
              { kind: 'del', content: 'old' },
              { kind: 'add', content: 'new' }
            ],
            stats: { added: 1, removed: 1 }
          },
          {
            path: 'b.ts',
            lines: [{ kind: 'add', content: 'hello' }],
            stats: { added: 1, removed: 0 }
          }
        ]
      },
      { type: 'status', content: 'Reconnecting... 1/5' },
      { type: 'think', content: 'Check patch' },
      { type: 'token', content: 'Patched' }
    ])
    flush('one-shot-write-and-token', [
      {
        type: 'tool_start',
        toolName: 'write_file',
        toolCallId: 'o3',
        toolArgs: { path: 'c.ts', content: 'export {}\n' }
      },
      {
        type: 'tool_done',
        toolName: 'write_file',
        toolCallId: 'o3',
        fileDiff: {
          path: 'c.ts',
          lines: [{ kind: 'add', content: 'export {}' }],
          stats: { added: 1, removed: 0 }
        }
      },
      { type: 'token', content: ' and wrote' }
    ])

    expect(misses).toEqual([])
    expect(answer.parts.filter((part) => part.type === 'diff')).toHaveLength(3)
    expect(
      answer.parts.some((part) => part.type === 'text' && part.content.includes('Patched'))
    ).toBe(true)
    expect(answer.tail?.type === 'text' && answer.tail.content).toBe(' and wrote')
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'apply_patch')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'write_file')).toBe(true)

    const finalized = finalizeSegments(prev)
    expect(shouldSkipLiveStreamDerivation(prev, finalized)).toBeTruthy()
    const afterFinalize = nextLiveAnswerView(answer, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: finalized
    })
    expect(afterFinalize.parts.filter((part) => part.type === 'diff')).toHaveLength(3)
    expect(
      afterFinalize.parts.some((part) => part.type === 'text' && part.content.includes('Patched'))
    ).toBe(true)
  })

  it('skips finalize role assignment on two answer texts without the table', () => {
    const first: TurnSegment = { id: 'a1', kind: 'text', status: 'done', content: 'Hello' }
    const second: TurnSegment = { id: 'a2', kind: 'text', status: 'active', content: 'World' }
    const thought = think('Hmm')
    const thoughtDone: TurnSegment = { ...thought, status: 'done' }
    const read = tool('done')
    const before = [thoughtDone, read, first, second]
    const finalized = finalizeSegments(before)
    expect(finalized.some((segment) => segment.kind === 'text' && segment.role === 'narration')).toBe(
      true
    )
    expect(shouldSkipLiveStreamDerivation(before, finalized)).toBe('text')
    const firstView = nextLiveAnswerView(null, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: before
    })
    const next = nextLiveAnswerView(firstView, {
      ...EMPTY_LIVE_STREAM_UI,
      liveSegments: finalized
    })
    expect(next.parts.filter((part) => part.type === 'text').map((part) => part.content)).toEqual([
      'Hello',
      'World'
    ])
    expect(next.parts).toBe(firstView.parts)
  })

  it('keeps catalog tools, code fences, and Allow+write previews off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [{ type: 'turn_start' }, { type: 'think', content: 'Look around' }])
    flush('search', [
      { type: 'tool_start', toolName: 'web_search', toolCallId: 's1', toolArgs: { query: 'codex' } },
      {
        type: 'tool_done',
        toolName: 'web_search',
        toolCallId: 's1',
        resultSummary: 'https://example.com/docs'
      }
    ])
    flush('mcp', [
      {
        type: 'tool_start',
        toolName: 'mcp_github__search',
        toolCallId: 's2',
        toolArgs: { q: 'codex' }
      },
      { type: 'tool_done', toolName: 'mcp_github__search', toolCallId: 's2' }
    ])
    flush('plan', [
      {
        type: 'tool_start',
        toolName: 'update_plan',
        toolCallId: 's3',
        toolArgs: {
          plan: [
            { step: 'Read', status: 'completed' },
            { step: 'Patch', status: 'in_progress' }
          ]
        }
      },
      { type: 'tool_done', toolName: 'update_plan', toolCallId: 's3' }
    ])
    flush('image', [
      {
        type: 'tool_start',
        toolName: 'view_image',
        toolCallId: 's4',
        toolArgs: { path: '/tmp/shot.png' }
      },
      { type: 'tool_done', toolName: 'view_image', toolCallId: 's4', resultSummary: 'Viewed image' }
    ])
    flush('ts-fence', [{ type: 'token', content: 'See\n```ts\nexport const n = 1' }])
    flush('ts-grow', [{ type: 'token', content: '\nexport const m = 2\n```' }])
    flush('mermaid', [{ type: 'token', content: '\n```mermaid\ngraph TD\nA-->B' }])
    flush('run-and-allow-write', [
      {
        type: 'tool_start',
        toolName: 'run_terminal_cmd',
        toolCallId: 's5',
        toolArgs: { command: 'ls' }
      },
      {
        type: 'approval_needed',
        toolName: 'run_terminal_cmd',
        approval: {
          id: 'appr-3',
          title: 'ls',
          description: '',
          toolName: 'run_terminal_cmd',
          args: { command: 'ls' }
        }
      },
      { type: 'approval_resolved', toolName: 'run_terminal_cmd', approved: true },
      { type: 'tool_done', toolName: 'run_terminal_cmd', toolCallId: 's5', resultSummary: 'ok' },
      {
        type: 'tool_preview',
        toolName: 'write_file',
        toolCallId: 's6',
        toolArgs: { path: 'n.ts', content: 'export const n = 1\n' }
      }
    ])

    expect(misses).toEqual([])
    expect(answer.parts.some((part) => part.type === 'text' && part.content.includes('```ts'))).toBe(
      true
    )
    expect(
      answer.parts.some((part) => part.type === 'text' && part.content.includes('```mermaid'))
    ).toBe(true)
    expect(answer.parts.some((part) => part.type === 'diff')).toBe(true)
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'web_search')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'mcp_github__search')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'update_plan')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'view_image')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'write_file')).toBe(true)
  })

  it('keeps grep, glob, browser, and subagent first-stream walks off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [{ type: 'turn_start' }, { type: 'think', content: 'Search the tree' }])
    flush('grep', [
      {
        type: 'tool_start',
        toolName: 'grep',
        toolCallId: 'g1',
        toolArgs: { pattern: 'shouldSkip', path: 'shared' }
      },
      { type: 'tool_done', toolName: 'grep', toolCallId: 'g1', resultSummary: '12 matches' }
    ])
    flush('glob', [
      {
        type: 'tool_start',
        toolName: 'glob_file_search',
        toolCallId: 'g2',
        toolArgs: { glob: '**/*.ts' }
      },
      { type: 'tool_done', toolName: 'glob_file_search', toolCallId: 'g2', resultSummary: '40 files' }
    ])
    flush('browser', [
      {
        type: 'tool_start',
        toolName: 'browser_navigate',
        toolCallId: 'g3',
        toolArgs: { url: 'https://learn.chatgpt.com' }
      },
      { type: 'tool_done', toolName: 'browser_navigate', toolCallId: 'g3', resultSummary: 'Opened' },
      {
        type: 'tool_start',
        toolName: 'browser_snapshot',
        toolCallId: 'g4'
      },
      { type: 'tool_done', toolName: 'browser_snapshot', toolCallId: 'g4' }
    ])
    flush('subagent', [
      {
        type: 'tool_start',
        toolName: 'agent_spawn',
        toolCallId: 'g5',
        toolArgs: { task: 'Review the diff' }
      },
      { type: 'tool_done', toolName: 'agent_spawn', toolCallId: 'g5', resultSummary: 'Spawned' }
    ])
    flush('token', [{ type: 'token', content: 'Found the matches.' }])

    expect(misses).toEqual([])
    expect(
      answer.parts.some((part) => part.type === 'text' && part.content.includes('Found the matches'))
    ).toBe(true)
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'grep')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'glob_file_search')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'browser_navigate')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'browser_snapshot')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'agent_spawn')).toBe(true)
  })

  it('keeps web_fetch, desktop, delete_path, and mcp_call first-stream walks off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [{ type: 'turn_start' }, { type: 'think', content: 'Fetch and patch' }])
    flush('fetch', [
      {
        type: 'tool_start',
        toolName: 'web_fetch',
        toolCallId: 'w1',
        toolArgs: { url: 'https://learn.chatgpt.com/docs/appshots' }
      },
      { type: 'tool_done', toolName: 'web_fetch', toolCallId: 'w1', resultSummary: 'Fetched' }
    ])
    flush('desktop', [
      { type: 'tool_start', toolName: 'desktop_screenshot', toolCallId: 'w2' },
      { type: 'tool_done', toolName: 'desktop_screenshot', toolCallId: 'w2', resultSummary: 'Saved' },
      {
        type: 'tool_start',
        toolName: 'mcp_call_tool',
        toolCallId: 'w3',
        toolArgs: { server: 'github', tool: 'search' }
      },
      { type: 'tool_done', toolName: 'mcp_call_tool', toolCallId: 'w3' }
    ])
    flush('delete', [
      {
        type: 'tool_start',
        toolName: 'delete_path',
        toolCallId: 'w4',
        toolArgs: { path: 'tmp/old.ts' }
      },
      {
        type: 'tool_done',
        toolName: 'delete_path',
        toolCallId: 'w4',
        fileDiff: {
          path: 'tmp/old.ts',
          lines: [{ kind: 'del', content: 'export const old = 1' }],
          stats: { added: 0, removed: 1 }
        }
      }
    ])
    flush('fence-close', [
      { type: 'token', content: 'Removed.\n```ts\nexport const n = 1' },
      { type: 'token', content: '\n```' }
    ])

    expect(misses).toEqual([])
    expect(answer.parts.some((part) => part.type === 'diff')).toBe(true)
    expect(answer.parts.some((part) => part.type === 'text' && part.content.includes('```ts'))).toBe(
      true
    )
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'web_fetch')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'desktop_screenshot')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'mcp_call_tool')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'delete_path')).toBe(true)
  })

  it('keeps pdf, notebook, tasks, plan-mode, and worktree first-stream walks off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [{ type: 'turn_start' }, { type: 'think', content: 'Read extras' }])
    flush('pdf', [
      {
        type: 'tool_start',
        toolName: 'read_pdf',
        toolCallId: 'x1',
        toolArgs: { path: 'spec.pdf' }
      },
      { type: 'tool_done', toolName: 'read_pdf', toolCallId: 'x1', resultSummary: '12 pages' }
    ])
    flush('notebook', [
      {
        type: 'tool_start',
        toolName: 'edit_notebook',
        toolCallId: 'x2',
        toolArgs: { path: 'n.ipynb', cell: 0 }
      },
      { type: 'tool_done', toolName: 'edit_notebook', toolCallId: 'x2' }
    ])
    flush('task', [
      {
        type: 'tool_start',
        toolName: 'task_create',
        toolCallId: 'x3',
        toolArgs: { title: 'Follow up' }
      },
      { type: 'tool_done', toolName: 'task_create', toolCallId: 'x3' }
    ])
    flush('plan-mode', [
      { type: 'tool_start', toolName: 'enter_plan_mode', toolCallId: 'x4' },
      { type: 'tool_done', toolName: 'enter_plan_mode', toolCallId: 'x4' },
      { type: 'tool_start', toolName: 'exit_plan_mode', toolCallId: 'x5' },
      { type: 'tool_done', toolName: 'exit_plan_mode', toolCallId: 'x5' }
    ])
    flush('worktree', [
      {
        type: 'tool_start',
        toolName: 'git_worktree_add',
        toolCallId: 'x6',
        toolArgs: { path: '.worktrees/review' }
      },
      { type: 'tool_done', toolName: 'git_worktree_add', toolCallId: 'x6' }
    ])
    flush('mermaid-close', [
      { type: 'token', content: 'See\n```mermaid\ngraph TD\nA-->B' },
      { type: 'token', content: '\n```' }
    ])

    expect(misses).toEqual([])
    expect(
      answer.parts.some((part) => part.type === 'text' && part.content.includes('```mermaid'))
    ).toBe(true)
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'read_pdf')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'edit_notebook')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'task_create')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'enter_plan_mode')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'git_worktree_add')).toBe(
      true
    )
  })

  it('keeps git, skills, move, and terminal first-stream walks off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [{ type: 'turn_start' }, { type: 'think', content: 'Inspect git and skills' }])
    flush('git', [
      { type: 'tool_start', toolName: 'git_status', toolCallId: 'y1' },
      { type: 'tool_done', toolName: 'git_status', toolCallId: 'y1', resultSummary: 'clean' },
      { type: 'tool_start', toolName: 'git_diff', toolCallId: 'y2' },
      { type: 'tool_done', toolName: 'git_diff', toolCallId: 'y2' },
      { type: 'tool_start', toolName: 'git_log', toolCallId: 'y3' },
      { type: 'tool_done', toolName: 'git_log', toolCallId: 'y3' },
      { type: 'tool_start', toolName: 'git_show', toolCallId: 'y4', toolArgs: { rev: 'HEAD' } },
      { type: 'tool_done', toolName: 'git_show', toolCallId: 'y4' },
      { type: 'tool_start', toolName: 'git_add', toolCallId: 'y5', toolArgs: { path: 'a.ts' } },
      { type: 'tool_done', toolName: 'git_add', toolCallId: 'y5' },
      {
        type: 'tool_start',
        toolName: 'git_commit',
        toolCallId: 'y6',
        toolArgs: { message: 'polish' }
      },
      { type: 'tool_done', toolName: 'git_commit', toolCallId: 'y6' },
      { type: 'tool_start', toolName: 'git_pull', toolCallId: 'y7' },
      { type: 'tool_done', toolName: 'git_pull', toolCallId: 'y7' },
      { type: 'tool_start', toolName: 'git_push', toolCallId: 'y8' },
      { type: 'tool_done', toolName: 'git_push', toolCallId: 'y8' }
    ])
    flush('skills', [
      { type: 'tool_start', toolName: 'list_skills', toolCallId: 'y9' },
      { type: 'tool_done', toolName: 'list_skills', toolCallId: 'y9' },
      { type: 'tool_start', toolName: 'read_skill', toolCallId: 'y10', toolArgs: { name: 'review' } },
      { type: 'tool_done', toolName: 'read_skill', toolCallId: 'y10' },
      {
        type: 'tool_start',
        toolName: 'run_skill_script',
        toolCallId: 'y11',
        toolArgs: { name: 'review' }
      },
      { type: 'tool_done', toolName: 'run_skill_script', toolCallId: 'y11' }
    ])
    flush('paths', [
      {
        type: 'tool_start',
        toolName: 'move_path',
        toolCallId: 'y12',
        toolArgs: { from: 'a.ts', to: 'b.ts' }
      },
      { type: 'tool_done', toolName: 'move_path', toolCallId: 'y12' },
      {
        type: 'tool_start',
        toolName: 'create_directory',
        toolCallId: 'y13',
        toolArgs: { path: 'tmp' }
      },
      { type: 'tool_done', toolName: 'create_directory', toolCallId: 'y13' },
      { type: 'tool_start', toolName: 'read_thread_terminal', toolCallId: 'y14' },
      { type: 'tool_done', toolName: 'read_thread_terminal', toolCallId: 'y14' }
    ])
    flush('math-close', [
      { type: 'token', content: 'Energy is \\(E=mc^2' },
      { type: 'token', content: '\\)' }
    ])

    expect(misses).toEqual([])
    expect(answer.parts.some((part) => part.type === 'text' && part.content.includes('E=mc^2'))).toBe(
      true
    )
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'git_status')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'list_skills')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'move_path')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'read_thread_terminal')).toBe(
      true
    )
  })

  it('keeps shell, voice, agent, and catalog leftover first-stream walks off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [{ type: 'turn_start' }, { type: 'think', content: 'Finish leftover tools' }])
    flush('uninstall', [
      {
        type: 'tool_start',
        toolName: 'uninstall_application',
        toolCallId: 'z1',
        toolArgs: { name: 'Demo' }
      },
      { type: 'tool_done', toolName: 'uninstall_application', toolCallId: 'z1' },
      { type: 'tool_start', toolName: 'verify_removal', toolCallId: 'z2' },
      { type: 'tool_done', toolName: 'verify_removal', toolCallId: 'z2' }
    ])
    flush('shell', [
      {
        type: 'tool_start',
        toolName: 'run_background_shell',
        toolCallId: 'z3',
        toolArgs: { command: 'sleep 1' }
      },
      { type: 'tool_done', toolName: 'run_background_shell', toolCallId: 'z3' },
      { type: 'tool_start', toolName: 'shell_read_output', toolCallId: 'z4' },
      { type: 'tool_done', toolName: 'shell_read_output', toolCallId: 'z4' },
      { type: 'tool_start', toolName: 'shell_kill', toolCallId: 'z5' },
      { type: 'tool_done', toolName: 'shell_kill', toolCallId: 'z5' }
    ])
    flush('voice-agent', [
      { type: 'tool_start', toolName: 'voice_read_aloud', toolCallId: 'z6' },
      { type: 'tool_done', toolName: 'voice_read_aloud', toolCallId: 'z6' },
      { type: 'tool_start', toolName: 'voice_stop', toolCallId: 'z7' },
      { type: 'tool_done', toolName: 'voice_stop', toolCallId: 'z7' },
      {
        type: 'tool_start',
        toolName: 'agent_send_message',
        toolCallId: 'z8',
        toolArgs: { message: 'ping' }
      },
      { type: 'tool_done', toolName: 'agent_send_message', toolCallId: 'z8' },
      { type: 'tool_start', toolName: 'agent_get_result', toolCallId: 'z9' },
      { type: 'tool_done', toolName: 'agent_get_result', toolCallId: 'z9' },
      { type: 'tool_start', toolName: 'agent_list', toolCallId: 'z10' },
      { type: 'tool_done', toolName: 'agent_list', toolCallId: 'z10' }
    ])
    flush('catalog', [
      { type: 'tool_start', toolName: 'mcp_list_tools', toolCallId: 'z11' },
      { type: 'tool_done', toolName: 'mcp_list_tools', toolCallId: 'z11' },
      {
        type: 'tool_start',
        toolName: 'open_url',
        toolCallId: 'z12',
        toolArgs: { url: 'https://learn.chatgpt.com' }
      },
      { type: 'tool_done', toolName: 'open_url', toolCallId: 'z12' }
    ])
    flush('token', [{ type: 'token', content: 'Done.' }])

    expect(misses).toEqual([])
    expect(answer.parts.some((part) => part.type === 'text' && part.content.includes('Done'))).toBe(
      true
    )
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'run_background_shell')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'voice_read_aloud')).toBe(
      true
    )
    expect(process.processForFlow.some((segment) => segment.toolName === 'agent_list')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'open_url')).toBe(true)
  })

  it('keeps remaining worktree, task, desktop, and browser first-stream walks off the table', () => {
    const misses: string[] = []
    let prev: TurnSegment[] = []
    let answer = nextLiveAnswerView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    let process = nextLiveProcessView(null, { ...EMPTY_LIVE_STREAM_UI, liveSegments: prev })
    const flush = (label: string, chunks: StreamChunk[]) => {
      let next = prev
      for (const chunk of chunks) next = applyStreamChunk(next, chunk)
      if (next === prev) return
      const skip = shouldSkipLiveStreamDerivation(prev, next)
      if (!skip) {
        misses.push(
          `${label}: ${prev.map((s) => s.kind).join('+')} → ${next
            .map((s) => `${s.kind}:${s.toolName ?? s.status}`)
            .join(',')}`
        )
      }
      answer = nextLiveAnswerView(answer, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      process = nextLiveProcessView(process, { ...EMPTY_LIVE_STREAM_UI, liveSegments: next })
      prev = next
    }

    flush('open', [{ type: 'turn_start' }, { type: 'think', content: 'Cover leftover catalog' }])
    flush('reads', [
      { type: 'tool_start', toolName: 'read_image', toolCallId: 'r1', toolArgs: { path: 'a.png' } },
      { type: 'tool_done', toolName: 'read_image', toolCallId: 'r1' },
      { type: 'tool_start', toolName: 'read_graph', toolCallId: 'r2', toolArgs: { path: 'g.json' } },
      { type: 'tool_done', toolName: 'read_graph', toolCallId: 'r2' },
      {
        type: 'tool_start',
        toolName: 'read_notebook',
        toolCallId: 'r3',
        toolArgs: { path: 'n.ipynb' }
      },
      { type: 'tool_done', toolName: 'read_notebook', toolCallId: 'r3' }
    ])
    flush('worktree', [
      { type: 'tool_start', toolName: 'git_worktree_list', toolCallId: 'r4' },
      { type: 'tool_done', toolName: 'git_worktree_list', toolCallId: 'r4' },
      {
        type: 'tool_start',
        toolName: 'git_worktree_remove',
        toolCallId: 'r5',
        toolArgs: { path: '.worktrees/old' }
      },
      { type: 'tool_done', toolName: 'git_worktree_remove', toolCallId: 'r5' },
      { type: 'tool_start', toolName: 'enter_worktree', toolCallId: 'r6' },
      { type: 'tool_done', toolName: 'enter_worktree', toolCallId: 'r6' },
      { type: 'tool_start', toolName: 'exit_worktree', toolCallId: 'r7' },
      { type: 'tool_done', toolName: 'exit_worktree', toolCallId: 'r7' }
    ])
    flush('tasks', [
      { type: 'tool_start', toolName: 'task_update', toolCallId: 'r8', toolArgs: { id: 't1' } },
      { type: 'tool_done', toolName: 'task_update', toolCallId: 'r8' },
      { type: 'tool_start', toolName: 'task_get', toolCallId: 'r9', toolArgs: { id: 't1' } },
      { type: 'tool_done', toolName: 'task_get', toolCallId: 'r9' },
      { type: 'tool_start', toolName: 'task_list', toolCallId: 'r10' },
      { type: 'tool_done', toolName: 'task_list', toolCallId: 'r10' },
      { type: 'tool_start', toolName: 'task_output', toolCallId: 'r11' },
      { type: 'tool_done', toolName: 'task_output', toolCallId: 'r11' },
      { type: 'tool_start', toolName: 'task_stop', toolCallId: 'r12' },
      { type: 'tool_done', toolName: 'task_stop', toolCallId: 'r12' },
      { type: 'tool_start', toolName: 'manage_scheduled_task', toolCallId: 'r13' },
      { type: 'tool_done', toolName: 'manage_scheduled_task', toolCallId: 'r13' }
    ])
    flush('desktop', [
      { type: 'tool_start', toolName: 'desktop_doctor', toolCallId: 'r14' },
      { type: 'tool_done', toolName: 'desktop_doctor', toolCallId: 'r14' },
      { type: 'tool_start', toolName: 'desktop_list_windows', toolCallId: 'r15' },
      { type: 'tool_done', toolName: 'desktop_list_windows', toolCallId: 'r15' },
      { type: 'tool_start', toolName: 'desktop_get_ui_tree', toolCallId: 'r16' },
      { type: 'tool_done', toolName: 'desktop_get_ui_tree', toolCallId: 'r16' },
      { type: 'tool_start', toolName: 'desktop_click', toolCallId: 'r17' },
      { type: 'tool_done', toolName: 'desktop_click', toolCallId: 'r17' },
      { type: 'tool_start', toolName: 'desktop_type', toolCallId: 'r18' },
      { type: 'tool_done', toolName: 'desktop_type', toolCallId: 'r18' },
      { type: 'tool_start', toolName: 'desktop_key', toolCallId: 'r19' },
      { type: 'tool_done', toolName: 'desktop_key', toolCallId: 'r19' },
      { type: 'tool_start', toolName: 'desktop_scroll', toolCallId: 'r20' },
      { type: 'tool_done', toolName: 'desktop_scroll', toolCallId: 'r20' }
    ])
    flush('browser', [
      { type: 'tool_start', toolName: 'browser_click', toolCallId: 'r21' },
      { type: 'tool_done', toolName: 'browser_click', toolCallId: 'r21' },
      { type: 'tool_start', toolName: 'browser_type', toolCallId: 'r22' },
      { type: 'tool_done', toolName: 'browser_type', toolCallId: 'r22' },
      { type: 'tool_start', toolName: 'browser_screenshot', toolCallId: 'r23' },
      { type: 'tool_done', toolName: 'browser_screenshot', toolCallId: 'r23' },
      { type: 'tool_start', toolName: 'browser_close', toolCallId: 'r24' },
      { type: 'tool_done', toolName: 'browser_close', toolCallId: 'r24' },
      { type: 'tool_start', toolName: 'shell_send_input', toolCallId: 'r25' },
      { type: 'tool_done', toolName: 'shell_send_input', toolCallId: 'r25' }
    ])
    flush('display-math', [
      { type: 'token', content: 'See\n$$E=mc^2' },
      { type: 'token', content: '$$' }
    ])

    expect(misses).toEqual([])
    expect(answer.parts.some((part) => part.type === 'text' && part.content.includes('$$'))).toBe(
      true
    )
    expect(process.contentStreaming).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'read_notebook')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'enter_worktree')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'task_list')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'desktop_click')).toBe(true)
    expect(process.processForFlow.some((segment) => segment.toolName === 'browser_screenshot')).toBe(
      true
    )
  })
})
