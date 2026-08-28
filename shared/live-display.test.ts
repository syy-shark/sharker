import { describe, expect, it } from 'vitest'
import {
  buildLiveHead,
  formatElapsedClock,
  isInlineDemoPaintable,
  isNearLiveMessageRow,
  liveThoughtBody,
  liveThinkingText,
  rollingThinkPreview,
  selectLiveHeadStep,
  shouldCollapseProcessOnAnswerStart,
  shouldFoldTurnWork,
  shouldSynthesizePlanning,
  turnProcessBounds,
  processElapsedSeconds
} from './live-display'

describe('live display head', () => {
  it('prefers latest active step over trailing done steps', () => {
    const step = selectLiveHeadStep([
      { id: '1', title: '读取文件', status: 'done' },
      { id: '2', title: '规划下一步', status: 'done' },
      { id: '3', title: '正在准备列出目录', status: 'active' }
    ])
    expect(step?.title).toBe('正在准备列出目录')
  })

  it('falls back to last step when none active', () => {
    const step = selectLiveHeadStep([
      { id: '1', title: '读取文件', status: 'done' },
      { id: '2', title: '规划下一步', status: 'done' }
    ])
    expect(step?.title).toBe('规划下一步')
  })

  it('buildLiveHead label matches active title', () => {
    const head = buildLiveHead({
      steps: [
        { id: '1', title: '读取文件', status: 'done' },
        { id: '2', title: '正在准备列出目录', detail: 'src', status: 'active' }
      ]
    })
    expect(head.label).toBe('正在准备列出目录')
    expect(head.detail).toBe('src')
  })

  it('does not synthesize planning while preparing next tool', () => {
    expect(
      shouldSynthesizePlanning({
        hasActiveWork: false,
        hasToolOrNarration: true,
        generatingAnswer: false,
        approvalWaiting: false,
        lastStepTitle: '正在准备列出目录'
      })
    ).toBe(false)
  })

  it('synthesizes planning after tools settle', () => {
    expect(
      shouldSynthesizePlanning({
        hasActiveWork: false,
        hasToolOrNarration: true,
        generatingAnswer: false,
        approvalWaiting: false,
        lastStepTitle: '读取文件'
      })
    ).toBe(true)
  })
})

describe('rolling think preview', () => {
  it('joins thinking segments and keeps a short tail window', () => {
    const text = liveThinkingText([
      { kind: 'status', content: '连接模型' },
      { kind: 'thinking', content: '先讲 add\n再讲 commit\n' },
      { kind: 'thinking', content: '然后用演示画分支\n最后总结' }
    ])
    expect(text).toContain('先讲 add')
    const preview = rollingThinkPreview(text, { maxLines: 3, maxChars: 80 })
    expect(preview).toContain('最后总结')
    expect(preview).not.toContain('先讲 add')
  })

  it('returns empty when there is no thinking text', () => {
    expect(liveThinkingText([{ kind: 'status', content: '思考中' }])).toBe('')
    expect(rollingThinkPreview('   ')).toBe('')
  })

  it('keeps narrative and drops trailing CSS from thought body', () => {
    const body = liveThoughtBody(
      [
        'The user wants an explanation of general relativity, then a demo.',
        'I will write a short intro and an interactive spacetime sketch.',
        'background: #444;',
        'color: white;',
        'cursor: pointer;',
        'font-size: 14px;'
      ].join('\n')
    )
    expect(body).toContain('general relativity')
    expect(body).not.toMatch(/background:\s*#444/)
    expect(body).not.toContain('cursor: pointer')
  })

  it('hides thought body when the stream is mostly source', () => {
    expect(
      liveThoughtBody(['background: #444;', 'color: white;', 'cursor: pointer;'].join('\n'))
    ).toBe('')
  })
})

describe('inline demo paintability', () => {
  it('rejects empty, placeholder, and CSS-only fragments', () => {
    expect(isInlineDemoPaintable('')).toBe(false)
    expect(isInlineDemoPaintable('<!-- streaming -->')).toBe(false)
    expect(
      isInlineDemoPaintable('background: #444;\ncolor: white;\ncursor: pointer;\nfont-size: 14px;')
    ).toBe(false)
  })

  it('accepts HTML with a real structure node', () => {
    expect(
      isInlineDemoPaintable(
        '<style>body{color:#fff}</style><div class="scene"><h1>广义相对论</h1></div>'
      )
    ).toBe(true)
  })
})

describe('near-live message rows', () => {
  it('keeps only the last window of history rows tall', () => {
    expect(isNearLiveMessageRow(11, 20, 8)).toBe(false)
    expect(isNearLiveMessageRow(12, 20, 8)).toBe(true)
    expect(isNearLiveMessageRow(19, 20, 8)).toBe(true)
    expect(isNearLiveMessageRow(0, 3, 8)).toBe(true)
    expect(isNearLiveMessageRow(-1, 3, 8)).toBe(false)
    expect(isNearLiveMessageRow(0, 0, 8)).toBe(false)
  })
})

describe('elapsed clock', () => {
  it('formats Codex-style goal and long-turn clocks', () => {
    expect(formatElapsedClock(0)).toBe('<1s')
    expect(formatElapsedClock(23)).toBe('23s')
    expect(formatElapsedClock(240)).toBe('4m')
    expect(formatElapsedClock(4140)).toBe('1h 9m')
    expect(formatElapsedClock(36000)).toBe('10h')
  })
})

describe('worked-for fold', () => {
  it('keeps the timeline open while tools run before any answer', () => {
    expect(
      shouldFoldTurnWork({ contentStreaming: false, isStreaming: true, foldableStepCount: 3 })
    ).toBe(false)
  })

  it('folds once the answer is on screen or the turn is done', () => {
    expect(
      shouldFoldTurnWork({ contentStreaming: true, isStreaming: true, foldableStepCount: 3 })
    ).toBe(true)
    expect(
      shouldFoldTurnWork({ contentStreaming: false, isStreaming: false, foldableStepCount: 2 })
    ).toBe(true)
    expect(
      shouldFoldTurnWork({ contentStreaming: true, isStreaming: false, foldableStepCount: 0 })
    ).toBe(false)
    expect(shouldCollapseProcessOnAnswerStart(true, false)).toBe(true)
    expect(shouldCollapseProcessOnAnswerStart(true, true)).toBe(false)
    expect(shouldCollapseProcessOnAnswerStart(false, false)).toBe(false)
  })

  it('uses the earliest start and latest end for the worked clock', () => {
    expect(
      turnProcessBounds([
        { startedAt: 1000, endedAt: 1500 },
        { startedAt: 800, endedAt: 2400 }
      ])
    ).toEqual({ startedAt: 800, endedAt: 2400 })
    expect(processElapsedSeconds({ startedAt: 1000, endedAt: 13000 })).toBe(12)
  })
})
