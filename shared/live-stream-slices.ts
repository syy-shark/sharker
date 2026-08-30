/**
 * 直播行过程 / 回答切片：token 只换回答；正文或思考加长、同一工具只改详情时不扫过程指纹 / 正文 ```demo 只换演示槽、不重跑过程 / 全文 buildAnswerParts。
 * 工具详情只换该步引用；工具收束无新写盘也只换该步（不必是末步；同一帧多条只读并行 complete_call 也只换这些步，不发明 Exploring 分组格，对标 Codex exec_cell complete_call）；写盘 +/- / 参数或收束带核实 diff 只换该步，回答只换该工具的 diff 槽、已画正文不重拆（对标 ~0.5s / Edited 格，不复制 #38695）；写盘收束同时新开工具时过程 remap 并追加，回答只换该工具的 diff 槽；写盘收束同时新开 status / 思考 / 散文 / ```demo / compress / 错误 / present_inline_demo 时过程 remap（status / compress 再追加该行，思考续旁白，散文/演示/错误开回答槽），写盘收束同时新开 status+思考 / 思考+散文 / status+散文 时过程 remap（有 status 再追加该行）且回答只换 diff 槽，以免藏直播 +/-（不把写盘收束算进 isLivePrefixClose）；前缀没变或只收束思考/status/散文/无新写盘的工具时新开一或多个工具（可带一条 Awaiting / Question requested 行）只追加过程步并封回答尾（同一 16ms 里 token 尾 + tool_start 可先加长再标 done、complete_call + add_call、只读并行多个 tool_start、规划下一步后同一帧或下一轮 tool_start（规划下一步可先标 done，可夹 think）、think + tool_start、tool_start + approval_needed / user_input_needed、规划下一步后同一帧 tool_start 且立刻 tool_done 也走这条，不发明 Exploring 分组格）、新思考只换旁白（无新写盘的工具收束后同一帧开思考也走这条，不复制 #24850；think 尾 + 首枚 token 可先加长再标 done）、新散文只开回答尾、新 status 只追加过程步（对标 Reconnecting... n/5 / Compacting）、无新写盘的工具收束后同一帧新开 status+思考 / 思考+散文 / status+散文 / status+思考+散文 / 思考+```demo / status+```demo / status+思考+```demo 时过程 remap（有 status 再追加该行；规划下一步后本地/快模型首枚 think / token / ```demo 也走这条，think 后首枚 token 可先把旁白标 done）、`compress` 收口 status 或无新写盘的工具后只追加已完成压缩步（对标 contextCompaction / complete_call；规划下一步后同一帧 compress 可先把 status 标 done，可夹 think）、审批挂上或收束只换工具步与 Awaiting approval 行（Deny 后同一帧 approval_resolved + tool_done error 只把该行与工具收成 error，可再追加 规划下一步或下一工具；Allow / Deny 只收口 Awaiting 后同一帧 compress / Stop / think / 首枚 token / 错误 / ```demo 只 remap（可再夹 compress / Stop；写盘收束或 Reconnecting / 规划下一步后同一帧也走 remap）；Allow / Deny 收口并 tool_done 后同一帧 compress / Stop 只追加压缩步或换 cancelled 步；不复制 #10760 / #24432 compact 卡住 / Stop 失败）、Ask User 挂上只换工具步与 Question requested 行（规划下一步后同一帧 user_input_needed / approval_needed 可改写规划下一步为第一题 header / Awaiting，已在场时 think 后推新 Question requested / Awaiting 只追加该行，可夹规划下一步；作答后同一帧 user_input_resolved + tool_done 只把该行与工具收成 done；作答后同一帧 Stop 只追加 cancelled 问句行，可夹 think；不发明 TUI Questions n/n / 60s 空答，不复制 #10952 Stop 失效）、status 收束只换该行、Stop 把多条 active 收成 cancelled 只换这些步（对标 You stopped after；规划下一步后同一帧 Stop 可先挂上 status / think 再标 cancelled）、错误收口 status 或无新写盘的工具后只开错误回答尾（不进过程）、新 present_inline_demo 或正文 ```demo 只开演示槽（过程不追加；规划下一步后同一帧 present_inline_demo 可先把 status 标 done，过程只追加该行）；演示 HTML / 说明 / 收束只换该槽；命令末行不换过程数组、不发 16ms store。对标 Codex #22860（已画过程不跟每枚 token 闪）。
 * @see shared/ARCH.md
 */
import {
  isAwaitingApprovalText,
  isInlineDemoPaintable,
  liveThinkingText,
  sameRefList
} from './live-display'
import { isLiveStableToolDetail } from './tool-output-display'
import { COMPRESS_TOOL } from './compact-activity'
import { REQUEST_USER_INPUT_TOOL } from './user-input'
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

/** 散文收束：正文可在同一 16ms 里先加长再标 done（token 尾 + tool_start） */
export function isLiveTextGrowClose(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.id !== next.id || prev.kind !== 'text' || next.kind !== 'text') return false
  if (prev.status !== 'active' || next.status !== 'done') return false
  return (next.content ?? '').startsWith(prev.content ?? '')
}

/** Stop 把增长散文标成 cancelled：仍可就地封回答尾（对标 You stopped after） */
function isLiveTextCancelClose(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.id !== next.id || prev.kind !== 'text' || next.kind !== 'text') return false
  if (prev.status !== 'active' || next.status !== 'cancelled') return false
  return (next.content ?? '').startsWith(prev.content ?? '')
}

/** 思考收束：旁白可在同一 16ms 里先加长再标 done（think 尾 + tool_start） */
export function isLiveThinkGrowClose(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.id !== next.id || prev.kind !== 'thinking' || next.kind !== 'thinking') return false
  if (prev.status !== 'active' || next.status !== 'done') return false
  return (next.content ?? '').startsWith(prev.content ?? '')
}

function isLivePrefixClose(prev: TurnSegment, next: TurnSegment): boolean {
  return (
    isLiveThinkOrStatusClose(prev, next) ||
    isLiveThinkGrowClose(prev, next) ||
    isLiveTextClose(prev, next) ||
    isLiveToolSettleChange(prev, next)
  )
}

/** 思考 / 回答 / ```demo 围栏前缀：只认 think/status 收口（旁白可先加长）或无新写盘的工具收束（写盘 +/- 仍重拆回答） */
function isLiveThinkAnswerPrefixClose(prev: TurnSegment, next: TurnSegment): boolean {
  return (
    isLiveThinkOrStatusClose(prev, next) ||
    isLiveThinkGrowClose(prev, next) ||
    isLiveToolSettleChange(prev, next)
  )
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
    if (before && after && (isLiveTextGrowClose(before, after) || isLiveTextCancelClose(before, after))) {
      return after
    }
  }
  return null
}

/** 前缀没变或只收束思考/status/散文/无新写盘的工具（正文/思考可在同一 16ms 先加长再标 done）、末尾新开一或多个工具，可带一条 Awaiting / Question requested 行：只追加这些步（对标 Codex exec_cell complete_call + add_call / Awaiting approval；token 尾 + tool_start、只读并行一次 yield 多个 tool_start，不发明 Exploring 分组格） */
function isLiveAddedToolsWithOptionalStatus(
  prevLen: number,
  next: readonly TurnSegment[]
): boolean {
  if (next.length <= prevLen) return false
  let tools = 0
  for (let i = prevLen; i < next.length; i++) {
    const added = next[i]
    if (!added) return false
    if (
      added.kind === 'status' &&
      added.status === 'active' &&
      i === next.length - 1 &&
      tools >= 1
    ) {
      return true
    }
    if (
      added.kind !== 'tool' ||
      added.status !== 'active' ||
      !added.toolName ||
      added.toolName === 'present_inline_demo'
    ) {
      return false
    }
    tools += 1
  }
  return tools >= 1
}

function isLiveAddedSettledTool(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'tool' &&
      (segment.status === 'done' || segment.status === 'error') &&
      segment.toolName &&
      segment.toolName !== 'present_inline_demo'
  )
}

/** 同一帧 tool_start + tool_done：新开的工具已是 done / error，可带一条 规划下一步 */
function isLiveAddedSettledToolsWithOptionalStatus(
  prevLen: number,
  next: readonly TurnSegment[]
): boolean {
  if (next.length <= prevLen) return false
  let tools = 0
  for (let i = prevLen; i < next.length; i++) {
    const added = next[i]
    if (!added) return false
    if (
      added.kind === 'status' &&
      added.status === 'active' &&
      i === next.length - 1 &&
      tools >= 1
    ) {
      return true
    }
    if (!isLiveAddedSettledTool(added)) return false
    tools += 1
  }
  return tools >= 1
}

function addedSettledToolsHaveWriteStat(
  prevLen: number,
  next: readonly TurnSegment[]
): boolean {
  for (let i = prevLen; i < next.length; i++) {
    const added = next[i]
    if (!added || added.kind !== 'tool') continue
    if (added.fileDiff || added.fileDiffs || added.editPreview) return true
  }
  return false
}

/** 规划下一步后同一帧 tool_start 且立刻 tool_done：前缀只收口，追加已收束工具（对标 query-loop assertToolAllowed / 快工具 complete_call，不发明 Exploring 分组格） */
export function isLiveSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || !isLiveAddedSettledToolsWithOptionalStatus(prev.length, next)) return false
  return hasLiveToolAppendPrefixClose(prev, next)
}

/** 规划下一步后同一帧 think + tool_start + tool_done：旁白可先标 done，再追加已收束工具 */
export function isLiveThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 规划下一步 + think + 立刻收束的工具：status 可先收口，思考不进过程 */
export function isLiveStatusThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

function isLiveAddedAnswerPair(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'text' &&
      (segment.status === 'active' || segment.status === 'done') &&
      !hasStreamingDemoFence(segment.content ?? '')
  )
}

/** 规划下一步后同一帧首枚 token + tool_start + tool_done：散文可先标 done，再追加已收束工具 */
export function isLiveAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedAnswerPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 写盘收束同时下一工具已在同一帧 complete_call：过程 remap 并追加已收束工具，回答只换 diff 槽 */
export function isLiveWriteStatSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveWriteStatPrefix(prev, next) && isLiveAddedSettledToolsWithOptionalStatus(prev!.length, next)
}

/** 规划下一步后同一帧 think + 首枚 token + tool_start + tool_done */
export function isLiveThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedAnswerPair(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** 规划下一步 + think + 首枚 token + 立刻收束的工具：status 可先收口 */
export function isLiveStatusThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  if (!isLiveAddedAnswerPair(next[prev!.length + 2])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 规划下一步后同一帧 think + ```demo + present_inline_demo：思考不进过程，回答开演示槽 */
export function isLiveThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 3) return false
  const text = next[prev!.length + 1]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 2])
}

/** 写盘收束同时 think + 下一工具已 complete_call：过程 remap，旁白续尾 */
export function isLiveWriteStatThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 写盘收束同时首枚 token + 下一工具已 complete_call：回答开散文尾并换 diff 槽 */
export function isLiveWriteStatAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedAnswerPair(next[prev!.length])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 写盘收束同时 think + 首枚 token + 下一工具已 complete_call：过程 remap，回答开散文尾并换 diff 槽 */
export function isLiveWriteStatThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) return false
  if (!isLiveAddedAnswerPair(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** 写盘收束同时 think + ```demo + present_inline_demo：过程 remap，旁白续尾，回答开演示槽 */
export function isLiveWriteStatThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) return false
  if (next.length !== prev!.length + 3) return false
  const text = next[prev!.length + 1]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 2])
}

/** 写盘收束同时 ```demo + present_inline_demo：过程 remap，回答开演示槽 */
export function isLiveWriteStatAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  const text = next[prev!.length]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 1])
}

/** 写盘收束同时 规划下一步 + think + 首枚 token + 下一工具已 complete_call */
export function isLiveWriteStatStatusThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  if (!isLiveAddedAnswerPair(next[prev!.length + 2])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 写盘收束同时 规划下一步 + think + 下一工具已 complete_call：过程 remap 并追加 status */
export function isLiveWriteStatStatusThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** 写盘收束同时 规划下一步 + 首枚 token + 下一工具已 complete_call */
export function isLiveWriteStatStatusAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedAnswerPair(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** 写盘收束同时 规划下一步 + think + ```demo + present_inline_demo */
export function isLiveWriteStatStatusThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  if (next.length !== prev!.length + 4) return false
  const text = next[prev!.length + 2]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 3])
}

/** 写盘收束同时 规划下一步 + ```demo + present_inline_demo */
export function isLiveWriteStatStatusAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (next.length !== prev!.length + 3) return false
  const text = next[prev!.length + 1]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 2])
}

/** 正文 ```demo 与 present_inline_demo 同一帧：过程不追加演示步，回答开演示槽（对标 query-loop token + tool_preview） */
export function isLiveAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev) return false
  if (next.length === prev.length + 2) {
    if (!hasLiveToolAppendPrefixClose(prev, next)) return false
    const text = next[prev.length]
    if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
    return isLiveAddedInlineDemo(next[prev.length + 1])
  }
  if (next.length !== prev.length + 1) return false
  if (!isLiveAddedInlineDemo(next[next.length - 1])) return false
  let fenceGrew = false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (
      i === prev.length - 1 &&
      before.kind === 'text' &&
      after.kind === 'text' &&
      before.id === after.id &&
      hasStreamingDemoFence(after.content ?? '')
    ) {
      fenceGrew = true
      continue
    }
    if (isLivePrefixClose(before, after) || isLiveTextGrowClose(before, after)) continue
    return false
  }
  return fenceGrew
}

export function isLiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || !isLiveAddedToolsWithOptionalStatus(prev.length, next)) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return true
}

function hasLiveToolAppendPrefixClose(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return true
}

/** 规划下一步后同一帧 tool_start：status 可先被收口，再追加一或多个工具 */
export function isLiveStatusToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 规划下一步已在场时 think 后 tool_start：旁白可先标 done，已画散文也可被收口，再追加工具 */
export function isLiveThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 规划下一步 + think + tool_start 同一帧：status 可仍在，旁白可先标 done */
export function isLiveStatusThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
}

/** 前缀没变或只收束思考/status/散文/无新写盘的工具、末尾新开 status：只追加过程步（对标 Codex Reconnecting... n/5 / Compacting） */
export function isLiveStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  const added = next[next.length - 1]
  if (!added || added.kind !== 'status' || added.status !== 'active') return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLivePrefixClose(before, after)) return false
  }
  return true
}

/** 前缀没变或只收束思考/status/无新写盘的工具、末尾新开思考：只换旁白（对标 Codex Thinking cell / complete_call，不复制 #24850） */
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
    if (!isLiveThinkAnswerPrefixClose(before, after)) return false
  }
  return true
}

/** 前缀没变或只收束思考/status/无新写盘的工具、末尾新开散文：只开回答尾（对标 Codex 工具后首枚 token / complete_call） */
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
    if (!isLiveThinkAnswerPrefixClose(before, after)) return false
  }
  return true
}

/** 前缀没变或只收束思考/status/无新写盘的工具、末尾新开带 ```demo 的散文：过程不追加、回答只开演示槽 */
export function isLiveDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  const added = next[next.length - 1]
  if (!added || !isLiveAnswerText(added) || added.status === 'done') return false
  if (!hasStreamingDemoFence(added.content ?? '')) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLiveThinkAnswerPrefixClose(before, after)) return false
  }
  return true
}

/** 前缀没变或只收束思考/status/无新写盘的工具、末尾新开已完成 compress：只追加过程步（对标 Codex contextCompaction / complete_call，写盘 +/- 仍走 write-stat） */
export function isLiveCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  const added = next[next.length - 1]
  if (!added || added.kind !== 'tool' || added.toolName !== COMPRESS_TOOL) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLiveThinkAnswerPrefixClose(before, after)) return false
  }
  return true
}

/** 同一段散文刚出现或加长 ```demo：只换该槽，不重拆过程 / 全文 buildAnswerParts */
function sameLiveToolCore(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'tool' || next.kind !== 'tool') return false
  if (prev.id !== next.id || prev.toolName !== next.toolName || prev.status !== next.status) {
    return false
  }
  return (
    prev.toolArgs === next.toolArgs &&
    prev.fileDiff === next.fileDiff &&
    prev.fileDiffs === next.fileDiffs &&
    prev.editPreview === next.editPreview
  )
}

function isLiveApprovalAttach(prev: TurnSegment, next: TurnSegment): boolean {
  return sameLiveToolCore(prev, next) && !prev.approval && Boolean(next.approval)
}

function isLiveApprovalDetach(prev: TurnSegment, next: TurnSegment): boolean {
  return sameLiveToolCore(prev, next) && Boolean(prev.approval) && !next.approval
}

