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

/** Stop 后审批工具标 cancelled，Awaiting 行已是 done（不跟 Ask 一起 cancelled） */
function hasLiveApprovalNeededStoppedHead(next: readonly TurnSegment[], start: number): boolean {
  return isLiveAddedCancelledApprovalTool(next[start]) && isLiveAddedAwaitingStatus(next[start + 1])
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


/** Awaiting approval 挂上后同一帧 首枚 token + Ask User */
export function isLiveApprovalNeededAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** Awaiting approval 挂上后同一帧 think + 首枚 token + Ask User */
export function isLiveApprovalNeededThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** Awaiting approval 挂上后同一帧 首枚 token + Ask User + Stop */
export function isLiveApprovalNeededAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 3)
}

/** Awaiting approval 挂上后同一帧 think + 首枚 token + Ask User + Stop */
export function isLiveApprovalNeededThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** Awaiting approval 挂上后同一帧 首枚 token + Ask User + compress */
export function isLiveApprovalNeededAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
}

/** Awaiting approval 挂上后同一帧 think + 首枚 token + Ask User + compress */
export function isLiveApprovalNeededThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** Awaiting approval 挂上后同一帧 Ask User + 下一工具已 complete_call */
export function isLiveApprovalNeededAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** Awaiting approval 挂上后同一帧 Ask User + 下一工具仍 active */
export function isLiveApprovalNeededAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 2)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 4, next)
}

/** Awaiting approval 挂上后同一帧 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalNeededAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** Awaiting approval 挂上后同一帧 首枚 token + Ask User + 下一工具仍 active */
export function isLiveApprovalNeededAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** Awaiting approval 挂上后同一帧 think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalNeededThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** Awaiting approval 挂上后同一帧 错误 + Ask User */
export function isLiveApprovalNeededErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedError(next[prev!.length + 2]) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** Awaiting approval 挂上后同一帧 think + 错误 + Ask User */
export function isLiveApprovalNeededThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 首枚 token + Ask User */
export function isLiveStatusApprovalNeededAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + 首枚 token + Ask User */
export function isLiveStatusApprovalNeededThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 首枚 token + Ask User + Stop */
export function isLiveStatusApprovalNeededAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + 首枚 token + Ask User + Stop */
export function isLiveStatusApprovalNeededThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 首枚 token + Ask User + compress */
export function isLiveStatusApprovalNeededAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + 首枚 token + Ask User + compress */
export function isLiveStatusApprovalNeededThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalNeededAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + Ask User + 下一工具仍 active */
export function isLiveStatusApprovalNeededAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalNeededAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 首枚 token + Ask User + 下一工具仍 active */
export function isLiveStatusApprovalNeededAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 4)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalNeededThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 错误 + Ask User */
export function isLiveStatusApprovalNeededErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + 错误 + Ask User */
export function isLiveStatusApprovalNeededThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 首枚 token + Ask User */
export function isLiveWriteStatApprovalNeededAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + 首枚 token + Ask User */
export function isLiveWriteStatApprovalNeededThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 首枚 token + Ask User + Stop */
export function isLiveWriteStatApprovalNeededAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + 首枚 token + Ask User + Stop */
export function isLiveWriteStatApprovalNeededThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 首枚 token + Ask User + compress */
export function isLiveWriteStatApprovalNeededAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + 首枚 token + Ask User + compress */
export function isLiveWriteStatApprovalNeededThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 写盘收束同时新开工具并立刻 Awaiting + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalNeededAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + Ask User + 下一工具仍 active */
export function isLiveWriteStatApprovalNeededAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 2)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalNeededAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 首枚 token + Ask User + 下一工具仍 active */
export function isLiveWriteStatApprovalNeededAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalNeededThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 错误 + Ask User */
export function isLiveWriteStatApprovalNeededErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedError(next[prev!.length + 2]) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + 错误 + Ask User */
export function isLiveWriteStatApprovalNeededThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 首枚 token + Ask User */
export function isLiveWriteStatStatusApprovalNeededAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + 首枚 token + Ask User */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 首枚 token + Ask User + Stop */
export function isLiveWriteStatStatusApprovalNeededAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + 首枚 token + Ask User + Stop */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 首枚 token + Ask User + compress */
export function isLiveWriteStatStatusApprovalNeededAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + 首枚 token + Ask User + compress */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalNeededAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + Ask User + 下一工具仍 active */
export function isLiveWriteStatStatusApprovalNeededAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalNeededAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 首枚 token + Ask User + 下一工具仍 active */
export function isLiveWriteStatStatusApprovalNeededAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 4)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalNeededErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalNeededThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededHead(next, prev!.length + 5)
}


