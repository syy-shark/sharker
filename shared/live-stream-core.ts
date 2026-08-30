/**
 * 直播 16ms 热路径：同长前缀尾 token / 末行工具，不静态导入 combinatorial 表。
 * `live-stream-slices` 只在直播回合收束后空闲 register；开画 / 直播中不装表，以免主线程评 7.9k 检测器卡顿。
 * 未登记时 miss 走全量重建，不扫 combinatorial 表。
 * 例外：过程前缀后新开普通工具（含同一帧 think+tool、第二枚工具）、首枚无 fence 正文、或只追加思考 / status 可在核心判定，不必等表。
 * `nextLiveProcessView` 在这些 skip 上只追加 / 换 processForFlow；首枚普通工具会摘掉思考步（对标 processSegments）。
 * @see shared/ARCH.md
 */
import { isInlineDemoPaintable, liveThinkingText, sameRefList } from './live-display'
import type { LiveStreamUiSnapshot } from './live-stream-ui'
import { hasLiveAssistantBody } from './session-runtime'
import { isLiveStableToolDetail } from './tool-output-display'
import {
  buildAnswerParts,
  extractFinalContent,
  hasStreamingDemoFence,
  hasStreamingDemoFenceGrowth,
  processSegments,
  type AnswerPart
} from './turn-segments'
import type { TurnSegment } from './types'

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

/** 16ms flush：前缀没变时不必整表 extract / 思考预览 / 找 active tool */
export type LiveStreamDerivationSkip = 'think' | 'status' | 'text' | 'tool'

export interface LiveStreamTable {
  shouldSkipLiveStreamDerivation: (
    prev: readonly TurnSegment[],
    next: readonly TurnSegment[]
  ) => LiveStreamDerivationSkip | null
  shouldSkipLiveAnswerIdentity: (input: {
    prev: LiveAnswerView | null
    prevSegments: readonly TurnSegment[] | null
    segments: readonly TurnSegment[]
  }) => boolean
  hasLiveProcessPhaseGrowHold: (
    prev: readonly TurnSegment[] | null | undefined,
    next: readonly TurnSegment[]
  ) => boolean
  nextLiveThinkText: (
    prev: string,
    prevSegments: readonly TurnSegment[] | null,
    segments: readonly TurnSegment[]
  ) => string
  nextLiveProcessView: (prev: LiveProcessView | null, snap: LiveStreamUiSnapshot) => LiveProcessView
  nextLiveAnswerView: (prev: LiveAnswerView | null, snap: LiveStreamUiSnapshot) => LiveAnswerView
  shouldRemapProcessOnThinkAppend: (
    prev: readonly TurnSegment[] | null | undefined,
    next: readonly TurnSegment[]
  ) => boolean
}

let liveStreamTable: LiveStreamTable | null = null
let tablePrefetch: Promise<void> | null = null

let answerCache: { snap: LiveStreamUiSnapshot; view: LiveAnswerView } | null = null
let answerGrowHold: {
  view: LiveAnswerView
  segments: readonly TurnSegment[]
  tailPlain: boolean
} | null = null
let processHold: {
  view: LiveProcessView
  segments: readonly TurnSegment[]
} | null = null

export function registerLiveStreamTable(table: LiveStreamTable): void {
  liveStreamTable = table
}

export function prefetchLiveStreamTable(): Promise<void> {
  tablePrefetch ??= import('./live-stream-slices').then(() => undefined)
  return tablePrefetch
}

/** 只在已有过直播且当前不在跑时才装表，避免开画 / 首轮 token 被 7.9k 评测卡住 */
export function shouldPrefetchLiveStreamTable(input: {
  loading: boolean
  hadLiveTurn: boolean
}): boolean {
  return input.hadLiveTurn && !input.loading
}

function isLiveAnswerText(segment: TurnSegment): boolean {
  return segment.kind === 'text' && (segment.role === 'final' || segment.status === 'active')
}

function isLiveThinking(segment: TurnSegment): boolean {
  return segment.kind === 'thinking'
}

function isLiveStatus(segment: TurnSegment): boolean {
  return segment.kind === 'status'
}

