/**
 * 直播行过程 / 回答切片：token 只换回答；正文或思考加长、同一工具只改详情时不扫过程指纹 / 全文 ```demo、不重跑过程 / 回答 buildAnswerParts。
 * 工具详情只换该步引用；工具收束无新写盘也只换该步（不必是末步，对标 Codex exec_cell complete_call）；前缀没变或只收束思考/status/散文时新工具只追加末步并封回答尾、新思考只换旁白、新散文只开回答尾；命令末行不换过程数组、不发 16ms store。对标 Codex #22860（已画过程不跟每枚 token 闪）。
 * @see shared/ARCH.md
 */
import {
  isInlineDemoPaintable,
  liveThinkingText,
  sameRefList
} from './live-display'
import { isLiveStableToolDetail } from './tool-output-display'
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

/** 时间线切片：不含 thinkText，思考 token 不抬 TurnFlow */
export interface LiveProcessTimeline {
  processForFlow: TurnSegment[]
  contentStreaming: boolean
  generatingDemo: boolean
  answerStreaming: boolean
  hasThought: boolean
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

function isLiveStatus(segment: TurnSegment): boolean {
  return segment.kind === 'status'
}

/** 16ms flush：前缀没变时不必整表 extract / 思考预览 / 找 active tool */
export type LiveStreamDerivationSkip = 'think' | 'status' | 'text' | 'tool'

/** 同一工具只改详情 / 摘要：预览与参数引用没变，不必重拆回答 */
function isLiveToolMetaOnlyChange(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'tool' || next.kind !== 'tool') return false
  if (prev.id !== next.id || prev.status !== next.status) return false
  if (prev.toolName !== next.toolName) return false
  return (
    prev.toolArgs === next.toolArgs &&
    prev.fileDiff === next.fileDiff &&
    prev.fileDiffs === next.fileDiffs &&
    prev.editPreview === next.editPreview
  )
}

/** 同一工具收束且没新写盘：就地换该步，不重拆回答（对标 Codex exec_cell complete_call） */
export function isLiveToolSettleChange(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'tool' || next.kind !== 'tool') return false
  if (prev.id !== next.id || prev.toolName !== next.toolName) return false
  if (prev.status !== 'active') return false
  if (next.status !== 'done' && next.status !== 'error' && next.status !== 'cancelled') return false
  return (
    prev.toolArgs === next.toolArgs &&
    prev.fileDiff === next.fileDiff &&
    prev.fileDiffs === next.fileDiffs &&
    prev.editPreview === next.editPreview
  )
}

/** 思考 / 桥接 status 只把 active 标成 done，正文没变（tool_start 收束） */
export function isLiveThinkOrStatusClose(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.id !== next.id || prev.kind !== next.kind) return false
  if (prev.kind !== 'thinking' && prev.kind !== 'status') return false
  if (prev.status !== 'active' || next.status !== 'done') return false
  return (prev.content ?? '') === (next.content ?? '')
}

/** 散文只把 active 标成 done，正文没变（tool_start 收束，对标 Codex flush then add_call） */
export function isLiveTextClose(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.id !== next.id || prev.kind !== 'text' || next.kind !== 'text') return false
  if (prev.status !== 'active' || next.status !== 'done') return false
  return (prev.content ?? '') === (next.content ?? '')
}

function isLivePrefixClose(prev: TurnSegment, next: TurnSegment): boolean {
  return isLiveThinkOrStatusClose(prev, next) || isLiveTextClose(prev, next)
}

/** 前缀里被 tool_start 收成 done 的散文；用来就地封回答尾 */
export function findLiveClosedAnswerText(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): TurnSegment | null {
  if (!prev) return null
  const n = Math.min(prev.length, next.length)
  for (let i = 0; i < n; i++) {
    const before = prev[i]
    const after = next[i]
    if (before && after && isLiveTextClose(before, after)) return after
  }
  return null
}

/** 前缀没变或只收束思考/status/散文、末尾新开工具：只追加过程步（对标 Codex exec_cell add_call） */
export function isLiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  const added = next[next.length - 1]
  if (
    !added ||
    added.kind !== 'tool' ||
    added.status !== 'active' ||
    !added.toolName ||
    added.toolName === 'present_inline_demo'
  ) {
    return false
  }
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLivePrefixClose(before, after)) return false
  }
  return true
}