/** Awaiting approval 挂上后同一帧 ```demo + Ask User */
export function isLiveApprovalNeededAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** Awaiting approval 挂上后同一帧 think + ```demo + Ask User */
export function isLiveApprovalNeededThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** Awaiting approval 挂上后同一帧 ```demo + Ask User + Stop */
export function isLiveApprovalNeededAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** Awaiting approval 挂上后同一帧 think + ```demo + Ask User + Stop */
export function isLiveApprovalNeededThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** Awaiting approval 挂上后同一帧 ```demo + Ask User + compress */
export function isLiveApprovalNeededAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** Awaiting approval 挂上后同一帧 think + ```demo + Ask User + compress */
export function isLiveApprovalNeededThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** Awaiting approval 挂上后同一帧 ```demo + 错误 + Ask User */
export function isLiveApprovalNeededAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** Awaiting approval 挂上后同一帧 错误 + ```demo + Ask User */
export function isLiveApprovalNeededErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedError(next[prev!.length + 2]) && isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** Awaiting approval 挂上后同一帧 think + ```demo + 错误 + Ask User */
export function isLiveApprovalNeededThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5]) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** Awaiting approval 挂上后同一帧 think + 错误 + ```demo + Ask User */
export function isLiveApprovalNeededThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3]) && isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** Awaiting approval 挂上后同一帧 ```demo + Ask User + 下一工具已 complete_call */
export function isLiveApprovalNeededAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 2)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** Awaiting approval 挂上后同一帧 ```demo + Ask User + 下一工具仍 active */
export function isLiveApprovalNeededAnswerDemoAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 2)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 6, next)
}

/** Awaiting approval 挂上后同一帧 think + ```demo + Ask User + 下一工具已 complete_call */
export function isLiveApprovalNeededThinkAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** Awaiting approval 挂上后同一帧 Ask User + 下一工具已 complete_call + Stop */
export function isLiveApprovalNeededAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** Awaiting approval 挂上后同一帧 首枚 token + Ask User + 下一工具已 complete_call + Stop */
export function isLiveApprovalNeededAnswerAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + ```demo + Ask User */
export function isLiveStatusApprovalNeededAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + ```demo + Ask User */
export function isLiveStatusApprovalNeededThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + ```demo + Ask User + Stop */
export function isLiveStatusApprovalNeededAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + ```demo + Ask User + Stop */
export function isLiveStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) && hasLiveAskNeededCancelledHead(next, prev!.length + 6)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + ```demo + Ask User + compress */
export function isLiveStatusApprovalNeededAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + ```demo + Ask User + compress */
export function isLiveStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededResolvedHead(next, prev!.length + 6) && isLiveAddedCompress(next[prev!.length + 8])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + ```demo + 错误 + Ask User */
export function isLiveStatusApprovalNeededAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5]) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 错误 + ```demo + Ask User */
export function isLiveStatusApprovalNeededErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + ```demo + 错误 + Ask User */
export function isLiveStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && isLiveAddedError(next[prev!.length + 6]) && hasLiveAskNeededHead(next, prev!.length + 7)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + 错误 + ```demo + Ask User */
export function isLiveStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && isLiveAddedDemoFencePair(next, prev!.length + 5) && hasLiveAskNeededHead(next, prev!.length + 7)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + ```demo + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalNeededAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + ```demo + Ask User + 下一工具仍 active */
export function isLiveStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + think + ```demo + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 4)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 6)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 8, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + Ask User + 下一工具已 complete_call + Stop */
export function isLiveStatusApprovalNeededAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Awaiting + 首枚 token + Ask User + 下一工具已 complete_call + Stop */
export function isLiveStatusApprovalNeededAnswerAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + ```demo + Ask User */
export function isLiveWriteStatApprovalNeededAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + ```demo + Ask User */
export function isLiveWriteStatApprovalNeededThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开工具并立刻 Awaiting + ```demo + Ask User + Stop */
export function isLiveWriteStatApprovalNeededAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + ```demo + Ask User + Stop */
export function isLiveWriteStatApprovalNeededThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 写盘收束同时新开工具并立刻 Awaiting + ```demo + Ask User + compress */
export function isLiveWriteStatApprovalNeededAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + ```demo + Ask User + compress */
export function isLiveWriteStatApprovalNeededThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** 写盘收束同时新开工具并立刻 Awaiting + ```demo + 错误 + Ask User */
export function isLiveWriteStatApprovalNeededAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 错误 + ```demo + Ask User */
export function isLiveWriteStatApprovalNeededErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  return isLiveAddedError(next[prev!.length + 2]) && isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + ```demo + 错误 + Ask User */
export function isLiveWriteStatApprovalNeededThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5]) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + 错误 + ```demo + Ask User */
export function isLiveWriteStatApprovalNeededThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3]) && isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 写盘收束同时新开工具并立刻 Awaiting + ```demo + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalNeededAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 2)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + ```demo + Ask User + 下一工具仍 active */
export function isLiveWriteStatApprovalNeededAnswerDemoAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 2)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + think + ```demo + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalNeededThinkAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + Ask User + 下一工具已 complete_call + Stop */
export function isLiveWriteStatApprovalNeededAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开工具并立刻 Awaiting + 首枚 token + Ask User + 下一工具已 complete_call + Stop */
export function isLiveWriteStatApprovalNeededAnswerAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalNeededAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + ```demo + Ask User + Stop */
export function isLiveWriteStatStatusApprovalNeededAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + ```demo + Ask User + Stop */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) && hasLiveAskNeededCancelledHead(next, prev!.length + 6)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + ```demo + Ask User + compress */
export function isLiveWriteStatStatusApprovalNeededAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + ```demo + Ask User + compress */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededResolvedHead(next, prev!.length + 6) && isLiveAddedCompress(next[prev!.length + 8])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + ```demo + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalNeededAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && isLiveAddedError(next[prev!.length + 5]) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 错误 + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalNeededErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + ```demo + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && isLiveAddedError(next[prev!.length + 6]) && hasLiveAskNeededHead(next, prev!.length + 7)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + 错误 + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && isLiveAddedDemoFencePair(next, prev!.length + 5) && hasLiveAskNeededHead(next, prev!.length + 7)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + ```demo + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalNeededAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + ```demo + Ask User + 下一工具仍 active */
export function isLiveWriteStatStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + think + ```demo + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!hasLiveApprovalNeededAppendHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 4)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 6)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 8, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + Ask User + 下一工具已 complete_call + Stop */
export function isLiveWriteStatStatusApprovalNeededAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Awaiting + 首枚 token + Ask User + 下一工具已 complete_call + Stop */
export function isLiveWriteStatStatusApprovalNeededAnswerAskToolCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!hasLiveApprovalNeededStoppedHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededStoppedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
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


/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + Ask User */
export function isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + Ask User */
export function isLiveWriteStatApprovalResolvedErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedError(next[prev!.length + 2]) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + Ask User */
export function isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + 错误 + Ask User */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + ```demo + Ask User */
export function isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + 错误 + Ask User */
export function isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedError(next[prev!.length + 4]) &&
    hasLiveAskNeededHead(next, prev!.length + 5)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + ```demo + Ask User */
export function isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededHead(next, prev!.length + 5)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}


/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 4)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return isLiveAddedError(next[prev!.length + 2]) && hasLiveAskNeededCancelledHead(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + 错误 + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + ```demo + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + 错误 + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) &&
    isLiveAddedError(next[prev!.length + 4]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + ```demo + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + Ask User + compress */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + Ask User + compress */
export function isLiveWriteStatApprovalResolvedAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + Ask User + compress */
export function isLiveWriteStatApprovalResolvedErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + Ask User + compress */
export function isLiveWriteStatApprovalResolvedThinkErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + 错误 + Ask User + compress */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + 错误 + Ask User + compress */
export function isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedError(next[prev!.length + 4]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}


/** 写盘收束同时新开工具并立刻 Allow/Deny + 错误 + ```demo + Ask User + compress */
export function isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 错误 + ```demo + Ask User + compress */
export function isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token + Ask User */
export function isLiveWriteStatApprovalResolvedAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User */
export function isLiveWriteStatApprovalResolvedThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + ```demo + Ask User + 下一工具 */
export function isLiveWriteStatApprovalResolvedAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 2)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + ```demo + Ask User + 下一工具 */
export function isLiveWriteStatApprovalResolvedThinkAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}


/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 2])) && hasLiveAskNeededCancelledHead(next, prev!.length + 3)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User + Stop */
export function isLiveWriteStatApprovalResolvedThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 3])) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token + Ask User + compress */
export function isLiveWriteStatApprovalResolvedAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User + compress */
export function isLiveWriteStatApprovalResolvedThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalResolvedAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + Ask User + 下一工具仍 active */
export function isLiveWriteStatApprovalResolvedAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 2)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 4, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalResolvedAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + 首枚 token + Ask User + 下一工具仍 active */
export function isLiveWriteStatApprovalResolvedAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatApprovalResolvedThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next)) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
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


/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + Ask User */
export function isLiveStatusApprovalResolvedAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 3) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 + Ask User */
export function isLiveStatusApprovalResolvedErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + Ask User */
export function isLiveStatusApprovalResolvedThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + Ask User */
export function isLiveStatusApprovalResolvedThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 4) && hasLiveAskNeededHead(next, prev!.length + 6)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + 错误 + Ask User */
export function isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    hasLiveAskNeededHead(next, prev!.length + 7)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + ```demo + Ask User */
export function isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 5) &&
    hasLiveAskNeededHead(next, prev!.length + 7)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + 错误 + Ask User */
export function isLiveStatusApprovalResolvedAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededHead(next, prev!.length + 6)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 + ```demo + Ask User */
export function isLiveStatusApprovalResolvedErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededHead(next, prev!.length + 6)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + Ask User + Stop */
export function isLiveStatusApprovalResolvedAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 + Ask User + Stop */
export function isLiveStatusApprovalResolvedErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + Ask User + Stop */
export function isLiveStatusApprovalResolvedThinkErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + Ask User + Stop */
export function isLiveStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + 错误 + Ask User + Stop */
export function isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 7)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + 错误 + Ask User + Stop */
export function isLiveStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 + ```demo + Ask User + Stop */
export function isLiveStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + ```demo + Ask User + Stop */
export function isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 5) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 7)
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + Ask User + compress */
export function isLiveStatusApprovalResolvedAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 + Ask User + compress */
export function isLiveStatusApprovalResolvedErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + Ask User + compress */
export function isLiveStatusApprovalResolvedThinkErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + Ask User + compress */
export function isLiveStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + 错误 + Ask User + compress */
export function isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 10) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 7) &&
    isLiveAddedCompress(next[prev!.length + 9])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + 错误 + Ask User + compress */
export function isLiveStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 错误 + ```demo + Ask User + compress */
export function isLiveStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 错误 + ```demo + Ask User + compress */
export function isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 10) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 5) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 7) &&
    isLiveAddedCompress(next[prev!.length + 9])
  )
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token + Ask User */
export function isLiveStatusApprovalResolvedAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User */
export function isLiveStatusApprovalResolvedThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + ```demo + Ask User + 下一工具 */
export function isLiveStatusApprovalResolvedAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}


/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token + Ask User + Stop */
export function isLiveStatusApprovalResolvedAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 3])) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User + Stop */
export function isLiveStatusApprovalResolvedThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 4])) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token + Ask User + compress */
export function isLiveStatusApprovalResolvedAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User + compress */
export function isLiveStatusApprovalResolvedThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalResolvedAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + Ask User + 下一工具仍 active */
export function isLiveStatusApprovalResolvedAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalResolvedAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + 首枚 token + Ask User + 下一工具仍 active */
export function isLiveStatusApprovalResolvedAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 4)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveStatusApprovalResolvedThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 规划下一步 / Reconnecting 后同一帧新开工具并立刻 Allow/Deny + think + ```demo + Ask User + 下一工具 */
export function isLiveStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveToolAppendPrefixClose(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 4)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 6)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 8, next)
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


/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    hasLiveAskNeededHead(next, prev!.length + 7)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 5) &&
    hasLiveAskNeededHead(next, prev!.length + 7)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + 错误 + Ask User */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + ```demo + Ask User */
export function isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(
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
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}


/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return isLiveAddedError(next[prev!.length + 3]) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return isLiveAddedError(next[prev!.length + 4]) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 错误 + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 7)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + ```demo + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 5) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 7)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + 错误 + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + ```demo + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 4) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAskCompressAppendChange(
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
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + 错误 + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 10) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    isLiveAddedError(next[prev!.length + 6]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 7) &&
    isLiveAddedCompress(next[prev!.length + 9])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + 错误 + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}


/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 错误 + ```demo + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 9) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return (
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 错误 + ```demo + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 10) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return (
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 5) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 7) &&
    isLiveAddedCompress(next[prev!.length + 9])
  )
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 首枚 token + Ask User */
export function isLiveWriteStatStatusApprovalResolvedAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 首枚 token + Ask User */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + ```demo + Ask User + 下一工具 */
export function isLiveWriteStatStatusApprovalResolvedAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 3)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + ```demo + Ask User + 下一工具 */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  if (!isLiveAddedDemoFencePair(next, prev!.length + 4)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 6)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 8, next)
}


/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 首枚 token + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 6) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 3])) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 首枚 token + Ask User + Stop */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 4])) && hasLiveAskNeededCancelledHead(next, prev!.length + 5)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 首枚 token + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 7) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 首枚 token + Ask User + compress */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (next.length !== prev!.length + 8) return false
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 5) && isLiveAddedCompress(next[prev!.length + 7])
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalResolvedAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + Ask User + 下一工具仍 active */
export function isLiveWriteStatStatusApprovalResolvedAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalResolvedAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + 首枚 token + Ask User + 下一工具仍 active */
export function isLiveWriteStatStatusApprovalResolvedAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 4)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 6, next)
}

/** 写盘收束同时新开 Reconnecting / 规划下一步并立刻 Allow/Deny + think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveWriteStatStatusApprovalResolvedThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveWriteStatPrefix(prev, next) || !isLiveAddedStatusPair(next[prev!.length])) {
    return false
  }
  if (!isLiveAddedResolvedApprovalHead(next, prev!.length + 1)) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 3])) return false
  const text = next[prev!.length + 4]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 5)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 7, next)
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

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 错误 + ```demo */
export function isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedError(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedError(next[prev!.length + 2]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 3)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + 错误 */
export function isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      isLiveAddedError(next[prev!.length + 3])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      isLiveAddedError(next[prev!.length + 4])
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + 错误 */
export function isLiveApprovalResolvedAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedDemoFencePair(next, prev!.length) && isLiveAddedError(next[prev!.length + 2])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedDemoFencePair(next, prev!.length + 1) && isLiveAddedError(next[prev!.length + 3])
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 错误 + ```demo */
export function isLiveApprovalResolvedErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedError(next[prev!.length]) && isLiveAddedDemoFencePair(next, prev!.length + 1)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedError(next[prev!.length + 1]) && isLiveAddedDemoFencePair(next, prev!.length + 2)
  }
  return false
}

/** Allow / Deny 收口后同一帧 think + ```demo + 错误 + Stop：工具未 tool_done，演示标 cancelled */
export function isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedError(next[next.length - 1])
  )
}

/** Allow / Deny 收口后同一帧 think + 错误 + ```demo + Stop：工具未 tool_done，演示标 cancelled */
export function isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveApprovalResolvedCancelPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveCancelPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedResolvedApprovalStatus(next[prev!.length])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 1]) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 3)
  )
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + 错误 + compress */
export function isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      isLiveAddedError(next[prev!.length + 3]) &&
      isLiveAddedCompress(next[prev!.length + 4])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      isLiveAddedError(next[prev!.length + 4]) &&
      isLiveAddedCompress(next[prev!.length + 5])
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 错误 + ```demo + compress */
export function isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedError(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      isLiveAddedCompress(next[prev!.length + 4])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedError(next[prev!.length + 2]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 3) &&
      isLiveAddedCompress(next[prev!.length + 5])
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 错误 + Ask User */
export function isLiveApprovalResolvedThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedError(next[prev!.length + 1]) &&
      hasLiveAskNeededHead(next, prev!.length + 2)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedError(next[prev!.length + 2]) &&
      hasLiveAskNeededHead(next, prev!.length + 3)
    )
  }
  return false
}


/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + Ask User */
export function isLiveApprovalResolvedAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedDemoFencePair(next, prev!.length) && hasLiveAskNeededHead(next, prev!.length + 2)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return isLiveAddedDemoFencePair(next, prev!.length + 1) && hasLiveAskNeededHead(next, prev!.length + 3)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 错误 + Ask User */
export function isLiveApprovalResolvedErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedError(next[prev!.length]) && hasLiveAskNeededHead(next, prev!.length + 1)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedError(next[prev!.length + 1]) && hasLiveAskNeededHead(next, prev!.length + 2)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + Ask User */
export function isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      hasLiveAskNeededHead(next, prev!.length + 3)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      hasLiveAskNeededHead(next, prev!.length + 4)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + 错误 + Ask User */
export function isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      isLiveAddedError(next[prev!.length + 3]) &&
      hasLiveAskNeededHead(next, prev!.length + 4)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 7) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      isLiveAddedError(next[prev!.length + 4]) &&
      hasLiveAskNeededHead(next, prev!.length + 5)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 错误 + ```demo + Ask User */