/** 普通过程工具：不含演示卡，避免无表时把 present_inline_demo 当追加步。 */
function isLiveCoreProcessTool(segment: TurnSegment): boolean {
  return segment.kind === 'tool' && segment.toolName !== 'present_inline_demo'
}

function isLiveCoreProcessPrefix(segment: TurnSegment): boolean {
  return isLiveThinking(segment) || isLiveStatus(segment) || isLiveCoreProcessTool(segment)
}

function liveCorePrefixHolds(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev === next) return true
  if (prev.id !== next.id || prev.kind !== next.kind) return false
  if (isLiveThinking(prev) && isLiveThinking(next)) return true
  if (isLiveStatus(prev) && isLiveStatus(next)) return true
  return isLiveCoreProcessTool(prev) && isLiveCoreProcessTool(next)
}

function isLiveCoreAppendExtra(segment: TurnSegment): boolean {
  return isLiveCoreProcessTool(segment) || isLiveStatus(segment) || isLiveThinking(segment)
}

function extrasHaveOnlyFirstAnswerText(extras: readonly TurnSegment[]): boolean {
  if (extras.length !== 1) return false
  const extra = extras[0]!
  return isLiveAnswerText(extra) && !hasStreamingDemoFence(extra.content ?? '')
}

/** 同一帧先落过程 extras，再开首枚无 fence 正文。 */
function extrasHaveProcessThenFirstAnswerText(extras: readonly TurnSegment[]): boolean {
  if (extras.length < 2) return false
  const last = extras[extras.length - 1]!
  if (!isLiveAnswerText(last) || hasStreamingDemoFence(last.content ?? '')) return false
  const head = extras.slice(0, -1)
  return head.every((segment) => isLiveCoreAppendExtra(segment))
}

/** 同一帧开出恰好一段无 fence 正文，其余只追加思考 / status。 */
function extrasHaveAnswerThenThinkOrStatus(extras: readonly TurnSegment[]): boolean {
  if (extras.length < 2) return false
  let seenText = false
  for (const extra of extras) {
    if (isLiveAnswerText(extra) && !hasStreamingDemoFence(extra.content ?? '')) {
      if (seenText) return false
      seenText = true
      continue
    }
    if (!(isLiveThinking(extra) || isLiveStatus(extra))) return false
  }
  return seenText
}

/** 同一帧开出恰好一段无 fence 正文，随后再落普通工具。 */
function extrasHaveAnswerThenProcessTools(extras: readonly TurnSegment[]): boolean {
  let textIndex = -1
  for (let i = 0; i < extras.length; i++) {
    const extra = extras[i]!
    if (isLiveAnswerText(extra) && !hasStreamingDemoFence(extra.content ?? '')) {
      if (textIndex >= 0) return false
      textIndex = i
      continue
    }
    if (!isLiveCoreAppendExtra(extra)) return false
  }
  if (textIndex < 0) return false
  const after = extras.slice(textIndex + 1)
  return after.some((segment) => isLiveCoreProcessTool(segment))
}

function liveCoreLastNoFenceAnswer(segments: readonly TurnSegment[]): TurnSegment | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!
    if (isLiveAnswerText(segment) && !hasStreamingDemoFence(segment.content ?? '')) return segment
  }
  return null
}

function liveCoreLeadingProcessLength(segments: readonly TurnSegment[]): number {
  let i = 0
  while (i < segments.length && isLiveCoreProcessPrefix(segments[i]!)) i += 1
  return i
}

function liveCoreAnswerHolds(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev === next) return true
  if (prev.id !== next.id || prev.kind !== next.kind) return false
  if (!isLiveAnswerText(prev) || !isLiveAnswerText(next)) return false
  if (hasStreamingDemoFence(prev.content ?? '') || hasStreamingDemoFence(next.content ?? '')) {
    return false
  }
  return liveTailContentGrew(prev, next)
}

