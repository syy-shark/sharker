/**
 * 多会话队列与流归属：纯逻辑，渲染层与单测共用。
 * 保证 A 的排队 follow-up 不会在切换到 B 后派发到 B。
 * @see shared/ARCH.md
 */

import type { ChatAttachment, ChatMessage } from './types'

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
 * 历史已挂上同一预留 id、直播体又空时，只留历史行。
 * 收束后 store 还留着本轮体时继续画直播行，避免卸下换历史气泡时重挂 Markdown / 折 20 行
 * （对标 Codex changelog「preserved streamed activity when tasks complete」）。
 */
export function shouldRenderLiveAssistantRow(options: {
  loading: boolean
  hasLiveBody: boolean
  historyHasReserved: boolean
}): boolean {
  if (options.hasLiveBody) return true
  if (!options.loading) return false
  if (options.historyHasReserved) return false
  return true
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
 * 历史列真有预留行且直播体已上屏才藏。
 * 开轮预留 id 还不在 messages 里时，首枚 token 不把历史 JSX 整列重建（对标 Codex #22860）。
 * 收束关 loading 后 store 未清也继续藏，让同一直播行留下。
 */
export function shouldHideReservedDuringLive(options: {
  isLive: boolean
  hasLiveBody: boolean
  reservedId?: string | null
  hasReservedInHistory: boolean
}): boolean {
  const { hasLiveBody, reservedId, hasReservedInHistory } = options
  return Boolean(hasLiveBody && reservedId?.trim() && hasReservedInHistory)
}

/**
 * 直播中不把已提交的同一条助手再画进历史列，避免与直播行叠两份。
 * 直播体已空时不再藏历史行，否则会出现「消息未挂上、直播已空」的空窗。
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
 * 历史列还没挂上预留行时仍走开轮 beginTurnMeta（首轮）。
 */
export function shouldHoldLiveHandoff(options: {
  hasLiveBody: boolean
  liveAssistantId?: string | null
  historyHasReserved?: boolean
}): boolean {
  if (!options.hasLiveBody) return false
  if (!options.liveAssistantId?.trim()) return false
  if (options.historyHasReserved === false) return false
  return true
}

/** 跟进保住期间过程秒表 / 图解码 / Thought 不得再当直播。 */
export function shouldStreamLiveAssistant(options: {
  loading: boolean
  handoffId?: string | null
}): boolean {
  return Boolean(options.loading && !options.handoffId?.trim())
}

/** 首枚真实 harness 事件才换新直播 id；本地 Thinking seed 不触发。 */
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

/** 保住期间不把下一轮 seed 写进直播 store。 */
export function shouldPublishLiveStreamDuringHandoff(handoffId?: string | null): boolean {
  return !handoffId?.trim()
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