function isLiveAwaitingStatusRetarget(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'status' || next.kind !== 'status' || prev.id !== next.id) return false
  if (prev.status !== 'active' || next.status !== 'active') return false
  return isAwaitingApprovalText(next.content ?? '')
}

function isLiveAwaitingStatusResolve(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'status' || next.kind !== 'status' || prev.id !== next.id) return false
  if (prev.status !== 'active' || next.status !== 'done') return false
  return isAwaitingApprovalText(prev.content ?? '')
}

/** 工具挂上 approval，并新开或改写 Awaiting approval 行：只换这两步（对标 Codex Awaiting approval） */
export function isLiveApprovalNeededChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || (next.length !== prev.length && next.length !== prev.length + 1)) return false
  let attached = 0
  let statusRetarget = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveApprovalAttach(before, after)) {
      attached += 1
      continue
    }
    if (next.length === prev.length && isLiveAwaitingStatusRetarget(before, after)) {
      statusRetarget += 1
      continue
    }
    return false
  }
  if (attached !== 1) {
    return attached === 0 && next.length === prev.length && statusRetarget === 1
  }
  if (next.length === prev.length + 1) {
    const added = next[next.length - 1]
    return Boolean(
      added &&
        added.kind === 'status' &&
        added.status === 'active' &&
        isAwaitingApprovalText(added.content ?? '')
    )
  }
  return statusRetarget === 1
}

function isLiveAddedAwaitingStatus(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'status' &&
      (segment.status === 'active' || segment.status === 'done') &&
      isAwaitingApprovalText(segment.content ?? '')
  )
}

function isLiveAddedCancelledAwaitingStatus(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'status' &&
      segment.status === 'cancelled' &&
      isAwaitingApprovalText(segment.content ?? '')
  )
}

function isLiveAddedApprovalTool(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && segment.kind === 'tool' && segment.status === 'active' && segment.approval)
}

function isLiveAddedCancelledApprovalTool(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && segment.kind === 'tool' && segment.status === 'cancelled')
}

function hasLiveApprovalNeededAppendHead(next: readonly TurnSegment[], start: number): boolean {
  return isLiveAddedApprovalTool(next[start]) && isLiveAddedAwaitingStatus(next[start + 1])
}

function hasLiveApprovalNeededCancelledHead(next: readonly TurnSegment[], start: number): boolean {
  return isLiveAddedCancelledApprovalTool(next[start]) && isLiveAddedCancelledAwaitingStatus(next[start + 1])
}

/** 已在场工具挂上或摘掉 approval，并新开 Awaiting 行（可先标 done） */
function hasLiveApprovalNeededPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length <= prev.length) return false
  let holds = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (sameLiveToolCore(before, after)) {
      holds += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return holds === 1 && isLiveAddedAwaitingStatus(next[prev.length])
}

/** Awaiting approval 挂上后同一帧 think：过程追加问句行，旁白续尾 */
export function isLiveApprovalNeededThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalNeededPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return isLiveAddedThinkPair(next[prev!.length + 1])
}

/** Awaiting approval 挂上后同一帧首枚 token：过程追加该行，回答开散文尾 */
export function isLiveApprovalNeededAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalNeededPrefix(prev, next) || next.length !== prev!.length + 2) return false
  const text = next[prev!.length + 1]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text))
}

/** Awaiting approval 挂上后同一帧 context_compress：过程追加该行与压缩步 */
export function isLiveApprovalNeededCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalNeededPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return isLiveAddedCompress(next[prev!.length + 1])
}

/** Awaiting approval 挂上后同一帧 think + compress */
export function isLiveApprovalNeededThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalNeededPrefix(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return isLiveAddedCompress(next[prev!.length + 2])
}

/** Awaiting approval 挂上后同一帧错误：过程追加该行，错误正文只进回答 */
export function isLiveApprovalNeededErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalNeededPrefix(prev, next) || next.length !== prev!.length + 2) return false
  const text = next[prev!.length + 1]
  return Boolean(text && isLiveErrorAnswer(text))
}

/** Awaiting approval 挂上后同一帧 ```demo + present_inline_demo */
export function isLiveApprovalNeededAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalNeededPrefix(prev, next) || next.length !== prev!.length + 3) return false
  const text = next[prev!.length + 1]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 2])
}

/** 写盘收束同时新开工具并立刻 Awaiting + compress */
export function isLiveWriteStatApprovalNeededCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedCompress(next[prev!.length + 2])
}

/** 写盘收束同时新开工具并立刻 Awaiting + Stop */
export function isLiveWriteStatApprovalNeededCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return hasLiveApprovalNeededCancelledHead(next, prev!.length)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + compress */
export function isLiveStatusApprovalNeededCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedCompress(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + Stop */
export function isLiveStatusApprovalNeededCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 3) return false
  return hasLiveApprovalNeededCancelledHead(next, prev!.length + 1)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + compress */
export function isLiveWriteStatApprovalResolvedCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedCompress(next[prev!.length + 2])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + Stop */
export function isLiveWriteStatApprovalResolvedCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  return isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + compress */
export function isLiveStatusApprovalResolvedCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedCompress(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + Stop */
export function isLiveStatusApprovalResolvedCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 3) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  return isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + compress */
export function isLiveWriteStatApprovalResolvedThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedCompress(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + compress */
export function isLiveStatusApprovalResolvedThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedCompress(next[prev!.length + 4])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token */
export function isLiveWriteStatApprovalResolvedAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text))
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 */
export function isLiveWriteStatApprovalResolvedErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveErrorAnswer(text))
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo */
export function isLiveWriteStatApprovalResolvedAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + Stop */
export function isLiveWriteStatApprovalResolvedThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  return isLiveAddedCancelledThink(next[prev!.length + 2])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token + Stop */
export function isLiveWriteStatApprovalResolvedAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  return isLiveAddedCancelledAnswer(next[prev!.length + 2])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + Stop */
export function isLiveWriteStatApprovalResolvedAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  return isLiveAddedCancelledDemoFencePair(next, prev!.length + 2)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 首枚 token + Stop */
export function isLiveWriteStatApprovalResolvedThinkAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) && isLiveAddedCancelledAnswer(next[prev!.length + 3])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + Stop */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 3)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + Stop */
export function isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedCancelledThink(next[prev!.length + 2]) && isLiveAddedError(next[prev!.length + 3])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + 错误 */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + 错误 + Stop */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + ```demo */
export function isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3]) && isLiveAddedDemoFencePair(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + ```demo + Stop */
export function isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  const tool = next[prev!.length]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 1])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) && isLiveAddedCancelledDemoFencePair(next, prev!.length + 4)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + 错误 + compress */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + ```demo + compress */
export function isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + 错误 */
export function isLiveWriteStatApprovalResolvedAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && isLiveAddedError(next[prev!.length + 4])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + ```demo */
export function isLiveWriteStatApprovalResolvedErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedError(next[prev!.length + 2]) && isLiveAddedDemoFencePair(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + Ask User */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + 下一工具 */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token */
export function isLiveStatusApprovalResolvedAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text))
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + Stop */
export function isLiveStatusApprovalResolvedThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return isLiveAddedCancelledThink(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token + Stop */
export function isLiveStatusApprovalResolvedAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return isLiveAddedCancelledAnswer(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 首枚 token + Stop */
export function isLiveStatusApprovalResolvedThinkAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) && isLiveAddedCancelledAnswer(next[prev!.length + 4])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + Stop */
export function isLiveStatusApprovalResolvedAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return isLiveAddedCancelledDemoFencePair(next, prev!.length + 3)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + Stop */
export function isLiveStatusApprovalResolvedThinkErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedCancelledThink(next[prev!.length + 3]) && isLiveAddedError(next[prev!.length + 4])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + Stop */
export function isLiveStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 4)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 下一工具已 complete_call */
export function isLiveStatusApprovalResolvedThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 首枚 token */
export function isLiveWriteStatApprovalResolvedThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text))
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 */
export function isLiveWriteStatApprovalResolvedThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveErrorAnswer(next[prev!.length + 3]!)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token + compress */
export function isLiveWriteStatApprovalResolvedAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return (
    Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) &&
    isLiveAddedCompress(next[prev!.length + 3])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + compress */
export function isLiveWriteStatApprovalResolvedErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveErrorAnswer(next[prev!.length + 2]!) && isLiveAddedCompress(next[prev!.length + 3])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + compress */
export function isLiveWriteStatApprovalResolvedAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && isLiveAddedCompress(next[prev!.length + 4])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 首枚 token + compress */
export function isLiveWriteStatApprovalResolvedThinkAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return (
    Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + compress */
export function isLiveWriteStatApprovalResolvedThinkErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveErrorAnswer(next[prev!.length + 3]!) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + compress */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 下一工具 */
export function isLiveWriteStatApprovalResolvedToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedResolvedApprovalHead(next, prev!.length)) {
    return false
  }
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 下一工具 */
export function isLiveWriteStatApprovalResolvedThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedResolvedApprovalHead(next, prev!.length)) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 下一工具已 complete_call */
export function isLiveWriteStatApprovalResolvedThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedResolvedApprovalHead(next, prev!.length)) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + Ask User */
export function isLiveWriteStatApprovalResolvedAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return hasLiveAskNeededHead(next, prev!.length + 2)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 首枚 token */
export function isLiveStatusApprovalResolvedThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text))
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo */
export function isLiveStatusApprovalResolvedThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo */
export function isLiveStatusApprovalResolvedAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 */
export function isLiveStatusApprovalResolvedErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveErrorAnswer(next[prev!.length + 3]!)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token + compress */
export function isLiveStatusApprovalResolvedAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return (
    Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 首枚 token + compress */
export function isLiveStatusApprovalResolvedThinkAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return (
    Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 */
export function isLiveStatusApprovalResolvedThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedThinkPair(next[prev!.length + 3]) && isLiveErrorAnswer(next[prev!.length + 4]!)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + compress */
export function isLiveStatusApprovalResolvedThinkErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) &&
    isLiveErrorAnswer(next[prev!.length + 4]!) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + compress */
export function isLiveStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 + compress */
export function isLiveStatusApprovalResolvedErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveErrorAnswer(next[prev!.length + 3]!) && isLiveAddedCompress(next[prev!.length + 4])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + compress */
export function isLiveStatusApprovalResolvedAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 下一工具 */
export function isLiveStatusApprovalResolvedToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 下一工具 */
export function isLiveStatusApprovalResolvedThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + Ask User */
export function isLiveStatusApprovalResolvedAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return hasLiveAskNeededHead(next, prev!.length + 3)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 下一工具 */
export function isLiveWriteStatStatusApprovalResolvedToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + Ask User */
export function isLiveWriteStatStatusApprovalResolvedAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return hasLiveAskNeededHead(next, prev!.length + 3)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 首枚 token + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) && isLiveAddedCancelledAnswer(next[prev!.length + 4])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + Stop */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return isLiveAddedCancelledDemoFencePair(next, prev!.length + 3)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalResolvedThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + Stop */
export function isLiveWriteStatStatusApprovalResolvedErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedCancelledThink(next[prev!.length + 3]) && isLiveAddedError(next[prev!.length + 4])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 4)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) &&
    isLiveErrorAnswer(next[prev!.length + 4]!) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + compress */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + compress */
export function isLiveWriteStatStatusApprovalResolvedErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveErrorAnswer(next[prev!.length + 3]!) && isLiveAddedCompress(next[prev!.length + 4])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + Ask User */
export function isLiveWriteStatStatusApprovalResolvedThinkAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 下一工具 */
export function isLiveWriteStatStatusApprovalResolvedThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 首枚 token + Stop */
export function isLiveWriteStatStatusApprovalResolvedAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return isLiveAddedCancelledAnswer(next[prev!.length + 3])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 首枚 token + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return (
    Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 错误 */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && isLiveAddedError(next[prev!.length + 6])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 错误 + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 4) && isLiveAddedError(next[prev!.length + 6])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + ```demo */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && isLiveAddedDemoFencePair(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + ```demo + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) && isLiveAddedCancelledDemoFencePair(next, prev!.length + 5)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 错误 + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + ```demo + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + 错误 */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + ```demo */