/**
 * 无表时：过程前缀（思考 / status / 普通工具）后新开普通工具可走 cheap path。
 * 同一帧 `think + tool`、以及首轮第二枚工具也走这条。
 * 过程前缀后首枚无 fence 正文标 `'text'`，过程步复用、回答另开尾。
 * 同一帧过程 extras + 首枚无 fence 正文也标 `'text'`。
 * 只追加思考 / status，或同一帧 status+思考，也走核心，不必等表。
 * 过程前缀后已有无 fence 正文，再开普通工具也走核心。
 * 同一帧首枚无 fence 正文后再落普通工具也标 `'tool'`。
 * 同一帧首枚无 fence 正文后再落思考 / status 标 `'think'` / `'status'`。
 * 同长普通工具原地收束 / 改详情（可多枚并行 complete_call，正文可仍在末尾）标 `'tool'`。
 * 同长只改 status / 思考（正文可仍在末尾）标 `'status'` / `'think'`。
 * 正文里的 ```demo 围栏、或 `present_inline_demo` 仍等表。
 */
function liveCoreInPlaceProcessToolSkip(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): LiveStreamDerivationSkip | null {
  if (prev.length !== next.length || !prev.length) return null
  let toolChange = false
  let statusChange = false
  let thinkChange = false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]!
    const after = next[i]!
    if (before === after) continue
    if (hasStreamingDemoFence(before.content ?? '') || hasStreamingDemoFence(after.content ?? '')) {
      return null
    }
    if (isLiveAnswerText(before) && liveCoreAnswerHolds(before, after)) continue
    if (before.id !== after.id || before.kind !== after.kind) return null
    if (isLiveThinking(before) && isLiveThinking(after)) {
      if (!liveTailContentGrew(before, after)) return null
      thinkChange = true
      continue
    }
    if (isLiveStatus(before) && isLiveStatus(after)) {
      const settled =
        before.status === 'active' &&
        after.status !== before.status &&
        (after.content ?? '') === (before.content ?? '')
      if (!liveTailContentGrew(before, after) && !settled) return null
      statusChange = true
      continue
    }
    if (isLiveCoreProcessTool(before) && isLiveCoreProcessTool(after)) {
      toolChange = true
      continue
    }
    return null
  }
  if (toolChange) return 'tool'
  if (statusChange) return 'status'
  if (thinkChange) return 'think'
  return null
}

export function liveCoreAppendedProcessToolsSkip(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): LiveStreamDerivationSkip | null {
  if (next.length < prev.length) return null
  if (next.length === prev.length) return liveCoreInPlaceProcessToolSkip(prev, next)
  const processLen = liveCoreLeadingProcessLength(prev)
  for (let i = 0; i < processLen; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after || !liveCorePrefixHolds(before, after)) return null
  }
  const prevAnswer = prev.slice(processLen)
  if (
    prevAnswer.some(
      (segment) => !isLiveAnswerText(segment) || hasStreamingDemoFence(segment.content ?? '')
    )
  ) {
    return null
  }
  if (next.length < processLen + prevAnswer.length) return null
  for (let i = 0; i < prevAnswer.length; i++) {
    const before = prevAnswer[i]!
    const after = next[processLen + i]
    if (!after || !liveCoreAnswerHolds(before, after)) return null
  }
  const extras = next.slice(processLen + prevAnswer.length)
  if (!extras.length) return null
  if (!prevAnswer.length) {
    if (extrasHaveOnlyFirstAnswerText(extras)) return 'text'
    if (extrasHaveProcessThenFirstAnswerText(extras)) return 'text'
    if (extrasHaveAnswerThenProcessTools(extras)) return 'tool'
    if (extrasHaveAnswerThenThinkOrStatus(extras)) {
      return extras.some(isLiveStatus) ? 'status' : 'think'
    }
  }
  if (extras.length && extras.every((segment) => isLiveThinking(segment) || isLiveStatus(segment))) {
    return extras.some(isLiveStatus) ? 'status' : 'think'
  }
  if (!extras.every((segment) => isLiveCoreAppendExtra(segment))) return null
  if (!extras.some((segment) => isLiveCoreProcessTool(segment))) return null
  return 'tool'
}

