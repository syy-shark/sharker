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
}

/** conversationId → 该会话的排队列表 */
export type SessionQueueMap = Record<string, SessionQueuedPrompt[]>

/** 创建排队项（强制绑定 conversationId） */
export function createQueuedPrompt(
  conversationId: string,
  text: string,
  attachments?: ChatAttachment[],
  id?: string
): SessionQueuedPrompt {
  return {
    id: id ?? `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text,
    conversationId,
    attachments: attachments?.length ? attachments : undefined
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
  /** 传给 abortChat；null 表示不调中止 */
  abortConversationId: string | null
  /** 写入 _(已停止)_ 的会话；null 表示不写 */
  commitStopToConversationId: string | null
} {
  const { activeConversationId, activeIsBusy } = input
  if (!activeConversationId || !activeIsBusy) {
    return { abortConversationId: null, commitStopToConversationId: null }
  }
  return {
    abortConversationId: activeConversationId,
    commitStopToConversationId: activeConversationId
  }
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

/**
 * 直播中不把已提交的同一条助手再画进历史列，避免与直播行叠两份。
 * 收束后 `isLive` 为假，预留 id 那一行只出现在历史列（React 复用同一 key）。
 */
export function historicalMessagesDuringLive(
  messages: ChatMessage[],
  reservedId: string | null | undefined,
  isLive: boolean
): ChatMessage[] {
  if (!isLive) return messages
  const id = reservedId?.trim()
  if (!id) return messages
  return messages.filter((m) => m.id !== id)
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
  next[idx] = assistant
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