export function isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && isLiveAddedDemoFencePair(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 下一工具 */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 4)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + Stop + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + 错误 + Stop */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + ```demo + Stop */
export function isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) && isLiveAddedCancelledDemoFencePair(next, prev!.length + 4)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 错误 + Stop + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  const tool = next[prev!.length + 1]
  if (!tool || tool.kind !== 'tool' || tool.status !== 'cancelled') return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length + 2])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 审批收束：Awaiting 行标 done，可选摘掉工具 approval，不重拆回答 */
export function isLiveApprovalResolvedChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || prev.length !== next.length) return false
  let detached = 0
  let resolved = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveApprovalDetach(before, after)) {
      detached += 1
      continue
    }
    if (isLiveAwaitingStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    return false
  }
  return resolved === 1 && detached <= 1
}

/** Allow / Deny 只收口 Awaiting 行（工具仍在跑）后同一帧 think：过程 remap，旁白续尾 */
export function isLiveApprovalResolvedThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 1) {
    return isLiveAddedThinkPair(next[prev!.length])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 2) {
    return isLiveAddedThinkPair(next[prev!.length + 1])
  }
  return false
}

function isLiveAddedResolvedApprovalStatus(segment: TurnSegment | undefined): boolean {
  const text = segment?.content ?? ''
  return Boolean(
    segment &&
      segment.kind === 'status' &&
      segment.status === 'done' &&
      (text === '已确认，继续执行' || text === '已拒绝该操作')
  )
}

function hasLiveApprovalResolvedPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let detached = 0
  let resolved = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveApprovalDetach(before, after)) {
      detached += 1
      continue
    }
    if (isLiveAwaitingStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    return false
  }
  return resolved === 1 && detached <= 1
}

/** 已在场 Allow/Deny 收口，且同一帧 tool_start 可先把散文 / 旁白标 done */
function hasLiveApprovalResolvedPrefixClose(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let detached = 0
  let resolved = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveApprovalDetach(before, after)) {
      detached += 1
      continue
    }
    if (isLiveAwaitingStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return resolved === 1 && detached <= 1
}

function hasLiveApprovalResolvedAppendPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length <= prev.length) return false
  let holds = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (sameLiveToolCore(before, after)) {
      holds += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return holds === 1 && isLiveAddedResolvedApprovalStatus(next[prev.length])
}

function isLiveAddedResolvedApprovalHead(next: readonly TurnSegment[], start: number): boolean {
  const tool = next[start]
  return Boolean(tool && tool.kind === 'tool') && isLiveAddedResolvedApprovalStatus(next[start + 1])
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 context_compress：过程 remap 并追加压缩步（对标 query-loop 放行后立即 compact；不复制 #24432 compact 卡住） */
export function isLiveApprovalResolvedCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 1) {
    return isLiveAddedCompress(next[prev!.length])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 2) {
    return isLiveAddedCompress(next[prev!.length + 1])
  }
  return false
}

/** Allow / Deny 挂上并立刻收口后同一帧 Stop：过程追加已确认/已拒绝行，已在场 active 标 cancelled（对标 You stopped after；不复制 Stop 失败卡住） */
export function isLiveApprovalResolvedCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedResolvedApprovalStatus(next[prev!.length])
}

/** Allow / Deny 已在场收口后同一帧 Stop：Awaiting 行标 done，active 标 cancelled */
export function isLiveApprovalResolvedCancelChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || prev.length !== next.length) return false
  let cancelled = 0
  let resolved = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) {
      cancelled += 1
      continue
    }
    return false
  }
  return resolved === 1 && cancelled >= 1
}

/** Allow / Deny 只收口 Awaiting 行后同一帧首枚 token：过程 remap，回答开散文尾 */
export function isLiveApprovalResolvedAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 1) {
    return isLiveAddedAnswerPair(next[prev!.length])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 2) {
    return isLiveAddedAnswerPair(next[prev!.length + 1])
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧错误：过程 remap，错误正文只进回答 */
export function isLiveApprovalResolvedErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 1) {
    const text = next[prev!.length]
    return Boolean(text && isLiveErrorAnswer(text))
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 2) {
    const text = next[prev!.length + 1]
    return Boolean(text && isLiveErrorAnswer(text))
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + present_inline_demo */
export function isLiveApprovalResolvedAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 2) {
    const text = next[prev!.length]
    if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
    return isLiveAddedInlineDemo(next[prev!.length + 1])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 3) {
    const text = next[prev!.length + 1]
    if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
    return isLiveAddedInlineDemo(next[prev!.length + 2])
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + compress */
export function isLiveApprovalResolvedThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 2) {
    return isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedCompress(next[prev!.length + 1])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedThinkPair(next[prev!.length + 1]) && isLiveAddedCompress(next[prev!.length + 2])
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧首枚 token + compress */
export function isLiveApprovalResolvedAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 2) {
    return isLiveAddedAnswerPair(next[prev!.length]) && isLiveAddedCompress(next[prev!.length + 1])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedAnswerPair(next[prev!.length + 1]) && isLiveAddedCompress(next[prev!.length + 2])
  }
  return false
}

function hasLiveApprovalResolvedCancelPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let cancelled = 0
  let resolved = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) {
      cancelled += 1
      continue
    }
    return false
  }
  return resolved === 1 && cancelled >= 1
}

/** Allow / Deny 收口后同一帧 think + Stop：旁白可先挂上再标 cancelled，思考不进过程 */
export function isLiveApprovalResolvedThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 1 &&
    isLiveAddedCancelledThink(next[prev!.length])
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 2) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return isLiveAddedCancelledThink(next[prev!.length + 1])
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 首枚 token */
export function isLiveApprovalResolvedThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 2) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!))
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 3) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      Boolean(isLiveAddedAnswerPair(next[prev!.length + 2]) && !isLiveErrorAnswer(next[prev!.length + 2]!))
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 错误 */
export function isLiveApprovalResolvedThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 2) {
    return isLiveAddedThinkPair(next[prev!.length]) && isLiveErrorAnswer(next[prev!.length + 1]!)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedThinkPair(next[prev!.length + 1]) && isLiveErrorAnswer(next[prev!.length + 2]!)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo */
export function isLiveApprovalResolvedThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedDemoFencePair(next, prev!.length + 1)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedThinkPair(next[prev!.length + 1]) && isLiveAddedDemoFencePair(next, prev!.length + 2)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 首枚 token + compress */
export function isLiveApprovalResolvedThinkAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 3) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) &&
      isLiveAddedCompress(next[prev!.length + 2])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      Boolean(isLiveAddedAnswerPair(next[prev!.length + 2]) && !isLiveErrorAnswer(next[prev!.length + 2]!)) &&
      isLiveAddedCompress(next[prev!.length + 3])
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + compress */
export function isLiveApprovalResolvedAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedDemoFencePair(next, prev!.length) && isLiveAddedCompress(next[prev!.length + 2])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedDemoFencePair(next, prev!.length + 1) && isLiveAddedCompress(next[prev!.length + 3])
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 Ask User */
export function isLiveApprovalResolvedAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 2) {
    return hasLiveAskNeededHead(next, prev!.length)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 3) {
    return hasLiveAskNeededHead(next, prev!.length + 1)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧下一工具 */
export function isLiveApprovalResolvedToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next)) {
    return isLiveAddedToolsWithOptionalStatus(prev!.length, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next)) {
    return isLiveAddedToolsWithOptionalStatus(prev!.length + 1, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧下一工具已 complete_call */
export function isLiveApprovalResolvedSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next)) {
    return isLiveAddedSettledToolsWithOptionalStatus(prev!.length, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next)) {
    return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 下一工具已 complete_call */
export function isLiveApprovalResolvedThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && isLiveAddedThinkPair(next[prev!.length])) {
    return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && isLiveAddedThinkPair(next[prev!.length + 1])) {
    return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 下一工具 */
export function isLiveApprovalResolvedThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && isLiveAddedThinkPair(next[prev!.length])) {
    return isLiveAddedToolsWithOptionalStatus(prev!.length + 1, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && isLiveAddedThinkPair(next[prev!.length + 1])) {
    return isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 错误 + compress */
export function isLiveApprovalResolvedThinkErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 3) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveErrorAnswer(next[prev!.length + 1]!) &&
      isLiveAddedCompress(next[prev!.length + 2])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveErrorAnswer(next[prev!.length + 2]!) &&
      isLiveAddedCompress(next[prev!.length + 3])
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + compress */
export function isLiveApprovalResolvedThinkAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      isLiveAddedCompress(next[prev!.length + 3])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      isLiveAddedCompress(next[prev!.length + 4])
    )
  }
  return false
}

/** Allow / Deny 收口后同一帧首枚 token + Stop：散文可先挂上再标 cancelled */
export function isLiveApprovalResolvedAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 1 &&
    isLiveAddedCancelledAnswer(next[prev!.length])
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 2) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return isLiveAddedCancelledAnswer(next[prev!.length + 1])
}

/** Allow / Deny 收口后同一帧 think + 首枚 token + Stop */
export function isLiveApprovalResolvedThinkAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 2 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedCancelledAnswer(next[prev!.length + 1])
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 1]) && isLiveAddedCancelledAnswer(next[prev!.length + 2])
  )
}

/** Allow / Deny 收口后同一帧错误 + Stop */
export function isLiveApprovalResolvedErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 1 &&
    isLiveErrorAnswer(next[prev!.length]!)
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 2) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return isLiveErrorAnswer(next[prev!.length + 1]!)
}

/** Allow / Deny 收口后同一帧 think + ```demo + Stop：工具未 tool_done，演示标 cancelled */
export function isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 2)
  )
}

/** Allow / Deny 收口后同一帧 think + 错误 + Stop：工具未 tool_done，旁白标 cancelled */
export function isLiveApprovalResolvedThinkErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 2 &&
    isLiveAddedCancelledThink(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1])
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return (
    isLiveAddedCancelledThink(next[prev!.length + 1]) && isLiveAddedError(next[prev!.length + 2])
  )
}

/** Deny 收口并 tool_done error 后同一帧 Stop：Awaiting 行与工具一起收口，其余 active 标 cancelled */
export function isLiveApprovalDeniedSettleCancelChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || prev.length !== next.length) return false
  let statusResolved = 0
  let toolSettled = 0
  let cancelled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) {
      cancelled += 1
      continue
    }
    return false
  }
  return statusResolved === 1 && toolSettled === 1 && cancelled >= 1
}

/** Allow 收口并 tool_done 后同一帧 think + Stop */
export function isLiveApprovalAllowedSettleThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  if (!isLiveAddedCancelledThink(next[prev.length])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow 收口并 tool_done 后同一帧 ```demo + compress */
export function isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedDemoFencePair(next, prev!.length) && isLiveAddedCompress(next[prev!.length + 2])
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + compress */
export function isLiveApprovalAllowedSettleThinkAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  )
}

/** Allow 收口并 tool_done 后同一帧 think + 首枚 token + Stop */
export function isLiveApprovalAllowedSettleThinkAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 2) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledAnswer(next[prev.length + 1])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow 收口并 tool_done 后同一帧首枚 token + Stop */
export function isLiveApprovalAllowedSettleAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  if (!isLiveAddedCancelledAnswer(next[prev.length])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

function hasLiveApprovalAllowedSettlePrefixClose(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow 收口并 tool_done 后同一帧 think + 错误 + Stop */
export function isLiveApprovalAllowedSettleThinkErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 2) return false
  if (!isLiveAddedCancelledThink(next[prev.length])) return false
  if (!isLiveAddedError(next[prev.length + 1])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + Stop */
export function isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 3) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 1)) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow 收口并 tool_done 后同一帧 ```demo + Stop */
export function isLiveApprovalAllowedSettleAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 2) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length)) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow 收口并 tool_done 后同一帧错误 + Stop */
export function isLiveApprovalAllowedSettleErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  if (!isLiveErrorAnswer(next[prev.length]!)) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow 收口并 tool_done 后同一帧下一工具 */
export function isLiveApprovalAllowedSettleToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return (
    hasLiveApprovalAllowedSettlePrefixClose(prev, next) &&
    isLiveAddedToolsWithOptionalStatus(prev!.length, next)
  )
}

function hasLiveApprovalDeniedPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 后同一帧 approval_resolved + tool_done error：Awaiting 行与工具一起收口（对标 query-loop 拒绝后立即 yield，不复制 #10760 卡住审批） */
export function isLiveApprovalDeniedSettleChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveApprovalDeniedPrefix(prev, next) && next.length === prev!.length
}

/** Deny 收口并 tool_done error 后同一帧 think + 首枚 token */
export function isLiveApprovalDeniedThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!))
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 */
export function isLiveApprovalDeniedThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return isLiveAddedThinkPair(next[prev!.length]) && isLiveErrorAnswer(next[prev!.length + 1]!)
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo */
export function isLiveApprovalDeniedThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedDemoFencePair(next, prev!.length + 1)
}

/** Deny 收口并 tool_done error 后同一帧 think + 首枚 token + compress */
export function isLiveApprovalDeniedThinkAnswerCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) &&
    isLiveAddedCompress(next[prev!.length + 2])
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + compress */
export function isLiveApprovalDeniedThinkAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + compress */
export function isLiveApprovalDeniedThinkErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveErrorAnswer(next[prev!.length + 1]!) &&
    isLiveAddedCompress(next[prev!.length + 2])
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 首枚 token + Stop */
export function isLiveApprovalDeniedThinkAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 2) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledAnswer(next[prev.length + 1])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + Stop */
export function isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 3) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 1)) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + Stop */
export function isLiveApprovalDeniedThinkErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 2) return false
  if (!isLiveAddedCancelledThink(next[prev.length])) return false
  if (!isLiveAddedError(next[prev.length + 1])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 收口并 tool_done error 后同一帧 ```demo + Stop */
export function isLiveApprovalDeniedAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 2) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length)) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 收口并 tool_done error 后同一帧错误 + Stop */
export function isLiveApprovalDeniedErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  if (!isLiveAddedError(next[prev.length])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 收口并 tool_done error 后同一帧首枚 token + Stop */
export function isLiveApprovalDeniedAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  if (!isLiveAddedCancelledAnswer(next[prev.length])) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) continue
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 收口并 tool_done error 后同一帧 ```demo */
export function isLiveApprovalDeniedAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return isLiveAddedDemoFencePair(next, prev!.length)
}

/** Deny 收口并 tool_done error 后同一帧 ```demo + compress */
export function isLiveApprovalDeniedAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedDemoFencePair(next, prev!.length) && isLiveAddedCompress(next[prev!.length + 2])
}

/** Deny 收口后同一帧新开 规划下一步：过程 remap 并追加 status */
export function isLiveApprovalDeniedStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedStatusPair(next[prev!.length])
}

/** Deny 收口后同一帧 context_compress：过程 remap 并追加压缩步（不复制 #24432 compact 卡住） */
export function isLiveApprovalDeniedCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedCompress(next[prev!.length])
}

function hasLiveApprovalDeniedPrefixClose(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'error') {
      toolSettled += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Deny 收口后同一帧下一工具（可带一条 规划下一步）：过程 remap 并追加这些步 */
export function isLiveApprovalDeniedToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalDeniedPrefix(prev, next) && isLiveAddedToolsWithOptionalStatus(prev!.length, next)) {
    return true
  }
  return (
    hasLiveApprovalDeniedPrefixClose(prev, next) && isLiveAddedToolsWithOptionalStatus(prev!.length, next)
  )
}

function hasLiveApprovalAllowedWriteStatPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let resolved = 0
  let writeStat = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    if (isLiveToolWriteStatChange(before, after)) {
      writeStat += 1
      continue
    }
    return false
  }
  return resolved === 1 && writeStat === 1
}

/** Allow once 后同一帧 approval_resolved + 首枚 tool_preview：Awaiting 行收口并换该工具写盘 +/-（对标 query-loop 放行后立即 runToolWithLiveStatus；不复制 #10760 / #38695） */
export function isLiveApprovalAllowedWriteStatChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveApprovalAllowedWriteStatPrefix(prev, next) && Boolean(prev && next.length === prev.length)
}

/** Allow 写盘收口后同一帧新开 规划下一步：过程 remap 并追加 status，回答只换 diff 槽 */
export function isLiveApprovalAllowedWriteStatStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) {
    return false
  }
  return isLiveAddedStatusPair(next[prev!.length])
}

/** Allow 写盘收口后同一帧下一工具（可带一条 规划下一步）：过程 remap 并追加这些步，回答只换 diff 槽 */
export function isLiveApprovalAllowedWriteStatToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return (
    hasLiveApprovalAllowedWriteStatPrefix(prev, next) &&
    isLiveAddedToolsWithOptionalStatus(prev!.length, next)
  )
}

function hasLiveApprovalAllowedSettlePrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let statusResolved = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      statusResolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    return false
  }
  return statusResolved === 1 && toolSettled === 1
}

/** Allow once 后同一帧 approval_resolved + tool_done：Awaiting 行与工具一起收口（对标 query-loop 放行后立即执行；不复制 #10760 / #36115） */
export function isLiveApprovalAllowedSettleChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveApprovalAllowedSettlePrefix(prev, next) && next.length === prev!.length
}

/** Allow 收口后同一帧新开 规划下一步：过程 remap 并追加 status */
export function isLiveApprovalAllowedStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedStatusPair(next[prev!.length])
}

/** Allow 收口后同一帧下一工具（可带一条 规划下一步）：过程 remap 并追加这些步 */
export function isLiveApprovalAllowedToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveApprovalAllowedSettlePrefix(prev, next) && isLiveAddedToolsWithOptionalStatus(prev!.length, next)
}

/** Allow 收口后同一帧 context_compress：过程 remap 并追加压缩步（不复制 #24432 compact 卡住） */
export function isLiveApprovalAllowedCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedCompress(next[prev!.length])
}

/** Allow 收口后同一帧 Stop：工具已 complete_call，其余 active 标 cancelled */
export function isLiveApprovalAllowedCancelChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || prev.length !== next.length) return false
  let resolved = 0
  let toolSettled = 0
  let cancelled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAwaitingStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.status === 'done') {
      toolSettled += 1
      continue
    }
    if (isLiveCancelRetarget(before, after)) {
      cancelled += 1
      continue
    }
    return false
  }
  return resolved === 1 && toolSettled === 1 && cancelled >= 1
}

/** Allow 收口后同一帧 think：过程 remap，旁白续尾 */
export function isLiveApprovalAllowedThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedThinkPair(next[prev!.length])
}

/** Allow 收口后同一帧首枚 token：过程 remap，回答开散文尾 */
export function isLiveApprovalAllowedAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedAnswerPair(next[prev!.length])
}

/** Allow 收口后同一帧 think + 首枚 token */
export function isLiveApprovalAllowedThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 2) return false
  return isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedAnswerPair(next[prev!.length + 1])
}

/** Allow 收口后同一帧 think + 下一工具已 complete_call */
export function isLiveApprovalAllowedThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** Allow 收口后同一帧首枚 token + 下一工具已 complete_call */
export function isLiveApprovalAllowedAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || !isLiveAddedAnswerPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** Allow 收口后同一帧 think + 首枚 token + 下一工具已 complete_call */
export function isLiveApprovalAllowedThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedAnswerPair(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** Allow 收口后同一帧 ```demo + present_inline_demo */
export function isLiveApprovalAllowedAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 2) return false
  const text = next[prev!.length]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 1])
}

/** Allow 收口后同一帧 think + ```demo + present_inline_demo */
export function isLiveApprovalAllowedThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 3) return false
  const text = next[prev!.length + 1]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 2])
}

/** Allow 写盘收口后同一帧 think：过程 remap，旁白续尾，回答只换 diff 槽 */
export function isLiveApprovalAllowedWriteStatThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) {
    return false
  }
  return isLiveAddedThinkPair(next[prev!.length])
}

/** Allow 写盘收口后同一帧首枚 token：过程 remap，回答开散文尾并换 diff 槽 */
export function isLiveApprovalAllowedWriteStatAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) {
    return false
  }
  return isLiveAddedAnswerPair(next[prev!.length])
}

/** Allow 写盘收口后同一帧 think + 首枚 token */
export function isLiveApprovalAllowedWriteStatThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) {
    return false
  }
  return isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedAnswerPair(next[prev!.length + 1])
}

/** Allow 写盘收口后同一帧 think + 下一工具已 complete_call */
export function isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** Allow 写盘收口后同一帧首枚 token + 下一工具已 complete_call */
export function isLiveApprovalAllowedWriteStatAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || !isLiveAddedAnswerPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** Allow 写盘收口后同一帧 think + 首枚 token + 下一工具已 complete_call */
export function isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedAnswerPair(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** Allow 写盘收口后同一帧 ```demo + present_inline_demo */
export function isLiveApprovalAllowedWriteStatAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) {
    return false
  }
  const text = next[prev!.length]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 1])
}

/** Allow 写盘收口后同一帧 think + ```demo + present_inline_demo */
export function isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 3) return false
  const text = next[prev!.length + 1]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 2])
}

