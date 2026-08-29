/**
 * 直播行过程 / 回答切片：token 只换回答；正文或思考加长不扫过程指纹 / 全文 ```demo、不重跑过程 / 回答 buildAnswerParts。
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
  hasStreamingDemoFence,
  hasStreamingDemoFenceGrowth,
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
let answerGrowHold: {
  view: LiveAnswerView
  segments: readonly TurnSegment[]
  tailPlain: boolean
} | null = null
let processHold: {
  view: LiveProcessView
  identity: string
  segments: readonly TurnSegment[]
  answerTailPlain: boolean
} | null = null

function isLiveAnswerText(segment: TurnSegment): boolean {
  return segment.kind === 'text' && (segment.role === 'final' || segment.status === 'active')
}

function isLiveThinking(segment: TurnSegment): boolean {
  return segment.kind === 'thinking'
}

/** 前缀引用没变时只续思考尾，不 `filter` 全段 */
export function nextLiveThinkText(
  prev: string,
  prevSegments: readonly TurnSegment[] | null,
  segments: readonly TurnSegment[]
): string {
  if (!prevSegments || prevSegments.length !== segments.length) return liveThinkingText(segments)
  const last = segments.length - 1
  for (let i = 0; i < last; i++) {
    if (prevSegments[i] !== segments[i]) return liveThinkingText(segments)
  }
  const prevTail = prevSegments[last]
  const nextTail = segments[last]
  if (!prevTail || !nextTail) return liveThinkingText(segments)
  if (prevTail === nextTail) return prev
  if (isLiveAnswerText(prevTail) && isLiveAnswerText(nextTail) && prevTail.id === nextTail.id) {
    return prev
  }
  if (isLiveThinking(prevTail) && isLiveThinking(nextTail) && prevTail.id === nextTail.id) {
    const prevContent = prevTail.content ?? ''
    const nextContent = nextTail.content ?? ''
    if (nextContent === prevContent) return prev
    if (nextContent.startsWith(prevContent) && (prev === prevContent || prev.endsWith(prevContent))) {
      return prev + nextContent.slice(prevContent.length)
    }
  }
  return liveThinkingText(segments)
}

function withUpdatedThinkText(prev: LiveProcessView, thinkText: string): LiveProcessView {
  return thinkText === prev.thinkText ? prev : { ...prev, thinkText }
}

function liveAnswerTailIsPlain(segments: readonly TurnSegment[]): boolean {
  const tail = segments[segments.length - 1]
  return Boolean(tail && isLiveAnswerText(tail) && !hasStreamingDemoFence(tail.content ?? ''))
}

/**
 * 过程区指纹：增长中的回答正文 / 思考只记 id，不拼全文。
 * 工具 / 演示围栏变了才变，避免每枚 token 重跑 buildAnswerParts。
 */
