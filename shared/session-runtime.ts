/**
 * 多会话队列与流归属：纯逻辑，渲染层与单测共用。
 * 保证 A 的排队 follow-up 不会在切换到 B 后派发到 B。
 * 直播行 retired 环挤出后仍按冻结正文画，不立刻重挂历史气泡。
 * `pinActiveLive` 钉进 map 的当前行由 `shouldStreamPinnedLiveAssistant` 继续跟秒表。
 * `nextPinnedTranscriptGaps` / `nextPinnedAfterGaps` 给 ChatView 稳定的历史缺口；预留行 persist 入列后复用同一 gap 引用，不重建历史行。
 * `nextPinnedLiveAssistantIds` 在 hideReserved 翻转但 id 没变时复用同一 pin 列，贴底 setState 不重建 pinned 槽。
 * `nextFrozenPinnedLiveSlots` 冻结槽不跟 loading / 秒表，收束不重挂上一轮直播树。
 * `shouldAttachLiveApprovalToPinnedSlot` 只让当前预留 id 接审批 / Ask User，跟进 hold 的上一轮不跟新一轮审批。
 * `shouldAttachLiveLoadingToPinnedSlot` 只让当前预留 id 跟 loading；hold 行（handoff id）不跟。
 * `shouldRetireLiveOnHandoffHold` 跟进开轮就把上一轮推进 retired 环冻结，adopt 不再重挂。
 * `shouldReserveLiveAfterHandoffHold` 冻结后立刻预留新 id，首枚 token 不另挂槽。
 * `shouldReuseReservedLiveOnHandoffAdopt` 已预留新 id 时 adopt 只清 handoff，不再换 id 重挂。
 * `shouldRestoreHeldLiveOnHandoffCancel` Stop 未出首枚 token 时把预留 id 收回 hold，避免空槽留下。
 * `shouldDeferLiveHandoffSeedPublish` 等 freeze 提交后再发准备中 seed，避免 hold 行闪新一轮。
 * `shouldMountLiveHandoffThinking` 已有新预留 id 时不另挂 Thinking 行。
 * `nextActivePinnedLiveSlots` 身份没变就留下未冻结槽，审批出现不重挂 hold 行。
 * `nextPinnedLiveRowNodes` 槽与 after 没变就留下同一 Fragment，loading 翻转不重挂冻结行。
 * `nextHistoricalRowNodes` 挤出冻结行时只重画该 id，其余历史行留下。
 * `nextPinnedAfterRowNodes` 挤出冻结行时只换该 pin 后缺口，其余 after 数组留下以免重挂冻结 Fragment。
 * `shouldPublishEmptyLiveBodyOnBeginTurn` 开轮不先发空直播体，留给同一帧的准备中 seed。
 * 再掉出 ejected 环的行进 parts 归档（当前对话不截断，切对话清掉），不抬 `EJECTED_LIVE_LIMIT`。
 * 归档行带过程快照，重挂不丢 Thought / 时间线、不塌行高。
 * @see shared/ARCH.md
 */

import type { AssistantMeta, ChatAttachment, ChatMessage, TurnSegment } from './types'
import type { ProcessPhaseStep } from './process-phases'
import type { AnswerPart } from './turn-segments'

/** 排队中的用户消息（归属固定 conversationId） */
export interface SessionQueuedPrompt {
  id: string
  text: string
  conversationId: string
  attachments?: ChatAttachment[]
  /** 定时任务排队后仍用任务指定的模型（对标 Codex scheduled model） */
  providerId?: string
  thinkingLevel?: string
}

/** conversationId → 该会话的排队列表 */
export type SessionQueueMap = Record<string, SessionQueuedPrompt[]>