export function isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedError(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      hasLiveAskNeededHead(next, prev!.length + 4)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 7) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedError(next[prev!.length + 2]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 3) &&
      hasLiveAskNeededHead(next, prev!.length + 5)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + 错误 + Ask User */
export function isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedDemoFencePair(next, prev!.length) &&
      isLiveAddedError(next[prev!.length + 2]) &&
      hasLiveAskNeededHead(next, prev!.length + 3)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      isLiveAddedError(next[prev!.length + 3]) &&
      hasLiveAskNeededHead(next, prev!.length + 4)
    )
  }
  return false
}


/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + Ask User + Stop */
export function isLiveApprovalResolvedAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 2)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 3)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 错误 + Ask User + Stop */
export function isLiveApprovalResolvedErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 3) {
    return isLiveAddedError(next[prev!.length]) && hasLiveAskNeededCancelledHead(next, prev!.length + 1)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedError(next[prev!.length + 1]) && hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + Ask User + Stop */
export function isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 3)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 4)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 错误 + Ask User + Stop */
export function isLiveApprovalResolvedThinkErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedError(next[prev!.length + 1]) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 2)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedError(next[prev!.length + 2]) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 3)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + 错误 + Ask User + Stop */
export function isLiveApprovalResolvedAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
      isLiveAddedError(next[prev!.length + 2]) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 3)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
      isLiveAddedError(next[prev!.length + 3]) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 4)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + 错误 + Ask User + Stop */
export function isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
      isLiveAddedError(next[prev!.length + 3]) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 4)
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 7) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) &&
      isLiveAddedError(next[prev!.length + 4]) &&
      hasLiveAskNeededCancelledHead(next, prev!.length + 5)
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 ```demo + Ask User + compress */
export function isLiveApprovalResolvedAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedDemoFencePair(next, prev!.length) &&
      hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
      isLiveAddedCompress(next[prev!.length + 4])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
      isLiveAddedCompress(next[prev!.length + 5])
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 错误 + Ask User + compress */
export function isLiveApprovalResolvedErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return (
      isLiveAddedError(next[prev!.length]) &&
      hasLiveAskNeededResolvedHead(next, prev!.length + 1) &&
      isLiveAddedCompress(next[prev!.length + 3])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return (
      isLiveAddedError(next[prev!.length + 1]) &&
      hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
      isLiveAddedCompress(next[prev!.length + 4])
    )
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + ```demo + Ask User + compress */
export function isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 6) {
    return (
      isLiveAddedThinkPair(next[prev!.length]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 1) &&
      hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
      isLiveAddedCompress(next[prev!.length + 5])
    )
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 7) {
    return (
      isLiveAddedThinkPair(next[prev!.length + 1]) &&
      isLiveAddedDemoFencePair(next, prev!.length + 2) &&
      hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
      isLiveAddedCompress(next[prev!.length + 6])
    )
  }
  return false
}


/** Allow / Deny 只收口 Awaiting 行后同一帧 首枚 token + Ask User */
export function isLiveApprovalResolvedAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 3) {
    const text = next[prev!.length]
    return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 1)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    const text = next[prev!.length + 1]
    return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 2)
  }
  return false
}


/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 首枚 token + Ask User */
export function isLiveApprovalResolvedThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedThinkPair(next[prev!.length]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) && hasLiveAskNeededHead(next, prev!.length + 2)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return isLiveAddedThinkPair(next[prev!.length + 1]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 2]) && !isLiveErrorAnswer(next[prev!.length + 2]!)) && hasLiveAskNeededHead(next, prev!.length + 3)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 首枚 token + Ask User + Stop */
export function isLiveApprovalResolvedAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 3) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length])) && hasLiveAskNeededCancelledHead(next, prev!.length + 1)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length + 1])) && hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 首枚 token + Ask User + compress */
export function isLiveApprovalResolvedAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length]) && !isLiveErrorAnswer(next[prev!.length]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 1) && isLiveAddedCompress(next[prev!.length + 3])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 2) && isLiveAddedCompress(next[prev!.length + 4])
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 首枚 token + Ask User + Stop */
export function isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return isLiveAddedThinkPair(next[prev!.length]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 1])) && hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return isLiveAddedThinkPair(next[prev!.length + 1]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 2])) && hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 首枚 token + Ask User + compress */
export function isLiveApprovalResolvedThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 5) {
    return isLiveAddedThinkPair(next[prev!.length]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 2) && isLiveAddedCompress(next[prev!.length + 4])
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return isLiveAddedThinkPair(next[prev!.length + 1]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 2]) && !isLiveErrorAnswer(next[prev!.length + 2]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 Ask User + 下一工具已 complete_call */
export function isLiveApprovalResolvedAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 3) {
    return hasLiveAskNeededResolvedHead(next, prev!.length) && isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return hasLiveAskNeededResolvedHead(next, prev!.length + 1) && isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 Ask User + 下一工具仍 active */
export function isLiveApprovalResolvedAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 3) {
    return hasLiveAskNeededHead(next, prev!.length) && isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 4) {
    return hasLiveAskNeededHead(next, prev!.length + 1) && isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalResolvedAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length]) && !isLiveErrorAnswer(next[prev!.length]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 1) && isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 2) && isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 首枚 token + Ask User + 下一工具仍 active */
export function isLiveApprovalResolvedAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 4) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length]) && !isLiveErrorAnswer(next[prev!.length]!)) && hasLiveAskNeededHead(next, prev!.length + 1) && isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 5) {
    return Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) && hasLiveAskNeededHead(next, prev!.length + 2) && isLiveAddedToolsWithOptionalStatus(prev!.length + 4, next)
  }
  return false
}

/** Allow / Deny 只收口 Awaiting 行后同一帧 think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalResolvedThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (hasLiveApprovalResolvedPrefixClose(prev, next) && next.length === prev!.length + 5) {
    return isLiveAddedThinkPair(next[prev!.length]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 1]) && !isLiveErrorAnswer(next[prev!.length + 1]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 2) && isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
  }
  if (hasLiveApprovalResolvedAppendPrefix(prev, next) && next.length === prev!.length + 6) {
    return isLiveAddedThinkPair(next[prev!.length + 1]) && Boolean(isLiveAddedAnswerPair(next[prev!.length + 2]) && !isLiveErrorAnswer(next[prev!.length + 2]!)) && hasLiveAskNeededResolvedHead(next, prev!.length + 3) && isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
  }
  return false
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

/** Allow 收口并 tool_done 后同一帧 think + 错误 + ```demo */
export function isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2)
  )
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + 错误 */
export function isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3])
  )
}

/** Allow 收口并 tool_done 后同一帧 think + 错误 + ```demo + Stop */
export function isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedError(next[prev.length + 1])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 2)) return false
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

/** Allow 收口并 tool_done 后同一帧 ```demo + 错误 */
export function isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedDemoFencePair(next, prev!.length) && isLiveAddedError(next[prev!.length + 2])
}

/** Allow 收口并 tool_done 后同一帧 错误 + ```demo */
export function isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedError(next[prev!.length]) && isLiveAddedDemoFencePair(next, prev!.length + 1)
}

