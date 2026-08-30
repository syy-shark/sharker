/**
 * 直播 16ms 热路径：同长前缀尾 token / 末行工具，不静态导入 combinatorial 表。
 * `live-stream-slices` 只在直播回合收束后空闲 register；开画 / 直播中不装表，以免主线程评 7.9k 检测器卡顿。
 * 未登记时 miss 走全量重建，不扫 combinatorial 表。
 * 例外：过程前缀后新开普通工具（含同一帧 think+tool、第二枚工具、首枚写盘 extras 开 diff 槽）、首枚或同一帧多段无 fence 正文 / ```demo / present_inline_demo、正文后又夹过工具再开 extras（harness token 无 role，tool_start 收口后仍 hold）、只追加思考 / status、同长正文收口或错误挂到正文、Allow/Deny / Stop / compress 可在核心判定，不必等表。
 * `nextLiveProcessView` 在这些 skip 上只追加 / 换 processForFlow；首枚普通工具会摘掉思考步（对标 processSegments）。
 * @see shared/ARCH.md
 */
import {
  isAwaitingApprovalText,
  isInlineDemoPaintable,
  liveThinkingText,
  sameRefList
} from './live-display'
import type { LiveStreamUiSnapshot } from './live-stream-ui'
import { hasLiveAssistantBody } from './session-runtime'
import { isLiveStableToolDetail } from './tool-output-display'
import {
  buildAnswerParts,
  extractFinalContent,
  hasStreamingDemoFence,
  hasStreamingDemoFenceGrowth,
  processSegments,
  sameFileDiff,
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

/** harness token 不写 role；tool_start 收口后仍是回答正文，不是 narration。 */
function isLiveCoreStreamText(segment: TurnSegment): boolean {
  if (segment.kind !== 'text' || segment.role === 'narration') return false
  return isLiveAnswerText(segment) || !segment.role
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

/**
 * 规划下一步改写成 Ask User / Awaiting approval：同一 status 从空 `toolName` 挂上名字
 * （对标 request_user_input / approval_needed 改写最后一条规划 status）。
 */
function isLiveCoreStatusHangRewrite(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev === next) return false
  if (prev.id !== next.id || prev.kind !== 'status' || next.kind !== 'status') return false
  if ((prev.toolName ?? '') !== '' || !next.toolName) return false
  if (next.toolName === 'request_user_input') return true
  return isAwaitingApprovalText(next.content ?? '')
}

function liveCorePrefixHolds(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev === next) return true
  if (prev.id !== next.id || prev.kind !== next.kind) return false
  if (isLiveThinking(prev) && isLiveThinking(next)) return true
  if (isLiveStatus(prev) && isLiveStatus(next)) {
    return (prev.toolName ?? '') === (next.toolName ?? '') || isLiveCoreStatusHangRewrite(prev, next)
  }
  return isLiveCoreProcessTool(prev) && isLiveCoreProcessTool(next)
}

function isLiveCoreNoFenceAnswer(segment: TurnSegment): boolean {
  return isLiveCoreStreamText(segment) && !hasStreamingDemoFence(segment.content ?? '')
}

function isLiveCoreDemoAnswer(segment: TurnSegment): boolean {
  return isLiveCoreStreamText(segment) && hasStreamingDemoFence(segment.content ?? '')
}

function isLiveCoreDemoTool(segment: TurnSegment): boolean {
  return segment.kind === 'tool' && segment.toolName === 'present_inline_demo'
}

function isLiveCoreAnswerExtra(segment: TurnSegment): boolean {
  return (
    isLiveCoreNoFenceAnswer(segment) ||
    isLiveCoreDemoAnswer(segment) ||
    isLiveCoreDemoTool(segment)
  )
}

/**
 * extras 只含无 fence 正文 / 演示槽与过程 extras 时分类。
 * 末尾是正文或演示标 `'text'`（工具后再开尾也要翻 streaming）；同一帧可多段正文。
 */
