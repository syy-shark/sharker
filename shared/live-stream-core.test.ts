import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  hasLiveProcessPhaseGrowHold,
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

  it('does not classify a newly appended tool after closed prose until the table is registered', () => {
    const closed: TurnSegment = { ...prose('Hello'), status: 'done' }
    expect(shouldSkipLiveStreamDerivation([prose('Hello')], [closed, tool('active')])).toBeNull()
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
    expect(shouldSkipLiveStreamDerivation([tool('active')], [tool('active'), demo])).toBeNull()
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
  })

  it('does not skip a first demo-fence answer after tools without the table', () => {
    const demoFence = prose('```demo\n<div>demo</div>\n```')
    expect(
      shouldSkipLiveStreamDerivation([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), demoFence])
    ).toBeNull()
    expect(
      hasLiveProcessPhaseGrowHold([think('Hmm'), tool('active')], [think('Hmm'), tool('active'), demoFence])
    ).toBe(false)
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
    expect(
      appendProcessPhaseStepOnToolStart(steps, [thought, reading], [thought, reading, demoFence], true)
    ).toBeNull()
    const demoTool: TurnSegment = {
      id: 'd1',
      kind: 'tool',
      toolName: 'present_inline_demo',
      status: 'active',
      content: ''
    }
    expect(
      appendProcessPhaseStepOnToolStart(steps, [thought, reading], [thought, reading, demoTool], true)
    ).toBeNull()
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