/** Deny 收口后同一帧 think：过程 remap，旁白续尾 */
export function isLiveApprovalDeniedThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedThinkPair(next[prev!.length])
}

/** Deny 收口后同一帧首枚 token：过程 remap，回答开散文尾 */
export function isLiveApprovalDeniedAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedAnswerPair(next[prev!.length])
}

/** Deny 收口后同一帧 think + 下一工具已 complete_call */
export function isLiveApprovalDeniedThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

/** Deny 收口后同一帧首枚 token + 下一工具已 complete_call */
export function isLiveApprovalDeniedAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || !isLiveAddedAnswerPair(next[prev!.length])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 1, next)
}

function isLiveUserInputToolRetarget(prev: TurnSegment, next: TurnSegment): boolean {
  if (!sameLiveToolCore(prev, next) || prev.toolName !== REQUEST_USER_INPUT_TOOL) return false
  return (prev.toolTitle ?? '') !== (next.toolTitle ?? '') || (prev.toolDetail ?? '') !== (next.toolDetail ?? '')
}

function isLiveStatusContentHold(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.kind !== 'status' || next.kind !== 'status' || prev.id !== next.id) return false
  return prev.status === 'active' && next.status === 'active'
}

function isLiveAskStatusRetarget(prev: TurnSegment, next: TurnSegment): boolean {
  return isLiveStatusContentHold(prev, next) && next.toolName === REQUEST_USER_INPUT_TOOL
}

function isLiveAddedAskOrAwaitingStatus(segment: TurnSegment | undefined): boolean {
  if (!segment || segment.kind !== 'status' || segment.status !== 'active') return false
  return (
    segment.toolName === REQUEST_USER_INPUT_TOOL || isAwaitingApprovalText(segment.content ?? '')
  )
}

/** Ask User 挂上：工具标题换成 Question requested / header，并新开或改写 status 行 */
export function isLiveUserInputNeededChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || (next.length !== prev.length && next.length !== prev.length + 1)) return false
  let toolRetarget = 0
  let statusRetarget = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveUserInputToolRetarget(before, after)) {
      toolRetarget += 1
      continue
    }
    if (next.length === prev.length && isLiveAskStatusRetarget(before, after)) {
      statusRetarget += 1
      continue
    }
    if (next.length === prev.length && isLiveStatusContentHold(before, after)) {
      statusRetarget += 1
      continue
    }
    return false
  }
  if (next.length === prev.length + 1) {
    if (toolRetarget !== 1) return false
    const added = next[next.length - 1]
    return Boolean(added && added.kind === 'status' && added.status === 'active')
  }
  if (toolRetarget === 1 && statusRetarget === 1) return true
  return toolRetarget === 0 && statusRetarget === 1 && next.some((segment, index) => {
    const before = prev[index]
    return Boolean(before && before !== segment && isLiveAskStatusRetarget(before, segment))
  })
}

/** 同一条 status 从 active 收成 done：只换该行（Ask User / compact / reconnect 收束） */
export function isLiveStatusSettleChange(
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
    if (
      before.kind === 'status' &&
      after.kind === 'status' &&
      before.id === after.id &&
      before.status === 'active' &&
      after.status === 'done'
    ) {
      settled += 1
      continue
    }
    return false
  }
  return settled === 1
}

/** Ask User 作答后同一帧 user_input_resolved + tool_done：Question requested 行与工具一起收成 done（对标 query-loop 连续 yield，不发明 60s 空答 #28969） */
export function isLiveAskResolvedSettleChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || prev.length !== next.length) return false
  let statusSettled = 0
  let toolSettled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (
      before.kind === 'status' &&
      after.kind === 'status' &&
      before.id === after.id &&
      before.status === 'active' &&
      after.status === 'done' &&
      after.toolName === REQUEST_USER_INPUT_TOOL
    ) {
      statusSettled += 1
      continue
    }
    if (isLiveToolSettleChange(before, after) && after.toolName === REQUEST_USER_INPUT_TOOL) {
      toolSettled += 1
      continue
    }
    return false
  }
  return statusSettled === 1 && toolSettled === 1
}

function isLiveAddedResolvedAskStatus(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'status' &&
      segment.status === 'done' &&
      segment.toolName === REQUEST_USER_INPUT_TOOL
  )
}

/** Ask User 作答后同一帧 Stop：问句行标 done，工具标 cancelled（对标 interrupt after request_user_input；不发明 60s 空答，不复制 #10952 Stop 失效） */
export function isLiveAskResolvedCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 2) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  return isLiveAddedResolvedAskStatus(next[prev!.length + 1])
}

/** Ask User 作答后同一帧 think + Stop：问句行标 done，工具与旁白标 cancelled */
export function isLiveAskResolvedThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedCancelledThink(next[prev!.length + 2])
}

function isLiveAskStatusResolve(prev: TurnSegment, next: TurnSegment): boolean {
  return (
    prev.kind === 'status' &&
    next.kind === 'status' &&
    prev.id === next.id &&
    prev.status === 'active' &&
    next.status === 'done' &&
    next.toolName === REQUEST_USER_INPUT_TOOL
  )
}

function hasLiveAskResolvedCancelHangPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let cancelledAsk = 0
  let resolved = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAskStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    if (
      isLiveCancelRetarget(before, after) &&
      after.kind === 'tool' &&
      after.toolName === REQUEST_USER_INPUT_TOOL
    ) {
      cancelledAsk += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveCancelRetarget(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return cancelledAsk === 1 && resolved === 1
}

function isLiveAddedCancelledAnswer(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'text' &&
      segment.status === 'cancelled' &&
      !hasStreamingDemoFence(segment.content ?? '')
  )
}

/** Ask User 作答后同一帧首枚 token + Stop：问句行标 done，工具与散文标 cancelled */
export function isLiveAskResolvedAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 1 &&
    isLiveAddedCancelledAnswer(next[prev!.length])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedCancelledAnswer(next[prev!.length + 2])
}

/** Ask User 作答后同一帧 ```demo + compress：问句行标 done，演示与压缩步追加 */
export function isLiveAskResolvedAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedCompress(next[prev!.length + 2])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && isLiveAddedCompress(next[prev!.length + 4])
}

function hasLiveAskResolvedHangPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  let resolved = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveAskStatusResolve(before, after)) {
      resolved += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after) ||
      sameLiveToolCore(before, after)
    ) {
      continue
    }
    return false
  }
  return resolved === 1
}

/** Ask User 作答后同一帧 think + 首枚 token + Stop */
export function isLiveAskResolvedThinkAnswerCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 2 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedCancelledAnswer(next[prev!.length + 1])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) && isLiveAddedCancelledAnswer(next[prev!.length + 3])
  )
}

/** Ask User 作答后同一帧 think + 错误 + Stop */
export function isLiveAskResolvedThinkErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 2 &&
    isLiveAddedCancelledThink(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedCancelledThink(next[prev!.length + 2]) && isLiveAddedError(next[prev!.length + 3])
  )
}

/** Ask User 作答后同一帧 错误 + Stop */
export function isLiveAskResolvedErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 1 &&
    isLiveAddedError(next[prev!.length])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedError(next[prev!.length + 2])
}

/** Ask User 作答后同一帧 ```demo + Stop */
export function isLiveAskResolvedAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 2 &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedCancelledDemoFencePair(next, prev!.length + 2)
}

/** Ask User 作答后同一帧 think + 错误 + ```demo + Stop */
export function isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 4)
  )
}

/** Ask User 作答后同一帧 think + ```demo + 错误 + Stop */
export function isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[next.length - 1])
  )
}

/** Ask User 作答后同一帧 错误 + ```demo + Stop */
export function isLiveAskResolvedErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) && isLiveAddedCancelledDemoFencePair(next, prev!.length + 3)
  )
}

/** Ask User 作答后同一帧 think + ```demo + 错误 + compress */
export function isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedCompress(next[prev!.length + 4])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** Ask User 作答后同一帧 think + 错误 + ```demo + compress */
export function isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** Ask User 作答后同一帧 think + ```demo + Stop */
export function isLiveAskResolvedThinkAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 3)
  )
}

/** Ask User 作答后同一帧 think + ```demo + compress */
export function isLiveAskResolvedThinkAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** Ask User 作答后同一帧首枚 token + Stop + compress */
export function isLiveAskResolvedAnswerCancelCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 2 &&
    isLiveAddedCancelledAnswer(next[prev!.length]) &&
    isLiveAddedCompress(next[prev!.length + 1])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedCancelledAnswer(next[prev!.length + 2]) && isLiveAddedCompress(next[prev!.length + 3])
  )
}

/** Ask User 作答后同一帧 think + 下一工具 */
export function isLiveAskResolvedThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveAskResolvedHangPrefix(prev, next) && isLiveAddedThinkPair(next[prev!.length])) {
    return isLiveAddedToolsWithOptionalStatus(prev!.length + 1, next)
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
}

/** Ask User 作答后同一帧下一工具 */
export function isLiveAskResolvedToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveAskResolvedHangPrefix(prev, next)) {
    return isLiveAddedToolsWithOptionalStatus(prev!.length, next)
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
}

/** Ask User 作答后同一帧下一工具已 complete_call */
export function isLiveAskResolvedSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveAskResolvedHangPrefix(prev, next)) {
    return isLiveAddedSettledToolsWithOptionalStatus(prev!.length, next)
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

function isLiveAddedAskTool(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'tool' &&
      segment.status === 'active' &&
      segment.toolName === REQUEST_USER_INPUT_TOOL
  )
}

function isLiveAddedAskStatusPair(segment: TurnSegment | undefined): boolean {
  return isLiveAddedStatusPair(segment) && segment!.toolName === REQUEST_USER_INPUT_TOOL
}

function hasLiveAskNeededHead(
  next: readonly TurnSegment[],
  start: number
): boolean {
  return isLiveAddedAskTool(next[start]) && isLiveAddedAskStatusPair(next[start + 1])
}

function hasLiveAskNeededPrefixClose(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveToolAppendPrefixClose(prev, next) && hasLiveAskNeededHead(next, prev!.length)
}

function hasLiveAskNeededWriteStatPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveWriteStatPrefix(prev, next) && hasLiveAskNeededHead(next, prev!.length)
}

function hasLiveAskNeededWriteStatStatusPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  return hasLiveAskNeededHead(next, prev!.length + 1)
}

/** 规划下一步 / 正文后同一帧 Ask User 挂上并立刻 think：过程追加问句与 Question requested，旁白续尾（不发明 TUI Questions n/n） */
export function isLiveAskNeededThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedThinkPair(next[prev!.length + 2])
}

/** Ask User 挂上后同一帧首枚 token：过程追加问句行，回答开散文尾 */
export function isLiveAskNeededAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedAnswerPair(next[prev!.length + 2])
}

/** Ask User 挂上后同一帧 think + 首枚 token */
export function isLiveAskNeededThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return isLiveAddedThinkPair(next[prev!.length + 2]) && isLiveAddedAnswerPair(next[prev!.length + 3])
}

/** Ask User 挂上后同一帧 think + 下一工具已 complete_call */
export function isLiveAskNeededThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 2])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** Ask User 挂上后同一帧首枚 token + 下一工具已 complete_call */
export function isLiveAskNeededAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || !isLiveAddedAnswerPair(next[prev!.length + 2])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** Ask User 挂上后同一帧 ```demo + present_inline_demo */
export function isLiveAskNeededAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  const text = next[prev!.length + 2]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 3])
}

/** Ask User 挂上后同一帧 think + ```demo + present_inline_demo */
export function isLiveAskNeededThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 2])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const text = next[prev!.length + 3]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 4])
}

/** 写盘收束同时 Ask User 挂上并立刻 think：过程 remap 并追加问句行，旁白续尾，回答只换 diff 槽 */
export function isLiveWriteStatAskNeededThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedThinkPair(next[prev!.length + 2])
}

/** 写盘收束同时 Ask User 挂上并立刻首枚 token */
export function isLiveWriteStatAskNeededAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedAnswerPair(next[prev!.length + 2])
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 think */
export function isLiveWriteStatStatusAskNeededThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatStatusPrefix(prev, next) || next.length !== prev!.length + 4) {
    return false
  }
  return isLiveAddedThinkPair(next[prev!.length + 3])
}

/** Ask User 挂上后同一帧 think + 首枚 token + 下一工具已 complete_call */
export function isLiveAskNeededThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 2])) {
    return false
  }
  if (!isLiveAddedAnswerPair(next[prev!.length + 3])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

function hasLiveAskNeededStatusPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  return hasLiveAskNeededHead(next, prev!.length + 1)
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 think */
export function isLiveStatusAskNeededThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || next.length !== prev!.length + 4) return false
  return isLiveAddedThinkPair(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻首枚 token */
export function isLiveStatusAskNeededAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || next.length !== prev!.length + 4) return false
  return isLiveAddedAnswerPair(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 think + 首枚 token */
export function isLiveStatusAskNeededThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) && isLiveAddedAnswerPair(next[prev!.length + 4])
  )
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 ```demo + present_inline_demo */
export function isLiveStatusAskNeededAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || next.length !== prev!.length + 5) return false
  const text = next[prev!.length + 3]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 4])
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 think + ```demo + present_inline_demo */
export function isLiveStatusAskNeededThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 3])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  const text = next[prev!.length + 4]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 5])
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 think + 下一工具已 complete_call */
export function isLiveStatusAskNeededThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 3])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻首枚 token + 下一工具已 complete_call */
export function isLiveStatusAskNeededAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || !isLiveAddedAnswerPair(next[prev!.length + 3])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时 Ask User 挂上并立刻 think + 首枚 token */
export function isLiveWriteStatAskNeededThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) && isLiveAddedAnswerPair(next[prev!.length + 3])
  )
}

/** 写盘收束同时 Ask User 挂上并立刻 think + 下一工具已 complete_call */
export function isLiveWriteStatAskNeededThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 2])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 写盘收束同时 Ask User 挂上并立刻首枚 token + 下一工具已 complete_call */
export function isLiveWriteStatAskNeededAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || !isLiveAddedAnswerPair(next[prev!.length + 2])) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** 写盘收束同时 Ask User 挂上并立刻 ```demo + present_inline_demo */
export function isLiveWriteStatAskNeededAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || next.length !== prev!.length + 4) return false
  const text = next[prev!.length + 2]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 3])
}

/** 写盘收束同时 Ask User 挂上并立刻 think + ```demo + present_inline_demo */
export function isLiveWriteStatAskNeededThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 2])) {
    return false
  }
  if (next.length !== prev!.length + 5) return false
  const text = next[prev!.length + 3]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 4])
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻首枚 token */
export function isLiveWriteStatStatusAskNeededAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatStatusPrefix(prev, next) || next.length !== prev!.length + 4) {
    return false
  }
  return isLiveAddedAnswerPair(next[prev!.length + 3])
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 think + 首枚 token */
export function isLiveWriteStatStatusAskNeededThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatStatusPrefix(prev, next) || next.length !== prev!.length + 5) {
    return false
  }
  return (
    isLiveAddedThinkPair(next[prev!.length + 3]) && isLiveAddedAnswerPair(next[prev!.length + 4])
  )
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 ```demo + present_inline_demo */
export function isLiveWriteStatStatusAskNeededAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatStatusPrefix(prev, next) || next.length !== prev!.length + 5) {
    return false
  }
  const text = next[prev!.length + 3]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 4])
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 think + 下一工具已 complete_call */
export function isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    !hasLiveAskNeededWriteStatStatusPrefix(prev, next) ||
    !isLiveAddedThinkPair(next[prev!.length + 3])
  ) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时 Ask User 挂上并立刻 think + 首枚 token + 下一工具已 complete_call */
export function isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length + 2])) {
    return false
  }
  if (!isLiveAddedAnswerPair(next[prev!.length + 3])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 think + ```demo + present_inline_demo */
export function isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    !hasLiveAskNeededWriteStatStatusPrefix(prev, next) ||
    !isLiveAddedThinkPair(next[prev!.length + 3])
  ) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  const text = next[prev!.length + 4]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[prev!.length + 5])
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻首枚 token + 下一工具已 complete_call */
export function isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    !hasLiveAskNeededWriteStatStatusPrefix(prev, next) ||
    !isLiveAddedAnswerPair(next[prev!.length + 3])
  ) {
    return false
  }
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 think + 首枚 token + 下一工具已 complete_call */
export function isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    !hasLiveAskNeededWriteStatStatusPrefix(prev, next) ||
    !isLiveAddedThinkPair(next[prev!.length + 3])
  ) {
    return false
  }
  if (!isLiveAddedAnswerPair(next[prev!.length + 4])) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