function classifyLiveCoreExtras(extras: readonly TurnSegment[]): LiveStreamDerivationSkip | null {
  if (!extras.length) return null
  let hasTool = false
  let hasStatus = false
  let hasThink = false
  let textCount = 0
  for (const extra of extras) {
    if (isLiveCoreAnswerExtra(extra)) {
      textCount += 1
      continue
    }
    if (isLiveCoreProcessTool(extra)) {
      hasTool = true
      continue
    }
    if (isLiveStatus(extra)) {
      hasStatus = true
      continue
    }
    if (isLiveThinking(extra)) {
      hasThink = true
      continue
    }
    return null
  }
  const last = extras[extras.length - 1]!
  if (isLiveCoreAnswerExtra(last)) return 'text'
  if (hasTool) return 'tool'
  if (hasStatus) return 'status'
  if (hasThink) return 'think'
  return textCount > 0 ? 'text' : null
}

function liveCoreLastNoFenceAnswer(segments: readonly TurnSegment[]): TurnSegment | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!
    if (isLiveCoreNoFenceAnswer(segment)) return segment
  }
  return null
}

/** 16ms flush 发布的找词 / 跳底进度：harness token 无 role，tool_start 收口后仍用这段正文。 */
export function nextLivePublishedStreaming(
  segments: readonly TurnSegment[],
  fallback = ''
): string {
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!
    if (!isLiveCoreStreamText(segment)) continue
    const content = segment.content ?? ''
    if (content.trim()) return content
  }
  return fallback
}

/** 相对 prev 新开的无 fence 正文（同一帧可多段）。 */
function liveCoreExtraNoFenceTexts(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): TurnSegment[] {
  return next.slice(prev.length).filter(isLiveCoreNoFenceAnswer)
}

/** 相对 prev 新开的 ```demo 正文或 present_inline_demo。 */
function liveCoreExtraDemoSegments(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): TurnSegment[] {
  return next.slice(prev.length).filter(
    (segment) => isLiveCoreDemoAnswer(segment) || isLiveCoreDemoTool(segment)
  )
}

/** 相对 prev 新开且已有 +/- 的写盘工具（首枚 tool_preview / write 不要冻住空回答）。 */
function liveCoreExtraWriteStatTools(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): TurnSegment[] {
  return next.slice(prev.length).filter((segment) => liveWriteStatDiffParts(segment).length > 0)
}

/** 同长已有无 fence 正文加长或收口：过程 skip 是 think/status/tool 时回答仍要换尾。 */
function liveCoreHeldNoFenceAnswerChange(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): TurnSegment | null {
  const extra = liveCoreLastNoFenceAnswer(next)
  if (!extra) return null
  const before = prev.find((segment) => segment.id === extra.id)
  if (!before || before === extra || !liveCoreAnswerHolds(before, extra)) return null
  return extra
}

function liveCoreAnswerHolds(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev === next) return true
  if (prev.id !== next.id || prev.kind !== 'text' || next.kind !== 'text') return false
  // 收束 finalize 把先前正文标 narration / 收口无 role token；内容前缀没变就 hold，避免提交帧重挂回答。
  return liveTailContentGrew(prev, next)
}