/** Allow 收口并 tool_done 后同一帧 ```demo + 错误 + Stop */
export function isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 3) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length)) return false
  if (!isLiveAddedError(next[prev.length + 2])) return false
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

/** Allow 收口并 tool_done 后同一帧 错误 + ```demo + Stop */
export function isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 3) return false
  if (!isLiveAddedError(next[prev.length])) return false
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

/** Allow 收口并 tool_done 后同一帧 think + ```demo + 错误 + compress */
export function isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** Allow 收口并 tool_done 后同一帧 think + 错误 + ```demo + compress */
export function isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefix(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + 错误 + Stop */
export function isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 1)) return false
  if (!isLiveAddedError(next[prev.length + 3])) return false
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

/** Allow 收口并 tool_done 后同一帧 think + ```demo + 错误 + Stop + compress */
export function isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 5) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 1)) return false
  if (!isLiveAddedError(next[prev.length + 3])) return false
  if (!isLiveAddedCompress(next[prev.length + 4])) return false
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

/** Allow 收口并 tool_done 后同一帧 think + ```demo + Ask User */
export function isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededHead(next, prev!.length + 3)
  )
}

/** Allow 收口并 tool_done 后同一帧 think + 错误 + Ask User */
export function isLiveApprovalAllowedSettleThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededHead(next, prev!.length + 2)
  )
}


/** Allow 收口并 tool_done 后同一帧 ```demo + Ask User */
export function isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return isLiveAddedDemoFencePair(next, prev!.length) && hasLiveAskNeededHead(next, prev!.length + 2)
}

/** Allow 收口并 tool_done 后同一帧 错误 + Ask User */
export function isLiveApprovalAllowedSettleErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedError(next[prev!.length]) && hasLiveAskNeededHead(next, prev!.length + 1)
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + 错误 + Ask User */
export function isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededHead(next, prev!.length + 4)
  )
}

/** Allow 收口并 tool_done 后同一帧 think + 错误 + ```demo + Ask User */
export function isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    hasLiveAskNeededHead(next, prev!.length + 4)
  )
}

/** Allow 收口并 tool_done 后同一帧 ```demo + 错误 + Ask User */
export function isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededHead(next, prev!.length + 3)
  )
}

/** Allow 收口并 tool_done 后同一帧 错误 + ```demo + Ask User */
export function isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededHead(next, prev!.length + 3)
  )
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + Ask User + Stop */
export function isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  )
}

/** Allow 收口并 tool_done 后同一帧 think + 错误 + Ask User + Stop */
export function isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  )
}


/** Allow 收口并 tool_done 后同一帧 ```demo + Ask User + Stop */
export function isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  )
}

/** Allow 收口并 tool_done 后同一帧 错误 + Ask User + Stop */
export function isLiveApprovalAllowedSettleErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedError(next[prev!.length]) && hasLiveAskNeededCancelledHead(next, prev!.length + 1)
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + 错误 + Ask User + Stop */
export function isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 4)
  )
}

/** Allow 收口并 tool_done 后同一帧 ```demo + 错误 + Ask User + Stop */
export function isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  )
}

/** Allow 收口并 tool_done 后同一帧 think + ```demo + Ask User + compress */
export function isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** Allow 收口并 tool_done 后同一帧 ```demo + Ask User + compress */
export function isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}


/** Allow 收口并 tool_done 后同一帧 + think + 错误 + ```demo + Ask User + Stop */
export function isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 4)
  )
}

/** Allow 收口并 tool_done 后同一帧 + 错误 + ```demo + Ask User + Stop */
export function isLiveApprovalAllowedSettleErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  )
}

/** Allow 收口并 tool_done 后同一帧 + 错误 + Ask User + compress */
export function isLiveApprovalAllowedSettleErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  )
}

/** Allow 收口并 tool_done 后同一帧 + think + 错误 + Ask User + compress */
export function isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** Allow 收口并 tool_done 后同一帧 + think + ```demo + 错误 + Ask User + compress */
export function isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** Allow 收口并 tool_done 后同一帧 + ```demo + 错误 + Ask User + compress */
export function isLiveApprovalAllowedSettleAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** Allow 收口并 tool_done 后同一帧 + 错误 + ```demo + Ask User + compress */
export function isLiveApprovalAllowedSettleErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}


/** Allow收口并 tool_done 后同一帧 think + 首枚 token + Ask User */
export function isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  const text = next[prev!.length + 1]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 2)
}

/** Allow收口并 tool_done 后同一帧 首枚 token + Ask User + Stop */
export function isLiveApprovalAllowedSettleAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 3) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length])) && hasLiveAskNeededCancelledHead(next, prev!.length + 1)
}

/** Allow收口并 tool_done 后同一帧 首枚 token + Ask User + compress */
export function isLiveApprovalAllowedSettleAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 4) return false
  const text = next[prev!.length]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 1) && isLiveAddedCompress(next[prev!.length + 3])
}

/** Allow收口并 tool_done 后同一帧 think + 首枚 token + Ask User + Stop */
export function isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 1])) && hasLiveAskNeededCancelledHead(next, prev!.length + 2)
}

/** Allow收口并 tool_done 后同一帧 think + 首枚 token + Ask User + compress */
export function isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  const text = next[prev!.length + 1]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 2) && isLiveAddedCompress(next[prev!.length + 4])
}

/** Allow收口并 tool_done 后同一帧 Ask User + 下一工具已 complete_call */
export function isLiveApprovalAllowedSettleAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** Allow收口并 tool_done 后同一帧 Ask User + 下一工具仍 active */
export function isLiveApprovalAllowedSettleAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (!hasLiveAskNeededHead(next, prev!.length)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
}

/** Allow收口并 tool_done 后同一帧 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalAllowedSettleAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  const text = next[prev!.length]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 1)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** Allow收口并 tool_done 后同一帧 首枚 token + Ask User + 下一工具仍 active */
export function isLiveApprovalAllowedSettleAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  const text = next[prev!.length]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 1)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
}

/** Allow收口并 tool_done 后同一帧 think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalAllowedSettlePrefixClose(prev, next)) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  const text = next[prev!.length + 1]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
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

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + ```demo */
export function isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2)
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + 错误 */
export function isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3])
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + ```demo + Stop */
export function isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedError(next[prev.length + 1])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 2)) return false
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

/** Deny 收口并 tool_done error 后同一帧 ```demo + 错误 */
export function isLiveApprovalDeniedAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedDemoFencePair(next, prev!.length) && isLiveAddedError(next[prev!.length + 2])
}

/** Deny 收口并 tool_done error 后同一帧 错误 + ```demo */
export function isLiveApprovalDeniedErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedError(next[prev!.length]) && isLiveAddedDemoFencePair(next, prev!.length + 1)
}

/** Deny 收口并 tool_done error 后同一帧 ```demo + 错误 + Stop */
export function isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 3) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length)) return false
  if (!isLiveAddedError(next[prev.length + 2])) return false
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