function isLiveAddedCancelledAskTool(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'tool' &&
      segment.status === 'cancelled' &&
      segment.toolName === REQUEST_USER_INPUT_TOOL
  )
}

function isLiveAddedCancelledAskStatus(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'status' &&
      segment.status === 'cancelled' &&
      segment.toolName === REQUEST_USER_INPUT_TOOL
  )
}

function hasLiveAskNeededCancelledHead(
  next: readonly TurnSegment[],
  start: number
): boolean {
  return isLiveAddedCancelledAskTool(next[start]) && isLiveAddedCancelledAskStatus(next[start + 1])
}

/** Ask User 挂上后同一帧 context_compress：过程追加问句行与压缩步 */
export function isLiveAskNeededCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedCompress(next[prev!.length + 2])
}

/** 写盘收束同时 Ask User 挂上并立刻 compress */
export function isLiveWriteStatAskNeededCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedCompress(next[prev!.length + 2])
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 compress */
export function isLiveWriteStatStatusAskNeededCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededWriteStatStatusPrefix(prev, next) || next.length !== prev!.length + 4) {
    return false
  }
  return isLiveAddedCompress(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 compress */
export function isLiveStatusAskNeededCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveAskNeededStatusPrefix(prev, next) || next.length !== prev!.length + 4) return false
  return isLiveAddedCompress(next[prev!.length + 3])
}

/** Ask User 挂上后同一帧 Stop：问句行与工具标 cancelled */
export function isLiveAskNeededCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 2) return false
  return hasLiveAskNeededCancelledHead(next, prev!.length)
}

/** Ask User 挂上后同一帧 think + Stop：问句行 cancelled，思考不进过程 */
export function isLiveAskNeededThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  if (!hasLiveAskNeededCancelledHead(next, prev!.length)) return false
  return isLiveAddedCancelledThink(next[prev!.length + 2])
}

/** 写盘收束同时 Ask User 挂上并立刻 Stop */
export function isLiveWriteStatAskNeededCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return hasLiveAskNeededCancelledHead(next, prev!.length)
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 Stop */
export function isLiveWriteStatStatusAskNeededCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (next.length !== prev!.length + 3) return false
  return hasLiveAskNeededCancelledHead(next, prev!.length + 1)
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 Stop */
export function isLiveStatusAskNeededCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 3) return false
  return hasLiveAskNeededCancelledHead(next, prev!.length + 1)
}

/** 写盘收束同时 Ask User 挂上并立刻 think + Stop */
export function isLiveWriteStatAskNeededThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  if (!hasLiveAskNeededCancelledHead(next, prev!.length)) return false
  return isLiveAddedCancelledThink(next[prev!.length + 2])
}

/** 写盘收束同时 规划下一步 + Ask User 挂上并立刻 think + Stop */
export function isLiveWriteStatStatusAskNeededThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (next.length !== prev!.length + 4) return false
  if (!hasLiveAskNeededCancelledHead(next, prev!.length + 1)) return false
  return isLiveAddedCancelledThink(next[prev!.length + 3])
}

/** 规划下一步 / Reconnecting 后同一帧 Ask User 挂上并立刻 think + Stop */
export function isLiveStatusAskNeededThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 4) return false
  if (!hasLiveAskNeededCancelledHead(next, prev!.length + 1)) return false
  return isLiveAddedCancelledThink(next[prev!.length + 3])
}

function isLiveCancelRetarget(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.id !== next.id || prev.kind !== next.kind) return false
  if (next.status !== 'cancelled') return false
  if (prev.status === 'active') {
    if (prev.kind !== 'tool') return (prev.content ?? '') === (next.content ?? '')
    return (
      prev.toolName === next.toolName &&
      prev.toolArgs === next.toolArgs &&
      prev.fileDiff === next.fileDiff &&
      prev.fileDiffs === next.fileDiffs &&
      prev.editPreview === next.editPreview
    )
  }
  return prev.kind === 'tool' && prev.status === 'error' && prev.toolName === next.toolName
}

/** Stop：多条 active 收成 cancelled，只换这些过程步（对标 Codex You stopped after / preserved streamed activity，不复制 Stop 失败卡住） */
export function isLiveCancelChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || prev.length !== next.length) return false
  let cancelled = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!isLiveCancelRetarget(before, after)) return false
    cancelled += 1
  }
  return cancelled >= 1
}

function isLiveAddedCancelledStatus(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && segment.kind === 'status' && segment.status === 'cancelled')
}

function isLiveAddedCancelledThink(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && segment.kind === 'thinking' && segment.status === 'cancelled')
}

function hasLiveCancelPrefixClose(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length < prev.length) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (
      isLivePrefixClose(before, after) ||
      isLiveCancelRetarget(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return true
}

function hasLiveWriteStatCancelPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length <= prev.length) return false
  let writeStats = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveToolWriteStatChange(before, after)) {
      writeStats += 1
      continue
    }
    if (
      isLivePrefixClose(before, after) ||
      isLiveCancelRetarget(before, after) ||
      isLiveTextGrowClose(before, after) ||
      isLiveThinkGrowClose(before, after)
    ) {
      continue
    }
    return false
  }
  return writeStats === 1
}

/** 规划下一步后同一帧 Stop：status 可先挂上再标 cancelled，只追加该行 */
export function isLiveStatusCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedCancelledStatus(next[next.length - 1])
}

/** 规划下一步已在场时 think 后 Stop：旁白可先挂上再标 cancelled，思考不进过程 */
export function isLiveThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedCancelledThink(next[next.length - 1])
}

/** 规划下一步 + think + Stop 同一帧：过程追加 cancelled status，思考不进过程 */
export function isLiveStatusThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedCancelledStatus(next[prev!.length]) &&
    isLiveAddedCancelledThink(next[prev!.length + 1])
  )
}

/** 写盘收束同时新开 cancelled status：过程 remap 并追加该行，回答只换 diff 槽 */
export function isLiveWriteStatStatusCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatCancelPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedCancelledStatus(next[next.length - 1])
}

/** 写盘收束同时新开 cancelled 思考：过程 remap，旁白续尾 */
export function isLiveWriteStatThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatCancelPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedCancelledThink(next[next.length - 1])
}

/** 写盘收束同时新开 cancelled status + 思考：过程 remap 并追加 status */
export function isLiveWriteStatStatusThinkCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatCancelPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedCancelledStatus(next[prev!.length]) &&
    isLiveAddedCancelledThink(next[prev!.length + 1])
  )
}

function isLiveErrorAnswer(segment: TurnSegment): boolean {
  return segment.kind === 'text' && (segment.content ?? '').includes('**错误**:')
}

/** 错误：收口 status/think/无新写盘的工具后追加错误正文，或就地封回答尾（对标 Codex 直播错误仍留已画过程；写盘 +/- 仍走 write-stat） */
export function isLiveErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev) return false
  if (next.length === prev.length + 1) {
    const added = next[next.length - 1]
    if (!added || !isLiveErrorAnswer(added) || added.status !== 'done') return false
    for (let i = 0; i < prev.length; i++) {
      const before = prev[i]
      const after = next[i]
      if (!before || !after) return false
      if (before === after) continue
      if (!isLiveThinkAnswerPrefixClose(before, after)) return false
    }
    return true
  }
  if (next.length !== prev.length) return false
  const last = next.length - 1
  for (let i = 0; i < last; i++) {
    if (prev[i] !== next[i]) return false
  }
  const from = prev[last]
  const to = next[last]
  if (!from || !to || from === to || from.id !== to.id) return false
  if (from.kind !== 'text' || to.kind !== 'text') return false
  if (from.status !== 'active' || to.status !== 'done') return false
  return isLiveErrorAnswer(to) && (to.content ?? '').startsWith(from.content ?? '')
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

/** 前缀没变或只收束思考/status/散文/无新写盘的工具、末尾新开演示：过程不追加、回答只开演示槽 */
export function isLiveDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 1) return false
  const added = next[next.length - 1]
  if (
    !added ||
    added.kind !== 'tool' ||
    added.status !== 'active' ||
    added.toolName !== 'present_inline_demo'
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

function isLiveDemoSegment(segment: TurnSegment): boolean {
  return segment.kind === 'tool' && segment.toolName === 'present_inline_demo'
}

/** 同一演示只改 HTML / 说明 / 收束：只换该槽，不重拆过程 / buildAnswerParts */
export function isLiveDemoHtmlChange(prev: TurnSegment, next: TurnSegment): boolean {
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

/** 同一帧里多条只读工具收束且没新写盘：只换这些步（对标 Codex 并行 complete_call / Promise.all tool_done，不发明 Exploring 分组格） */
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

function isLiveToolStatusHoldOrSettle(prev: TurnSegment, next: TurnSegment): boolean {
  if (prev.status === next.status) return true
  if (prev.status !== 'active') return false
  return next.status === 'done' || next.status === 'error' || next.status === 'cancelled'
}

/** 同一工具只改写盘 +/- / 参数，或收束时带上核实 diff：就地换该步；回答只换该工具的 diff 槽（对标 Codex Edited 格 / ~0.5s，不复制 #38695） */
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

function hasLiveWriteStatPrefix(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length <= prev.length) return false
  let writeStats = 0
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (isLiveToolWriteStatChange(before, after)) {
      writeStats += 1
      continue
    }
    if (!isLivePrefixClose(before, after)) return false
  }
  return writeStats === 1
}

/** 一条写盘 +/- 收束，同时末尾新开一或多个工具，可带一条 Awaiting / Question requested 行：过程 remap + 追加，回答只换 diff 槽（对标 Codex ~0.5s / add_call / Awaiting approval，不复制 #38695） */
export function isLiveToolWriteStatAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  return hasLiveWriteStatPrefix(prev, next) && isLiveAddedToolsWithOptionalStatus(prev!.length, next)
}

/** 写盘收束同时新开 status + 工具：过程 remap 并追加这些步，回答只换 diff 槽 */
export function isLiveWriteStatStatusToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 写盘收束同时新开思考 + 工具：过程 remap 并追加工具，旁白续尾，回答只换 diff 槽 */
export function isLiveWriteStatThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 1, next)
}

/** 写盘收束同时新开 status + 思考 + 工具：过程 remap 并追加 status 与工具，旁白续尾 */
export function isLiveWriteStatStatusThinkToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
}

/** 写盘收束同时新开 status：过程 remap + 追加，回答只换 diff 槽（对标 规划下一步 / Reconnecting... n/5） */
export function isLiveWriteStatStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) return false
  const added = next[next.length - 1]
  return Boolean(added && added.kind === 'status' && added.status === 'active')
}

/** 写盘收束同时新开思考：过程 remap，旁白续尾，回答只换 diff 槽（不复制 #24850） */
export function isLiveWriteStatThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) return false
  const added = next[next.length - 1]
  return Boolean(added && added.kind === 'thinking' && added.status === 'active')
}

/** 写盘收束同时新开散文：过程 remap，回答开尾并重拆（对标 ~0.5s / 工具后首枚 token） */
export function isLiveWriteStatAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) return false
  const added = next[next.length - 1]
  if (!added || !isLiveAnswerText(added) || added.status === 'done') return false
  return !hasStreamingDemoFence(added.content ?? '')
}

/** 写盘收束同时新开 ```demo：过程 remap，回答开演示槽并重拆 */
export function isLiveWriteStatDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) return false
  const added = next[next.length - 1]
  if (!added || !isLiveAnswerText(added) || added.status === 'done') return false
  return hasStreamingDemoFence(added.content ?? '')
}

function isLiveAddedCompress(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && segment.kind === 'tool' && segment.toolName === COMPRESS_TOOL)
}

/** 写盘收束同时新开已完成 compress：过程 remap + 追加，回答只换 diff 槽（对标 contextCompaction 紧跟 Edited） */
export function isLiveWriteStatCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedCompress(next[next.length - 1])
}

/** 规划下一步后同一帧 compress：status 可先标 done，过程追加该行与压缩步 */
export function isLiveStatusCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  return next.length === prev!.length + 2 && isLiveAddedCompress(next[next.length - 1])
}

/** 规划下一步已在场时 think 后 compress：旁白可仍在，过程追加工具、思考不进过程 */
export function isLiveThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return next.length === prev!.length + 2 && isLiveAddedCompress(next[next.length - 1])
}

/** 规划下一步 + think + compress 同一帧：过程追加 status 与压缩步 */
export function isLiveStatusThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return next.length === prev!.length + 3 && isLiveAddedCompress(next[next.length - 1])
}

/** 写盘收束同时新开 status + compress：过程 remap 并追加这两步，回答只换 diff 槽 */
export function isLiveWriteStatStatusCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  return next.length === prev!.length + 2 && isLiveAddedCompress(next[next.length - 1])
}

/** 写盘收束同时新开思考 + compress：过程 remap 并追加压缩步，旁白续尾 */
export function isLiveWriteStatThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) return false
  return next.length === prev!.length + 2 && isLiveAddedCompress(next[next.length - 1])
}

/** 写盘收束同时新开 status + 思考 + compress：过程 remap 并追加 status 与压缩步 */
export function isLiveWriteStatStatusThinkCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return next.length === prev!.length + 3 && isLiveAddedCompress(next[next.length - 1])
}

function isLiveAddedError(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && isLiveErrorAnswer(segment) && segment.status === 'done')
}

/** 写盘收束同时新开错误正文：过程 remap，错误只进回答（不复制 Stop / 错误卡住） */
export function isLiveWriteStatErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedError(next[next.length - 1])
}

/** 规划下一步后同一帧错误：status 可先标 done，过程追加该行，错误只进回答 */
export function isLiveStatusErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  return next.length === prev!.length + 2 && isLiveAddedError(next[next.length - 1])
}

/** 规划下一步已在场时 think 后错误：旁白可仍在，错误只进回答 */
export function isLiveThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return next.length === prev!.length + 2 && isLiveAddedError(next[next.length - 1])
}

/** 规划下一步 + think + 错误同一帧：过程追加 status，思考不进过程，错误只进回答 */
export function isLiveStatusThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return next.length === prev!.length + 3 && isLiveAddedError(next[next.length - 1])
}

/** 写盘收束同时新开 status + 错误：过程 remap 并追加 status，错误只进回答 */
export function isLiveWriteStatStatusErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  return next.length === prev!.length + 2 && isLiveAddedError(next[next.length - 1])
}

/** 写盘收束同时新开思考 + 错误：过程 remap，旁白续尾，错误只进回答 */
export function isLiveWriteStatThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) return false
  return next.length === prev!.length + 2 && isLiveAddedError(next[next.length - 1])
}

/** 写盘收束同时新开 status + 思考 + 错误：过程 remap 并追加 status */
export function isLiveWriteStatStatusThinkErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return next.length === prev!.length + 3 && isLiveAddedError(next[next.length - 1])
}

function isLiveAddedDemoFencePair(next: readonly TurnSegment[], start: number): boolean {
  const text = next[start]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  return isLiveAddedInlineDemo(next[start + 1])
}

function isLiveAddedCancelledDemoFencePair(next: readonly TurnSegment[], start: number): boolean {
  const text = next[start]
  if (
    !text ||
    text.kind !== 'text' ||
    text.status !== 'cancelled' ||
    !hasStreamingDemoFence(text.content ?? '')
  ) {
    return false
  }
  const demo = next[start + 1]
  return Boolean(
    demo &&
      demo.kind === 'tool' &&
      demo.status === 'cancelled' &&
      demo.toolName === 'present_inline_demo'
  )
}

function isLiveAddedInlineDemo(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'tool' &&
      segment.status === 'active' &&
      segment.toolName === 'present_inline_demo'
  )
}

/** 写盘收束同时新开 present_inline_demo：过程 remap 不开演示步，回答开槽并重拆 */
export function isLiveWriteStatDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 1) return false
  return isLiveAddedInlineDemo(next[next.length - 1])
}

/** 规划下一步后同一帧 present_inline_demo：status 可先标 done，过程追加该行、回答开演示槽 */
export function isLiveStatusDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  return next.length === prev!.length + 2 && isLiveAddedInlineDemo(next[next.length - 1])
}

/** 规划下一步已在场时 think 后 present_inline_demo：旁白可先标 done，已画散文也可被收口 */
export function isLiveThinkDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) {
    return false
  }
  return next.length === prev!.length + 2 && isLiveAddedInlineDemo(next[next.length - 1])
}