function retargetLiveProcessFlow(
  prevFlow: TurnSegment[],
  prevSegments: readonly TurnSegment[],
  nextSegments: readonly TurnSegment[]
): TurnSegment[] {
  let changed = false
  const mapped = prevFlow.map((segment) => {
    const index = prevSegments.indexOf(segment)
    if (index < 0) return segment
    const nextSeg = nextSegments[index]
    if (!nextSeg || nextSeg === segment) return segment
    changed = true
    return nextSeg
  })
  return changed ? mapped : prevFlow
}

/** 无表时把新开的普通工具 / status 接到过程流；首枚工具摘掉思考步。 */
function appendCoreProcessFlow(
  prev: LiveProcessView,
  prevSegments: readonly TurnSegment[],
  segments: readonly TurnSegment[]
): LiveProcessView {
  const extras = segments.slice(prevSegments.length)
  const extraTools = extras.filter(isLiveCoreProcessTool)
  const extraStatus = extras.filter(isLiveStatus)
  const extraThink = extras.filter((segment) => isLiveThinking(segment) && segment.status === 'active')
  const prevHasTool = prev.processForFlow.some(isLiveCoreProcessTool)
  let base = retargetLiveProcessFlow(prev.processForFlow, prevSegments, segments)
  if (!prevHasTool && extraTools.length) {
    const withoutThink = base.filter((segment) => !isLiveThinking(segment))
    if (withoutThink.length !== base.length) base = withoutThink
  }
  const addThink = !prevHasTool && extraTools.length === 0 ? extraThink : []
  const add = [...addThink, ...extraStatus, ...extraTools]
  const processForFlow = add.length ? [...base, ...add] : base
  const thinkText = nextLiveThinkText(prev.thinkText, prevSegments, segments)
  const view: LiveProcessView = { ...prev, processForFlow, thinkText }
  return sameProcessView(prev, view) ? prev : view
}

/** Same-length prefix-stable tail: token / last-line tool, no 7k detector scan (对标 Codex #22860). */
export function liveSameLengthPrefixTail(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): { prevTail: TurnSegment; nextTail: TurnSegment } | null {
  if (prev.length !== next.length) return null
  const last = next.length - 1
  for (let i = 0; i < last; i++) {
    if (prev[i] !== next[i]) return null
  }
  const prevTail = prev[last]
  const nextTail = next[last]
  if (!prevTail || !nextTail) return null
  if (prevTail.id !== nextTail.id || prevTail.kind !== nextTail.kind) return null
  return { prevTail, nextTail }
}

export function liveTailContentGrew(prevTail: TurnSegment, nextTail: TurnSegment): boolean {
  const prevContent = prevTail.content ?? ''
  const nextContent = nextTail.content ?? ''
  return nextContent === prevContent || nextContent.startsWith(prevContent)
}

/** 思考 / 状态 / 散文同长加长：过程步不必 remap / derive（对标 Codex #22860） */
export function isLiveSameLengthTokenGrow(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev) return false
  const tails = liveSameLengthPrefixTail(prev, next)
  if (!tails) return false
  if (tails.prevTail.status !== tails.nextTail.status) return false
  if (!liveTailContentGrew(tails.prevTail, tails.nextTail)) return false
  const kind = tails.nextTail.kind
  return kind === 'thinking' || kind === 'status' || isLiveAnswerText(tails.nextTail)
}

/** 同一工具只改详情 / 摘要：预览与参数引用没变，不必重拆回答 */
export function isLiveToolMetaOnlyChange(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'tool' || next.kind !== 'tool') return false
  if (prev.id !== next.id || prev.status !== next.status) return false
  if (prev.toolName !== next.toolName) return false
  if (
    prev.toolName === 'present_inline_demo' &&
    ((prev.content ?? '') !== (next.content ?? '') || (prev.toolDetail ?? '') !== (next.toolDetail ?? ''))
  ) {
    return false
  }
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
  if (prev.toolName === 'present_inline_demo') return false
  if (prev.status !== 'active') return false
  if (next.status !== 'done' && next.status !== 'error' && next.status !== 'cancelled') return false
  return (
    prev.toolArgs === next.toolArgs &&
    prev.fileDiff === next.fileDiff &&
    prev.fileDiffs === next.fileDiffs &&
    prev.editPreview === next.editPreview
  )
}

