/**
 * 直播行过程 / 回答切片：token 只换回答；正文加长不重跑过程 buildAnswerParts。
 * 对标 Codex #22860（已画过程不跟每枚 token 闪）。
 * @see shared/ARCH.md
 */
import {
  isInlineDemoPaintable,
  liveThinkingText,
  sameRefList
} from './live-display'
import { hasLiveAssistantBody } from './session-runtime'
import type { TurnSegment } from './types'
import {
  buildAnswerParts,
  extractFinalContent,
  processSegments,
  reuseAnswerParts,
  type AnswerPart
} from './turn-segments'
import type { LiveStreamUiSnapshot } from './live-stream-ui'

/** 直播过程区：工具/思考，不含增长中的正文 */
export interface LiveProcessView {
  processForFlow: TurnSegment[]
  thinkText: string
  contentStreaming: boolean
  generatingDemo: boolean
  answerStreaming: boolean
}

/** 直播回答槽：闭合块与增长尾分开，已画正文不跟 token 重挂 */
export interface LiveAnswerView {
  parts: AnswerPart[]
  closed: AnswerPart[]
  tail: AnswerPart | null
  show: boolean
  copyable: string
  hasCopyable: boolean
}

/** 操作条只订布尔，避免 copyable 每枚 token 抬按钮 */
export interface LiveAnswerActions {
  show: boolean
  reserved: boolean
}

let answerCache: { snap: LiveStreamUiSnapshot; view: LiveAnswerView } | null = null
let processHold: {
  view: LiveProcessView
  identity: string
  segments: readonly TurnSegment[]
} | null = null