/** 前缀没变或只收束思考/status、末尾新开思考：只换旁白（对标 Codex Thinking cell） */
export function isLiveThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  const added = next[next.length - 1]
  if (!added || added.kind !== 'thinking' || added.status !== 'active') return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLiveThinkOrStatusClose(before, after)) return false
  }
  return true
}

/** 前缀没变或只收束思考/status、末尾新开散文：只开回答尾（对标 Codex 工具后首枚 token） */
export function isLiveAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  const added = next[next.length - 1]
  if (!added || !isLiveAnswerText(added) || added.status === 'done') return false
  if (hasStreamingDemoFence(added.content ?? '')) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLiveThinkOrStatusClose(before, after)) return false
  }
  return true
}

/** 同一列表里只有一个工具就地改详情或收束：找出该对，供非末步 complete_call */
export function findLiveToolInPlaceChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): { from: TurnSegment; to: TurnSegment } | null {
  if (!prev || prev.length !== next.length) return null
  let found: { from: TurnSegment; to: TurnSegment } | null = null
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (before === after) continue
    if (!before || !after) return null
    if (!isLiveToolMetaOnlyChange(before, after) && !isLiveToolSettleChange(before, after)) {
      return null
    }
    if (found) return null
    found = { from: before, to: after }
  }
  return found
}

/** 同一工具只把详情换成命令末行：过程切片保持原数组，不抬 TurnFlow */
export function isLiveLastLineOnlyToolChange(prev: TurnSegment, next: TurnSegment): boolean {
  if (!isLiveToolMetaOnlyChange(prev, next)) return false
  if ((prev.toolDetail ?? '') === (next.toolDetail ?? '')) return false
  return !isLiveStableToolDetail(next.toolDetail)
}

/** 心跳同一数组或只换命令末行：16ms flush 不发 store（对标 Codex #19260 / #22860） */
export function shouldSkipLiveStreamPublish(
  prevSegments: readonly TurnSegment[] | null | undefined,
  segments: readonly TurnSegment[]
): boolean {
  if (prevSegments === segments) return true
  if (!prevSegments || prevSegments.length !== segments.length) return false
  if (sameRefList(prevSegments, segments)) return true
  if (shouldSkipLiveStreamDerivation(prevSegments, segments) !== 'tool') return false
  const change = findLiveToolInPlaceChange(prevSegments, segments)
  return Boolean(change && isLiveLastLineOnlyToolChange(change.from, change.to))
}

export function shouldSkipLiveStreamDerivation(
  prevSegments: readonly TurnSegment[] | null | undefined,
  segments: readonly TurnSegment[]
): LiveStreamDerivationSkip | null {
  if (!prevSegments) return null
  if (isLiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveAnswerAppendChange(prevSegments, segments)) return 'text'
  if (findLiveToolInPlaceChange(prevSegments, segments)) return 'tool'
  if (prevSegments.length !== segments.length) return null
  const last = segments.length - 1
  for (let i = 0; i < last; i++) {
    if (prevSegments[i] !== segments[i]) return null
  }
  const prevTail = prevSegments[last]
  const nextTail = segments[last]
  if (!prevTail || !nextTail) return null
  if (prevTail.id !== nextTail.id || prevTail.kind !== nextTail.kind) return null
  if (prevTail !== nextTail && prevTail.status !== nextTail.status) {
    return isLiveToolSettleChange(prevTail, nextTail) ? 'tool' : null
  }
  if (isLiveThinking(nextTail)) return 'think'
  if (isLiveStatus(nextTail)) return 'status'
  if (isLiveToolMetaOnlyChange(prevTail, nextTail)) return 'tool'
  if (
    isLiveAnswerText(nextTail) &&
    !hasStreamingDemoFenceGrowth(prevTail.content ?? '', nextTail.content ?? '')
  ) {
    return 'text'
  }
  return null
}