function isLiveToolStatusHoldOrSettle(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.status === next.status) return true
  if (prev.status !== 'active') return false
  return next.status === 'done' || next.status === 'error' || next.status === 'cancelled'
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

/** 同一帧里多条只读工具收束且没新写盘：只换这些步 */
export function isLiveMultiToolSettleChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || prev.length !== next.length) return false
  let settled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLiveToolSettleChange(before, after)) return false
    settled += 1
  }
  return settled >= 2
}

/** 同一工具只改写盘 +/- / 参数，或收束时带上核实 diff */
export function isLiveToolWriteStatChange(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'tool' || next.kind !== 'tool') return false
  if (prev.id !== next.id || prev.toolName !== next.toolName) return false
  if (!isLiveToolStatusHoldOrSettle(prev, next)) return false
  return (
    prev.toolArgs !== next.toolArgs ||
    prev.fileDiff !== next.fileDiff ||
    prev.fileDiffs !== next.fileDiffs ||
    prev.editPreview !== next.editPreview
  )
}

export function findLiveToolWriteStatChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): { from: TurnSegment; to: TurnSegment } | null {
  if (!prev || prev.length !== next.length) return null
  let found: { from: TurnSegment; to: TurnSegment } | null = null
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (before === after) continue
    if (!before || !after || !isLiveToolWriteStatChange(before, after)) return null
    if (found) return null
    found = { from: before, to: after }
  }
  return found
}

export function findLiveToolRetargetChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): { from: TurnSegment; to: TurnSegment } | null {
  return findLiveToolInPlaceChange(prev, next) ?? findLiveToolWriteStatChange(prev, next)
}

/** 同一工具只把详情换成命令末行：过程切片保持原数组，不抬 TurnFlow */
export function isLiveLastLineOnlyToolChange(prev: TurnSegment, next: TurnSegment): boolean {
  if (!isLiveToolMetaOnlyChange(prev, next)) return false
  if ((prev.toolDetail ?? '') === (next.toolDetail ?? '')) return false
  return !isLiveStableToolDetail(next.toolDetail)
}

function isLiveDemoSegment(segment: TurnSegment): boolean {
  return segment.kind === 'tool' && segment.toolName === 'present_inline_demo'
}

export function findLiveDemoFenceChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): { from: TurnSegment; to: TurnSegment } | null {
  if (!prev || prev.length !== next.length) return null
  const last = next.length - 1
  for (let i = 0; i < last; i++) {
    if (prev[i] !== next[i]) return null
  }
  const from = prev[last]
  const to = next[last]
  if (!from || !to || from === to) return null
  if (!isLiveAnswerText(from) || !isLiveAnswerText(to) || from.id !== to.id) return null
  if (!hasStreamingDemoFence(to.content ?? '')) return null
  if ((from.content ?? '') === (to.content ?? '') && from.status === to.status) return null
  return { from, to }
}

function isLiveDemoHtmlChange(prev: TurnSegment, next: TurnSegment): boolean {
  if (!isLiveDemoSegment(prev) || !isLiveDemoSegment(next)) return false
  if (prev.id !== next.id) return false
  if (!isLiveToolStatusHoldOrSettle(prev, next)) return false
  return (
    prev.content !== next.content ||
    prev.toolDetail !== next.toolDetail ||
    prev.toolArgs !== next.toolArgs ||
    prev.status !== next.status
  )
}

export function findLiveDemoHtmlChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): { from: TurnSegment; to: TurnSegment } | null {
  if (!prev || prev.length !== next.length) return null
  let found: { from: TurnSegment; to: TurnSegment } | null = null
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (before === after) continue
    if (!before || !after || !isLiveDemoHtmlChange(before, after)) return null
    if (found) return null
    found = { from: before, to: after }
  }
  return found
}