/** 规划下一步 + think + present_inline_demo 同一帧：过程追加 status，思考不进过程 */
export function isLiveStatusThinkDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return next.length === prev!.length + 3 && isLiveAddedInlineDemo(next[next.length - 1])
}

/** 写盘收束同时新开 status + present_inline_demo：过程 remap 并追加 status，回答开演示槽 */
export function isLiveWriteStatStatusDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  return next.length === prev!.length + 2 && isLiveAddedInlineDemo(next[next.length - 1])
}

/** 写盘收束同时新开思考 + present_inline_demo：过程 remap 不追加演示步，旁白续尾 */
export function isLiveWriteStatThinkDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedThinkPair(next[prev!.length])) return false
  return next.length === prev!.length + 2 && isLiveAddedInlineDemo(next[next.length - 1])
}

/** 写盘收束同时新开 status + 思考 + present_inline_demo：过程 remap 并追加 status */
export function isLiveWriteStatStatusThinkDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 1])) return false
  return next.length === prev!.length + 3 && isLiveAddedInlineDemo(next[next.length - 1])
}

function isLiveAddedActiveStatus(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && segment.kind === 'status' && segment.status === 'active')
}

/** 无思考时首枚 token 会先把规划下一步标 done 再开散文 / ```demo */
function isLiveAddedStatusPair(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'status' &&
      (segment.status === 'active' || segment.status === 'done')
  )
}

function isLiveAddedActiveThink(segment: TurnSegment | undefined): boolean {
  return Boolean(segment && segment.kind === 'thinking' && segment.status === 'active')
}

/** 同一 16ms 里 think 后首枚 token 会先把旁白标 done 再开散文 */
function isLiveAddedThinkPair(segment: TurnSegment | undefined): boolean {
  return Boolean(
    segment &&
      segment.kind === 'thinking' &&
      (segment.status === 'active' || segment.status === 'done')
  )
}

function isLiveAddedActiveAnswer(segment: TurnSegment | undefined): boolean {
  if (!segment || !isLiveAnswerText(segment) || segment.status === 'done') return false
  return !hasStreamingDemoFence(segment.content ?? '')
}

function isLiveAddedDemoFence(segment: TurnSegment | undefined): boolean {
  if (!segment || !isLiveAnswerText(segment) || segment.status === 'done') return false
  return hasStreamingDemoFence(segment.content ?? '')
}

function hasLivePrefixClose(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[],
  close: (before: TurnSegment, after: TurnSegment) => boolean
): boolean {
  if (!prev || next.length < prev.length) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after) return false
    if (before === after) continue
    if (!close(before, after)) return false
  }
  return true
}

/** 无新写盘收束同时新开 status + 思考：过程 remap 并追加 status，旁白续尾（对标 规划下一步后首枚 think） */
export function isLiveStatusThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLivePrefixClose(prev, next, isLivePrefixClose) || next.length !== prev!.length + 2) {
    return false
  }
  return (
    isLiveAddedActiveStatus(next[prev!.length]) && isLiveAddedActiveThink(next[prev!.length + 1])
  )
}

/** 规划下一步已在场时 think 后 Question requested / Awaiting：旁白续尾，追加 status（对标 Ask User / Awaiting approval，不发明 TUI Questions n/n） */
export function isLiveThinkStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedAskOrAwaitingStatus(next[prev!.length + 1])
  )
}

/** 规划下一步 + think + Ask User / Awaiting 同一帧：过程 remap 并追加两条 status，思考不进过程 */
export function isLiveStatusThinkStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return (
    isLiveAddedStatusPair(next[prev!.length]) &&
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedAskOrAwaitingStatus(next[prev!.length + 2])
  )
}

/** 写盘收束同时新开思考 + Question requested / Awaiting：过程 remap 并追加 status，旁白续尾，回答只换 diff 槽 */
export function isLiveWriteStatThinkStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedAskOrAwaitingStatus(next[prev!.length + 1])
  )
}

/** 写盘收束同时新开 status + 思考 + Ask User / Awaiting：过程 remap 并追加两条 status，旁白续尾 */
export function isLiveWriteStatStatusThinkStatusAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return (
    isLiveAddedStatusPair(next[prev!.length]) &&
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedAskOrAwaitingStatus(next[prev!.length + 2])
  )
}

/** 无新写盘收束同时新开思考 + 散文：过程 remap，旁白续尾，回答开尾 */
export function isLiveThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    !hasLivePrefixClose(prev, next, isLiveThinkAnswerPrefixClose) ||
    next.length !== prev!.length + 2
  ) {
    return false
  }
  return (
    isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedActiveAnswer(next[prev!.length + 1])
  )
}

/** 无新写盘收束同时新开 status + 思考 + 散文：过程 remap 并追加 status，旁白续尾，回答开尾 */
export function isLiveStatusThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLivePrefixClose(prev, next, isLivePrefixClose) || next.length !== prev!.length + 3) {
    return false
  }
  return (
    isLiveAddedActiveStatus(next[prev!.length]) &&
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedActiveAnswer(next[prev!.length + 2])
  )
}

/** 无新写盘收束同时新开思考 + ```demo：过程 remap，旁白续尾，回答开演示槽 */
export function isLiveThinkDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    !hasLivePrefixClose(prev, next, isLiveThinkAnswerPrefixClose) ||
    next.length !== prev!.length + 2
  ) {
    return false
  }
  return isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedDemoFence(next[prev!.length + 1])
}

/** 无新写盘收束同时新开 status + ```demo：过程 remap 并追加 status，回答开演示槽 */
export function isLiveStatusDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLivePrefixClose(prev, next, isLivePrefixClose) || next.length !== prev!.length + 2) {
    return false
  }
  return (
    isLiveAddedStatusPair(next[prev!.length]) && isLiveAddedDemoFence(next[prev!.length + 1])
  )
}

/** 无新写盘收束同时新开 status + 思考 + ```demo：过程 remap 并追加 status，旁白续尾，回答开演示槽 */
export function isLiveStatusThinkDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLivePrefixClose(prev, next, isLivePrefixClose) || next.length !== prev!.length + 3) {
    return false
  }
  return (
    isLiveAddedActiveStatus(next[prev!.length]) &&
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedDemoFence(next[prev!.length + 2])
  )
}

/** 无新写盘收束同时新开 status + 散文：过程 remap 并追加 status，回答开尾 */
export function isLiveStatusAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLivePrefixClose(prev, next, isLivePrefixClose) || next.length !== prev!.length + 2) {
    return false
  }
  return (
    isLiveAddedStatusPair(next[prev!.length]) && isLiveAddedActiveAnswer(next[prev!.length + 1])
  )
}

/** 写盘收束同时新开 status + 思考：过程 remap 并追加 status，旁白续尾，回答只换 diff 槽（对标 规划下一步后首枚 think） */
export function isLiveWriteStatStatusThinkAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedActiveStatus(next[prev!.length]) && isLiveAddedActiveThink(next[prev!.length + 1])
  )
}

/** 写盘收束同时新开思考 + 散文：过程 remap，旁白续尾，回答开尾并只换 diff 槽 */
export function isLiveWriteStatThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedActiveAnswer(next[prev!.length + 1])
  )
}

/** 写盘收束同时新开 status + 思考 + 散文：过程 remap 并追加 status，旁白续尾，回答开尾并只换 diff 槽 */
export function isLiveWriteStatStatusThinkAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return (
    isLiveAddedActiveStatus(next[prev!.length]) &&
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedActiveAnswer(next[prev!.length + 2])
  )
}

/** 写盘收束同时新开思考 + ```demo：过程 remap，旁白续尾，回答开演示槽并只换 diff 槽 */
export function isLiveWriteStatThinkDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return isLiveAddedThinkPair(next[prev!.length]) && isLiveAddedDemoFence(next[prev!.length + 1])
}

/** 写盘收束同时新开 status + ```demo：过程 remap 并追加 status，回答开演示槽并只换 diff 槽 */
export function isLiveWriteStatStatusDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedStatusPair(next[prev!.length]) && isLiveAddedDemoFence(next[prev!.length + 1])
  )
}

/** 写盘收束同时新开 status + 思考 + ```demo：过程 remap 并追加 status，旁白续尾，回答开演示槽并只换 diff 槽 */
export function isLiveWriteStatStatusThinkDemoFenceAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return (
    isLiveAddedActiveStatus(next[prev!.length]) &&
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedDemoFence(next[prev!.length + 2])
  )
}