/**
 * 无表时：过程前缀（思考 / status / 普通工具）后新开普通工具可走 cheap path。
 * 同一帧 `think + tool`、以及首轮第二枚工具也走这条。
 * 过程前缀后首枚无 fence 正文标 `'text'`，过程步复用、回答另开尾。
 * 同一帧过程 extras + 首枚无 fence 正文也标 `'text'`。
 * 只追加思考 / status，或同一帧 status+思考，也走核心，不必等表。
 * 过程前缀后已有无 fence 正文，再开普通工具也走核心（harness token 无 role，tool_start 收口后仍 hold）。
 * 同一帧首枚无 fence 正文后再落普通工具也标 `'tool'`。
 * 同一帧首枚无 fence 正文后再落思考 / status 标 `'think'` / `'status'`。
 * 同长普通工具原地收束 / 改详情（可多枚并行 complete_call，正文可仍在末尾）标 `'tool'`。
 * 同长只改 status / 思考（正文可仍在末尾；重连 n/5 可改写文案）标 `'status'` / `'think'`。
 * 规划下一步改写成 Ask / Awaiting（空 `toolName` 挂上名字）标 `'status'`，只换该行。
 * 已有无 fence 正文后再开第二段或多段 text 标 `'text'`，先封上一尾再开新尾。
 * 已有正文后再夹普通工具 / 思考 / status 也走同一套 extras 分类。
 * 正文后又夹过普通工具，再开正文 / 工具 / 思考 / status 仍走 held prefix + extras，不必等表。
 * 写盘 +/- 在 `'tool'` skip 上换这些工具的 diff 槽（同一帧可多枚）；新开写盘 extras 也开槽并翻 contentStreaming，随后首枚 token 不冲掉 +/-。
 * 没变的 `s.id-diff-N` 退回同一 part（sameFileDiff），closed 槽引用能复用就不抬 LiveStoreClosedAnswer。
 * 同长正文收口或错误挂到正文标 `'text'`；与思考 / status 同帧加长时过程标 think/status，回答仍换尾。
 * Allow/Deny 只换 Awaiting 行（可顺带清工具 approval）、Stop 多条 cancelled、compress 收口 status 再追加压缩步也走核心。
 * 首枚 ```demo 围栏 / `present_inline_demo` 开演示槽，同长 HTML 增长只换该槽；过程步不挂演示。
 * 收束 finalize 给多段正文标 narration / final（可顺带收口思考 / 工具）仍走核心，不在提交帧重拆回答。
 */
function liveCoreInPlaceProcessToolSkip(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): LiveStreamDerivationSkip | null {
  if (prev.length !== next.length || !prev.length) return null
  let toolChange = false
  let statusChange = false
  let thinkChange = false
  let textChange = false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]!
    const after = next[i]!
    if (before === after) continue
    if (isLiveCoreDemoTool(before) || isLiveCoreDemoTool(after)) {
      if (before.id === after.id && isLiveCoreDemoTool(before) && isLiveCoreDemoTool(after)) {
        textChange = true
        continue
      }
      return null
    }
    if (liveCoreAnswerHolds(before, after)) {
      if (before !== after) textChange = true
      continue
    }
    if (before.id !== after.id || before.kind !== after.kind) return null
    if (isLiveThinking(before) && isLiveThinking(after)) {
      if (!liveTailContentGrew(before, after)) return null
      thinkChange = true
      continue
    }
    if (isLiveStatus(before) && isLiveStatus(after)) {
      if ((before.toolName ?? '') !== (after.toolName ?? '')) {
        if (!isLiveCoreStatusHangRewrite(before, after)) return null
      }
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
  if (textChange) return 'text'
  return null
}

function liveCoreHeldPrefix(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): boolean {
  if (next.length < prev.length) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (isLiveCoreDemoTool(before) || isLiveCoreDemoTool(after)) {
      if (before.id === after.id && isLiveCoreDemoTool(before) && isLiveCoreDemoTool(after)) {
        continue
      }
      return false
    }
    if (liveCorePrefixHolds(before, after) || liveCoreAnswerHolds(before, after)) continue
    return false
  }
  return true
}