function liveSameLengthDerivationSkip(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): LiveStreamDerivationSkip | undefined {
  const tails = liveSameLengthPrefixTail(prev, next)
  if (!tails) return undefined
  if (tails.prevTail !== tails.nextTail && tails.prevTail.status !== tails.nextTail.status) {
    return undefined
  }
  if (isLiveThinking(tails.nextTail)) {
    return liveTailContentGrew(tails.prevTail, tails.nextTail) ? 'think' : undefined
  }
  if (isLiveStatus(tails.nextTail)) {
    return liveTailContentGrew(tails.prevTail, tails.nextTail) ? 'status' : undefined
  }
  if (isLiveToolMetaOnlyChange(tails.prevTail, tails.nextTail)) return 'tool'
  if (findLiveToolInPlaceChange(prev, next)) return 'tool'
  if (
    isLiveAnswerText(tails.nextTail) &&
    !hasStreamingDemoFenceGrowth(tails.prevTail.content ?? '', tails.nextTail.content ?? '')
  ) {
    return liveTailContentGrew(tails.prevTail, tails.nextTail) ? 'text' : undefined
  }
  return undefined
}

function liveSameLengthAnswerIdentityHold(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): boolean | undefined {
  const tails = liveSameLengthPrefixTail(prev, next)
  if (!tails) return undefined
  if (tails.prevTail === tails.nextTail) return true
  if (tails.prevTail.status !== tails.nextTail.status) return undefined
  if (tails.nextTail.kind === 'thinking' || tails.nextTail.kind === 'status') {
    return liveTailContentGrew(tails.prevTail, tails.nextTail) ? true : undefined
  }
  if (tails.nextTail.kind === 'tool') return isLiveToolMetaOnlyChange(tails.prevTail, tails.nextTail)
  if (
    isLiveAnswerText(tails.nextTail) &&
    !hasStreamingDemoFenceGrowth(tails.prevTail.content ?? '', tails.nextTail.content ?? '')
  ) {
    // Prose tokens must still grow the answer tail / copyable (对标 nextLiveAnswerView).
    return liveTailContentGrew(tails.prevTail, tails.nextTail) ? false : undefined
  }
  return undefined
}

export function shouldSkipLiveStreamDerivation(
  prevSegments: readonly TurnSegment[] | null | undefined,
  segments: readonly TurnSegment[]
): LiveStreamDerivationSkip | null {
  if (!prevSegments) return null
  const sameLengthSkip = liveSameLengthDerivationSkip(prevSegments, segments)
  if (sameLengthSkip !== undefined) return sameLengthSkip
  const coreToolSkip = liveCoreAppendedProcessToolsSkip(prevSegments, segments)
  if (coreToolSkip) return coreToolSkip
  return liveStreamTable?.shouldSkipLiveStreamDerivation(prevSegments, segments) ?? null
}

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

export function hasLiveProcessPhaseGrowHold(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (prev && liveSameLengthPrefixTail(prev, next)) {
    const last = next[next.length - 1]!
    const before = prev[prev.length - 1]!
    if (before.status === last.status && liveTailContentGrew(before, last)) return false
    return liveStreamTable?.hasLiveProcessPhaseGrowHold(prev, next) ?? true
  }
  if (prev) {
    const coreSkip = liveCoreAppendedProcessToolsSkip(prev, next)
    if (coreSkip) return true
  }
  return liveStreamTable?.hasLiveProcessPhaseGrowHold(prev, next) ?? false
}

export function shouldRemapProcessOnThinkAppend(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (liveStreamTable?.shouldRemapProcessOnThinkAppend) {
    return liveStreamTable.shouldRemapProcessOnThinkAppend(prev, next)
  }
  if (!prev) return false
  if (findLiveDemoFenceChange(prev, next) || findLiveDemoHtmlChange(prev, next)) return true
  if (next.length <= prev.length) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before !== after && before.id !== after.id) return false
  }
  return next.slice(prev.length).every((segment) => {
    if (segment.kind === 'thinking' || segment.kind === 'text' || segment.kind === 'status') {
      return true
    }
    return segment.toolName === 'present_inline_demo'
  })
}

