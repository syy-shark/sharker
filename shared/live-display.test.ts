import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildLiveHead,
  clampLockedScrollTop,
  ELAPSED_CLOCK_RESERVE_CH,
  GOAL_ELAPSED_CLOCK_RESERVE_CH,
  formatElapsedClock,
  nextElapsedClockDelayMs,
  formatStoppedAfterClock,
  formatStoppedAfterLabel,
  AWAITING_APPROVAL_LABEL,
  formatStreamingFallbackLabel,
  resolvePrepareLiveTitle,
  formatThoughtLabel,
  formatWorkedForLabel,
  parseStoppedAfterSeconds,
  resolveStoppedAfterLabel,
  stoppedAfterFootnote,
  stripStoppedAfterFootnote,
  clearInlineDemoHeightCache,
  estimateInlineDemoHeight,
  isInlineDemoPaintable,
  readCachedInlineDemoHeight,
  seedInlineDemoHeight,
  liveInlineDemoPaintDelay,
  LIVE_INLINE_DEMO_FIRST_PAINT_MS,
  LIVE_INLINE_DEMO_GROW_PAINT_MS,
  LIVE_INLINE_DEMO_IDLE_PAINT_MS,
  shouldMeasureInlineDemoInParent,
  shouldMountInlineDemoFrame,
  shouldWalkInlineDemoTree,
  writeCachedInlineDemoHeight,
  isNearLiveMessageRow,
  shouldObserveRowIntrinsicHeight,
  nextRowIntrinsicHeights,
  resolveRowIntrinsicHeight,
  rowIntrinsicSizeStyle,
  shouldForceStickScroll,
  shouldFollowApprovalIntoView,
  shouldIgnoreLeaveBottomDuringCommit,
  shouldRecordTranscriptScrollIntent,
  shouldStartLiveCommitSettle,
  LIVE_COMMIT_SETTLE_FRAMES,
  LIVE_COMMIT_SETTLE_MS,
  liveThoughtBody,
  liveThinkingText,
  rollingThinkPreview,
  selectLiveHeadStep,
  sameRefList,
  shouldCollapseProcessOnAnswerStart,
  shouldFoldTurnWork,
  shouldPromoteSyntheticLiveHead,
  shouldSynthesizePlanning,
  jumpToBottomAffordance,
  liveProgressGrew,
  liveProgressKey,
  shouldWatchLiveJumpProgress,
  liveStickNeedsFollow,
  liveStickScrollTop,
  shouldClearUnseenLive,
  shouldMarkUnseenLive,
  shouldFollowArtifactTail,
  codeArtifactHeadStickyTop,
  continueLiveFenceLines,
  nextClosedFenceLines,
  shouldHighlightLiveFence,
  shouldMountMessageActions,
  shouldReserveMessageActions,
  LIVE_TAIL_SAFE_PX,
  shouldFocusTranscriptScroller,
  shouldLockStickOnTranscriptKey,
  transcriptNavIntent,
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
    expect(step?.title).toBe('读取文件')
    expect(
      selectLiveHeadStep([
        { id: '1', title: 'Read a.ts', status: 'done' },
        { id: '2', title: '规划下一步', status: 'active' }
      ])?.title
    ).toBe('Read a.ts')
  })

  it('buildLiveHead label matches active title', () => {
    const head = buildLiveHead({
      steps: [
        { id: '1', title: '读取文件', status: 'done' },
        { id: '2', title: '正在准备列出目录', detail: 'src', status: 'active' }
      ]
    })
    expect(head.label).toBe('List')
    expect(head.detail).toBe('src')
    expect(
      buildLiveHead({
        steps: [
          { id: 'cmd', title: 'Running npm test', detail: 'PASS src/a.test.ts', status: 'active' }
        ]
      }).detail
    ).toBeUndefined()
    expect(
      buildLiveHead({
        steps: [{ id: 'cmd2', title: 'Running', detail: '执行中… 3s', status: 'active' }]
      }).detail
    ).toBeUndefined()
    expect(resolvePrepareLiveTitle('正在准备列出目录')).toBe('List')
    expect(resolvePrepareLiveTitle('正在准备读取 package.json')).toBe('Read package.json')
    expect(resolvePrepareLiveTitle('正在准备运行命令')).toBe('Running')
    expect(resolvePrepareLiveTitle('连接模型并准备任务…')).toBe('Thinking')
    expect(resolvePrepareLiveTitle('Working')).toBe(null)
    expect(
      buildLiveHead({
        steps: [{ id: 'a', title: '等待确认 · 高危操作', status: 'active' }],
        approvalWaiting: true
      }).label
    ).toBe(AWAITING_APPROVAL_LABEL)
    expect(
      buildLiveHead({
        steps: [
          { id: '1', title: 'Read a.ts', status: 'done' },
          { id: '2', title: '规划下一步', status: 'active' }
        ],
        fallbackLabel: 'Working'
      }).label
    ).toBe('Read a.ts')
    expect(clampLockedScrollTop(900, 1000, 200)).toBe(800)
    expect(clampLockedScrollTop(100, 1000, 200)).toBe(100)
    expect(clampLockedScrollTop(-4, 1000, 200)).toBe(0)
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
    expect(
      shouldSynthesizePlanning({
        hasActiveWork: false,
        hasToolOrNarration: true,
        generatingAnswer: false,
        approvalWaiting: false,
        lastStepTitle: 'List',
        lastStepKind: 'status'
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
    expect(shouldPromoteSyntheticLiveHead('planning')).toBe(false)
    expect(shouldPromoteSyntheticLiveHead('answer')).toBe(false)
    expect(shouldPromoteSyntheticLiveHead('approval')).toBe(true)
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
    expect(seedInlineDemoHeight('<!-- streaming -->', true)).toBe(96)
    expect(
      isInlineDemoPaintable('background: #444;\ncolor: white;\ncursor: pointer;\nfont-size: 14px;')
    ).toBe(false)
  })

  it('accepts HTML with a real structure node', () => {
    const scene = '<style>body{color:#fff}</style><div class="scene"><h1>广义相对论</h1></div>'
    expect(isInlineDemoPaintable(scene)).toBe(true)
    expect(shouldMeasureInlineDemoInParent({ paintable: true, streaming: true })).toBe(false)
    expect(shouldMeasureInlineDemoInParent({ paintable: true, streaming: false })).toBe(true)
    expect(shouldMeasureInlineDemoInParent({ paintable: false, streaming: false })).toBe(false)
    expect(shouldWalkInlineDemoTree({ streaming: true })).toBe(false)
    expect(shouldWalkInlineDemoTree({ streaming: false })).toBe(true)
    expect(shouldWalkInlineDemoTree({})).toBe(true)
    expect(shouldMountInlineDemoFrame({ paintable: false })).toBe(false)
    expect(shouldMountInlineDemoFrame({ paintable: true })).toBe(true)
    expect(liveInlineDemoPaintDelay({ lastPaintLen: 0, htmlLen: 20 })).toBe(
      LIVE_INLINE_DEMO_FIRST_PAINT_MS
    )
    expect(liveInlineDemoPaintDelay({ lastPaintLen: 10, htmlLen: 200 })).toBe(
      LIVE_INLINE_DEMO_GROW_PAINT_MS
    )
    expect(liveInlineDemoPaintDelay({ lastPaintLen: 200, htmlLen: 220 })).toBe(
      LIVE_INLINE_DEMO_IDLE_PAINT_MS
    )
    expect(estimateInlineDemoHeight('')).toBe(48)
    expect(estimateInlineDemoHeight(scene)).toBeGreaterThanOrEqual(96)
    expect(estimateInlineDemoHeight('<div class="card" style="height: 240px"></div>')).toBe(256)
    expect(
      estimateInlineDemoHeight('<svg viewBox="0 0 200 180" width="200" height="180"></svg>')
    ).toBe(196)
    expect(estimateInlineDemoHeight('<canvas height="320" width="400"></canvas>')).toBe(336)
    clearInlineDemoHeightCache()
    expect(readCachedInlineDemoHeight(scene)).toBeNull()
    expect(writeCachedInlineDemoHeight(scene, 420)).toBe(420)
    expect(readCachedInlineDemoHeight(scene)).toBe(420)
    expect(seedInlineDemoHeight(scene, true)).toBe(420)
    expect(seedInlineDemoHeight('<div class="empty-ish"></div>', true)).toBeGreaterThanOrEqual(96)
    writeCachedInlineDemoHeight(scene, 12)
    expect(readCachedInlineDemoHeight(scene)).toBe(48)
    clearInlineDemoHeightCache()
    expect(readCachedInlineDemoHeight(scene)).toBeNull()
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
    expect(shouldObserveRowIntrinsicHeight({ id: 'streaming' })).toBe(false)
    expect(shouldObserveRowIntrinsicHeight({ id: 'a1', live: true })).toBe(false)
    expect(shouldObserveRowIntrinsicHeight({ id: '' })).toBe(false)
    expect(shouldObserveRowIntrinsicHeight({ id: 'hist-1' })).toBe(true)
    expect(rowIntrinsicSizeStyle(undefined)).toBeUndefined()
    expect(rowIntrinsicSizeStyle(0)).toBeUndefined()
    expect(rowIntrinsicSizeStyle(481.6)).toEqual({ containIntrinsicSize: 'auto 482px' })
    expect(resolveRowIntrinsicHeight(undefined, 640)).toBe(640)
    expect(resolveRowIntrinsicHeight(200, 640)).toBe(200)
    expect(resolveRowIntrinsicHeight(undefined, undefined)).toBeUndefined()
    expect(
      shouldForceStickScroll({
        stickToBottom: true,
        userLocked: false,
        distanceFromBottom: 8,
        atBottomPx: 16
      })
    ).toBe(true)
    expect(
      shouldForceStickScroll({
        stickToBottom: true,
        userLocked: false,
        distanceFromBottom: 32,
        atBottomPx: 16
      })
    ).toBe(false)
    expect(
      shouldForceStickScroll({
        stickToBottom: true,
        userLocked: true,
        distanceFromBottom: 0,
        atBottomPx: 16
      })
    ).toBe(false)
    expect(shouldStartLiveCommitSettle({ wasLoading: true, loading: false })).toBe(true)
    expect(shouldStartLiveCommitSettle({ wasLoading: false, loading: false })).toBe(false)
    expect(shouldStartLiveCommitSettle({ wasLoading: true, loading: true })).toBe(false)
    expect(shouldStartLiveCommitSettle({ wasLoading: false, loading: true })).toBe(false)
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: true,
        stickToBottom: true,
        userLocked: false
      })
    ).toBe(true)
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: true,
        stickToBottom: true,
        userLocked: false,
        scrollIntent: 'up'
      })
    ).toBe(true)
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: true,
        stickToBottom: true,
        userLocked: true
      })
    ).toBe(false)
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: false,
        liveStreaming: true,
        stickToBottom: true,
        userLocked: false,
        scrollIntent: 'up'
      })
    ).toBe(true)
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: false,
        liveStreaming: true,
        stickToBottom: true,
        userLocked: true,
        scrollIntent: 'up'
      })
    ).toBe(false)
    expect(shouldRecordTranscriptScrollIntent({ commitSettling: false })).toBe(true)
    expect(shouldRecordTranscriptScrollIntent({ commitSettling: true })).toBe(false)
    expect(shouldRecordTranscriptScrollIntent({ commitSettling: false, liveStreaming: true })).toBe(
      false
    )
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: false,
        stickToBottom: true,
        userLocked: false,
        scrollIntent: 'down'
      })
    ).toBe(true)
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: false,
        stickToBottom: true,
        userLocked: false,
        scrollIntent: 'up'
      })
    ).toBe(false)
    expect(
      shouldIgnoreLeaveBottomDuringCommit({
        commitSettling: true,
        stickToBottom: false,
        userLocked: false
      })
    ).toBe(false)
    expect(LIVE_COMMIT_SETTLE_MS).toBe(240)
    expect(LIVE_COMMIT_SETTLE_FRAMES).toBe(3)
    const chatView = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ChatView.tsx'),
      'utf8'
    )
    expect(chatView).toContain('shouldIgnoreLeaveBottomDuringCommit')
    expect(chatView).toContain('LIVE_COMMIT_SETTLE_MS')
    expect(chatView).toContain('shouldStartLiveCommitSettle')
    expect(chatView).toContain('shouldRecordTranscriptScrollIntent')
    expect(chatView).toContain('liveStreaming: loadingRef.current')
    expect(shouldFollowApprovalIntoView({ userLocked: false, stickToBottom: true })).toBe(true)
    expect(shouldFollowApprovalIntoView({ userLocked: true, stickToBottom: false })).toBe(false)
    expect(shouldFollowApprovalIntoView({ userLocked: true, stickToBottom: true })).toBe(false)
    const prev = new Map([['old', 200]])
    const same = nextRowIntrinsicHeights(prev, [
      { id: 'old', nearLive: false, height: 200 },
      { id: 'live', nearLive: true, height: 800 }
    ])
    expect(same).toBe(prev)
    const grown = nextRowIntrinsicHeights(prev, [
      { id: 'old', nearLive: false, height: 200 },
      { id: 'left', nearLive: false, height: 640.2 }
    ])
    expect(grown).not.toBe(prev)
    expect(grown.get('left')).toBe(640)
    expect(grown.get('old')).toBe(200)
    expect(liveStickScrollTop(800, 200)).toBe(600)
    expect(liveStickScrollTop(100, 400)).toBe(0)
    expect(shouldFollowArtifactTail({ followTail: true, userLocked: false })).toBe(true)
    expect(shouldFollowArtifactTail({ followTail: true, userLocked: true })).toBe(false)
    expect(shouldFollowArtifactTail({ followTail: false, userLocked: false })).toBe(false)
    const fenceShell = { top: 0, bottom: 400 }
    expect(codeArtifactHeadStickyTop(fenceShell, { top: 0, bottom: 800 }, 34)).toBe(0)
    expect(codeArtifactHeadStickyTop(fenceShell, { top: 120, bottom: 920 }, 34)).toBe(120)
    expect(codeArtifactHeadStickyTop(fenceShell, { top: 380, bottom: 1180 }, 34)).toBe(366)
    expect(codeArtifactHeadStickyTop(fenceShell, { top: 500, bottom: 1300 }, 34)).toBeNull()
    expect(codeArtifactHeadStickyTop(fenceShell, { top: 0, bottom: 800 }, 0)).toBeNull()
    const fenceFirst = continueLiveFenceLines(null, 'const a = 1\nconst b =')
    const fenceGrown = continueLiveFenceLines(fenceFirst, 'const a = 1\nconst b = 2')
    expect(fenceGrown[0]).toBe(fenceFirst[0])
    expect(fenceGrown).not.toBe(fenceFirst)
    expect(continueLiveFenceLines(fenceGrown, 'const a = 1\nconst b = 2')).toBe(fenceGrown)
    const closedFirst = nextClosedFenceLines(null, fenceFirst)
    expect(closedFirst).toEqual(['const a = 1'])
    expect(nextClosedFenceLines(closedFirst, fenceGrown)).toBe(closedFirst)
    expect(shouldHighlightLiveFence({ live: true, closed: true })).toBe(false)
    expect(shouldHighlightLiveFence({ live: true, closed: false })).toBe(false)
    expect(shouldHighlightLiveFence({ live: false, closed: true })).toBe(true)
    expect(shouldHighlightLiveFence({ live: false, closed: false })).toBe(false)
    expect(shouldMountMessageActions({ showBody: true })).toBe(true)
    expect(shouldMountMessageActions({ showBody: true, isError: true })).toBe(false)
    expect(shouldMountMessageActions({ showBody: false })).toBe(false)
    expect(shouldReserveMessageActions({ isStreaming: true, hasCopyableContent: false })).toBe(
      true
    )
    expect(shouldReserveMessageActions({ isStreaming: true, hasCopyableContent: true })).toBe(
      false
    )
    expect(shouldReserveMessageActions({ isStreaming: false, hasCopyableContent: false })).toBe(
      false
    )
    expect(LIVE_TAIL_SAFE_PX).toBe(12)
    expect(
      liveStickNeedsFollow(
        { scrollHeight: 800, clientHeight: 400 },
        { scrollHeight: 800, clientHeight: 300 }
      )
    ).toBe(true)
    expect(
      liveStickNeedsFollow(
        { scrollHeight: 1200, clientHeight: 520 },
        { scrollHeight: 1200, clientHeight: 440 }
      )
    ).toBe(true)
    expect(
      liveStickNeedsFollow(
        { scrollHeight: 800, clientHeight: 400 },
        { scrollHeight: 800, clientHeight: 400 }
      )
    ).toBe(false)
    expect(transcriptNavIntent({ key: 'Home' })).toBe('top')
    expect(transcriptNavIntent({ key: 'End' })).toBe('bottom')
    expect(transcriptNavIntent({ key: 'ArrowUp', metaKey: true })).toBe('top')
    expect(transcriptNavIntent({ key: 'ArrowDown', ctrlKey: true })).toBe('bottom')
    expect(transcriptNavIntent({ key: 'Home' }, true)).toBeNull()
    expect(transcriptNavIntent({ key: 'Home', metaKey: true })).toBeNull()
    expect(transcriptNavIntent({ key: 'End', shiftKey: true })).toBeNull()
    expect(transcriptNavIntent({ key: 'ArrowUp' })).toBeNull()
    expect(shouldFocusTranscriptScroller({ closest: () => null })).toBe(true)
    expect(shouldFocusTranscriptScroller({ closest: (sel) => (sel.includes('button') ? {} : null) })).toBe(
      false
    )
    expect(shouldLockStickOnTranscriptKey({ key: 'PageUp' })).toBe(true)
    expect(shouldLockStickOnTranscriptKey({ key: 'ArrowUp' })).toBe(true)
    expect(shouldLockStickOnTranscriptKey({ key: ' ', shiftKey: true })).toBe(true)
    expect(shouldLockStickOnTranscriptKey({ key: ' ' })).toBe(false)
    expect(shouldLockStickOnTranscriptKey({ key: 'ArrowDown' })).toBe(false)
    expect(liveProgressKey({ streamingChars: 12, liveSegmentCount: 3, thinkingChars: 4 })).toBe(
      '3:12:4'
    )
    expect(liveProgressGrew('', '1:1:0')).toBe(false)
    expect(liveProgressGrew('1:1:0', '1:2:0')).toBe(true)
    expect(shouldWatchLiveJumpProgress({ visible: true, unseen: false })).toBe(true)
    expect(shouldWatchLiveJumpProgress({ visible: true, unseen: true })).toBe(false)
    expect(shouldWatchLiveJumpProgress({ visible: false, unseen: true })).toBe(false)
    expect(
      shouldMarkUnseenLive({ userLocked: true, stickToBottom: false, liveGrew: true })
    ).toBe(true)
    expect(
      shouldMarkUnseenLive({ userLocked: false, stickToBottom: true, liveGrew: true })
    ).toBe(false)
    expect(shouldClearUnseenLive({ stickToBottom: true, userLocked: false })).toBe(true)
    expect(shouldClearUnseenLive({ stickToBottom: false, userLocked: true })).toBe(false)
    expect(jumpToBottomAffordance(true)).toEqual({
      label: 'New message',
      ariaLabel: 'New message, jump to bottom',
      emphasize: true
    })
    expect(jumpToBottomAffordance(false).label).toBe('Jump to bottom')
    expect(jumpToBottomAffordance(false, { keepReading: true })).toEqual({
      label: 'Jump to latest',
      ariaLabel: 'Jump to latest',
      emphasize: false
    })
    expect(jumpToBottomAffordance(true, { keepReading: true })).toEqual({
      label: 'New response',
      ariaLabel: 'New response, jump to latest',
      emphasize: true
    })
  })
})