export function liveProcessIdentity(segments: readonly TurnSegment[]): string {
  let out = ''
  for (const segment of segments) {
    if (isLiveThinking(segment)) {
      out += `th:${segment.id}:${segment.status};`
      continue
    }
    if (isLiveAnswerText(segment) && !hasStreamingDemoFence(segment.content ?? '')) {
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

/**
 * 前缀引用没变、末段仍是同一段增长正文或思考：不必拼过程指纹。
 * 对标 Codex #22860：回答 / 思考 token 不扫整条工具时间线。
 */
export function shouldSkipLiveProcessIdentity(input: {
  prev: LiveProcessView | null
  prevSegments: readonly TurnSegment[] | null
  segments: readonly TurnSegment[]
  prevAnswerTailPlain?: boolean
}): boolean {
  if (!input.prev || !input.prevSegments) return false
  if (input.prev.generatingDemo) return false
  if (input.prevSegments.length !== input.segments.length) return false
  const last = input.segments.length - 1
  for (let i = 0; i < last; i++) {
    if (input.prevSegments[i] !== input.segments[i]) return false
  }
  const prevTail = input.prevSegments[last]
  const nextTail = input.segments[last]
  if (!prevTail || !nextTail) return false
  if (prevTail === nextTail) return true
  if (
    isLiveThinking(prevTail) &&
    isLiveThinking(nextTail) &&
    prevTail.id === nextTail.id &&
    prevTail.status === nextTail.status
  ) {
    return true
  }
  if (!input.prev.contentStreaming || !input.prev.answerStreaming) return false
  if (input.prevAnswerTailPlain === false) return false
  const nextHasFence =
    input.prevAnswerTailPlain === true
      ? hasStreamingDemoFenceGrowth(prevTail.content ?? '', nextTail.content ?? '')
      : hasStreamingDemoFence(nextTail.content ?? '')
  return (
    isLiveAnswerText(prevTail) &&
    isLiveAnswerText(nextTail) &&
    prevTail.id === nextTail.id &&
    !nextHasFence
  )
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
  if (
    prev &&
    processHold?.view === prev &&
    shouldSkipLiveProcessIdentity({
      prev,
      prevSegments: processHold.segments,
      segments,
      prevAnswerTailPlain: processHold.answerTailPlain
    })
  ) {
    const view = withUpdatedThinkText(
      prev,
      nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    )
    processHold = {
      view,
      identity: processHold.identity,
      segments,
      answerTailPlain: liveAnswerTailIsPlain(segments)
    }
    return view
  }
  const identity = liveProcessIdentity(segments)
  const prevIdentity = processHold?.view === prev ? processHold.identity : ''
  if (prev && shouldReuseLiveProcessView({ prev, identity, prevIdentity })) {
    const view = withUpdatedThinkText(
      prev,
      nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    )
    processHold = {
      view,
      identity,
      segments,
      answerTailPlain: liveAnswerTailIsPlain(segments)
    }
    return view
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
  processHold = {
    view,
    identity,
    segments,
    answerTailPlain: liveAnswerTailIsPlain(segments)
  }
  return view
}

/** 末段是增长中的回答正文时可以只换 tail，不必切出前缀数组 */
export function liveAnswerGrowState(
  segments: readonly TurnSegment[],
  prevTail?: { content: string; plain: boolean }
): { tail: TurnSegment | null } {
  const tail = segments[segments.length - 1]
  if (!tail || tail.kind !== 'text' || !tail.content?.trim()) {
    return { tail: null }
  }
  const hasFence =
    prevTail?.plain === true
      ? hasStreamingDemoFenceGrowth(prevTail.content, tail.content)
      : hasStreamingDemoFence(tail.content)
  if (hasFence) return { tail: null }
  return { tail }
}

/**
 * 前缀引用没变且尾仍是同一段正文：只换 tail，不重跑 buildAnswerParts。
 * 就地比 all-but-last，不 `slice`（对标 Codex #22860）。
 */
export function shouldGrowLiveAnswerTail(input: {
  prev: LiveAnswerView | null
  prevSegments: readonly TurnSegment[] | null
  segments: readonly TurnSegment[]
  tail: TurnSegment | null
}): boolean {
  if (!input.prev?.tail || input.prev.tail.type !== 'text' || !input.tail) return false
  if (input.tail.kind !== 'text' || input.tail.id !== input.prev.tail.id) return false
  if (hasStreamingDemoFenceGrowth(input.prev.tail.content, input.tail.content ?? '')) return false
  if (!input.prevSegments || input.prevSegments.length !== input.segments.length) return false
  const last = input.segments.length - 1
  for (let i = 0; i < last; i++) {
    if (input.prevSegments[i] !== input.segments[i]) return false
  }
  return true
}

function copyableFromAnswerParts(parts: readonly AnswerPart[]): string {
  return parts
    .filter((part): part is Extract<AnswerPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.content)
    .join('\n\n')
    .trim()
}

function growLiveAnswerView(prev: LiveAnswerView, tail: TurnSegment): LiveAnswerView {
  const content = tail.content ?? ''
  if (prev.tail?.type === 'text' && prev.tail.content === content) return prev
  const tailPart: AnswerPart = { type: 'text', id: tail.id, content }
  const parts = prev.closed.length ? [...prev.closed, tailPart] : [tailPart]
  const copyable = prev.closed.length ? copyableFromAnswerParts(parts) : content.trim()
  return {
    parts,
    closed: prev.closed,
    tail: tailPart,
    show: true,
    copyable,
    hasCopyable: Boolean(copyable)
  }
}

/** 回答切片：正文只加长时续尾；否则闭合块走 reuseAnswerParts */
export function nextLiveAnswerView(
  prev: LiveAnswerView | null,
  snap: LiveStreamUiSnapshot
): LiveAnswerView {
  const segments = snap.liveSegments
  const prevTextTail = prev?.tail?.type === 'text' ? prev.tail : null
  const grow = liveAnswerGrowState(
    segments,
    prevTextTail && answerGrowHold?.view === prev
      ? { content: prevTextTail.content, plain: answerGrowHold.tailPlain }
      : undefined
  )
  const prevSegments = answerGrowHold?.view === prev ? answerGrowHold.segments : null
  if (prev && shouldGrowLiveAnswerTail({ prev, prevSegments, segments, tail: grow.tail })) {
    const view = growLiveAnswerView(prev, grow.tail!)
    answerGrowHold = { view, segments, tailPlain: true }
    return view
  }
  const parts = reuseAnswerParts(
    prev?.parts ?? [],
    buildAnswerParts(segments, { isStreaming: true })
  )
  const split = splitClosedTail(parts)
  const closed =
    prev && sameRefList(prev.closed, split.closed) ? prev.closed : split.closed
  const copyable = copyableFromAnswerParts(parts)
  const next: LiveAnswerView = {
    parts,
    closed,
    tail: split.tail,
    show: parts.length > 0,
    copyable,
    hasCopyable: Boolean(copyable)
  }
  const view =
    prev &&
    prev.parts === next.parts &&
    prev.closed === next.closed &&
    prev.tail === next.tail &&
    prev.show === next.show &&
    prev.copyable === next.copyable &&
    prev.hasCopyable === next.hasCopyable
      ? prev
      : next
  answerGrowHold = {
    view,
    segments,
    tailPlain: Boolean(grow.tail)
  }
  return view
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