export function nextLiveThinkText(
  prev: string,
  prevSegments: readonly TurnSegment[] | null,
  segments: readonly TurnSegment[]
): string {
  if (prevSegments) {
    const tails = liveSameLengthPrefixTail(prevSegments, segments)
    if (
      tails &&
      isLiveThinking(tails.nextTail) &&
      tails.prevTail.status === tails.nextTail.status &&
      liveTailContentGrew(tails.prevTail, tails.nextTail)
    ) {
      const prevContent = tails.prevTail.content ?? ''
      const nextContent = tails.nextTail.content ?? ''
      if (nextContent === prevContent) return prev
      if (
        nextContent.startsWith(prevContent) &&
        (prev === prevContent || prev.endsWith(prevContent))
      ) {
        return prev + nextContent.slice(prevContent.length)
      }
    }
  }
  return liveStreamTable?.nextLiveThinkText(prev, prevSegments, segments) ?? liveThinkingText(segments)
}

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

export function shouldSkipLiveAnswerIdentity(input: {
  prev: LiveAnswerView | null
  prevSegments: readonly TurnSegment[] | null
  segments: readonly TurnSegment[]
}): boolean {
  if (!input.prev || !input.prevSegments) return false
  const sameLengthHold = liveSameLengthAnswerIdentityHold(input.prevSegments, input.segments)
  if (sameLengthHold !== undefined) return sameLengthHold
  return liveStreamTable?.shouldSkipLiveAnswerIdentity(input) ?? false
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

function rebuildLiveProcessView(
  prev: LiveProcessView | null,
  segments: readonly TurnSegment[]
): LiveProcessView {
  const list = segments as TurnSegment[]
  const answerParts = buildAnswerParts(list, { isStreaming: true })
  const flow = processForAnswer(list, answerParts)
  const processForFlow =
    prev && sameRefList(prev.processForFlow, flow) ? prev.processForFlow : flow
  const hasLiveProse = answerParts.some((part) => part.type === 'text' && part.content.trim())
  const hasLiveDemo = answerParts.some((part) => part.type === 'demo')
  const hasPaintableDemo = answerParts.some(
    (part) => part.type === 'demo' && isInlineDemoPaintable(part.html)
  )
  const finalRaw = extractFinalContent(list, { isStreaming: true })
  const next: LiveProcessView = {
    processForFlow,
    thinkText: liveThinkingText(list),
    contentStreaming: hasLiveProse || hasPaintableDemo,
    generatingDemo: hasLiveDemo && !hasPaintableDemo,
    answerStreaming: Boolean(finalRaw.trim() || hasLiveProse)
  }
  return prev && sameProcessView(prev, next) ? prev : next
}

function rebuildLiveAnswerView(segments: readonly TurnSegment[]): LiveAnswerView {
  const parts = buildAnswerParts(segments as TurnSegment[], { isStreaming: true })
  const split = splitClosedTail(parts)
  const copyable = copyableFromAnswerParts(parts)
  return {
    parts,
    closed: split.closed,
    tail: split.tail,
    show: parts.length > 0,
    copyable,
    hasCopyable: Boolean(copyable)
  }
}

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

export function nextLiveProcessView(
  prev: LiveProcessView | null,
  snap: LiveStreamUiSnapshot
): LiveProcessView {
  if (liveStreamTable?.nextLiveProcessView) {
    return liveStreamTable.nextLiveProcessView(prev, snap)
  }
  const segments = snap.liveSegments
  if (prev && processHold?.view === prev && processHold.segments === segments) return prev
  if (
    prev &&
    processHold?.view === prev &&
    shouldSkipLiveProcessIdentity({
      prev,
      prevSegments: processHold.segments,
      segments
    })
  ) {
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const view = thinkText === prev.thinkText ? prev : { ...prev, thinkText }
    processHold = { view, segments }
    return view
  }
  if (prev && processHold?.view === prev) {
    const coreSkip = liveCoreAppendedProcessToolsSkip(processHold.segments, segments)
    if (coreSkip === 'text') {
      const appended = appendCoreProcessFlow(prev, processHold.segments, segments)
      const tail = segments[segments.length - 1]
      const hasProse = Boolean((tail?.content ?? '').trim())
      const view: LiveProcessView = hasProse
        ? { ...appended, contentStreaming: true, answerStreaming: true }
        : appended
      const held = sameProcessView(prev, view) ? prev : view
      processHold = { view: held, segments }
      return held
    }
    if (coreSkip === 'think') {
      const processForFlow = retargetLiveProcessFlow(
        prev.processForFlow,
        processHold.segments,
        segments
      )
      const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
      const view =
        processForFlow === prev.processForFlow && thinkText === prev.thinkText
          ? prev
          : { ...prev, processForFlow, thinkText }
      processHold = { view, segments }
      return view
    }
    if (coreSkip === 'tool' || coreSkip === 'status') {
      const view = appendCoreProcessFlow(prev, processHold.segments, segments)
      processHold = { view, segments }
      return view
    }
    if (isLiveMultiToolSettleChange(processHold.segments, segments)) {
      const processForFlow = prev.processForFlow.map((segment) => {
        const index = processHold!.segments.indexOf(segment)
        return index >= 0 ? (segments[index] ?? segment) : segment
      })
      const view =
        processForFlow === prev.processForFlow ? prev : { ...prev, processForFlow }
      processHold = { view, segments }
      return view
    }
    const change = findLiveToolRetargetChange(processHold.segments, segments)
    if (change) {
      if (isLiveLastLineOnlyToolChange(change.from, change.to)) {
        processHold = { view: prev, segments }
        return prev
      }
      let found = false
      const processForFlow = prev.processForFlow.map((segment) => {
        if (segment !== change.from) return segment
        found = true
        return change.to
      })
      const view =
        found && processForFlow !== prev.processForFlow ? { ...prev, processForFlow } : prev
      processHold = { view, segments }
      return view
    }
  }
  const view = rebuildLiveProcessView(prev, segments)
  processHold = { view, segments }
  return view
}

export function liveProcessViewFromSnap(snap: LiveStreamUiSnapshot): LiveProcessView {
  return nextLiveProcessView(processHold?.view ?? null, snap)
}

export function nextLiveProcessTimeline(
  prev: LiveProcessTimeline | null,
  snap: LiveStreamUiSnapshot
): LiveProcessTimeline {
  const next = timelineFromProcessView(liveProcessViewFromSnap(snap))
  return prev && sameProcessTimeline(prev, next) ? prev : next
}

export function nextLiveAnswerView(
  prev: LiveAnswerView | null,
  snap: LiveStreamUiSnapshot
): LiveAnswerView {
  if (liveStreamTable?.nextLiveAnswerView) {
    return liveStreamTable.nextLiveAnswerView(prev, snap)
  }
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
  if (prev && grow.tail && prevSegments) {
    const tails = liveSameLengthPrefixTail(prevSegments, segments)
    if (
      tails &&
      isLiveAnswerText(tails.nextTail) &&
      liveTailContentGrew(tails.prevTail, tails.nextTail)
    ) {
      const view = growLiveAnswerView(prev, grow.tail)
      answerGrowHold = { view, segments, tailPlain: true }
      return view
    }
  }
  const coreSkip = prevSegments ? liveCoreAppendedProcessToolsSkip(prevSegments, segments) : null
  if (coreSkip) {
    const last = segments[segments.length - 1]
    const extra =
      coreSkip === 'text' && last && isLiveAnswerText(last)
        ? last
        : liveCoreLastNoFenceAnswer(segments)
    if (extra && isLiveAnswerText(extra) && !hasStreamingDemoFence(extra.content ?? '')) {
      const seed = prev ?? {
        parts: [],
        closed: [],
        tail: null,
        show: false,
        copyable: '',
        hasCopyable: false
      }
      const view = growLiveAnswerView(seed, extra)
      answerGrowHold = { view, segments, tailPlain: true }
      return view
    }
    if (prev && coreSkip !== 'text') {
      answerGrowHold = { view: prev, segments, tailPlain: Boolean(prev.tail) }
      return prev
    }
  }
  const view = rebuildLiveAnswerView(segments)
  answerGrowHold = { view, segments, tailPlain: Boolean(grow.tail) }
  return view
}

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