export function liveCoreAppendedProcessToolsSkip(
  prev: readonly TurnSegment[],
  next: readonly TurnSegment[]
): LiveStreamDerivationSkip | null {
  if (next.length < prev.length) return null
  if (next.length === prev.length) return liveCoreInPlaceProcessToolSkip(prev, next)
  if (!liveCoreHeldPrefix(prev, next)) return null
  return classifyLiveCoreExtras(next.slice(prev.length))
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
  if (kind === 'status' && (tails.prevTail.toolName ?? '') !== (tails.nextTail.toolName ?? '')) {
    return false
  }
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
    if ((tails.prevTail.toolName ?? '') !== (tails.nextTail.toolName ?? '')) return undefined
    return liveTailContentGrew(tails.prevTail, tails.nextTail) ? 'status' : undefined
  }
  if (isLiveToolMetaOnlyChange(tails.prevTail, tails.nextTail)) return 'tool'
  if (findLiveToolInPlaceChange(prev, next)) return 'tool'
  if (findLiveDemoFenceChange(prev, next) || findLiveDemoHtmlChange(prev, next)) return 'text'
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
  const prefix = prev.closed.length
    ? prev.closed
    : prev.parts.filter((part) => part.type !== 'text')
  const parts = prefix.length ? [...prefix, tailPart] : [tailPart]
  const copyable = prefix.length ? copyableFromAnswerParts(parts) : content.trim()
  return {
    parts,
    closed: prefix,
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

function emptyLiveAnswerView(): LiveAnswerView {
  return {
    parts: [],
    closed: [],
    tail: null,
    show: false,
    copyable: '',
    hasCopyable: false
  }
}

/** ```demo / present_inline_demo：先收起文字尾，再开演示槽（buildAnswerParts 只拆这一段） */
function appendLiveDemoView(prev: LiveAnswerView, segment: TurnSegment): LiveAnswerView {
  const added = buildAnswerParts([segment], { isStreaming: true })
  if (!added.length) return prev
  const sealed =
    prev.tail?.type === 'text'
      ? {
          ...prev,
          closed: [...prev.closed, prev.tail],
          parts:
            prev.parts.length && prev.parts[prev.parts.length - 1] === prev.tail
              ? prev.parts
              : [...prev.parts, prev.tail],
          tail: null
        }
      : prev
  const parts = sealed.parts.length ? [...sealed.parts, ...added] : added
  const split = splitClosedTail(parts)
  const copyable = copyableFromAnswerParts(parts)
  return {
    parts,
    closed: split.closed,
    tail: split.tail,
    show: true,
    copyable,
    hasCopyable: Boolean(copyable)
  }
}

/** 同长演示 HTML 增长：只换已有 demo 槽，已画正文不重拆 */
function retargetLiveDemoParts(prev: LiveAnswerView, segment: TurnSegment): LiveAnswerView {
  const added = buildAnswerParts([segment], { isStreaming: true })
  if (!added.length) return prev
  const byId = new Map(added.map((part) => [part.id, part]))
  let changed = false
  const parts = prev.parts.map((part) => {
    const next = byId.get(part.id)
    if (!next || next === part) return part
    if (part.type === 'demo' && next.type === 'demo' && part.html === next.html) return part
    if (part.type === 'text' && next.type === 'text' && part.content === next.content) return part
    changed = true
    return next
  })
  const missing = added.filter((part) => !prev.parts.some((old) => old.id === part.id))
  const merged = missing.length ? [...parts, ...missing] : parts
  if (!changed && !missing.length) return prev
  const split = splitClosedTail(merged)
  const copyable = copyableFromAnswerParts(merged)
  return {
    ...prev,
    parts: merged,
    closed: split.closed,
    tail: split.tail,
    show: true,
    copyable,
    hasCopyable: Boolean(copyable)
  }
}

/** 首枚写盘 extras / 同一帧正文+工具：翻 contentStreaming，Thought 立刻收起（对标 Codex）。 */
function applyCoreAnswerStreaming(
  view: LiveProcessView,
  prevSegments: readonly TurnSegment[],
  segments: readonly TurnSegment[]
): LiveProcessView {
  if (view.contentStreaming && view.answerStreaming) return view
  const extras = segments.slice(prevSegments.length)
  const hasProse =
    extras.some((segment) => isLiveCoreStreamText(segment) && Boolean((segment.content ?? '').trim())) ||
    Boolean((liveCoreHeldNoFenceAnswerChange(prevSegments, segments)?.content ?? '').trim())
  const writeStats = findLiveCoreWriteStatTools(prevSegments, segments)
  const hasWrite =
    liveCoreExtraWriteStatTools(prevSegments, segments).length > 0 ||
    Boolean(writeStats?.length)
  if (!hasProse && !hasWrite && !view.generatingDemo) return view
  const next: LiveProcessView = {
    ...view,
    contentStreaming: true,
    answerStreaming: true
  }
  return sameProcessView(view, next) ? view : next
}

function applyCoreDemoStreaming(
  view: LiveProcessView,
  extras: readonly TurnSegment[]
): LiveProcessView {
  const extraDemos = extras.filter(
    (segment) => isLiveCoreDemoAnswer(segment) || isLiveCoreDemoTool(segment)
  )
  if (!extraDemos.length) return view
  const demoParts = buildAnswerParts(extraDemos as TurnSegment[], { isStreaming: true })
  const hasPaintable = demoParts.some(
    (part) => part.type === 'demo' && isInlineDemoPaintable(part.html)
  )
  const hasDemo = demoParts.some((part) => part.type === 'demo')
  const hasProse = extraDemos.some(
    (segment) => isLiveCoreDemoAnswer(segment) && Boolean((segment.content ?? '').trim())
  )
  const next: LiveProcessView = {
    ...view,
    contentStreaming: view.contentStreaming || hasPaintable || hasProse,
    generatingDemo: hasDemo && !hasPaintable,
    answerStreaming: true
  }
  return sameProcessView(view, next) ? view : next
}

function liveWriteStatDiffParts(tool: TurnSegment): Extract<AnswerPart, { type: 'diff' }>[] {
  return buildAnswerParts([tool], { isStreaming: true }).filter(
    (part): part is Extract<AnswerPart, { type: 'diff' }> => part.type === 'diff'
  )
}

function findLiveCoreWriteStatTools(
  prev: readonly TurnSegment[] | null,
  next: readonly TurnSegment[]
): TurnSegment[] | null {
  if (!prev) return null
  const n = Math.min(prev.length, next.length)
  const found: TurnSegment[] = []
  for (let i = 0; i < n; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after || before === after) continue
    if (isLiveToolWriteStatChange(before, after)) {
      found.push(after)
      continue
    }
    if (liveCoreAnswerHolds(before, after)) continue
    if (
      before.id === after.id &&
      isLiveThinking(before) &&
      isLiveThinking(after) &&
      liveTailContentGrew(before, after)
    ) {
      continue
    }
    if (
      before.id === after.id &&
      isLiveStatus(before) &&
      isLiveStatus(after) &&
      ((before.toolName ?? '') === (after.toolName ?? '') || isLiveCoreStatusHangRewrite(before, after))
    ) {
      continue
    }
    if (before.id === after.id && isLiveCoreProcessTool(before) && isLiveCoreProcessTool(after)) {
      continue
    }
    return null
  }
  return found
}