describe('elapsed clock', () => {
  it('formats Codex-style goal and long-turn clocks', () => {
    expect(formatElapsedClock(0)).toBe('<1s')
    expect(formatElapsedClock(23)).toBe('23s')
    expect(formatElapsedClock(240)).toBe('4m')
    expect(formatElapsedClock(4140)).toBe('1h 9m')
    expect(formatElapsedClock(36000)).toBe('10h')
    expect(formatElapsedClock(86340)).toBe('23h 59m')
    expect(formatElapsedClock(86400)).toBe('1d 0h 0m')
    expect(formatElapsedClock(258120)).toBe('2d 23h 42m')
    expect(formatElapsedClock(4140).length).toBeLessThanOrEqual(ELAPSED_CLOCK_RESERVE_CH)
    expect(formatElapsedClock(3599).length).toBeLessThanOrEqual(ELAPSED_CLOCK_RESERVE_CH)
    expect(formatElapsedClock(86400).length).toBeLessThanOrEqual(GOAL_ELAPSED_CLOCK_RESERVE_CH)
    expect(formatElapsedClock(258120).length).toBeLessThanOrEqual(GOAL_ELAPSED_CLOCK_RESERVE_CH)
    expect(nextElapsedClockDelayMs(0)).toBe(1000)
    expect(nextElapsedClockDelayMs(23)).toBe(1000)
    expect(nextElapsedClockDelayMs(59)).toBe(1000)
    expect(nextElapsedClockDelayMs(60)).toBe(60000)
    expect(nextElapsedClockDelayMs(90)).toBe(30000)
    expect(nextElapsedClockDelayMs(3599)).toBe(1000)
    expect(nextElapsedClockDelayMs(3600)).toBe(60000)
    expect(formatStoppedAfterClock(0)).toBe('0s')
    expect(formatStoppedAfterClock(2848)).toBe('47m 28s')
    expect(formatWorkedForLabel(true)).toBe('Working')
    expect(formatWorkedForLabel(false)).toBe('Worked for')
    expect(formatThoughtLabel(true)).toBe('Thinking')
    expect(formatThoughtLabel(false)).toBe('Thought')
    expect(formatStreamingFallbackLabel({})).toBe('Thinking')
    expect(formatStreamingFallbackLabel({ hasStartedWork: true })).toBe('Working')
    expect(formatStreamingFallbackLabel({ approvalWaiting: true })).toBe(AWAITING_APPROVAL_LABEL)
    const turnFlowSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/TurnFlow.tsx'),
      'utf8'
    )
    expect(turnFlowSrc).toContain('AWAITING_APPROVAL_LABEL')
    expect(turnFlowSrc).toContain('WORKING_LABEL')
    expect(turnFlowSrc).toContain('aria-label={formatWorkedForLabel(isStreaming)}')
    expect(turnFlowSrc).toContain('className="turn-flow-thought-body" aria-label={label}')
    expect(turnFlowSrc).not.toContain('aria-label="执行过程"')
    expect(turnFlowSrc).not.toContain('aria-label="思考过程"')
    expect(turnFlowSrc).not.toContain('data-phase="approval"')
    expect(turnFlowSrc).not.toContain('>审批<')
    expect(turnFlowSrc).not.toContain(": '处理中'")
    expect(formatStoppedAfterLabel(0)).toBe('You stopped after 0s')
    expect(stoppedAfterFootnote(2848)).toContain('You stopped after 47m 28s')
    expect(parseStoppedAfterSeconds('hello\n\n_(已停止 · 47m 28s)_')).toBe(2848)
    expect(parseStoppedAfterSeconds('hello\n\n_(You stopped after 47m 28s)_')).toBe(2848)
    expect(stripStoppedAfterFootnote('保留\n\n_(已停止 · 47m 28s)_')).toBe('保留')
    expect(stripStoppedAfterFootnote('保留\n\n_(You stopped after 47m 28s)_')).toBe('保留')
    expect(resolveStoppedAfterLabel({ content: '_(已停止)_', startedAt: 0, endedAt: 0 })).toBe(
      'You stopped after 0s'
    )
    const processSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), './process-phases.ts'),
      'utf8'
    )
    expect(processSrc).toContain('WORKED_FOR_LABEL')
    expect(processSrc).toContain('formatStoppedAfterLabel')
    expect(processSrc).toContain('formatEditedFilesHeader')
    expect(processSrc).not.toContain('浏览 ${model.totals.readFiles} 个文件')
    expect(processSrc).not.toContain('修改 ${model.totals.modifiedFiles} 个文件')
    expect(processSrc).not.toContain('运行 ${model.totals.commands} 个命令')
    const assistantSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/AssistantMessage.tsx'),
      'utf8'
    )
    expect(assistantSrc).toContain('WORKED_FOR_LABEL')
    expect(assistantSrc).toContain('exploreNameFromPath')
    expect(assistantSrc).toContain('<span>Read</span>')
    expect(assistantSrc).not.toContain("'已处理'")
    expect(assistantSrc).not.toContain('<span>已浏览</span>')
    expect(assistantSrc).not.toContain('{browsedFiles.length} 个文件')
    expect(assistantSrc).not.toContain('已保留停止前生成的内容')
    expect(assistantSrc).not.toContain('未产生可保留的结果')
    expect(assistantSrc).not.toContain('展开过程')
    expect(assistantSrc).not.toContain('处理步骤')
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
    const tool = { id: 'read' }
    const prev = [tool]
    expect(sameRefList(prev, [tool])).toBe(true)
    expect(sameRefList(prev, prev)).toBe(true)
    expect(sameRefList(prev, [{ id: 'read' }])).toBe(false)
    expect(sameRefList(prev, [tool, { id: 'write' }])).toBe(false)
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