/** Deny 收口并 tool_done error 后同一帧 错误 + ```demo + Stop */
export function isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 3) return false
  if (!isLiveAddedError(next[prev.length])) return false
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

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + 错误 + compress */
export function isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + ```demo + compress */
export function isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefix(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + 错误 + Stop */
export function isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 1)) return false
  if (!isLiveAddedError(next[prev.length + 3])) return false
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

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + 错误 + Stop + compress */
export function isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!prev || next.length !== prev.length + 5) return false
  if (!isLiveAddedThinkPair(next[prev.length])) return false
  if (!isLiveAddedCancelledDemoFencePair(next, prev.length + 1)) return false
  if (!isLiveAddedError(next[prev.length + 3])) return false
  if (!isLiveAddedCompress(next[prev.length + 4])) return false
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

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + Ask User */
export function isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededHead(next, prev!.length + 3)
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + Ask User */
export function isLiveApprovalDeniedThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededHead(next, prev!.length + 2)
  )
}


/** Deny 收口并 tool_done error 后同一帧 ```demo + Ask User */
export function isLiveApprovalDeniedAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return isLiveAddedDemoFencePair(next, prev!.length) && hasLiveAskNeededHead(next, prev!.length + 2)
}

/** Deny 收口并 tool_done error 后同一帧 错误 + Ask User */
export function isLiveApprovalDeniedErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedError(next[prev!.length]) && hasLiveAskNeededHead(next, prev!.length + 1)
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + 错误 + Ask User */
export function isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededHead(next, prev!.length + 4)
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + ```demo + Ask User */
export function isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    hasLiveAskNeededHead(next, prev!.length + 4)
  )
}

/** Deny 收口并 tool_done error 后同一帧 ```demo + 错误 + Ask User */
export function isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededHead(next, prev!.length + 3)
  )
}

/** Deny 收口并 tool_done error 后同一帧 错误 + ```demo + Ask User */
export function isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededHead(next, prev!.length + 3)
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + Ask User + Stop */
export function isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + 错误 + Ask User + Stop */
export function isLiveApprovalDeniedThinkErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  )
}


/** Deny 收口并 tool_done error 后同一帧 ```demo + Ask User + Stop */
export function isLiveApprovalDeniedAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  )
}

/** Deny 收口并 tool_done error 后同一帧 错误 + Ask User + Stop */
export function isLiveApprovalDeniedErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 3) return false
  return isLiveAddedError(next[prev!.length]) && hasLiveAskNeededCancelledHead(next, prev!.length + 1)
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + 错误 + Ask User + Stop */
export function isLiveApprovalDeniedThinkAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 4)
  )
}

/** Deny 收口并 tool_done error 后同一帧 ```demo + 错误 + Ask User + Stop */
export function isLiveApprovalDeniedAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  )
}

/** Deny 收口并 tool_done error 后同一帧 think + ```demo + Ask User + compress */
export function isLiveApprovalDeniedThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** Deny 收口并 tool_done error 后同一帧 ```demo + Ask User + compress */
export function isLiveApprovalDeniedAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}


/** Deny 收口并 tool_done error 后同一帧 + think + 错误 + ```demo + Ask User + Stop */
export function isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 4)
  )
}

/** Deny 收口并 tool_done error 后同一帧 + 错误 + ```demo + Ask User + Stop */
export function isLiveApprovalDeniedErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  )
}

/** Deny 收口并 tool_done error 后同一帧 + 错误 + Ask User + compress */
export function isLiveApprovalDeniedErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 4) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  )
}

/** Deny 收口并 tool_done error 后同一帧 + think + 错误 + Ask User + compress */
export function isLiveApprovalDeniedThinkErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  )
}

/** Deny 收口并 tool_done error 后同一帧 + think + ```demo + 错误 + Ask User + compress */
export function isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  return (
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** Deny 收口并 tool_done error 后同一帧 + ```demo + 错误 + Ask User + compress */
export function isLiveApprovalDeniedAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** Deny 收口并 tool_done error 后同一帧 + 错误 + ```demo + Ask User + compress */
export function isLiveApprovalDeniedErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  return (
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}


/** Deny收口并 tool_done 后同一帧 think + 首枚 token + Ask User */
export function isLiveApprovalDeniedThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  const text = next[prev!.length + 1]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 2)
}

/** Deny收口并 tool_done 后同一帧 首枚 token + Ask User + Stop */
export function isLiveApprovalDeniedAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 3) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length])) && hasLiveAskNeededCancelledHead(next, prev!.length + 1)
}

/** Deny收口并 tool_done 后同一帧 首枚 token + Ask User + compress */
export function isLiveApprovalDeniedAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 4) return false
  const text = next[prev!.length]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 1) && isLiveAddedCompress(next[prev!.length + 3])
}

/** Deny收口并 tool_done 后同一帧 think + 首枚 token + Ask User + Stop */
export function isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 4) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 1])) && hasLiveAskNeededCancelledHead(next, prev!.length + 2)
}

/** Deny收口并 tool_done 后同一帧 think + 首枚 token + Ask User + compress */
export function isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (next.length !== prev!.length + 5) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  const text = next[prev!.length + 1]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 2) && isLiveAddedCompress(next[prev!.length + 4])
}

/** Deny收口并 tool_done 后同一帧 Ask User + 下一工具已 complete_call */
export function isLiveApprovalDeniedAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
}

/** Deny收口并 tool_done 后同一帧 Ask User + 下一工具仍 active */
export function isLiveApprovalDeniedAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (!hasLiveAskNeededHead(next, prev!.length)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
}

/** Deny收口并 tool_done 后同一帧 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalDeniedAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  const text = next[prev!.length]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 1)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
}

/** Deny收口并 tool_done 后同一帧 首枚 token + Ask User + 下一工具仍 active */
export function isLiveApprovalDeniedAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  const text = next[prev!.length]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 1)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
}

/** Deny收口并 tool_done 后同一帧 think + 首枚 token + Ask User + 下一工具已 complete_call */
export function isLiveApprovalDeniedThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (!hasLiveApprovalDeniedPrefixClose(prev, next)) return false
  if (!isLiveAddedThinkPair(next[prev!.length])) return false
  const text = next[prev!.length + 1]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
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

/** Ask User 作答后同一帧 think + ```demo + 错误 + Stop + compress */
export function isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedCompress(next[prev!.length + 4])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** Ask User 作答后同一帧 ```demo + 错误 + Stop */
export function isLiveAskResolvedAnswerDemoErrorCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 2) && isLiveAddedError(next[next.length - 1])
  )
}

/** Ask User 作答后同一帧 错误 + ```demo + compress */
export function isLiveAskResolvedErrorAnswerDemoCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}


/** Ask User 作答后同一帧 think + ```demo + 再开 Ask User */
export function isLiveAskResolvedThinkAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededHead(next, prev!.length + 3)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededHead(next, prev!.length + 5)
  )
}


/** Ask User 作答后同一帧 ```demo + 再开 Ask User */
export function isLiveAskResolvedAnswerDemoAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedDemoFencePair(next, prev!.length) &&
    hasLiveAskNeededHead(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && hasLiveAskNeededHead(next, prev!.length + 4)
}

/** Ask User 作答后同一帧 错误 + 再开 Ask User */
export function isLiveAskResolvedErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedError(next[prev!.length]) &&
    hasLiveAskNeededHead(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedError(next[prev!.length + 2]) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** Ask User 作答后同一帧 think + 错误 + 再开 Ask User */
export function isLiveAskResolvedThinkErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededHead(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededHead(next, prev!.length + 4)
  )
}

/** Ask User 作答后同一帧 think + ```demo + 错误 + 再开 Ask User */
export function isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 6 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededHead(next, prev!.length + 4)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededHead(next, prev!.length + 6)
  )
}