/** 写盘 +/- 只换该工具的 diff 槽，已画正文 / 尾不重拆（对标 ~0.5s / #22860，不复制 #38695） */
function retargetLiveAnswerDiffs(prev: LiveAnswerView, tool: TurnSegment): LiveAnswerView {
  const diffs = liveWriteStatDiffParts(tool)
  const prefix = `${tool.id}-diff-`
  let start = -1
  let end = -1
  for (let i = 0; i < prev.parts.length; i++) {
    const part = prev.parts[i]
    if (part.type === 'diff' && part.id.startsWith(prefix)) {
      if (start < 0) start = i
      end = i + 1
      continue
    }
    if (start >= 0) break
  }
  if (start < 0) {
    if (!diffs.length) return prev
    const parts =
      prev.tail && prev.parts.length && prev.parts[prev.parts.length - 1] === prev.tail
        ? [...prev.parts.slice(0, -1), ...diffs, prev.tail]
        : [...prev.parts, ...diffs]
    return liveAnswerViewFromParts(prev, parts)
  }
  const reused = diffs.map((diff, index) => {
    const old = prev.parts[start + index]
    if (old && old.type === 'diff' && old.id === diff.id && sameFileDiff(old.diff, diff.diff)) {
      return old
    }
    return diff
  })
  if (
    reused.length === end - start &&
    reused.every((part, index) => part === prev.parts[start + index])
  ) {
    return prev
  }
  const parts = [...prev.parts.slice(0, start), ...reused, ...prev.parts.slice(end)]
  return liveAnswerViewFromParts(prev, parts)
}

