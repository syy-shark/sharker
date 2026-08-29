/**
 * 直播行过程 / 回答切片：token 只换回答；正文或思考加长、同一工具只改详情时不扫过程指纹 / 正文 ```demo 只换演示槽、不重跑过程 / 全文 buildAnswerParts。
 * 工具详情只换该步引用；工具收束无新写盘也只换该步（不必是末步；同一帧多条只读并行 complete_call 也只换这些步，不发明 Exploring 分组格，对标 Codex exec_cell complete_call）；写盘 +/- / 参数或收束带核实 diff 只换该步，回答只换该工具的 diff 槽、已画正文不重拆（对标 ~0.5s / Edited 格，不复制 #38695）；写盘收束同时新开工具时过程 remap 并追加，回答只换该工具的 diff 槽；写盘收束同时新开 status / 思考 / 散文 / ```demo / compress / 错误 / present_inline_demo 时过程 remap（status / compress 再追加该行，思考续旁白，散文/演示/错误开回答槽），写盘收束同时新开 status+思考 / 思考+散文 / status+散文 时过程 remap（有 status 再追加该行）且回答只换 diff 槽，以免藏直播 +/-（不把写盘收束算进 isLivePrefixClose）；前缀没变或只收束思考/status/散文/无新写盘的工具时新开一或多个工具（可带一条 Awaiting / Question requested 行）只追加过程步并封回答尾（同一 16ms 里 token 尾 + tool_start 可先加长再标 done、complete_call + add_call、只读并行多个 tool_start、规划下一步后同一帧或下一轮 tool_start（规划下一步可先标 done，可夹 think）、think + tool_start、tool_start + approval_needed / user_input_needed 也走这条，不发明 Exploring 分组格）、新思考只换旁白（无新写盘的工具收束后同一帧开思考也走这条，不复制 #24850；think 尾 + 首枚 token 可先加长再标 done）、新散文只开回答尾、新 status 只追加过程步（对标 Reconnecting... n/5 / Compacting）、无新写盘的工具收束后同一帧新开 status+思考 / 思考+散文 / status+散文 / status+思考+散文 / 思考+```demo / status+```demo / status+思考+```demo 时过程 remap（有 status 再追加该行；规划下一步后本地/快模型首枚 think / token / ```demo 也走这条，think 后首枚 token 可先把旁白标 done）、`compress` 收口 status 或无新写盘的工具后只追加已完成压缩步（对标 contextCompaction / complete_call；规划下一步后同一帧 compress 可先把 status 标 done，可夹 think）、审批挂上或收束只换工具步与 Awaiting approval 行、Ask User 挂上只换工具步与 Question requested 行（规划下一步后同一帧 user_input_needed / approval_needed 可改写规划下一步为第一题 header / Awaiting，已在场时 think 后推新 Question requested / Awaiting 只追加该行，可夹规划下一步；不发明 TUI Questions n/n）、status 收束只换该行、Stop 把多条 active 收成 cancelled 只换这些步（对标 You stopped after；规划下一步后同一帧 Stop 可先挂上 status / think 再标 cancelled）、错误收口 status 或无新写盘的工具后只开错误回答尾（不进过程）、新 present_inline_demo 或正文 ```demo 只开演示槽（过程不追加；规划下一步后同一帧 present_inline_demo 可先把 status 标 done，过程只追加该行）；演示 HTML / 说明 / 收束只换该槽；命令末行不换过程数组、不发 16ms store。对标 Codex #22860（已画过程不跟每枚 token 闪）。
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
  if (isLiveApprovalResolvedChange(prevSegments, segments)) return 'tool'
  if (isLiveUserInputNeededChange(prevSegments, segments)) return 'tool'
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
    (isLiveThinkToolAppendChange(prevSegments, segments) ||
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
      isLiveWriteStatStatusThinkStatusAppendChange(prevSegments, segments))
  ) {
    return prev + (segments[prevSegments.length + 1]?.content ?? '')
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
    (isLiveToolAppendChange(processHold.segments, segments) ||
      isLiveToolWriteStatAppendChange(processHold.segments, segments) ||
      isLiveStatusToolAppendChange(processHold.segments, segments) ||
      isLiveThinkToolAppendChange(processHold.segments, segments) ||
      isLiveStatusThinkToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatThinkToolAppendChange(processHold.segments, segments) ||
      isLiveWriteStatStatusThinkToolAppendChange(processHold.segments, segments) ||
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
      isLiveWriteStatThinkAppendChange(processHold.segments, segments))
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
      isLiveWriteStatDemoAppendChange(processHold.segments, segments) ||
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
    (isLiveApprovalNeededChange(processHold.segments, segments) ||
      isLiveApprovalResolvedChange(processHold.segments, segments) ||
      isLiveUserInputNeededChange(processHold.segments, segments) ||
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
    isLiveToolAppendChange(input.prevSegments, input.segments) ||
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
  if (isLiveApprovalResolvedChange(input.prevSegments, input.segments)) return true
  if (isLiveUserInputNeededChange(input.prevSegments, input.segments)) return true
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
        isLiveWriteStatStatusThinkAnswerAppendChange(prevSegments, segments)
      ) {
        const view = appendLiveAnswerView(patched, segments[segments.length - 1]!)
        answerGrowHold = { view, segments, tailPlain: true }
        return view
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
        isLiveWriteStatStatusThinkDemoAppendChange(prevSegments, segments)
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
        isLiveWriteStatStatusThinkStatusAppendChange(prevSegments, segments)
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
        isLiveWriteStatStatusThinkErrorAppendChange(prevSegments, segments)
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
      isLiveStatusToolAppendChange(prevSegments, segments) ||
      isLiveThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusThinkToolAppendChange(prevSegments, segments) ||
      isLiveStatusCancelAppendChange(prevSegments, segments) ||
      isLiveThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusThinkCancelAppendChange(prevSegments, segments) ||
      isLiveStatusAppendChange(prevSegments, segments))
  ) {
    const sealed = findLiveClosedAnswerText(prevSegments, segments)
    if (sealed) {
      const view = sealLiveAnswerTail(prev, sealed)
      answerGrowHold = { view, segments, tailPlain: false }
      return view
    }
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
