import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TurnSegment } from './types'
import {
  hasLiveProcessPhaseGrowHold,
  shouldPrefetchLiveStreamTable,
  shouldSkipLiveAnswerIdentity,
  shouldSkipLiveStreamDerivation,
  type LiveAnswerView
} from './live-stream-core'

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

  it('does not classify a newly appended tool until the table is registered', () => {
    const closed: TurnSegment = { ...prose('Hello'), status: 'done' }
    expect(shouldSkipLiveStreamDerivation([prose('Hello')], [closed, tool('active')])).toBeNull()
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