/** 创建排队项（强制绑定 conversationId） */
export function createQueuedPrompt(
  conversationId: string,
  text: string,
  attachments?: ChatAttachment[],
  id?: string,
  extras?: { providerId?: string; thinkingLevel?: string }
): SessionQueuedPrompt {
  const providerId = extras?.providerId?.trim() || undefined
  const thinkingLevel = extras?.thinkingLevel?.trim() || undefined
  return {
    id: id ?? `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text,
    conversationId,
    attachments: attachments?.length ? attachments : undefined,
    providerId,
    thinkingLevel
  }
}

/** 将 follow-up 排入指定会话队列（不触碰其他会话） */
export function enqueueForConversation(
  queues: SessionQueueMap,
  conversationId: string,
  item: SessionQueuedPrompt,
  mode: 'append' | 'front' = 'append'
): SessionQueueMap {
  const owned: SessionQueuedPrompt = {
    ...item,
    conversationId
  }
  const prev = queues[conversationId] ?? []
  const nextList = mode === 'front' ? [owned, ...prev] : [...prev, owned]
  return { ...queues, [conversationId]: nextList }
}

/**
 * 取出某会话队首并返回剩余队列。
 * 绝不会返回其他 conversationId 的条目。
 */
export function dequeueForConversation(
  queues: SessionQueueMap,
  conversationId: string
): { next: SessionQueuedPrompt | null; queues: SessionQueueMap } {
  const list = queues[conversationId] ?? []
  if (list.length === 0) {
    return { next: null, queues }
  }
  const [head, ...rest] = list
  // 防御：若脏数据 conversationId 不符，丢弃该项并继续
  if (head.conversationId !== conversationId) {
    return dequeueForConversation({ ...queues, [conversationId]: rest }, conversationId)
  }
  const nextQueues = { ...queues }
  if (rest.length === 0) delete nextQueues[conversationId]
  else nextQueues[conversationId] = rest
  return { next: head, queues: nextQueues }
}

/** 取消某会话中指定排队 id */
export function cancelQueuedPrompt(
  queues: SessionQueueMap,
  conversationId: string,
  promptId: string
): SessionQueueMap {
  const list = queues[conversationId]
  if (!list) return queues
  const next = list.filter((q) => q.id !== promptId)
  const out = { ...queues }
  if (next.length === 0) delete out[conversationId]
  else out[conversationId] = next
  return out
}

/** 列出某会话当前排队（只读视图） */
export function listQueuedForConversation(
  queues: SessionQueueMap,
  conversationId: string | null | undefined
): SessionQueuedPrompt[] {
  if (!conversationId) return []
  return queues[conversationId] ?? []
}

/**
 * 流式 chunk 是否应更新当前可见 UI。
 * chunk 带 conversationId 时，仅当与 active 一致才应用；
 * 无 conversationId 的旧 chunk 视为未知，调用方应丢弃或仅在单会话路径使用。
 */
export function shouldApplyStreamToActive(
  chunkConversationId: string | null | undefined,
  activeConversationId: string | null | undefined
): boolean {
  if (!chunkConversationId) return false
  if (!activeConversationId) return false
  return chunkConversationId === activeConversationId
}

/** 改排队正文（对标 Codex：queued messages can be edited） */
export function updateQueuedPromptText(
  queues: SessionQueueMap,
  conversationId: string,
  promptId: string,
  text: string
): SessionQueueMap {
  const list = queues[conversationId]
  if (!list) return queues
  const nextText = String(text || '')
  let changed = false
  const next = list.map((item) => {
    if (item.id !== promptId || item.conversationId !== conversationId) return item
    changed = true
    return { ...item, text: nextText }
  })
  if (!changed) return queues
  return { ...queues, [conversationId]: next }
}

/** 上移 / 下移排队项（对标 Codex reorder） */
export function moveQueuedPrompt(
  queues: SessionQueueMap,
  conversationId: string,
  promptId: string,
  direction: -1 | 1
): SessionQueueMap {
  const list = queues[conversationId]
  if (!list || list.length < 2) return queues
  const idx = list.findIndex((item) => item.id === promptId && item.conversationId === conversationId)
  if (idx < 0) return queues
  const nextIdx = idx + direction
  if (nextIdx < 0 || nextIdx >= list.length) return queues
  const next = [...list]
  const [item] = next.splice(idx, 1)
  next.splice(nextIdx, 0, item)
  return { ...queues, [conversationId]: next }
}

/** 取出指定排队项立刻发送，其余顺序不变 */
export function takeQueuedPrompt(
  queues: SessionQueueMap,
  conversationId: string,
  promptId: string
): { item: SessionQueuedPrompt | null; queues: SessionQueueMap } {
  const list = queues[conversationId]
  if (!list) return { item: null, queues }
  const idx = list.findIndex((item) => item.id === promptId && item.conversationId === conversationId)
  if (idx < 0) return { item: null, queues }
  const item = list[idx]
  const rest = list.filter((_, i) => i !== idx)
  const nextQueues = { ...queues }
  if (rest.length === 0) delete nextQueues[conversationId]
  else nextQueues[conversationId] = rest
  return { item, queues: nextQueues }
}

/**
 * 回合结束后应派发的下一跳：只从 **完成回合所属会话** 的队列取。
 * `held` 时保留队列、不自动出队（对标 Codex hold queue）。
 */
export function nextFollowUpAfterTurn(
  queues: SessionQueueMap,
  completedConversationId: string,
  options?: { held?: boolean }
): { next: SessionQueuedPrompt | null; queues: SessionQueueMap } {
  if (options?.held) return { next: null, queues }
  return dequeueForConversation(queues, completedConversationId)
}

/** 切换会话时清空全局「可见 loading」但不丢弃各会话队列（队列按 id 保留） */
export function queuesAfterConversationSwitch(
  queues: SessionQueueMap
): SessionQueueMap {
  // 队列按 conversation 隔离，切换本身不修改 map
  return queues
}

// ── Stop / done / commit 归属（多会话） ─────────────────────────────────

/** 每会话 done 是否已提交（Stop 或 done 事件） */
export type DoneCommittedMap = Record<string, boolean>

/** 某会话是否已消费 done/stop，后续 done 应丢弃 */
export function isDoneCommittedFor(
  map: DoneCommittedMap,
  conversationId: string | null | undefined
): boolean {
  if (!conversationId) return false
  return map[conversationId] === true
}

/** 标记某会话已提交；不触碰其他会话 */
export function markDoneCommitted(
  map: DoneCommittedMap,
  conversationId: string
): DoneCommittedMap {
  return { ...map, [conversationId]: true }
}

/** 新 turn 开始时清除该会话的 done 门闩 */
export function clearDoneCommitted(
  map: DoneCommittedMap,
  conversationId: string
): DoneCommittedMap {
  if (!(conversationId in map)) return map
  const next = { ...map }
  delete next[conversationId]
  return next
}

/**
 * 用户点 Stop 时的目标：
 * - 始终只针对 **当前可见且 busy** 的会话
 * - 不因全局 abort 去给其他会话写「已停止」
 * - 主进程侧按 conversationId 取消（含 turnChain 排队尚未开跑的 turn）
 */
export function resolveStopAction(input: {
  activeConversationId: string | null
  activeIsBusy: boolean
}): {
  /** 传给 abortChat；null 表示对话尚未落库，只收口 UI */
  abortConversationId: string | null
  /** 写入 _(You stopped after 时长)_ 的会话；null 表示写当前可见列 */
  commitStopToConversationId: string | null
  /** 首轮尚未落库也要收口直播并保留用户气泡（对标 Codex #34839 / #38896） */
  commitStopToActiveUi: boolean
} {
  const { activeConversationId, activeIsBusy } = input
  if (!activeIsBusy) {
    return {
      abortConversationId: null,
      commitStopToConversationId: null,
      commitStopToActiveUi: false
    }
  }
  return {
    abortConversationId: activeConversationId,
    commitStopToConversationId: activeConversationId,
    commitStopToActiveUi: true
  }
}

/** ensure / worktree 之后若已 Stop，不得再 sendMessage */
export function shouldAbandonInFlightTurn(input: {
  turnGen: number
  myTurn: number
  doneCommitted: boolean
}): boolean {
  return input.doneCommitted || input.turnGen !== input.myTurn
}

/**
 * done 事件是否应被当前 UI/缓冲处理。
 * 已对该 conversationId 提交过 stop/done 则拒绝（防止 B 的 real done 被 A 的 stop 门闩误杀）。
 */
export function shouldAcceptDoneEvent(
  doneCommitted: DoneCommittedMap,
  eventConversationId: string | null | undefined
): boolean {
  if (!eventConversationId) {
    // 无 id 的遗留 chunk：仅当 map 完全为空时接受，避免跨会话污染
    return Object.keys(doneCommitted).length === 0
  }
  return !isDoneCommittedFor(doneCommitted, eventConversationId)
}

/** 助手消息是否应更新「当前可见」messages state */
export function shouldCommitToActiveUi(
  targetConversationId: string | null | undefined,
  activeConversationId: string | null | undefined
): boolean {
  if (!targetConversationId) return true
  if (!activeConversationId) return false
  return targetConversationId === activeConversationId
}

/**
 * 将助手消息追加到指定 transcript（纯函数）。
 * persist 时必须带同一 conversationId，禁止用「当时的 active」。
 */
export function appendAssistantMessage(
  messages: ChatMessage[],
  assistant: ChatMessage
): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && last.content === assistant.content) {
    return messages
  }
  return [...messages, assistant]
}

/** 直播行 / 查找用的助手 id：有预留则用预留，否则回退 `streaming` */
export function liveRowMessageId(reservedId: string | null | undefined): string {
  const id = reservedId?.trim()
  return id || 'streaming'
}

/** 直播行是否还有可画的正文 / 过程 / 思考 / 审批 */
export function hasLiveAssistantBody(options: {
  streaming?: string | null
  liveSegmentCount?: number
  thinking?: string | null
  approvalWaiting?: boolean
}): boolean {
  if (options.approvalWaiting) return true
  if ((options.liveSegmentCount ?? 0) > 0) return true
  if (String(options.streaming || '').trim()) return true
  return Boolean(String(options.thinking || '').trim())
}

/**
 * loading 中即使 store 闪空也留下直播槽，避免 `return null` 塌高再重挂。
 * 收束后 store 还留着本轮体时继续画直播行，避免卸下换历史气泡时重挂 Markdown / 折 20 行
 * （对标 Codex #22860 / changelog「preserved streamed activity when tasks complete」）。
 * 藏历史预留行交给 `shouldHideReservedDuringLive`。
 * `historyHasReserved` 仍接调用方，直播槽不再订它：persist 入列翻 true 会重绘整棵 pinned 树。
 */
export function shouldRenderLiveAssistantRow(options: {
  loading: boolean
  hasLiveBody: boolean
  historyHasReserved?: boolean
}): boolean {
  // loading 中 store 闪空也留下槽，避免 return null 塌高再重挂（对标 Codex #22860）。
  // historyHasReserved 仍接调用方；藏历史行交给 shouldHideReservedDuringLive。
  return options.hasLiveBody || options.loading
}

/**
 * 对话柱是否挂直播槽。收束关 loading 后 store 还留着本轮体也要挂，
 * 否则历史列藏预留行、槽又卸掉，回答会从画面消失（对标 Codex preserved streamed activity）。
 */
export function shouldMountLiveAssistantSlot(options: {
  atLatestWindow: boolean
  loading: boolean
  hasLiveBody: boolean
}): boolean {
  return options.atLatestWindow && (options.loading || options.hasLiveBody)
}

/**
 * 历史列真有预留行且（直播体已上屏或本轮仍 loading）才藏。
 * 开轮预留 id 还不在 messages 里时，首枚 token 不把历史 JSX 整列重建（对标 Codex #22860）。
 * loading 中 store 闪空也继续藏，避免直播行 `return null` 塌高再跟历史气泡叠两份。
 * 收束关 loading 后 store 未清也继续藏，让同一直播行留下。
 */
export function shouldHideReservedDuringLive(options: {
  isLive: boolean
  hasLiveBody: boolean
  reservedId?: string | null
  hasReservedInHistory: boolean
}): boolean {
  const { isLive, hasLiveBody, reservedId, hasReservedInHistory } = options
  return Boolean(reservedId?.trim() && hasReservedInHistory && (hasLiveBody || isLive))
}

/**
 * 直播中不把已提交的同一条助手再画进历史列，避免与直播行叠两份。
 * loading 已关且直播体已空时不再藏历史行，否则会出现「消息未挂上、直播已空」的空窗。
 * 收束后 store 还留着本轮体时继续藏预留行，同一直播实例留下；store 清空后预留 id 才出现在历史列。
 */
export function historicalMessagesDuringLive(
  messages: ChatMessage[],
  reservedId: string | null | undefined,
  isLive: boolean,
  hasLiveBody = true
): ChatMessage[] {
  if (!isLive || !hasLiveBody) return messages
  const id = reservedId?.trim()
  if (!id) return messages
  return messages.filter((m) => m.id !== id)
}

/**
 * 跟进发送时上一轮直播体还在：先保住同一直播实例，等首枚 harness chunk 再换 id。
 * persist 还没把预留行写入历史列时也要保住（对标 Codex #22860）。
 * 首轮没有直播体 / 预留 id，仍走开轮 beginTurnMeta。
 * `historyHasReserved` 仍接调用方，不再当门闩。
 */
export function shouldHoldLiveHandoff(options: {
  hasLiveBody: boolean
  liveAssistantId?: string | null
  historyHasReserved?: boolean
}): boolean {
  if (!options.hasLiveBody) return false
  if (!options.liveAssistantId?.trim()) return false
  // historyHasReserved 仍接调用方；persist 未入列也保住上一轮直播实例。
  return true
}

/**
 * 跟进 hold 开轮就冻结上一轮。adopt 只换新 id，不再把 hold 从活动槽搬进 frozen 槽重挂
 * （对标 Codex #22860 / #37849）。
 */
export function shouldRetireLiveOnHandoffHold(options: {
  holdFollowUp: boolean
  liveAssistantId?: string | null
  alreadyRetired?: boolean
}): boolean {
  if (!options.holdFollowUp) return false
  if (!options.liveAssistantId?.trim()) return false
  return options.alreadyRetired !== true
}

/** 跟进保住期间过程秒表 / 图解码 / Thought 不得再当直播。hold 已冻结则可给新槽跟秒表。 */
export function shouldStreamLiveAssistant(options: {
  loading: boolean
  handoffId?: string | null
  holdAlreadyRetired?: boolean
}): boolean {
  if (!options.loading) return false
  if (options.handoffId?.trim() && !options.holdAlreadyRetired) return false
  return true
}

/** 首枚真实 harness 事件才清 handoff；本地 Thinking seed 不触发。已预留则不再换 id。 */
export function shouldAdoptLiveHandoff(options: {
  handoffId?: string | null
  chunkType: string
}): boolean {
  if (!options.handoffId?.trim()) return false
  switch (options.chunkType) {
    case 'turn_start':
    case 'think':
    case 'token':
    case 'tool_start':
    case 'tool_done':
    case 'tool_preview':
    case 'status':
    case 'error':
    case 'context_compress':
    case 'approval_needed':
    case 'user_input_needed':
    case 'done':
      return true
    default:
      return false
  }
}

/** 保住期间 Stop：还原上一轮片段，不把本地 seed 提交成新助手。 */
export function shouldCancelLiveHandoffWithoutCommit(options: {
  handoffId?: string | null
}): boolean {
  return Boolean(options.handoffId?.trim())
}

/** 保住期间不把下一轮 seed 写进直播 store。hold 已冻结则可以写给新槽。 */
export function shouldPublishLiveStreamDuringHandoff(
  handoffId?: string | null,
  options?: { holdAlreadyRetired?: boolean }
): boolean {
  if (!handoffId?.trim()) return true
  return options?.holdAlreadyRetired === true
}

/** 冻结后立刻预留新直播 id，首枚 token 不另挂槽（对标 Codex #22860）。 */
export function shouldReserveLiveAfterHandoffHold(options: {
  holdFollowUp: boolean
  retired?: boolean
}): boolean {
  return Boolean(options.holdFollowUp && options.retired)
}

/** 已有不同于 hold 的预留 id 时不另挂 Thinking 行。 */
export function shouldMountLiveHandoffThinking(options: {
  liveHandoffId?: string | null
  liveAssistantId?: string | null
}): boolean {
  const handoff = options.liveHandoffId?.trim()
  if (!handoff) return false
  const live = options.liveAssistantId?.trim()
  return !live || live === handoff
}

/** 冻结后已预留新 id：adopt 只清 handoff，不再 mint 新槽（对标 Codex #22860）。 */
export function shouldReuseReservedLiveOnHandoffAdopt(options: {
  liveHandoffId?: string | null
  liveAssistantId?: string | null
}): boolean {
  const handoff = options.liveHandoffId?.trim()
  const live = options.liveAssistantId?.trim()
  return Boolean(handoff && live && live !== handoff)
}

/** Stop 未出首枚 token：把预留 id 收回 hold，空槽不能留下（对标 Codex #22860）。 */
export function shouldRestoreHeldLiveOnHandoffCancel(options: {
  liveHandoffId?: string | null
  liveAssistantId?: string | null
}): boolean {
  return shouldReuseReservedLiveOnHandoffAdopt(options)
}

/**
 * hold 已冻结但仍挂着旧槽时，不要同步发下一轮 seed。
 * 等 React 提交冻结槽后再发，避免旧行闪「准备中」（对标 Codex #22860）。
 */
export function shouldDeferLiveHandoffSeedPublish(options: {
  liveHandoffId?: string | null
  holdAlreadyRetired?: boolean
}): boolean {
  return Boolean(options.liveHandoffId?.trim() && options.holdAlreadyRetired)
}

/**
 * 跟进用户气泡插在上一轮直播行之后、新 Thinking 之前。
 * 预留 id 不在列里时整列当 before，避免把回答藏起来却无处可画。
 */
export function splitTranscriptAroundLiveHandoff(
  messages: ChatMessage[],
  liveAssistantId: string | null | undefined
): { before: ChatMessage[]; after: ChatMessage[] } {
  const id = liveAssistantId?.trim()
  if (!id) return { before: messages, after: [] }
  const idx = messages.findIndex((m) => m.id === id)
  if (idx < 0) return { before: messages, after: [] }
  return {
    before: messages.slice(0, idx),
    after: messages.slice(idx + 1)
  }
}

/** 历史重挂刚离开直播槽的 diff：展开，但 `live` 仍关以免 followTail 抢滚动。 */
export function shouldPreserveLiveDiffExpanded(options: {
  streaming: boolean
  preserveLiveDiffs?: boolean
}): boolean {
  return options.streaming || Boolean(options.preserveLiveDiffs)
}

/**
 * 跟进 adopt 后仍挂着的上一轮直播行 id。
 * 先 retired 环，再 handoff，再收束后仍藏在直播槽的预留 id。
 */
export function pinnedLiveAssistantId(options: {
  retiredLiveId?: string | null
  retiredLiveIds?: readonly string[]
  liveHandoffId?: string | null
  liveAssistantId?: string | null
  hideReservedLive?: boolean
}): string | null {
  return pinnedLiveAssistantIds(options)[0] ?? null
}

/**
 * 开轮或直播体已在 store 时就把当前预留 id 钉进 pinned 列。
 * 等 hideReserved 再钉会把同一行从无 pin 槽搬进 map，整棵直播树重挂（对标 Codex #22860）。
 */
export function shouldPinActiveLiveAssistant(options: {
  loading: boolean
  hasLiveBody: boolean
}): boolean {
  return options.loading || options.hasLiveBody
}

/**
 * 开轮 beginTurnMeta 不要先发空直播体。
 * 空发布会让已挂直播行 `liveBody` 变 false，loading 尚未抬起时 `return null` 塌高
 * （对标 Codex #22860）。准备中 seed 同一帧再写。
 */
export function shouldPublishEmptyLiveBodyOnBeginTurn(): boolean {
  return false
}

/**
 * 重试已在 persist 前预留直播 id 时不要再 beginTurnMeta。
 * 否则 await 回来换新 id，直播树从旧槽搬到新槽重挂（对标 Codex #22860）。
 */
export function shouldBeginNewLiveReservation(options: {
  holdFollowUp: boolean
  reuseReservedLiveId?: boolean
  reservedId?: string | null
}): boolean {
  if (options.holdFollowUp) return false
  if (options.reuseReservedLiveId && Boolean(options.reservedId?.trim())) return false
  return true
}

/**
 * pinned 列里只有当前未冻结的预留 id 才跟 `liveStreaming`。
 * `pinActiveLive` 从开轮就把该 id 钉进 map 后，若整列写死 `isStreaming={false}`，
 * 秒表 / 贴尾 / mermaid 会当成收束（对标 Codex #22860）。
 */
export function shouldStreamPinnedLiveAssistant(options: {
  pinnedId: string
  liveAssistantId?: string | null
  frozen: boolean
  liveStreaming: boolean
}): boolean {
  if (options.frozen || !options.liveStreaming) return false
  const pinned = options.pinnedId.trim()
  const live = options.liveAssistantId?.trim()
  return Boolean(pinned && live && pinned === live)
}

/** 只有当前预留 id 才接审批 / Ask User。跟进 hold 的上一轮不跟新一轮审批（对标 Codex #22860）。 */
export function shouldAttachLiveApprovalToPinnedSlot(options: {
  pinnedId: string
  liveAssistantId?: string | null
  liveHandoffId?: string | null
}): boolean {
  const pinned = options.pinnedId.trim()
  const live = options.liveAssistantId?.trim()
  const handoff = options.liveHandoffId?.trim()
  if (handoff && pinned === handoff) return false
  return Boolean(pinned && live && pinned === live)
}

/**
 * 只有当前预留 id 才跟 `loading`。
 * hold / handoff 行不跟（对标 Codex #22860 / #37849）。冻结后预留 id 已是新槽。
 */
export function shouldAttachLiveLoadingToPinnedSlot(options: {
  pinnedId: string
  liveAssistantId?: string | null
  liveHandoffId?: string | null
}): boolean {
  return shouldAttachLiveApprovalToPinnedSlot(options)
}

/**
 * 无 pin 才走 fallback 槽。`pinActiveLive` 已开但预留 id 还没进 map 时
 * 不要用 `key=streaming` 占位，否则 id 一到就从 fallback 搬进 map 整棵重挂（对标 Codex #22860）。
 */
export function shouldMountUnpinnedLiveSlot(options: {
  pinnedCount: number
  pinActiveLive: boolean
  atLatestWindow: boolean
  loading: boolean
  hasLiveBody: boolean
}): boolean {
  if (options.pinnedCount > 0 || options.pinActiveLive) return false
  return shouldMountLiveAssistantSlot(options)
}

/** 新直播 id 已与 pinned 行分开时才另挂一轮槽，避免 adopt 把 A 的 key 换成 B。 */
export function shouldMountActiveLiveSlot(options: {
  atLatestWindow: boolean
  loading: boolean
  hasLiveBody: boolean
  liveAssistantId?: string | null
  pinnedLiveId?: string | null
  pinnedLiveIds?: readonly string[]
}): boolean {
  if (!shouldMountLiveAssistantSlot(options)) return false
  const live = options.liveAssistantId?.trim()
  if (!live) return false
  if (options.pinnedLiveIds?.some((id) => id.trim() === live)) return false
  const pinned = options.pinnedLiveId?.trim()
  if (pinned && live === pinned) return false
  return true
}

function sameMessageRefList(prev: ChatMessage[] | undefined, next: ChatMessage[]): boolean {
  if (prev === next) return true
  if (!prev || prev.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) return false
  }
  return true
}

/**
 * persist 把预留行写入历史列后，before 缺口往往只是同一批消息对象。
 * 复用上一份 gap，避免 ChatView 整列重建历史 JSX（对标 Codex #22860 / #38220）。
 */
export function reusePinnedTranscriptGaps(
  prev: ChatMessage[][] | null | undefined,
  next: ChatMessage[][]
): ChatMessage[][] {
  if (!prev || prev.length !== next.length) return next
  let changed = false
  const out = next.map((gap, i) => {
    if (sameMessageRefList(prev[i], gap)) return prev[i]
    changed = true
    return gap
  })
  return changed ? out : prev
}

/**
 * 按 pinned id 切开历史列并藏掉这些 id。
 * 空 pin 返回 null，好让 ChatView 用同一引用跳过贴底重绘（对标 Codex #22860 / #38220）。
 * 传入上一份 gaps 时，内容没变就复用同一数组。
 */
export function nextPinnedTranscriptGaps(
  messages: ChatMessage[],
  pinnedIds: readonly string[],
  hideIds: Array<string | null | undefined>,
  prev: ChatMessage[][] | null = null
): ChatMessage[][] | null {
  if (pinnedIds.length === 0) return null
  const split = splitTranscriptAroundPinnedLive(messages, pinnedIds)
  const next = split.gaps.map((gap) => historicalMessagesHidingIds(gap, hideIds))
  return reusePinnedTranscriptGaps(prev, next)
}

const EMPTY_PINNED_AFTER_GAPS: ChatMessage[][] = []

/** pin 后的缺口。空结果用同一数组，贴底 setState 不重建 after 行。 */
export function nextPinnedAfterGaps(gaps: ChatMessage[][] | null): ChatMessage[][] {
  if (!gaps || gaps.length <= 1) return EMPTY_PINNED_AFTER_GAPS
  return gaps.slice(1)
}

/** 历史列同时藏 pinned / 预留直播 id，避免与冻结槽叠两份。 */
export function historicalMessagesHidingIds(
  messages: ChatMessage[],
  hideIds: Array<string | null | undefined>
): ChatMessage[] {
  const ids = new Set<string>()
  for (const id of hideIds) {
    const trimmed = id?.trim()
    if (trimmed) ids.add(trimmed)
  }
  if (ids.size === 0) return messages
  return messages.filter((m) => !ids.has(m.id))
}

/** 跟进 adopt 后仍挂着的已完成直播行：冻结 part 引用，避免跟新回合。 */
export type RetiredLiveProcess = {
  processForFlow: readonly TurnSegment[]
  thinkText: string
  contentStreaming: boolean
  generatingDemo: boolean
  answerStreaming: boolean
  hasThought: boolean
  steps?: readonly ProcessPhaseStep[] | null
}

export type RetiredLiveArticle = {
  id: string
  parts: readonly AnswerPart[]
  meta: AssistantMeta | null
  startedAt: number | null
  copyable: string | null
  process?: RetiredLiveProcess | null
}

/** 把直播过程切片收成冻结快照；`hasThought` 默认识 thinkText。 */
export function snapshotRetiredLiveProcess(input: {
  processForFlow?: readonly TurnSegment[] | null
  thinkText?: string | null
  contentStreaming?: boolean
  generatingDemo?: boolean
  answerStreaming?: boolean
  hasThought?: boolean
  steps?: readonly ProcessPhaseStep[] | null
}): RetiredLiveProcess {
  const thinkText = String(input.thinkText ?? '')
  return {
    processForFlow: input.processForFlow ? input.processForFlow.slice() : [],
    thinkText,
    contentStreaming: Boolean(input.contentStreaming),
    generatingDemo: Boolean(input.generatingDemo),
    answerStreaming: Boolean(input.answerStreaming),
    hasThought: input.hasThought ?? Boolean(thinkText.trim()),
    steps: input.steps ? input.steps.slice() : input.steps === null ? null : undefined
  }
}

/** 短线程连跟两轮时仍留下上一行；再早的行退出环，但仍用冻结正文画，不重挂 `AssistantMessage`。 */
export const RETIRED_LIVE_LIMIT = 2

/** 退出环后仍按完整冻结行画的上限；再早的进 parts 归档，不走普通历史气泡。 */
export const EJECTED_LIVE_LIMIT = 8

/** 把刚 adopt 的行推进环；同 id 覆盖，超出上限的最早行进 `ejected`。 */
export function retireLiveArticle(
  prev: readonly RetiredLiveArticle[],
  article: RetiredLiveArticle
): { retired: RetiredLiveArticle[]; ejected: RetiredLiveArticle[] } {
  const id = article.id.trim()
  if (!id) return { retired: prev.slice(), ejected: [] }
  const next = [...prev.filter((item) => item.id !== id), { ...article, id }]
  if (next.length <= RETIRED_LIVE_LIMIT) return { retired: next, ejected: [] }
  return {
    retired: next.slice(-RETIRED_LIVE_LIMIT),
    ejected: next.slice(0, next.length - RETIRED_LIVE_LIMIT)
  }
}

/** 把刚 adopt 的行推进环；同 id 覆盖，超出上限丢掉最早的。 */
export function nextRetiredLiveArticles(
  prev: readonly RetiredLiveArticle[],
  article: RetiredLiveArticle
): RetiredLiveArticle[] {
  return retireLiveArticle(prev, article).retired
}

/** 环里挤出的冻结行：同 id 覆盖，超出上限丢掉最早的。 */
export function nextEjectedLiveArticles(
  prev: readonly RetiredLiveArticle[],
  ejected: readonly RetiredLiveArticle[]
): RetiredLiveArticle[] {
  if (!ejected.length) return prev.slice()
  const drop = new Set(ejected.map((item) => item.id.trim()).filter(Boolean))
  const next = [...prev.filter((item) => !drop.has(item.id)), ...ejected.map((item) => ({ ...item }))]
  return next.length > EJECTED_LIVE_LIMIT ? next.slice(-EJECTED_LIVE_LIMIT) : next
}

/** ejected 环收下新行后，哪些旧冻结行掉出上限。 */
export function takeEjectedLiveOverflow(
  prev: readonly RetiredLiveArticle[],
  ejected: readonly RetiredLiveArticle[]
): { kept: RetiredLiveArticle[]; dropped: RetiredLiveArticle[] } {
  const kept = nextEjectedLiveArticles(prev, ejected)
  const keptIds = new Set(kept.map((item) => item.id))
  const dropped: RetiredLiveArticle[] = []
  const seen = new Set<string>()
  const consider = (item: RetiredLiveArticle) => {
    const id = item.id.trim()
    if (!id || keptIds.has(id) || seen.has(id)) return
    seen.add(id)
    dropped.push({ ...item, id })
  }
  for (const item of prev) consider(item)
  for (const item of ejected) consider(item)
  return { kept, dropped }
}

/** 掉出 ejected 环的冻结 part：同 id 覆盖；当前对话不截断，切对话清掉。不抬 ejected / retired 环。 */
export function nextArchivedLiveArticles(
  prev: readonly RetiredLiveArticle[],
  dropped: readonly RetiredLiveArticle[]
): RetiredLiveArticle[] {
  if (!dropped.length) return prev.slice()
  const incoming = new Set(dropped.map((item) => item.id.trim()).filter(Boolean))
  return [
    ...prev.filter((item) => !incoming.has(item.id)),
    ...dropped.filter((item) => item.id.trim()).map((item) => ({ ...item }))
  ]
}

/** 按 id 取冻结行。 */
export function retiredLiveArticle(
  articles: readonly RetiredLiveArticle[],
  id?: string | null
): RetiredLiveArticle | null {
  const key = id?.trim()
  if (!key) return null
  return articles.find((item) => item.id === key) ?? null
}

/** 历史列冻结行：先 ejected 环，再 parts 归档。 */
export function frozenHistoricalArticle(
  ejected: readonly RetiredLiveArticle[],
  archived: readonly RetiredLiveArticle[],
  id?: string | null
): RetiredLiveArticle | null {
  return retiredLiveArticle(ejected, id) ?? retiredLiveArticle(archived, id)
}

/**
 * 直播槽要按时间顺序挂住的 id：先 retired 环，再 handoff，再当前预留 id。
 * `pinActiveLive` 从开轮就钉当前 id，避免 hideReserved 翻转时搬槽重挂。
 * 去重且保序，让 A 在跟进 B / C 时 key 不丢。
 */
export function pinnedLiveAssistantIds(options: {
  retiredLiveIds?: readonly string[]
  retiredLiveId?: string | null
  liveHandoffId?: string | null
  liveAssistantId?: string | null
  hideReservedLive?: boolean
  pinActiveLive?: boolean
}): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (id?: string | null) => {
    const trimmed = id?.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    ids.push(trimmed)
  }
  for (const id of options.retiredLiveIds ?? []) push(id)
  push(options.retiredLiveId)
  push(options.liveHandoffId)
  if (options.hideReservedLive || options.pinActiveLive) push(options.liveAssistantId)
  return ids
}

const EMPTY_PINNED_LIVE_IDS: string[] = []

/**
 * hideReserved 翻转时 pin 列往往仍是同一批 id。
 * 复用上一份数组，避免 ChatView 重算 gaps / 重建 pinned 槽（对标 Codex #22860 / #38220）。
 */
export function reusePinnedLiveIds(
  prev: readonly string[] | null | undefined,
  next: string[]
): string[] {
  if (next.length === 0) return EMPTY_PINNED_LIVE_IDS
  if (!prev || prev.length !== next.length) return next
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) return next
  }
  return prev as string[]
}

/** 算出 pin 列后再对照上一份；id 没变就留下同一引用。 */
export function nextPinnedLiveAssistantIds(
  prev: readonly string[] | null | undefined,
  options: Parameters<typeof pinnedLiveAssistantIds>[0]
): string[] {
  return reusePinnedLiveIds(prev, pinnedLiveAssistantIds(options))
}

/** 冻结 pinned 槽的身份：article 引用与找词位没变才复用元素 */
export type FrozenPinnedLiveSlotIdentity = {
  article: unknown
  findHit: boolean
  findCurrent: boolean
}

const EMPTY_FROZEN_PINNED_MAP: ReadonlyMap<string, never> = new Map()

function nextHeldSlotMap<T, I>(
  prevSlots: ReadonlyMap<string, T> | null | undefined,
  prevIdentities: ReadonlyMap<string, I> | null | undefined,
  nextIdentities: ReadonlyMap<string, I>,
  sameIdentity: (prev: I | undefined, next: I) => boolean,
  build: (id: string) => T
): { slots: ReadonlyMap<string, T>; identities: ReadonlyMap<string, I> } {
  if (nextIdentities.size === 0) {
    return {
      slots: EMPTY_FROZEN_PINNED_MAP as ReadonlyMap<string, T>,
      identities: EMPTY_FROZEN_PINNED_MAP as ReadonlyMap<string, I>
    }
  }
  const slots = new Map<string, T>()
  let reusedAll = Boolean(prevSlots && prevSlots.size === nextIdentities.size)
  for (const [id, identity] of nextIdentities) {
    const held = prevSlots?.get(id)
    if (held != null && sameIdentity(prevIdentities?.get(id), identity)) {
      slots.set(id, held)
    } else {
      reusedAll = false
      slots.set(id, build(id))
    }
  }
  if (reusedAll && prevSlots && prevIdentities) {
    return { slots: prevSlots, identities: prevIdentities }
  }
  return { slots, identities: nextIdentities }
}

/** 冻结行不跟 loading / 秒表；article 与找词没变才复用上一份元素（对标 Codex #22860 / #37849）。 */
export function sameFrozenPinnedLiveSlotIdentity(
  prev: FrozenPinnedLiveSlotIdentity | undefined,
  next: FrozenPinnedLiveSlotIdentity
): boolean {
  if (!prev) return false
  return (
    prev.article === next.article &&
    prev.findHit === next.findHit &&
    prev.findCurrent === next.findCurrent
  )
}

/**
 * 只给仍在 retired 环的 id 建槽。身份没变的 id 留下上一份元素，
 * 收束 loading 翻转不重挂冻结直播树（对标 Codex #22860 / #37849）。
 */
export function nextFrozenPinnedLiveSlots<T>(
  prevSlots: ReadonlyMap<string, T> | null | undefined,
  prevIdentities: ReadonlyMap<string, FrozenPinnedLiveSlotIdentity> | null | undefined,
  nextIdentities: ReadonlyMap<string, FrozenPinnedLiveSlotIdentity>,
  build: (id: string) => T
): {
  slots: ReadonlyMap<string, T>
  identities: ReadonlyMap<string, FrozenPinnedLiveSlotIdentity>
} {
  return nextHeldSlotMap(
    prevSlots,
    prevIdentities,
    nextIdentities,
    sameFrozenPinnedLiveSlotIdentity,
    build
  )
}

/** 未冻结 pinned 槽身份：审批与 loading 只挂当前预留 id，hold 行不跟新一轮 */
export type ActivePinnedLiveSlotIdentity = {
  loading: boolean
  isStreaming: boolean
  findHit: boolean
  findCurrent: boolean
  approval: unknown
  userInput: unknown
  approvalResponding: boolean
  userInputResponding: boolean
  toolOutputDisplay?: string
}

export function sameActivePinnedLiveSlotIdentity(
  prev: ActivePinnedLiveSlotIdentity | undefined,
  next: ActivePinnedLiveSlotIdentity
): boolean {
  if (!prev) return false
  return (
    prev.loading === next.loading &&
    prev.isStreaming === next.isStreaming &&
    prev.findHit === next.findHit &&
    prev.findCurrent === next.findCurrent &&
    prev.approval === next.approval &&
    prev.userInput === next.userInput &&
    prev.approvalResponding === next.approvalResponding &&
    prev.userInputResponding === next.userInputResponding &&
    prev.toolOutputDisplay === next.toolOutputDisplay
  )
}

/**
 * 未冻结 pinned 槽：身份没变留下上一份元素。
 * 新一轮审批 / Ask User 不重挂跟进 hold 的上一轮（对标 Codex #22860）。
 */
export function nextActivePinnedLiveSlots<T>(
  prevSlots: ReadonlyMap<string, T> | null | undefined,
  prevIdentities: ReadonlyMap<string, ActivePinnedLiveSlotIdentity> | null | undefined,
  nextIdentities: ReadonlyMap<string, ActivePinnedLiveSlotIdentity>,
  build: (id: string) => T
): {
  slots: ReadonlyMap<string, T>
  identities: ReadonlyMap<string, ActivePinnedLiveSlotIdentity>
} {
  return nextHeldSlotMap(
    prevSlots,
    prevIdentities,
    nextIdentities,
    sameActivePinnedLiveSlotIdentity,
    build
  )
}

/** pinned 行列：槽与 after 引用没变才复用上一份行节点 */
export type PinnedLiveRowHold<T> = {
  ids: readonly string[]
  rows: readonly T[]
  after: readonly unknown[]
  slots: ReadonlyMap<string, unknown>
}

const EMPTY_PINNED_LIVE_ROW_HOLD: PinnedLiveRowHold<never> = {
  ids: [],
  rows: [],
  after: [],
  slots: EMPTY_FROZEN_PINNED_MAP
}

/** 槽与 pin 后缺口没变就留下同一行节点，收束不重挂冻结 Fragment（对标 Codex #22860 / #37849）。 */
export function nextPinnedLiveRowNodes<T>(
  prev: PinnedLiveRowHold<T> | null | undefined,
  input: {
    ids: readonly string[]
    after: readonly unknown[]
    slots: ReadonlyMap<string, unknown>
  },
  build: (id: string, index: number) => T
): PinnedLiveRowHold<T> {
  if (input.ids.length === 0) return EMPTY_PINNED_LIVE_ROW_HOLD as PinnedLiveRowHold<T>
  const rows = input.ids.map((id, index) => {
    if (
      prev &&
      prev.ids[index] === id &&
      prev.slots.get(id) === input.slots.get(id) &&
      prev.after[index] === input.after[index]
    ) {
      return prev.rows[index]
    }
    return build(id, index)
  })
  if (
    prev &&
    prev.rows.length === rows.length &&
    rows.every((row, index) => row === prev.rows[index])
  ) {
    return prev
  }
  return {
    ids: input.ids,
    rows,
    after: input.after,
    slots: input.slots
  }
}

/** 历史行身份：消息与冻结 article 引用没变才复用元素 */
export type HistoricalRowIdentity = {
  message: unknown
  article: unknown
  findHit: boolean
  findCurrent: boolean
  nearLive: boolean
  editRequested: boolean
  selectionSource: boolean
  preserveLiveDiffs: boolean
  isLast: boolean
}

export type HistoricalRowHold<T> = {
  ids: readonly string[]
  rows: readonly T[]
  identities: ReadonlyMap<string, HistoricalRowIdentity>
}

const EMPTY_HISTORICAL_ROW_HOLD: HistoricalRowHold<never> = {
  ids: [],
  rows: [],
  identities: EMPTY_FROZEN_PINNED_MAP
}

export function sameHistoricalRowIdentity(
  prev: HistoricalRowIdentity | undefined,
  next: HistoricalRowIdentity
): boolean {
  if (!prev) return false
  return (
    prev.message === next.message &&
    prev.article === next.article &&
    prev.findHit === next.findHit &&
    prev.findCurrent === next.findCurrent &&
    prev.nearLive === next.nearLive &&
    prev.editRequested === next.editRequested &&
    prev.selectionSource === next.selectionSource &&
    prev.preserveLiveDiffs === next.preserveLiveDiffs &&
    prev.isLast === next.isLast
  )
}

/**
 * 挤出 / 归档冻结行只换该 id。其余历史行留下上一份元素（对标 Codex #22860 / #38220）。
 */
export function nextHistoricalRowNodes<T>(
  prev: HistoricalRowHold<T> | null | undefined,
  nextIds: readonly string[],
  nextIdentities: ReadonlyMap<string, HistoricalRowIdentity>,
  build: (id: string, index: number) => T
): HistoricalRowHold<T> {
  if (nextIds.length === 0) return EMPTY_HISTORICAL_ROW_HOLD as HistoricalRowHold<T>
  const rows = nextIds.map((id, index) => {
    const identity = nextIdentities.get(id)
    if (
      prev &&
      prev.ids[index] === id &&
      identity &&
      sameHistoricalRowIdentity(prev.identities.get(id), identity)
    ) {
      return prev.rows[index]
    }
    return build(id, index)
  })
  if (
    prev &&
    prev.rows.length === rows.length &&
    rows.every((row, index) => row === prev.rows[index])
  ) {
    return prev
  }
  return { ids: nextIds, rows, identities: nextIdentities }
}

/** pin 后缺口身份：与历史行同一套比较，挤出只换该 id */
export type PinnedAfterRowHold<T> = {
  ids: readonly string[]
  rows: readonly T[]
  gaps: readonly (readonly T[])[]
  identities: ReadonlyMap<string, HistoricalRowIdentity>
}

const EMPTY_PINNED_AFTER_ROW_HOLD: PinnedAfterRowHold<never> = {
  ids: [],
  rows: [],
  gaps: [],
  identities: EMPTY_FROZEN_PINNED_MAP
}

/**
 * 挤出 / 归档冻结行只换含该 id 的 after 缺口。其余 gap 数组留下，
 * 以便 `nextPinnedLiveRowNodes` 不重挂冻结 Fragment（对标 Codex #22860 / #38220）。
 */
export function nextPinnedAfterRowNodes<T>(
  prev: PinnedAfterRowHold<T> | null | undefined,
  nextGaps: readonly (readonly { id: string }[])[],
  nextIdentities: ReadonlyMap<string, HistoricalRowIdentity>,
  build: (id: string, index: number) => T
): PinnedAfterRowHold<T> {
  const nextIds = nextGaps.flatMap((gap) => gap.map((item) => item.id))
  if (nextIds.length === 0) return EMPTY_PINNED_AFTER_ROW_HOLD as PinnedAfterRowHold<T>
  const flat = nextHistoricalRowNodes(prev, nextIds, nextIdentities, build)
  const gaps: (readonly T[])[] = []
  let offset = 0
  for (let index = 0; index < nextGaps.length; index += 1) {
    const len = nextGaps[index].length
    const slice = flat.rows.slice(offset, offset + len)
    const prevGap = prev?.gaps[index]
    if (
      prevGap &&
      prevGap.length === slice.length &&
      slice.every((row, rowIndex) => row === prevGap[rowIndex])
    ) {
      gaps.push(prevGap)
    } else {
      gaps.push(slice)
    }
    offset += len
  }
  if (
    prev &&
    prev.gaps.length === gaps.length &&
    gaps.every((gap, index) => gap === prev.gaps[index])
  ) {
    return prev
  }
  return { ids: flat.ids, rows: flat.rows, gaps, identities: flat.identities }
}

/**
 * 按多个 pinned id 切开对话柱：`gaps.length === pinnedIds.length + 1`。
 * 历史列不在清单里的 pin（仍只挂在直播槽）吃掉当时剩下的消息，以免把回答画进历史。
 */
export function splitTranscriptAroundPinnedLive(
  messages: ChatMessage[],
  pinnedIds: readonly string[]
): { gaps: ChatMessage[][]; pinnedIds: string[] } {
  const pins: string[] = []
  const gaps: ChatMessage[][] = []
  let rest = messages
  for (const raw of pinnedIds) {
    const id = raw.trim()
    if (!id) continue
    const idx = rest.findIndex((m) => m.id === id)
    if (idx < 0) {
      gaps.push(rest)
      pins.push(id)
      rest = []
      continue
    }
    gaps.push(rest.slice(0, idx))
    pins.push(id)
    rest = rest.slice(idx + 1)
  }
  gaps.push(rest)
  return { gaps, pinnedIds: pins }
}

/**
 * 按预留 id 写入或替换助手气泡（直播行收束成历史时同一 id，避免再追加一条）。
 * 没有同 id 时走 `appendAssistantMessage`。
 */
export function upsertAssistantMessage(
  messages: ChatMessage[],
  assistant: ChatMessage
): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === assistant.id)
  if (idx < 0) return appendAssistantMessage(messages, assistant)
  if (messages[idx] === assistant) return messages
  const next = messages.slice()
  const prevCreatedAt = messages[idx].createdAt
  next[idx] =
    assistant.createdAt != null || prevCreatedAt == null
      ? assistant
      : { ...assistant, createdAt: prevCreatedAt }
  return next
}

/**
 * 解析 commit 目标会话：优先显式 id，其次流归属，再次当前 active。
 * 用于 commitAssistantReply / persist 防串写。
 */
export function resolveCommitConversationId(input: {
  explicitId?: string | null
  streamOwnerId?: string | null
  activeConversationId?: string | null
}): string | null {
  return input.explicitId ?? input.streamOwnerId ?? input.activeConversationId ?? null
}