/** Ask User 作答后同一帧 ```demo + 再开 Ask User + Stop */
export function isLiveAskResolvedAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** Ask User 作答后同一帧 错误 + 再开 Ask User + Stop */
export function isLiveAskResolvedErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedError(next[prev!.length]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedError(next[prev!.length + 2]) && hasLiveAskNeededCancelledHead(next, prev!.length + 3)
}

/** Ask User 作答后同一帧 think + 错误 + 再开 Ask User + Stop */
export function isLiveAskResolvedThinkErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 4)
  )
}

/** Ask User 作答后同一帧 think + ```demo + 错误 + 再开 Ask User + Stop */
export function isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 6 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 4)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 6)
  )
}

/** Ask User 作答后同一帧 ```demo + 再开 Ask User + compress */
export function isLiveAskResolvedAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedDemoFencePair(next, prev!.length) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}

/** Ask User 作答后同一帧 错误 + 再开 Ask User + compress */
export function isLiveAskResolvedErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedError(next[prev!.length]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** Ask User 作答后同一帧 think + 错误 + 再开 Ask User + compress */
export function isLiveAskResolvedThinkErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
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
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  )
}


/** Ask User 作答后同一帧 think + ```demo + 再开 Ask User + Stop */
export function isLiveAskResolvedThinkAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}

/** Ask User 作答后同一帧 think + ```demo + 再开 Ask User + compress */
export function isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 6 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** Ask User 作答后同一帧 think + ```demo + 错误 + 再开 Ask User + compress */
export function isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 7 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 4) &&
    isLiveAddedCompress(next[prev!.length + 6])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 9) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[prev!.length + 5]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 6) &&
    isLiveAddedCompress(next[prev!.length + 8])
  )
}

/** Ask User 作答后同一帧 错误 + ```demo + 再开 Ask User + Stop */
export function isLiveAskResolvedErrorAnswerDemoAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 1) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 3) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}

/** Ask User 作答后同一帧 错误 + ```demo + 再开 Ask User + compress */
export function isLiveAskResolvedErrorAnswerDemoAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 6 &&
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** Ask User 作答后同一帧 ```demo + 错误 + 再开 Ask User + Stop */
export function isLiveAskResolvedAnswerDemoErrorAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 3)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedDoneDemoCancelledToolPair(next, prev!.length + 2) &&
    isLiveAddedError(next[prev!.length + 4]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 5)
  )
}

/** Ask User 作答后同一帧 ```demo + 错误 + 再开 Ask User + compress */
export function isLiveAskResolvedAnswerDemoErrorAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 6 &&
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 3) &&
    isLiveAddedCompress(next[prev!.length + 5])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 8) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedError(next[prev!.length + 4]) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 5) &&
    isLiveAddedCompress(next[prev!.length + 7])
  )
}

/** Ask User 作答后同一帧 首枚 token + 再开 Ask User */
export function isLiveAskResolvedAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedAnswerPair(next[prev!.length]) &&
    !isLiveErrorAnswer(next[prev!.length]!) &&
    hasLiveAskNeededHead(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 3)
}

/** Ask User 作答后同一帧 think + 首枚 token + 再开 Ask User */
export function isLiveAskResolvedThinkAnswerAskAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedAnswerPair(next[prev!.length + 1]) &&
    !isLiveErrorAnswer(next[prev!.length + 1]!) &&
    hasLiveAskNeededHead(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededHead(next, prev!.length + 4)
}


/** Ask User 作答后同一帧 首枚 token + 再开 Ask User + Stop */
export function isLiveAskResolvedAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedAnswerPair(next[prev!.length]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 2])) && hasLiveAskNeededCancelledHead(next, prev!.length + 3)
}

/** Ask User 作答后同一帧 think + 首枚 token + 再开 Ask User + Stop */
export function isLiveAskResolvedThinkAnswerAskCancelAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedAnswerPair(next[prev!.length + 1]) &&
    hasLiveAskNeededCancelledHead(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  return Boolean(isLiveAddedAnswerPair(next[prev!.length + 3])) && hasLiveAskNeededCancelledHead(next, prev!.length + 4)
}

/** Ask User 作答后同一帧 首枚 token + 再开 Ask User + compress */
export function isLiveAskResolvedAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedAnswerPair(next[prev!.length]) &&
    !isLiveErrorAnswer(next[prev!.length]!) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 1) &&
    isLiveAddedCompress(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  const text = next[prev!.length + 2]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 3) && isLiveAddedCompress(next[prev!.length + 5])
}

/** Ask User 作答后同一帧 think + 首枚 token + 再开 Ask User + compress */
export function isLiveAskResolvedThinkAnswerAskCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedAnswerPair(next[prev!.length + 1]) &&
    !isLiveErrorAnswer(next[prev!.length + 1]!) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  return Boolean(text && isLiveAddedAnswerPair(text) && !isLiveErrorAnswer(text)) && hasLiveAskNeededResolvedHead(next, prev!.length + 4) && isLiveAddedCompress(next[prev!.length + 6])
}

/** Ask User 作答后同一帧 再开 Ask User + 下一工具已 complete_call */
export function isLiveAskResolvedAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    hasLiveAskNeededResolvedHead(next, prev!.length) &&
    isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 2, next)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 2)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
}

/** Ask User 作答后同一帧 再开 Ask User + 下一工具仍 active */
export function isLiveAskResolvedAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    hasLiveAskNeededHead(next, prev!.length) &&
    isLiveAddedToolsWithOptionalStatus(prev!.length + 2, next)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 2)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 4, next)
}

/** Ask User 作答后同一帧 首枚 token + 再开 Ask User + 下一工具已 complete_call */
export function isLiveAskResolvedAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedAnswerPair(next[prev!.length]) &&
    !isLiveErrorAnswer(next[prev!.length]!) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 1) &&
    isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 3, next)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 3)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 5, next)
}

/** Ask User 作答后同一帧 首枚 token + 再开 Ask User + 下一工具仍 active */
export function isLiveAskResolvedAnswerAskActiveToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedAnswerPair(next[prev!.length]) &&
    !isLiveErrorAnswer(next[prev!.length]!) &&
    hasLiveAskNeededHead(next, prev!.length + 1) &&
    isLiveAddedToolsWithOptionalStatus(prev!.length + 3, next)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  const text = next[prev!.length + 2]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededHead(next, prev!.length + 3)) return false
  return isLiveAddedToolsWithOptionalStatus(prev!.length + 5, next)
}

/** Ask User 作答后同一帧 think + 首枚 token + 再开 Ask User + 下一工具已 complete_call */
export function isLiveAskResolvedThinkAnswerAskToolAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedAnswerPair(next[prev!.length + 1]) &&
    !isLiveErrorAnswer(next[prev!.length + 1]!) &&
    hasLiveAskNeededResolvedHead(next, prev!.length + 2) &&
    isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 4, next)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  if (!isLiveAddedThinkPair(next[prev!.length + 2])) return false
  const text = next[prev!.length + 3]
  if (!text || !isLiveAddedAnswerPair(text) || isLiveErrorAnswer(text)) return false
  if (!hasLiveAskNeededResolvedHead(next, prev!.length + 4)) return false
  return isLiveAddedSettledToolsWithOptionalStatus(prev!.length + 6, next)
}

/** Ask User 作答后同一帧 ```demo + 错误 + compress */
export function isLiveAskResolvedAnswerDemoErrorCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2]) &&
    isLiveAddedCompress(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedError(next[prev!.length + 4]) &&
    isLiveAddedCompress(next[prev!.length + 5])
  )
}