/** 前缀引用没变时只续思考尾，不 `filter` 全段 */
export function nextLiveThinkText(
  prev: string,
  prevSegments: readonly TurnSegment[] | null,
  segments: readonly TurnSegment[]
): string {
  if (isLiveThinkAppendChange(prevSegments, segments)) {
    return prev + (segments[segments.length - 1]?.content ?? '')
  }
  if (isLiveAnswerAppendChange(prevSegments, segments)) return prev
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

/** 同一工具只改详情：换时间线该步引用，不重跑 buildAnswerParts / extractFinalContent */
export function shouldRetargetLiveProcessOnToolMeta(input: {
  prev: LiveProcessView | null
  prevSegments: readonly TurnSegment[] | null
  segments: readonly TurnSegment[]
}): boolean {
  if (!input.prev || !input.prevSegments) return false
  if (input.prev.generatingDemo) return false
  return findLiveToolInPlaceChange(input.prevSegments, input.segments) !== null
}

function remapProcessFlowRefs(
  prevFlow: TurnSegment[],
  prevSegments: readonly TurnSegment[],
  segments: readonly TurnSegment[]
): TurnSegment[] {
  const remapped = prevFlow.map((segment) => {
    const index = prevSegments.indexOf(segment)
    if (index < 0) return segment
    return segments[index] ?? segment
  })
  if (remapped.length !== prevFlow.length) return remapped
  for (let i = 0; i < remapped.length; i++) {
    if (remapped[i] !== prevFlow[i]) return remapped
  }
  return prevFlow
}

function retargetProcessFlow(
  prevFlow: TurnSegment[],
  prevTail: TurnSegment,
  nextTail: TurnSegment
): TurnSegment[] {
  let found = false
  const next = prevFlow.map((segment) => {
    if (segment !== prevTail) return segment
    found = true
    return nextTail
  })
  return found ? next : prevFlow
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

function sameProcessTimeline(prev: LiveProcessTimeline, next: LiveProcessTimeline): boolean {
  return (
    prev.processForFlow === next.processForFlow &&
    prev.contentStreaming === next.contentStreaming &&
    prev.generatingDemo === next.generatingDemo &&
    prev.answerStreaming === next.answerStreaming &&
    prev.hasThought === next.hasThought
  )
}

function timelineFromProcessView(view: LiveProcessView): LiveProcessTimeline {
  return {
    processForFlow: view.processForFlow,
    contentStreaming: view.contentStreaming,
    generatingDemo: view.generatingDemo,
    answerStreaming: view.answerStreaming,
    hasThought: Boolean(view.thinkText.trim())
  }
}

/** 过程切片：正文增长且工具引用没变时退回 prev；工具详情只换末步，不重跑 buildAnswerParts */
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
  if (
    prev &&
    processHold?.view === prev &&
    isLiveToolAppendChange(processHold.segments, segments)
  ) {
    const added = segments[segments.length - 1]!
    const remapped = remapProcessFlowRefs(prev.processForFlow, processHold.segments, segments)
    const view = { ...prev, processForFlow: [...remapped, added] }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: processHold.answerTailPlain
    }
    return view
  }
  if (
    prev &&
    processHold?.view === prev &&
    isLiveThinkAppendChange(processHold.segments, segments)
  ) {
    const processForFlow = remapProcessFlowRefs(
      prev.processForFlow,
      processHold.segments,
      segments
    )
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const view =
      processForFlow === prev.processForFlow && thinkText === prev.thinkText
        ? prev
        : { ...prev, processForFlow, thinkText }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: processHold.answerTailPlain
    }
    return view
  }
  if (
    prev &&
    processHold?.view === prev &&
    isLiveAnswerAppendChange(processHold.segments, segments)
  ) {
    const added = segments[segments.length - 1]!
    const hasProse = Boolean((added.content ?? '').trim())
    const processForFlow = remapProcessFlowRefs(
      prev.processForFlow,
      processHold.segments,
      segments
    )
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const view = {
      ...prev,
      processForFlow,
      thinkText,
      contentStreaming: prev.contentStreaming || hasProse,
      answerStreaming: prev.answerStreaming || hasProse
    }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: true
    }
    return view
  }
  if (
    prev &&
    processHold?.view === prev &&
    shouldRetargetLiveProcessOnToolMeta({
      prev,
      prevSegments: processHold.segments,
      segments
    })
  ) {
    const change = findLiveToolInPlaceChange(processHold.segments, segments)
    if (!change) return prev
    if (isLiveLastLineOnlyToolChange(change.from, change.to)) {
      return prev
    }
    const processForFlow = retargetProcessFlow(prev.processForFlow, change.from, change.to)
    const view =
      processForFlow === prev.processForFlow ? prev : { ...prev, processForFlow }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: processHold.answerTailPlain
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

/** 同一帧快照只派生一次过程视图 */
export function liveProcessViewFromSnap(snap: LiveStreamUiSnapshot): LiveProcessView {
  return nextLiveProcessView(processHold?.view ?? null, snap)
}

/**
 * 时间线切片：思考原文加长时退回 prev，不抬 TurnFlow。
 * 对标 Codex #22860：默认折叠的 Thinking 不跟 token 重挂步骤。
 */
export function nextLiveProcessTimeline(
  prev: LiveProcessTimeline | null,
  snap: LiveStreamUiSnapshot
): LiveProcessTimeline {
  const next = timelineFromProcessView(liveProcessViewFromSnap(snap))
  return prev && sameProcessTimeline(prev, next) ? prev : next
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
/**
 * 末段仍是同一段增长中的思考 / 状态，或同一工具只改详情：回答槽没变，不必 `buildAnswerParts`。
 * 工具预览 / diff / 参数变了才重拆。对标 Codex #22860。
 */
export function shouldSkipLiveAnswerIdentity(input: {
  prev: LiveAnswerView | null
  prevSegments: readonly TurnSegment[] | null
  segments: readonly TurnSegment[]
}): boolean {
  if (!input.prev || !input.prevSegments) return false
  if (isLiveToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveThinkAppendChange(input.prevSegments, input.segments)) return true
  if (findLiveToolInPlaceChange(input.prevSegments, input.segments)) return true
  if (input.prevSegments.length !== input.segments.length) return false
  const last = input.segments.length - 1
  for (let i = 0; i < last; i++) {
    if (input.prevSegments[i] !== input.segments[i]) return false
  }
  const prevTail = input.prevSegments[last]
  const nextTail = input.segments[last]
  if (!prevTail || !nextTail) return false
  if (prevTail === nextTail) return true
  if (prevTail.id !== nextTail.id || prevTail.kind !== nextTail.kind) return false
  if (nextTail.kind === 'thinking' || nextTail.kind === 'status') {
    return prevTail.status === nextTail.status
  }
  if (nextTail.kind === 'tool') {
    return isLiveToolMetaOnlyChange(prevTail, nextTail) || isLiveToolSettleChange(prevTail, nextTail)
  }
  return false
}

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

/** 工具后新开一段散文：先收起上一尾，再开新尾，不重跑 buildAnswerParts */
function appendLiveAnswerView(prev: LiveAnswerView, tail: TurnSegment): LiveAnswerView {
  if (prev.tail && prev.tail.id !== tail.id) {
    return growLiveAnswerView({ ...prev, closed: [...prev.closed, prev.tail], tail: null }, tail)
  }
  return growLiveAnswerView(prev, tail)
}

/** tool_start 收束散文：把增长尾封进 closed，不重跑 buildAnswerParts */
function sealLiveAnswerTail(prev: LiveAnswerView, closedSeg: TurnSegment): LiveAnswerView {
  if (!prev.tail || prev.tail.id !== closedSeg.id) return prev
  const content = closedSeg.content ?? prev.tail.content
  const sealed =
    prev.tail.type === 'text' && prev.tail.content === content
      ? prev.tail
      : { type: 'text' as const, id: closedSeg.id, content }
  const closed = [...prev.closed, sealed]
  const copyable = copyableFromAnswerParts(closed)
  return {
    parts: closed,
    closed,
    tail: null,
    show: closed.length > 0,
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
  if (prev && shouldSkipLiveAnswerIdentity({ prev, prevSegments, segments })) {
    answerGrowHold = { view: prev, segments, tailPlain: Boolean(grow.tail) }
    return prev
  }
  if (prev && isLiveToolAppendChange(prevSegments, segments)) {
    const sealed = findLiveClosedAnswerText(prevSegments, segments)
    if (sealed) {
      const view = sealLiveAnswerTail(prev, sealed)
      answerGrowHold = { view, segments, tailPlain: false }
      return view
    }
  }
  if (prev && isLiveAnswerAppendChange(prevSegments, segments)) {
    const added = segments[segments.length - 1]!
    const view = appendLiveAnswerView(prev, added)
    answerGrowHold = { view, segments, tailPlain: true }
    return view
  }
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
