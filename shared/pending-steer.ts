/**
 * 当前回合注入（对标 Codex Follow-up → Steer：加入当前 run，不中止直播）。
 * 首轮采样前不排空；采样/工具边界后再交给模型。
 * @see shared/ARCH.md
 */
import type { ChatAttachment, ChatMessage } from './types'

/** 已接受、尚未写入对话历史的注入 */
export interface PendingSteerItem {
  id: string
  conversationId: string
  text: string
  attachments?: ChatAttachment[]
  createdAt: number
}

/** conversationId → 该会话待注入列表 */
export type PendingSteerMap = Record<string, PendingSteerItem[]>

/** 主进程接受注入的结果 */
export type SteerAcceptResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no_active_turn' | 'empty' | 'no_conversation' }

/** 忙时注入失败后的去向：不得为了「注入」中止直播 */
export type BusyFollowUpAction = 'pending' | 'queue' | 'send' | 'ignore'

/**
 * 忙时后续：Steer 成功进当前回合；没有进行中回合才新开一轮；
 * 其它失败改排队（对标 Codex queued chip Steer，不 abort）。
 */
export function resolveBusyFollowUp(input: {
  intent: 'steer' | 'queue'
  accepted?: SteerAcceptResult | null
}): BusyFollowUpAction {
  if (input.intent === 'queue') return 'queue'
  if (!input.accepted) return 'queue'
  if (input.accepted.ok) return 'pending'
  if (input.accepted.reason === 'empty') return 'ignore'
  if (input.accepted.reason === 'no_active_turn') return 'send'
  return 'queue'
}

/** 创建注入项（强制绑定 conversationId） */
export function createPendingSteer(
  conversationId: string,
  text: string,
  attachments?: ChatAttachment[],
  id?: string
): PendingSteerItem {
  return {
    id: id ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId,
    text,
    createdAt: Date.now(),
    attachments: attachments?.length ? attachments : undefined
  }
}

/** 排入指定会话的待注入列表 */
export function enqueuePendingSteer(
  boxes: PendingSteerMap,
  conversationId: string,
  item: PendingSteerItem
): PendingSteerMap {
  const owned: PendingSteerItem = { ...item, conversationId }
  const prev = boxes[conversationId] ?? []
  return { ...boxes, [conversationId]: [...prev, owned] }
}

/** 列出某会话尚未排空的注入 */
export function listPendingSteers(
  boxes: PendingSteerMap,
  conversationId: string | null | undefined
): PendingSteerItem[] {
  if (!conversationId) return []
  return boxes[conversationId] ?? []
}

/** 排空某会话全部注入 */
export function drainPendingSteers(
  boxes: PendingSteerMap,
  conversationId: string
): { items: PendingSteerItem[]; boxes: PendingSteerMap } {
  const items = boxes[conversationId] ?? []
  if (items.length === 0) return { items: [], boxes }
  const next = { ...boxes }
  delete next[conversationId]
  return { items, boxes: next }
}

/** 取消一条尚未排空的注入 */
export function cancelPendingSteer(
  boxes: PendingSteerMap,
  conversationId: string,
  steerId: string
): PendingSteerMap {
  const list = boxes[conversationId]
  if (!list?.length) return boxes
  const nextList = list.filter((item) => item.id !== steerId)
  if (nextList.length === list.length) return boxes
  const next = { ...boxes }
  if (nextList.length === 0) delete next[conversationId]
  else next[conversationId] = nextList
  return next
}

/** 改写一条尚未排空的注入正文 */
export function updatePendingSteerText(
  boxes: PendingSteerMap,
  conversationId: string,
  steerId: string,
  text: string
): PendingSteerMap {
  const list = boxes[conversationId]
  if (!list?.length) return boxes
  const trimmed = text.trim()
  if (!trimmed) return cancelPendingSteer(boxes, conversationId, steerId)
  return {
    ...boxes,
    [conversationId]: list.map((item) => (item.id === steerId ? { ...item, text: trimmed } : item))
  }
}

/**
 * 对标 Codex：采样进行中不排空；至少完成过一次模型回复后才交给下一轮。
 * 首轮用户提示先被采样，工具批次后或终答前再注入。
 */
export function shouldDrainPendingSteers(options: {
  hasSampledOnce: boolean
  samplingInFlight?: boolean
}): boolean {
  if (options.samplingInFlight) return false
  return options.hasSampledOnce
}

/** 写入模型上下文的注入正文（附件只列文件名，避免中止重开） */
export function formatSteerForModel(item: PendingSteerItem): string {
  const text = String(item.text || '').trim()
  const names = (item.attachments || []).map((a) => a.name).filter(Boolean)
  if (!names.length) return text
  return `${text}\n\n[附件: ${names.join(', ')}]`
}

/** 排空后写入对话历史；已有同一 id 不重复（对标 committed UserMessage） */
export function appendConsumedSteerMessage(
  messages: ChatMessage[],
  item: Pick<PendingSteerItem, 'id' | 'text' | 'attachments'>
): ChatMessage[] {
  if (messages.some((row) => row.id === item.id)) return messages
  return [
    ...messages,
    {
      id: item.id,
      role: 'user',
      content: item.text,
      attachments: item.attachments
    }
  ]
}

/**
 * 回合结束仍未排空的注入：对标 Codex core `on_task_finished` + TUI #18290 / #15842。
 * 成功且已采样 → 收成 UserMessage（#12868）；中止/失败或从未采样（如 `!` 本地命令）→ 还回排队并作为下一轮。
 */
export function leftoverSteerDisposition(options: {
  outcome: 'success' | 'aborted' | 'error'
  sampled: boolean
}): 'consume' | 'restore' {
  if (options.outcome !== 'success') return 'restore'
  if (!options.sampled) return 'restore'
  return 'consume'
}

/** 收束后未排空的多条注入合成下一轮提示（对标连续 steer 合并） */
export function joinLeftoverSteerPrompt(items: Array<{ text: string }>): string {
  return items
    .map((item) => String(item.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

/** 续跑时从发给模型的 history 去掉已写入气泡的注入，避免同一段进两次 */
export function historyWithoutSteerIds<T extends { id: string }>(
  messages: T[],
  ids: Iterable<string>
): T[] {
  const skip = new Set(ids)
  if (skip.size === 0) return messages
  const next = messages.filter((row) => !skip.has(row.id))
  return next.length === messages.length ? messages : next
}

/**
 * 排队芯片主操作：直播中只注入当前回合（对标 Codex queued chip Steer），
 * 空闲才立刻发送。失败必须把条目留在队列，不得中止直播。
 */
export function queuedChipPrimaryAction(busy: boolean): 'steer' | 'send' {
  return busy ? 'steer' : 'send'
}

/** 收束助手行插在残留注入气泡之前（对标 leftover UserMessage 出现在本轮回答之后） */
export function placeMessageBeforeIds<T extends { id: string }>(
  messages: T[],
  message: T,
  beforeIds: Iterable<string>
): T[] {
  const skip = new Set(beforeIds)
  const without = messages.filter((row) => row.id !== message.id)
  let cut = without.length
  while (cut > 0 && skip.has(without[cut - 1]!.id)) cut--
  return [...without.slice(0, cut), message, ...without.slice(cut)]
}