/** Ask User 作答后同一帧 think + ```demo + 错误 */
export function isLiveAskResolvedThinkAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1) &&
    isLiveAddedError(next[prev!.length + 3])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 3) &&
    isLiveAddedError(next[next.length - 1])
  )
}

/** Ask User 作答后同一帧 think + 错误 + ```demo */
export function isLiveAskResolvedThinkErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 4 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 2)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 6) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 4)
  )
}

/** Ask User 作答后同一帧 ```demo + 错误 */
export function isLiveAskResolvedAnswerDemoErrorAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedDemoFencePair(next, prev!.length) &&
    isLiveAddedError(next[prev!.length + 2])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedDemoFencePair(next, prev!.length + 2) && isLiveAddedError(next[next.length - 1])
}

/** Ask User 作答后同一帧 错误 + ```demo */
export function isLiveAskResolvedErrorAnswerDemoAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedHangPrefix(prev, next) &&
    next.length === prev!.length + 3 &&
    isLiveAddedError(next[prev!.length]) &&
    isLiveAddedDemoFencePair(next, prev!.length + 1)
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 5) return false
  if (!isLiveAddedAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return isLiveAddedError(next[prev!.length + 2]) && isLiveAddedDemoFencePair(next, prev!.length + 3)
}

/** Ask User 作答后同一帧 think + 错误 + ```demo + Stop + compress */
export function isLiveAskResolvedThinkErrorAnswerDemoCancelCompressAppendChange(
  prev: readonly TurnSegment[] | null | undefined,
  next: readonly TurnSegment[]
): boolean {
  if (
    hasLiveAskResolvedCancelHangPrefix(prev, next) &&
    next.length === prev!.length + 5 &&
    isLiveAddedThinkPair(next[prev!.length]) &&
    isLiveAddedError(next[prev!.length + 1]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 2) &&
    isLiveAddedCompress(next[prev!.length + 4])
  ) {
    return true
  }
  if (!hasLiveToolAppendPrefixClose(prev, next) || next.length !== prev!.length + 7) return false
  if (!isLiveAddedCancelledAskTool(next[prev!.length])) return false
  if (!isLiveAddedResolvedAskStatus(next[prev!.length + 1])) return false
  return (
    isLiveAddedThinkPair(next[prev!.length + 2]) &&
    isLiveAddedError(next[prev!.length + 3]) &&
    isLiveAddedCancelledDemoFencePair(next, prev!.length + 4) &&
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

function hasLiveAskNeededResolvedHead(
  next: readonly TurnSegment[],
  start: number
): boolean {
  return isLiveAddedAskTool(next[start]) && isLiveAddedResolvedAskStatus(next[start + 1])
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

/** Stop 后 Ask 工具标 cancelled，Question requested 行已是 done（下一工具已 complete_call 时不跟 Ask 一起 cancelled） */
function hasLiveAskNeededStoppedHead(next: readonly TurnSegment[], start: number): boolean {
  return isLiveAddedCancelledAskTool(next[start]) && isLiveAddedResolvedAskStatus(next[start + 1])
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


function isLiveAddedDoneDemoCancelledToolPair(next: readonly TurnSegment[], start: number): boolean {
  const text = next[start]
  if (!text || text.kind !== 'text' || !hasStreamingDemoFence(text.content ?? '')) return false
  const demo = next[start + 1]
  return Boolean(
    demo &&
      demo.kind === 'tool' &&
      demo.status === 'cancelled' &&
      demo.toolName === 'present_inline_demo'
  )
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
  if (isLiveApprovalNeededAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments)) return 'tool'
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
  if (isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalDeniedThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
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
  if (isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
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
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
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
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
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
  if (isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
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
  if (isLiveStatusApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveStatusApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
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
  if (isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoErrorCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAnswerDemoCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerAskAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerAskActiveToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerAskToolAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoErrorCompressAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedAnswerDemoErrorAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedErrorAnswerDemoAppendChange(prevSegments, segments)) return 'tool'
  if (isLiveAskResolvedThinkErrorAnswerDemoCancelCompressAppendChange(prevSegments, segments)) return 'tool'
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
      isLiveStatusApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
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
      isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
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
      isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
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
      isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelCompressAppendChange(processHold.segments, segments) ||
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
      isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelCompressAppendChange(processHold.segments, segments) ||
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
      isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelCompressAppendChange(processHold.segments, segments) ||
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
      isLiveApprovalNeededAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerDemoAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAskToolCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalNeededAnswerAskToolCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAskToolCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalNeededAnswerAskToolCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAskToolCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskToolCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAskToolCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskToolCancelAppendChange(processHold.segments, segments) ||
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
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
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
      isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
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
      isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
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
      isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
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
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
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
      isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments)
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
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
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
      isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorCancelCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAnswerDemoAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedErrorAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCompressAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedAnswerAskActiveToolAppendChange(processHold.segments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskToolAppendChange(processHold.segments, segments) ||
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
  if (isLiveApprovalNeededAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerDemoAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededThinkAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalNeededAnswerAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalNeededAnswerAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerDemoAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededThinkAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalNeededAnswerAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalNeededAnswerAskToolCancelAppendChange(input.prevSegments, input.segments)) {
    return false
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
  if (isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalDeniedThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
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
  if (isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalResolvedThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
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
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
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
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatApprovalResolvedThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
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
  if (isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveWriteStatStatusApprovalResolvedThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
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
  if (isLiveStatusApprovalResolvedAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveStatusApprovalResolvedThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
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
  if (isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoErrorCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAnswerDemoCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAnswerDemoAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAnswerDemoAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoErrorAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoErrorAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerAskAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerAskCancelAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerAskCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerAskActiveToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerAskToolAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoErrorCompressAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedAnswerDemoErrorAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedErrorAnswerDemoAppendChange(input.prevSegments, input.segments)) {
    return false
  }
  if (isLiveAskResolvedThinkErrorAnswerDemoCancelCompressAppendChange(input.prevSegments, input.segments)) {
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
        isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
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
        isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoToolAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleThinkAnswerAskAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleAnswerAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleThinkAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedThinkAnswerAskAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveAskResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveAskResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveAskResolvedErrorAskAppendChange(prevSegments, segments) ||
        isLiveAskResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
        isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveAskResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveAskResolvedAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveAskResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveAskResolvedAskToolAppendChange(prevSegments, segments) ||
        isLiveAskResolvedAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveAskResolvedAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveAskResolvedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveAskResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
        isLiveAskResolvedErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveAskResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalAllowedSettleErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveApprovalDeniedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
        isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments)
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
      isLiveApprovalNeededAnswerAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAskToolCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAskToolCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAskToolCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAskToolCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskToolCancelAppendChange(prevSegments, segments) ||
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
      isLiveStatusApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
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
      isLiveStatusApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
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
      isLiveAskResolvedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorAskAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAskToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerDemoAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCancelAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskActiveToolAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskToolAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorCancelCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededAnswerDemoAskCompressAppendChange(prevSegments, segments) ||
      isLiveWriteStatStatusApprovalNeededThinkAnswerDemoAskCompressAppendChange(prevSegments, segments))
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
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalAllowedSettleErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalDeniedErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorAnswerDemoAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedErrorAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveAskResolvedThinkAnswerDemoCompressAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkAnswerDemoCancelAppendChange(prevSegments, segments) ||
      isLiveApprovalResolvedThinkErrorAnswerDemoAppendChange(prevSegments, segments) ||
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