/** 写盘收束同时新开 status + 散文：过程 remap 并追加 status，回答开尾并只换 diff 槽 */
export function isLiveWriteStatStatusAnswerAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 2) return false
  return (
    isLiveAddedStatusPair(next[prev!.length]) && isLiveAddedActiveAnswer(next[prev!.length + 1])
  )
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
  if (isLiveSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveThinkAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusThinkAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatThinkAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusThinkAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveToolWriteStatAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveThinkStatusAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusThinkStatusAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatThinkStatusAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusThinkStatusAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAppendChange(prevSegments, segments)) return 'status'
  if (isLiveWriteStatStatusThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveWriteStatStatusAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveWriteStatThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveThinkDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusThinkDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatThinkDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusThinkDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveThinkDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusThinkDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatThinkDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusThinkDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveCancelChange(prevSegments, segments)) {
    return segments.some((segment, index) => {
      const before = prevSegments[index]
      return Boolean(before && before !== segment && segment.kind === 'text')
    })
      ? 'text'
      : 'tool'
  }
  if (
    isLiveStatusCancelAppendChange(prevSegments, segments) ||
    isLiveThinkCancelAppendChange(prevSegments, segments) ||
    isLiveStatusThinkCancelAppendChange(prevSegments, segments)
  ) {
    return segments.some((segment, index) => {
      const before = prevSegments[index]
      return Boolean(before && before !== segment && segment.kind === 'text')
    })
      ? 'text'
      : 'tool'
  }
  if (isLiveWriteStatStatusCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusAppendChange(prevSegments, segments)) return 'status'
  if (isLiveThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveDemoFenceAppendChange(prevSegments, segments)) return 'text'
  if (findLiveDemoFenceChange(prevSegments, segments)) return 'text'
  if (isLiveDemoAppendChange(prevSegments, segments)) return 'tool'
  if (findLiveDemoHtmlChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveApprovalNeededAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalNeededCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalNeededAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedCancelChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedSettleChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedStatusAppendChange(prevSegments, segments)) return 'status'
  if (isLiveApprovalDeniedToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveApprovalDeniedThinkAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedThinkAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedThinkAnswerCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalDeniedThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedWriteStatChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedWriteStatStatusAppendChange(prevSegments, segments)) return 'status'
  if (isLiveApprovalAllowedWriteStatToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedWriteStatThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveApprovalAllowedWriteStatAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedWriteStatThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedWriteStatAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveApprovalAllowedWriteStatAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalResolvedThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedSettleCancelChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedSettleAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedSettleErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedSettleThinkErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedSettleAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedCancelChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorCancelAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorCompressAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerCancelAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments)) {
    return 'tool'
  }
  if (isLiveWriteStatStatusApprovalResolvedToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedErrorCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatApprovalResolvedThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedThinkErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedErrorCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedErrorAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusApprovalResolvedThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedStatusAppendChange(prevSegments, segments)) return 'status'
  if (isLiveApprovalAllowedToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveApprovalAllowedAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedThinkAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveApprovalAllowedAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedChange(prevSegments, segments)) return 'tool'
  if (isLiveUserInputNeededChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedSettleChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerCancelCompressAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskResolvedAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskResolvedThinkAnswerCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskResolvedErrorCancelAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskResolvedAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskNeededThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveAskNeededAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskNeededThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskNeededThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskNeededAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveAskNeededAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskNeededThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAskNeededThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveWriteStatAskNeededAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatAskNeededThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatAskNeededThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAskNeededAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatAskNeededAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAskNeededThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAskNeededThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveWriteStatStatusAskNeededAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusAskNeededThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusAskNeededAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusAskNeededThinkAppendChange(prevSegments, segments)) return 'think'
  if (isLiveStatusAskNeededAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusAskNeededThinkAnswerAppendChange(prevSegments, segments)) return 'text'
  if (isLiveStatusAskNeededAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusAskNeededThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusAskNeededThinkSettledToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusAskNeededAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange(prevSegments, segments)) return 'text'
  if (isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
    return 'text'
  }
  if (isLiveAskNeededCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAskNeededCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAskNeededCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusAskNeededCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskNeededCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskNeededThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAskNeededCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAskNeededCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusAskNeededCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatAskNeededThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusAskNeededThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusAskNeededThinkCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusSettleChange(prevSegments, segments)) return 'status'
  if (findLiveToolInPlaceChange(prevSegments, segments)) return 'tool'
  if (isLiveMultiToolSettleChange(prevSegments, segments)) return 'tool'
  if (findLiveToolWriteStatChange(prevSegments, segments)) return 'tool'
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
  if (
    isLiveThinkAppendChange(prevSegments, segments) ||
    isLiveWriteStatThinkAppendChange(prevSegments, segments) ||
    isLiveStatusThinkAppendChange(prevSegments, segments) ||
    isLiveWriteStatStatusThinkAppendChange(prevSegments, segments)
  ) {
    return prev + (segments[segments.length - 1]?.content ?? '')
  }
  if (
    prevSegments &&
    (isLiveApprovalResolvedThinkAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorCancelAppendChange(prevSegments, segments))
  ) {
    const think = segments
      .slice(prevSegments.length)
      .find((segment) => segment.kind === 'thinking')
    return prev + (think?.content ?? '')
  }
  if (
    prevSegments &&
    (isLiveThinkToolAppendChange(prevSegments, segments) ||
      isLiveThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedThinkAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkToolAppendChange(prevSegments, segments) ||
      isLiveThinkStatusAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkStatusAppendChange(prevSegments, segments))
  ) {
    return prev + (segments[prevSegments.length]?.content ?? '')
  }
  if (
    prevSegments &&
    (isLiveWriteStatThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkDemoFenceAppendChange(prevSegments, segments) ||
      isLiveThinkDemoFenceAppendChange(prevSegments, segments) ||
      isLiveThinkDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkDemoAppendChange(prevSegments, segments) ||
      isLiveThinkErrorAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkErrorAppendChange(prevSegments, segments) ||
      isLiveThinkCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkCompressAppendChange(prevSegments, segments) ||
      isLiveThinkCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatThinkCancelAppendChange(prevSegments, segments))
  ) {
    return prev + (segments[prevSegments.length]?.content ?? '')
  }
  if (
    prevSegments &&
    (isLiveStatusThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusThinkDemoFenceAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkDemoFenceAppendChange(prevSegments, segments) ||
      isLiveStatusThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveStatusThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusThinkDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkDemoAppendChange(prevSegments, segments) ||
      isLiveStatusThinkErrorAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkErrorAppendChange(prevSegments, segments) ||
      isLiveStatusThinkCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkCompressAppendChange(prevSegments, segments) ||
      isLiveStatusThinkCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusThinkStatusAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusThinkStatusAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkCompressAppendChange(prevSegments, segments))
  ) {
    return prev + (segments[prevSegments.length + 1]?.content ?? '')
  }
  if (
    prevSegments &&
    (isLiveAskNeededThinkAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatAskNeededThinkAppendChange(prevSegments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveWriteStatAskNeededThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatAskNeededThinkCancelAppendChange(prevSegments, segments))
  ) {
    return prev + (segments[prevSegments.length + 2]?.content ?? '')
  }
  if (
    prevSegments &&
    (isLiveWriteStatStatusAskNeededThinkAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusAskNeededThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkCancelAppendChange(prevSegments, segments))
  ) {
    return prev + (segments[prevSegments.length + 3]?.content ?? '')
  }
  if (prevSegments && shouldSkipLiveStreamDerivation(prevSegments, segments)) {
    return nextLiveThinkTextOnPrefixChange(prev, prevSegments, segments)
  }
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

function nextLiveThinkTextOnPrefixChange(
  prev: string,
  prevSegments: readonly TurnSegment[],
  segments: readonly TurnSegment[]
): string {
  let next = prev
  const n = Math.min(prevSegments.length, segments.length)
  for (let i = 0; i < n; i++) {
    const before = prevSegments[i]
    const after = segments[i]
    if (!before || !after || before === after) continue
    if (!isLiveThinking(before) || !isLiveThinking(after) || before.id !== after.id) continue
    const prevContent = before.content ?? ''
    const nextContent = after.content ?? ''
    if (nextContent === prevContent) continue
    if (nextContent.startsWith(prevContent) && (next === prevContent || next.endsWith(prevContent))) {
      next += nextContent.slice(prevContent.length)
      continue
    }
    return liveThinkingText(segments)
  }
  return next
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
  return (
    findLiveToolRetargetChange(input.prevSegments, input.segments) !== null ||
    isLiveMultiToolSettleChange(input.prevSegments, input.segments)
  )
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

function liveDemoProcessFlags(
  prev: LiveProcessView,
  demo: TurnSegment
): Pick<LiveProcessView, 'generatingDemo' | 'contentStreaming' | 'answerStreaming'> {
  const paintable = isInlineDemoPaintable(demo.content ?? '')
  return {
    generatingDemo: demo.status === 'active' && !paintable,
    contentStreaming: prev.contentStreaming || paintable,
    answerStreaming: prev.answerStreaming
  }
}

function liveDemoFenceProcessFlags(
  prev: LiveProcessView,
  text: TurnSegment
): Pick<LiveProcessView, 'generatingDemo' | 'contentStreaming' | 'answerStreaming'> {
  const built = buildAnswerParts([text], { isStreaming: true })
  const demo = built.find(
    (part): part is Extract<AnswerPart, { type: 'demo' }> => part.type === 'demo'
  )
  const paintable = Boolean(demo && isInlineDemoPaintable(demo.html))
  const hasProse = built.some((part) => part.type === 'text' && part.content.trim())
  return {
    generatingDemo: Boolean(demo?.streaming && !paintable),
    contentStreaming: prev.contentStreaming || paintable || hasProse,
    answerStreaming: true
  }
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
    (isLiveAskNeededThinkAppendChange(processHold.segments, segments) ||
      isLiveAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveAskNeededAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededThinkAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveAskNeededCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededCompressAppendChange(processHold.segments, segments) ||
      isLiveAskNeededCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedSettledToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedToolAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededThinkCancelAppendChange(processHold.segments, segments))
  ) {
    const added = segments.slice(processHold.segments.length).filter((segment) => {
      if (segment.kind === 'thinking' || segment.kind === 'text') return false
      return segment.toolName !== 'present_inline_demo'
    })
    const remapped = remapProcessFlowRefs(prev.processForFlow, processHold.segments, segments)
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const inlineDemo =
      isLiveAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededThinkAnswerDemoAppendChange(processHold.segments, segments)
    const answer =
      isLiveAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveAskNeededAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveAskNeededThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusAskNeededAnswerSettledToolAppendChange(processHold.segments, segments)
    const hasProse =
      answer &&
      segments.some(
        (segment, index) =>
          index >= processHold.segments.length &&
          segment.kind === 'text' &&
          Boolean((segment.content ?? '').trim())
      )
    const flags = inlineDemo
      ? liveDemoProcessFlags(prev, segments[segments.length - 1]!)
      : answer
        ? {
            contentStreaming: prev.contentStreaming || Boolean(hasProse),
            answerStreaming: prev.answerStreaming || Boolean(hasProse)
          }
        : {}
    const view = {
      ...prev,
      processForFlow: [...remapped, ...added],
      thinkText,
      ...flags
    }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: inlineDemo ? processHold.answerTailPlain : Boolean(hasProse) || processHold.answerTailPlain
    }
    return view
  }
  if (
    prev &&
    processHold?.view === prev &&
    (isLiveToolAppendChange(processHold.segments, segments) ||
      isLiveSettledToolAppendChange(processHold.segments, segments) ||
      isLiveThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatSettledToolAppendChange(processHold.segments, segments) ||
      isLiveThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAnswerSettledToolAppendChange(processHold.segments, segments) ||
      isLiveToolWriteStatAppendChange(processHold.segments, segments) ||
      isLiveStatusToolAppendChange(processHold.segments, segments) ||
      isLiveThinkToolAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatToolAppendChange(processHold.segments, segments) ||
      isLiveThinkStatusAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkStatusAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkStatusAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkStatusAppendChange(processHold.segments, segments) ||
      isLiveWriteStatCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusCompressAppendChange(processHold.segments, segments) ||
      isLiveThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusCancelAppendChange(processHold.segments, segments) ||
      isLiveThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveCompressAppendChange(processHold.segments, segments))
  ) {
    const added = segments.slice(processHold.segments.length).filter((segment) => {
      if (segment.kind === 'thinking' || segment.kind === 'text') return false
      return segment.toolName !== 'present_inline_demo'
    })
    const remapped = remapProcessFlowRefs(prev.processForFlow, processHold.segments, segments)
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const view = { ...prev, processForFlow: [...remapped, ...added], thinkText }
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
    (isLiveWriteStatStatusThinkAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkAppendChange(processHold.segments, segments) ||
      isLiveStatusAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveStatusDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusErrorAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkErrorAppendChange(processHold.segments, segments))
  ) {
    const status = segments[processHold.segments.length]!
    const remapped = remapProcessFlowRefs(prev.processForFlow, processHold.segments, segments)
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const inlineDemo =
      isLiveStatusDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkDemoAppendChange(processHold.segments, segments)
    const demoFence =
      isLiveWriteStatStatusDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveStatusDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkDemoFenceAppendChange(processHold.segments, segments)
    const answer =
      isLiveWriteStatStatusAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkAnswerAppendChange(processHold.segments, segments)
        ? segments[segments.length - 1]
        : null
    const hasProse = Boolean(answer && (answer.content ?? '').trim())
    const flags = inlineDemo
      ? liveDemoProcessFlags(prev, segments[segments.length - 1]!)
      : demoFence
        ? liveDemoFenceProcessFlags(prev, segments[segments.length - 1]!)
        : {
            contentStreaming: prev.contentStreaming || hasProse,
            answerStreaming: prev.answerStreaming || hasProse
          }
    const view = {
      ...prev,
      processForFlow: [...remapped, status],
      thinkText,
      ...flags
    }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: inlineDemo || demoFence ? false : hasProse || processHold.answerTailPlain
    }
    return view
  }
  if (
    prev &&
    processHold?.view === prev &&
    (isLiveStatusAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedStatusAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedStatusAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatStatusAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAppendChange(processHold.segments, segments))
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
    (isLiveThinkAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedThinkAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAppendChange(processHold.segments, segments))
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
    (isLiveAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAppendChange(processHold.segments, segments) ||
      isLiveThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkErrorAppendChange(processHold.segments, segments))
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
    (isLiveDemoAppendChange(processHold.segments, segments) ||
      isLiveAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveThinkDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkDemoAppendChange(processHold.segments, segments))
  ) {
    const added = segments[segments.length - 1]!
    const processForFlow = remapProcessFlowRefs(
      prev.processForFlow,
      processHold.segments,
      segments
    )
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const flags = liveDemoProcessFlags(prev, added)
    const view = {
      ...prev,
      processForFlow,
      thinkText,
      ...flags
    }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: processHold.answerTailPlain
    }
    return view
  }
  if (prev && processHold?.view === prev) {
    const demoChange = findLiveDemoHtmlChange(processHold.segments, segments)
    if (demoChange) {
      const processForFlow = remapProcessFlowRefs(
        prev.processForFlow,
        processHold.segments,
        segments
      )
      const flags = liveDemoProcessFlags(prev, demoChange.to)
      const view =
        processForFlow === prev.processForFlow &&
        flags.generatingDemo === prev.generatingDemo &&
        flags.contentStreaming === prev.contentStreaming &&
        flags.answerStreaming === prev.answerStreaming
          ? prev
          : { ...prev, processForFlow, ...flags }
      processHold = {
        view,
        identity: liveProcessIdentity(segments),
        segments,
        answerTailPlain: processHold.answerTailPlain
      }
      return view
    }
  }
  if (prev && processHold?.view === prev) {
    const fenceText =
      findLiveDemoFenceChange(processHold.segments, segments)?.to ??
      (isLiveDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveWriteStatDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveThinkDemoFenceAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkDemoFenceAppendChange(processHold.segments, segments)
        ? segments[segments.length - 1]
        : null)
    if (fenceText) {
      const processForFlow = remapProcessFlowRefs(
        prev.processForFlow,
        processHold.segments,
        segments
      )
      const flags = liveDemoFenceProcessFlags(prev, fenceText)
      const view = {
        ...prev,
        processForFlow,
        thinkText: nextLiveThinkText(prev.thinkText, processHold.segments, segments),
        ...flags
      }
      processHold = {
        view,
        identity: liveProcessIdentity(segments),
        segments,
        answerTailPlain: false
      }
      return view
    }
  }
  if (
    prev &&
    processHold?.view === prev &&
    (isLiveApprovalNeededThinkAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedSettledToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkSettledToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkCancelAppendChange(processHold.segments, segments))
  ) {
    const added = segments.slice(processHold.segments.length).filter((segment) => {
      if (segment.kind === 'thinking' || segment.kind === 'text') return false
      return segment.toolName !== 'present_inline_demo'
    })
    const remapped = remapProcessFlowRefs(prev.processForFlow, processHold.segments, segments)
    const thinkText = nextLiveThinkText(prev.thinkText, processHold.segments, segments)
    const inlineDemo =
      isLiveApprovalNeededAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments)
    const answer =
      isLiveApprovalNeededAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerCancelAppendChange(processHold.segments, segments)
    const hasProse =
      answer &&
      segments.some(
        (segment, index) =>
          index >= processHold.segments.length &&
          segment.kind === 'text' &&
          Boolean((segment.content ?? '').trim())
      )
    const flags = inlineDemo
      ? liveDemoProcessFlags(prev, segments[segments.length - 1]!)
      : answer
        ? {
            contentStreaming: prev.contentStreaming || Boolean(hasProse),
            answerStreaming: prev.answerStreaming || Boolean(hasProse)
          }
        : {}
    const view = {
      ...prev,
      processForFlow: [...remapped, ...added],
      thinkText,
      ...flags
    }
    processHold = {
      view,
      identity: liveProcessIdentity(segments),
      segments,
      answerTailPlain: inlineDemo ? processHold.answerTailPlain : Boolean(hasProse) || processHold.answerTailPlain
    }
    return view
  }
  if (
    prev &&
    processHold?.view === prev &&
    (isLiveApprovalNeededChange(processHold.segments, segments) ||
      isLiveApprovalDeniedSettleChange(processHold.segments, segments) ||
      isLiveApprovalDeniedSettleCancelChange(processHold.segments, segments) ||
      isLiveApprovalAllowedWriteStatChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleChange(processHold.segments, segments) ||
      isLiveApprovalResolvedChange(processHold.segments, segments) ||
      isLiveApprovalResolvedCancelChange(processHold.segments, segments) ||
      isLiveApprovalAllowedCancelChange(processHold.segments, segments) ||
      isLiveUserInputNeededChange(processHold.segments, segments) ||
      isLiveAskResolvedSettleChange(processHold.segments, segments) ||
      isLiveStatusSettleChange(processHold.segments, segments) ||
      isLiveCancelChange(processHold.segments, segments) ||
      isLiveErrorAppendChange(processHold.segments, segments) ||
      isLiveWriteStatErrorAppendChange(processHold.segments, segments))
  ) {
    const remapped = remapProcessFlowRefs(prev.processForFlow, processHold.segments, segments)
    const grew =
      segments.length === processHold.segments.length + 1 &&
      !isLiveErrorAppendChange(processHold.segments, segments) &&
      !isLiveWriteStatErrorAppendChange(processHold.segments, segments)
    const processForFlow = grew ? [...remapped, segments[segments.length - 1]!] : remapped
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
  if (
    prev &&
    processHold?.view === prev &&
    shouldRetargetLiveProcessOnToolMeta({
      prev,
      prevSegments: processHold.segments,
      segments
    })
  ) {
    if (isLiveMultiToolSettleChange(processHold.segments, segments)) {
      const processForFlow = remapProcessFlowRefs(
        prev.processForFlow,
        processHold.segments,
        segments
      )
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
    const change = findLiveToolRetargetChange(processHold.segments, segments)
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
  if (
    (isLiveSettledToolAppendChange(input.prevSegments, input.segments) ||
      isLiveThinkSettledToolAppendChange(input.prevSegments, input.segments) ||
      isLiveStatusThinkSettledToolAppendChange(input.prevSegments, input.segments) ||
      isLiveWriteStatSettledToolAppendChange(input.prevSegments, input.segments)) &&
    addedSettledToolsHaveWriteStat(input.prevSegments.length, input.segments)
  ) {
    return false
  }
  if (isLiveWriteStatSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatThinkSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusThinkSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (
    isLiveToolAppendChange(input.prevSegments, input.segments) ||
    isLiveSettledToolAppendChange(input.prevSegments, input.segments) ||
    isLiveThinkSettledToolAppendChange(input.prevSegments, input.segments) ||
    isLiveStatusThinkSettledToolAppendChange(input.prevSegments, input.segments) ||
    isLiveStatusToolAppendChange(input.prevSegments, input.segments) ||
    isLiveThinkToolAppendChange(input.prevSegments, input.segments) ||
    isLiveStatusThinkToolAppendChange(input.prevSegments, input.segments) ||
    isLiveThinkStatusAppendChange(input.prevSegments, input.segments) ||
    isLiveStatusThinkStatusAppendChange(input.prevSegments, input.segments)
  ) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveThinkAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveStatusThinkAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveCompressAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveStatusCompressAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveThinkCompressAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveStatusThinkCompressAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveCancelChange(input.prevSegments, input.segments)) {
    return !input.segments.some((segment, index) => {
      const before = input.prevSegments![index]
      return Boolean(before && before !== segment && segment.kind === 'text')
    })
  }
  if (
    isLiveStatusCancelAppendChange(input.prevSegments, input.segments) ||
    isLiveThinkCancelAppendChange(input.prevSegments, input.segments) ||
    isLiveStatusThinkCancelAppendChange(input.prevSegments, input.segments)
  ) {
    return !input.segments.some((segment, index) => {
      const before = input.prevSegments![index]
      return Boolean(before && before !== segment && segment.kind === 'text')
    })
  }
  if (isLiveApprovalNeededChange(input.prevSegments, input.segments)) return true
  if (isLiveApprovalNeededThinkAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalNeededThinkCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalNeededCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalNeededAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalNeededErrorAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalNeededAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatApprovalNeededCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusApprovalNeededCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveWriteStatApprovalResolvedCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusApprovalResolvedCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedCancelChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalDeniedSettleChange(input.prevSegments, input.segments)) return true
  if (isLiveApprovalDeniedCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalDeniedThinkAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveApprovalDeniedThinkAnswerCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalDeniedThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalDeniedThinkAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalDeniedAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalDeniedAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalDeniedAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalDeniedAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalDeniedStatusAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalDeniedToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedSettleChange(input.prevSegments, input.segments)) return true
  if (isLiveApprovalAllowedThinkAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveApprovalAllowedWriteStatThinkAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedWriteStatAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedWriteStatThinkAnswerAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedWriteStatAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedWriteStatAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAppendChange(input.prevSegments, input.segments)) return true
  if (isLiveApprovalResolvedThinkCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedThinkAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedThinkErrorAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedThinkAnswerCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerCancelAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedErrorCancelAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkErrorCancelAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedAskAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalDeniedSettleCancelChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedSettleThinkAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedSettleThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedErrorAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalResolvedAnswerCompressAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedCancelChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatApprovalResolvedErrorAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatApprovalResolvedAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusApprovalResolvedAskAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusApprovalResolvedToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusApprovalResolvedThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusApprovalResolvedThinkAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusApprovalResolvedThinkAnswerCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusApprovalResolvedThinkErrorAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusApprovalResolvedAnswerCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusApprovalResolvedAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusApprovalResolvedThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedThinkAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveApprovalAllowedStatusAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalAllowedToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveApprovalResolvedChange(input.prevSegments, input.segments)) return true
  if (isLiveUserInputNeededChange(input.prevSegments, input.segments)) return true
  if (isLiveAskResolvedSettleChange(input.prevSegments, input.segments)) return true
  if (isLiveAskResolvedCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskResolvedThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskResolvedAnswerCancelCompressAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskResolvedAnswerCancelAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskResolvedThinkAnswerCancelAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskResolvedThinkAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskResolvedAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskResolvedSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskResolvedToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskNeededThinkAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskNeededThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskNeededAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskNeededThinkAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskNeededAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskNeededAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveAskNeededThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatAskNeededThinkAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatAskNeededAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatAskNeededThinkAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatAskNeededThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatAskNeededAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatAskNeededAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatAskNeededThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusAskNeededThinkAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusAskNeededAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusAskNeededThinkAnswerAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusAskNeededAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskNeededThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusAskNeededThinkAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusAskNeededThinkSettledToolAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusAskNeededAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusAskNeededThinkAnswerAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusAskNeededAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusAskNeededThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveStatusAskNeededAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskNeededCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusAskNeededCompressAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveWriteStatAskNeededCompressAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusAskNeededCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskNeededCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveAskNeededThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusAskNeededCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveWriteStatAskNeededCancelAppendChange(input.prevSegments, input.segments)) return false
  if (isLiveWriteStatStatusAskNeededCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatAskNeededThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusAskNeededThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusAskNeededThinkCancelAppendChange(input.prevSegments, input.segments)) {
    return findLiveClosedAnswerText(input.prevSegments, input.segments) === null
  }
  if (isLiveStatusSettleChange(input.prevSegments, input.segments)) return true
  if (findLiveToolInPlaceChange(input.prevSegments, input.segments)) return true
  if (isLiveMultiToolSettleChange(input.prevSegments, input.segments)) return true
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

function applyLiveDemoFenceView(prev: LiveAnswerView, text: TurnSegment): LiveAnswerView {
  const built = buildAnswerParts([text], { isStreaming: true })
  const owned = new Set([text.id, `${text.id}-demo-stream`, `${text.id}-post`])
  const prefix = [
    ...prev.closed.filter((part) => !owned.has(part.id)),
    ...(prev.tail && !owned.has(prev.tail.id) ? [prev.tail] : [])
  ]
  const parts = reuseAnswerParts(prev.parts, [...prefix, ...built])
  const split = splitClosedTail(parts)
  const copyable = copyableFromAnswerParts(parts)
  return {
    parts,
    closed: sameRefList(prev.closed, split.closed) ? prev.closed : split.closed,
    tail: split.tail,
    show: parts.length > 0,
    copyable,
    hasCopyable: Boolean(copyable)
  }
}

function liveDemoAnswerPart(demo: TurnSegment): Extract<AnswerPart, { type: 'demo' }> {
  const html = demo.content ?? ''
  return {
    type: 'demo',
    id: demo.id,
    html: html || '<!-- streaming -->',
    caption: demo.toolDetail,
    streaming: demo.status === 'active'
  }
}

/** 新开 present_inline_demo：先收起上一尾，再开演示槽，不重跑 buildAnswerParts */
function appendLiveDemoView(prev: LiveAnswerView, demo: TurnSegment): LiveAnswerView {
  const demoPart = liveDemoAnswerPart(demo)
  const closed = prev.tail ? [...prev.closed, prev.tail] : prev.closed
  const parts = [...closed, demoPart]
  const copyable = copyableFromAnswerParts(parts)
  return {
    parts,
    closed,
    tail: demoPart,
    show: true,
    copyable,
    hasCopyable: Boolean(copyable)
  }
}

/** 同一演示 HTML / 说明 / 收束：只换该槽 */
function growLiveDemoView(prev: LiveAnswerView, demo: TurnSegment): LiveAnswerView {
  const demoPart = liveDemoAnswerPart(demo)
  if (prev.tail?.type === 'demo' && prev.tail.id === demo.id) {
    if (
      prev.tail.html === demoPart.html &&
      prev.tail.caption === demoPart.caption &&
      prev.tail.streaming === demoPart.streaming
    ) {
      return prev
    }
    const parts = prev.closed.length ? [...prev.closed, demoPart] : [demoPart]
    return {
      ...prev,
      parts,
      tail: demoPart,
      show: true
    }
  }
  const index = prev.parts.findIndex((part) => part.type === 'demo' && part.id === demo.id)
  if (index < 0) {
    return {
      parts: reuseAnswerParts(prev.parts, [...prev.parts, demoPart]),
      closed: prev.closed,
      tail: demoPart,
      show: true,
      copyable: prev.copyable,
      hasCopyable: prev.hasCopyable
    }
  }
  const current = prev.parts[index]!
  if (
    current.type === 'demo' &&
    current.html === demoPart.html &&
    current.caption === demoPart.caption &&
    current.streaming === demoPart.streaming
  ) {
    return prev
  }
  const parts = prev.parts.slice()
  parts[index] = demoPart
  const tail = prev.tail?.id === demo.id ? demoPart : prev.tail
  const closed =
    prev.tail?.id === demo.id
      ? prev.closed
      : prev.closed.map((part) => (part.id === demo.id && part.type === 'demo' ? demoPart : part))
  return {
    ...prev,
    parts,
    closed,
    tail,
    show: true
  }
}

function liveWriteStatDiffParts(tool: TurnSegment): Extract<AnswerPart, { type: 'diff' }>[] {
  return buildAnswerParts([tool], { isStreaming: true }).filter(
    (part): part is Extract<AnswerPart, { type: 'diff' }> => part.type === 'diff'
  )
}

function findLiveWriteStatTool(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): TurnSegment | null {
  if (!prev) return null
  const n = Math.min(prev.length, next.length)
  let found: TurnSegment | null = null
  for (let i = 0; i < n; i++) {
    const before = prev[i]
    const after = next[i]
    if (!before || !after || before === after) continue
    if (isLiveToolWriteStatChange(before, after)) {
      if (found) return null
      found = after
      continue
    }
    if (isLiveAwaitingStatusResolve(before, after)) continue
    if (next.length === prev.length) return null
    if (!isLivePrefixClose(before, after)) return null
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
    return { ...prev, parts, show: true }
  }
  const reused = diffs.map((diff, index) => {
    const old = prev.parts[start + index]
    if (old && old.type === 'diff' && old.id === diff.id && old.diff === diff.diff) return old
    return diff
  })
  if (reused.length === end - start && reused.every((part, index) => part === prev.parts[start + index])) {
    return prev
  }
  const parts = [...prev.parts.slice(0, start), ...reused, ...prev.parts.slice(end)]
  return { ...prev, parts, show: parts.length > 0 }
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
  if (prev) {
    const writeStat = findLiveWriteStatTool(prevSegments, segments)
    if (writeStat) {
      const patched = retargetLiveAnswerDiffs(prev, writeStat)
      if (
        isLiveWriteStatAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatThinkAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkAnswerAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedWriteStatAnswerAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedWriteStatThinkAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededThinkAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededAnswerAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededThinkAnswerAppendChange(prevSegments, segments)
      ) {
        const view = appendLiveAnswerView(patched, segments[segments.length - 1]!)
        answerGrowHold = { view, segments, tailPlain: true }
        return view
      }
      if (
        isLiveWriteStatApprovalResolvedAnswerCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments)
      ) {
        const text = segments.slice(prevSegments!.length).find((segment) => segment.kind === 'text')
        if (text) {
          const appended = appendLiveAnswerView(patched, text)
          const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
          answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
          return view
        }
      }
      if (isLiveWriteStatAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (isLiveWriteStatThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length + 1]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (isLiveWriteStatStatusAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length + 1]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (isLiveWriteStatStatusThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length + 2]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (isLiveWriteStatAskNeededAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length + 2]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (isLiveWriteStatAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length + 3]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (isLiveWriteStatStatusAskNeededAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length + 3]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (isLiveWriteStatStatusAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
        const text = segments[prevSegments!.length + 4]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (
        isLiveApprovalAllowedWriteStatAnswerSettledToolAppendChange(prevSegments, segments)
      ) {
        const text = segments[prevSegments!.length]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (
        isLiveApprovalAllowedWriteStatThinkAnswerSettledToolAppendChange(prevSegments, segments)
      ) {
        const text = segments[prevSegments!.length + 1]!
        const appended = appendLiveAnswerView(patched, text)
        const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
        answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
        return view
      }
      if (
        isLiveWriteStatThinkSettledToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkSettledToolAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedWriteStatThinkSettledToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededThinkSettledToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededThinkSettledToolAppendChange(prevSegments, segments)
      ) {
        answerGrowHold = {
          view: patched,
          segments,
          tailPlain: Boolean(prev.tail?.type === 'text')
        }
        return patched
      }
      if (
        isLiveWriteStatDemoFenceAppendChange(prevSegments, segments) ||
        isLiveWriteStatThinkDemoFenceAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusDemoFenceAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkDemoFenceAppendChange(prevSegments, segments)
      ) {
        const view = applyLiveDemoFenceView(patched, segments[segments.length - 1]!)
        answerGrowHold = { view, segments, tailPlain: false }
        return view
      }
      if (
        isLiveWriteStatDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatThinkDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatThinkAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedWriteStatAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedWriteStatThinkAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoCancelCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAnswerDemoAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(prevSegments, segments)
      ) {
        const sealed = findLiveClosedAnswerText(prevSegments, segments)
        const base = sealed ? sealLiveAnswerTail(patched, sealed) : patched
        const view = appendLiveDemoView(base, segments[segments.length - 1]!)
        answerGrowHold = { view, segments, tailPlain: false }
        return view
      }
      if (
        isLiveWriteStatStatusCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatThinkCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatThinkStatusAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkStatusAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatAskNeededThinkCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusAskNeededThinkCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalNeededCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalNeededCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkCompressAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments)
      ) {
        const sealed = findLiveClosedAnswerText(prevSegments, segments)
        const view = sealed ? sealLiveAnswerTail(patched, sealed) : patched
        answerGrowHold = { view, segments, tailPlain: false }
        return view
      }
      if (
        isLiveWriteStatErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatThinkErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusThinkErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAppendChange(prevSegments, segments)
      ) {
        const view = appendLiveAnswerView(patched, segments[segments.length - 1]!)
        answerGrowHold = { view, segments, tailPlain: false }
        return view
      }
      answerGrowHold = {
        view: patched,
        segments,
        tailPlain: Boolean(prev.tail?.type === 'text')
      }
      return patched
    }
  }
  if (
    prev &&
    (isLiveToolAppendChange(prevSegments, segments) ||
      isLiveSettledToolAppendChange(prevSegments, segments) ||
      isLiveThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveStatusThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveStatusToolAppendChange(prevSegments, segments) ||
      isLiveThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusCancelAppendChange(prevSegments, segments) ||
      isLiveThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveAskNeededCompressAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededCompressAppendChange(prevSegments, segments) ||
      isLiveAskNeededCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedSettledToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedToolAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededCancelAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedCancelChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedToolAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedSettleCancelChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleToolAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedCancelChange(prevSegments, segments) ||
      isLiveApprovalDeniedCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkSettledToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkCancelAppendChange(prevSegments, segments))
  ) {
    const sealed = findLiveClosedAnswerText(prevSegments, segments)
    if (sealed) {
      const view = sealLiveAnswerTail(prev, sealed)
      answerGrowHold = { view, segments, tailPlain: false }
      return view
    }
  }
  if (prev && isLiveAnswerSettledToolAppendChange(prevSegments, segments)) {
    const text = segments[prevSegments!.length]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (prev && isLiveThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
    const text = segments[prevSegments!.length + 1]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (prev && isLiveStatusThinkAnswerSettledToolAppendChange(prevSegments, segments)) {
    const text = segments[prevSegments!.length + 2]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (
    prev &&
    (isLiveApprovalAllowedAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedAnswerSettledToolAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerSettledToolAppendChange(prevSegments, segments))
  ) {
    const text = segments[prevSegments!.length]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (
    prev &&
    (isLiveApprovalAllowedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedThinkAnswerSettledToolAppendChange(prevSegments, segments))
  ) {
    const text = segments[prevSegments!.length + 1]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (
    prev &&
    (isLiveAskNeededAnswerAppendChange(prevSegments, segments) ||
      isLiveAskNeededAnswerSettledToolAppendChange(prevSegments, segments))
  ) {
    const text = segments[prevSegments!.length + 2]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (
    prev &&
    (isLiveAskNeededThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkAnswerSettledToolAppendChange(prevSegments, segments))
  ) {
    const text = segments[prevSegments!.length + 3]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (
    prev &&
    (isLiveStatusAskNeededAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededAnswerSettledToolAppendChange(prevSegments, segments))
  ) {
    const text = segments[prevSegments!.length + 3]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (prev && isLiveStatusAskNeededThinkAnswerAppendChange(prevSegments, segments)) {
    const text = segments[prevSegments!.length + 4]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (
    prev &&
    (isLiveAnswerAppendChange(prevSegments, segments) ||
      isLiveThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusThinkAnswerAppendChange(prevSegments, segments))
  ) {
    const added = segments[segments.length - 1]!
    const view = appendLiveAnswerView(prev, added)
    answerGrowHold = { view, segments, tailPlain: true }
    return view
  }
  if (
    prev &&
    (isLiveDemoFenceAppendChange(prevSegments, segments) ||
      isLiveThinkDemoFenceAppendChange(prevSegments, segments) ||
      isLiveStatusDemoFenceAppendChange(prevSegments, segments) ||
      isLiveStatusThinkDemoFenceAppendChange(prevSegments, segments))
  ) {
    const added = segments[segments.length - 1]!
    const view = applyLiveDemoFenceView(prev, added)
    answerGrowHold = { view, segments, tailPlain: false }
    return view
  }
  if (prev) {
    const fenceChange = findLiveDemoFenceChange(prevSegments, segments)
    if (fenceChange) {
      const view = applyLiveDemoFenceView(prev, fenceChange.to)
      answerGrowHold = { view, segments, tailPlain: false }
      return view
    }
  }
  if (prev && isLiveApprovalNeededAnswerAppendChange(prevSegments, segments)) {
    const text = segments[prevSegments!.length + 1]!
    const appended = appendLiveAnswerView(prev, text)
    const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
    answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
    return view
  }
  if (
    prev &&
    (isLiveApprovalResolvedAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerCancelCompressAppendChange(prevSegments, segments))
  ) {
    const sealed = findLiveClosedAnswerText(prevSegments, segments)
    const base = sealed ? sealLiveAnswerTail(prev, sealed) : prev
    const text = segments.slice(prevSegments!.length).find((segment) => segment.kind === 'text')
    if (text) {
      const appended = appendLiveAnswerView(base, text)
      const view = text.status === 'done' ? sealLiveAnswerTail(appended, text) : appended
      answerGrowHold = { view, segments, tailPlain: text.status === 'active' }
      return view
    }
  }
  if (
    prev &&
    (isLiveApprovalResolvedErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments))
  ) {
    const text = segments.slice(prevSegments!.length).find((segment) => segment.kind === 'text')
    if (text) {
      const view = appendLiveAnswerView(prev, text)
      answerGrowHold = { view, segments, tailPlain: false }
      return view
    }
  }
  if (prev && isLiveApprovalNeededErrorAppendChange(prevSegments, segments)) {
    const view = appendLiveAnswerView(prev, segments[prevSegments!.length + 1]!)
    answerGrowHold = { view, segments, tailPlain: false }
    return view
  }
  if (prev && isLiveApprovalNeededAnswerDemoAppendChange(prevSegments, segments)) {
    const sealed = findLiveClosedAnswerText(prevSegments, segments)
    const base = sealed ? sealLiveAnswerTail(prev, sealed) : prev
    const view = appendLiveDemoView(base, segments[segments.length - 1]!)
    answerGrowHold = { view, segments, tailPlain: false }
    return view
  }
  if (
    prev &&
    (isLiveErrorAppendChange(prevSegments, segments) ||
      isLiveStatusErrorAppendChange(prevSegments, segments) ||
      isLiveThinkErrorAppendChange(prevSegments, segments) ||
      isLiveStatusThinkErrorAppendChange(prevSegments, segments))
  ) {
    const view = appendLiveAnswerView(prev, segments[segments.length - 1]!)
    answerGrowHold = { view, segments, tailPlain: false }
    return view
  }
  if (
    prev &&
    (isLiveDemoAppendChange(prevSegments, segments) ||
      isLiveAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveAskNeededAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveStatusAskNeededThinkAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveStatusDemoAppendChange(prevSegments, segments) ||
      isLiveThinkDemoAppendChange(prevSegments, segments) ||
      isLiveStatusThinkDemoAppendChange(prevSegments, segments))
  ) {
    const added = segments[segments.length - 1]!
    const sealed = findLiveClosedAnswerText(prevSegments, segments)
    const base = sealed ? sealLiveAnswerTail(prev, sealed) : prev
    const view = appendLiveDemoView(base, added)
    answerGrowHold = { view, segments, tailPlain: false }
    return view
  }
  if (prev) {
    const demoChange = findLiveDemoHtmlChange(prevSegments, segments)
    if (demoChange) {
      const view = growLiveDemoView(prev, demoChange.to)
      answerGrowHold = { view, segments, tailPlain: false }
      return view
    }
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