/** 正文里的演示围栏会改过程头，必须进指纹 */
const LIVE_PROCESS_DEMO_FENCE_RE =
  /```(?:demo|demo-html|html-demo|visualization|viz|inline-demo)\b/i

function isLiveAnswerText(segment: TurnSegment): boolean {
  return segment.kind === 'text' && (segment.role === 'final' || segment.status === 'active')
}

/**
 * 过程区指纹：增长中的回答正文只记 id，不拼全文。
 * 工具 / 思考 / 演示围栏变了才变，避免每枚 token 重跑 buildAnswerParts。
 */
export function liveProcessIdentity(segments: readonly TurnSegment[]): string {
  let out = ''
  for (const segment of segments) {
    if (isLiveAnswerText(segment) && !LIVE_PROCESS_DEMO_FENCE_RE.test(segment.content ?? '')) {
      out += `a:${segment.id};`
      continue
    }
    out += `${segment.kind}:${segment.id}:${segment.status}:${segment.role ?? ''}:${segment.toolName ?? ''}:${segment.toolTitle ?? ''}:${segment.toolDetail ?? ''}:${segment.content ?? ''};`
  }
  return out
}

/**
 * 已在回答且不是演示生成中：指纹没变就复用过程视图。
 * 对标 Codex #22860：工具时间线不跟正文 token。
 */
export function shouldReuseLiveProcessView(input: {
  prev: LiveProcessView | null
  identity: string
  prevIdentity: string
}): boolean {
  if (!input.prev || !input.identity || input.identity !== input.prevIdentity) return false
  return input.prev.contentStreaming && input.prev.answerStreaming && !input.prev.generatingDemo
}

function splitClosedTail(parts: AnswerPart[]): { closed: AnswerPart[]; tail: AnswerPart | null } {
  if (!parts.length) return { closed: [], tail: null }
  if (parts.length === 1) return { closed: [], tail: parts[0]! }
  return { closed: parts.slice(0, -1), tail: parts[parts.length - 1]! }
}

function processForAnswer(segments: TurnSegment[], answerParts: AnswerPart[]): TurnSegment[] {
  const answerTextIds = new Set(
    answerParts.filter((part) => part.type === 'text').map((part) => part.id)
  )
  return processSegments(segments, { isStreaming: true }).filter((segment) => {
    if (segment.toolName === 'present_inline_demo') return false
    if (segment.kind === 'text' && answerTextIds.has(segment.id)) return false
    return true
  })
}

function sameProcessView(prev: LiveProcessView, next: LiveProcessView): boolean {
  return (
    prev.processForFlow === next.processForFlow &&
    prev.thinkText === next.thinkText &&
    prev.contentStreaming === next.contentStreaming &&
    prev.generatingDemo === next.generatingDemo &&
    prev.answerStreaming === next.answerStreaming
  )
}

/** 过程切片：正文增长且工具引用没变时退回 prev，不重跑 buildAnswerParts */
export function nextLiveProcessView(
  prev: LiveProcessView | null,
  snap: LiveStreamUiSnapshot
): LiveProcessView {
  const segments = snap.liveSegments
  if (prev && processHold?.view === prev && processHold.segments === segments) return prev
  const identity = liveProcessIdentity(segments)
  const prevIdentity = processHold?.view === prev ? processHold.identity : ''
  if (prev && shouldReuseLiveProcessView({ prev, identity, prevIdentity })) {
    processHold = { view: prev, identity, segments }
    return prev
  }
  const answerParts = buildAnswerParts(segments, { isStreaming: true })
  const flow = processForAnswer(segments, answerParts)
  const processForFlow =
    prev && sameRefList(prev.processForFlow, flow) ? prev.processForFlow : flow
  const hasLiveProse = answerParts.some((part) => part.type === 'text' && part.content.trim())
  const hasLiveDemo = answerParts.some((part) => part.type === 'demo')
  const hasPaintableDemo = answerParts.some(
    (part) => part.type === 'demo' && isInlineDemoPaintable(part.html)
  )
  const finalRaw = extractFinalContent(segments, { isStreaming: true })
  const next: LiveProcessView = {
    processForFlow,
    thinkText: liveThinkingText(segments),
    contentStreaming: hasLiveProse || hasPaintableDemo,
    generatingDemo: hasLiveDemo && !hasPaintableDemo,
    answerStreaming: Boolean(finalRaw.trim() || hasLiveProse)
  }
  const view = prev && sameProcessView(prev, next) ? prev : next
  processHold = { view, identity, segments }
  return view
}

/** 回答切片：闭合块走 reuseAnswerParts，closed 数组能复用就复用 */
export function nextLiveAnswerView(
  prev: LiveAnswerView | null,
  snap: LiveStreamUiSnapshot
): LiveAnswerView {
  const parts = reuseAnswerParts(
    prev?.parts ?? [],
    buildAnswerParts(snap.liveSegments, { isStreaming: true })
  )
  const split = splitClosedTail(parts)
  const closed =
    prev && sameRefList(prev.closed, split.closed) ? prev.closed : split.closed
  const copyable = parts
    .filter((part): part is Extract<AnswerPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.content)
    .join('\n\n')
    .trim()
  const next: LiveAnswerView = {
    parts,
    closed,
    tail: split.tail,
    show: parts.length > 0,
    copyable,
    hasCopyable: Boolean(copyable)
  }
  if (
    prev &&
    prev.parts === next.parts &&
    prev.closed === next.closed &&
    prev.tail === next.tail &&
    prev.show === next.show &&
    prev.copyable === next.copyable &&
    prev.hasCopyable === next.hasCopyable
  ) {
    return prev
  }
  return next
}

/** 同一帧快照只派生一次回答视图；片段引用没变则不重拆（过程/闭合/尾/操作条共用） */
export function liveAnswerViewFromSnap(snap: LiveStreamUiSnapshot): LiveAnswerView {
  if (answerCache && answerCache.snap === snap) return answerCache.view
  if (answerCache && answerCache.snap.liveSegments === snap.liveSegments) {
    answerCache = { snap, view: answerCache.view }
    return answerCache.view
  }
  const view = nextLiveAnswerView(answerCache?.view ?? null, snap)
  answerCache = { snap, view }
  return view
}

export function nextLiveAnswerActions(
  prev: LiveAnswerActions | null,
  snap: LiveStreamUiSnapshot
): LiveAnswerActions {
  const view = liveAnswerViewFromSnap(snap)
  const next: LiveAnswerActions = {
    show: view.show,
    reserved: view.show && !view.hasCopyable
  }
  if (prev && prev.show === next.show && prev.reserved === next.reserved) return prev
  return next
}

/** 直播行是否该挂（布尔，token 不翻转） */
export function liveHasAssistantBody(
  snap: LiveStreamUiSnapshot,
  approvalWaiting: boolean
): boolean {
  return hasLiveAssistantBody({
    streaming: snap.streaming,
    liveSegmentCount: snap.liveSegments.length,
    thinking: snap.turnThinking,
    approvalWaiting
  })
}