/** 写盘 extras 开槽后同步 closed/tail，避免下一枚 token 用空 closed 把 +/- 冲掉。 */
function liveAnswerViewFromParts(prev: LiveAnswerView, parts: AnswerPart[]): LiveAnswerView {
  if (
    prev.parts.length === parts.length &&
    parts.every((part, index) => part === prev.parts[index])
  ) {
    return prev
  }
  const split = splitClosedTail(parts)
  const closed =
    prev.closed.length === split.closed.length &&
    split.closed.every((part, index) => part === prev.closed[index])
      ? prev.closed
      : split.closed
  const copyable = copyableFromAnswerParts(parts)
  return {
    ...prev,
    parts,
    closed,
    tail: split.tail,
    show: parts.length > 0,
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
      const appended = applyCoreAnswerStreaming(
        applyCoreDemoStreaming(
          appendCoreProcessFlow(prev, processHold.segments, segments),
          segments.slice(processHold.segments.length)
        ),
        processHold.segments,
        segments
      )
      const held = sameProcessView(prev, appended) ? prev : appended
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
      const retargeted =
        processForFlow === prev.processForFlow && thinkText === prev.thinkText
          ? prev
          : { ...prev, processForFlow, thinkText }
      const view = applyCoreAnswerStreaming(retargeted, processHold.segments, segments)
      processHold = { view, segments }
      return view
    }
    if (coreSkip === 'tool' || coreSkip === 'status') {
      const view = applyCoreAnswerStreaming(
        applyCoreDemoStreaming(
          appendCoreProcessFlow(prev, processHold.segments, segments),
          segments.slice(processHold.segments.length)
        ),
        processHold.segments,
        segments
      )
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
    const extraTexts = liveCoreExtraNoFenceTexts(prevSegments, segments)
    const extraDemos = liveCoreExtraDemoSegments(prevSegments, segments)
    let view: LiveAnswerView | null = null
    if (extraTexts.length || extraDemos.length) {
      let nextView = prev ?? emptyLiveAnswerView()
      if (extraTexts.length) {
        nextView = extraTexts.reduce((acc, extra) => appendLiveAnswerView(acc, extra), nextView)
      }
      if (extraDemos.length) {
        nextView = extraDemos.reduce((acc, extra) => appendLiveDemoView(acc, extra), nextView)
      }
      view = nextView
    } else if (coreSkip === 'text') {
      const demoTo =
        findLiveDemoFenceChange(prevSegments, segments)?.to ??
        findLiveDemoHtmlChange(prevSegments, segments)?.to
      if (demoTo) {
        view = retargetLiveDemoParts(prev ?? emptyLiveAnswerView(), demoTo)
      } else {
        const extra = liveCoreLastNoFenceAnswer(segments)
        if (extra) view = appendLiveAnswerView(prev ?? emptyLiveAnswerView(), extra)
      }
    } else if (prev) {
      const grown = liveCoreHeldNoFenceAnswerChange(prevSegments, segments)
      view = grown ? appendLiveAnswerView(prev, grown) : prev
    }
    if (view) {
      const writeStats = findLiveCoreWriteStatTools(prevSegments, segments) ?? []
      const extraWriteStats = liveCoreExtraWriteStatTools(prevSegments, segments)
      for (const writeStat of [...writeStats, ...extraWriteStats]) {
        view = retargetLiveAnswerDiffs(view, writeStat)
      }
      answerGrowHold = { view, segments, tailPlain: Boolean(view.tail) }
      return view
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
