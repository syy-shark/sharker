/**
 * 主进程当前回合注入信箱：渲染进程 IPC 写入，queryLoop 在采样/工具边界排空。
 * @see agent/ARCH.md
 */
import {
  cancelPendingSteer,
  createPendingSteer,
  drainPendingSteers,
  enqueuePendingSteer,
  listPendingSteers,
  updatePendingSteerText,
  type PendingSteerItem,
  type PendingSteerMap,
  type SteerAcceptResult
} from '../shared/pending-steer'
import type { ChatAttachment } from '../shared/types'

let boxes: PendingSteerMap = {}
const steerable = new Set<string>()

/** 回合入槽：此后 chat:steer 可写入该会话 */
export function markTurnSteerable(conversationId: string): void {
  const id = conversationId.trim()
  if (id) steerable.add(id)
}

/** 回合出槽：剩余注入交还渲染层（成功收成用户气泡 / 中止还原排队） */
export function releaseTurnSteer(conversationId: string): PendingSteerItem[] {
  const id = conversationId.trim()
  steerable.delete(id)
  const drained = drainPendingSteers(boxes, id)
  boxes = drained.boxes
  return drained.items
}

/** 该会话是否正跑、可接受注入 */
export function isTurnSteerable(conversationId: string | undefined): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  return steerable.has(id)
}

/** 接受一条注入；无进行中回合则失败，由渲染层回退排队 */
export function acceptTurnSteer(
  conversationId: string | undefined,
  text: string,
  attachments?: ChatAttachment[]
): SteerAcceptResult {
  const id = conversationId?.trim()
  if (!id) return { ok: false, reason: 'no_conversation' }
  const trimmed = String(text || '').trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (!isTurnSteerable(id)) return { ok: false, reason: 'no_active_turn' }
  const item = createPendingSteer(id, trimmed, attachments)
  boxes = enqueuePendingSteer(boxes, id, item)
  return { ok: true, id: item.id }
}

/** queryLoop 在安全边界排空 */
export function drainSteersForTurn(conversationId: string): PendingSteerItem[] {
  const drained = drainPendingSteers(boxes, conversationId)
  boxes = drained.boxes
  return drained.items
}

/** 预览是否还有待注入（终答前决定是否续轮） */
export function peekSteersForTurn(conversationId: string): PendingSteerItem[] {
  return listPendingSteers(boxes, conversationId)
}

/** 用户从预览条删除尚未排空的注入 */
export function cancelTurnSteer(conversationId: string, steerId: string): boolean {
  const before = listPendingSteers(boxes, conversationId).length
  boxes = cancelPendingSteer(boxes, conversationId, steerId)
  return listPendingSteers(boxes, conversationId).length !== before
}

/** 用户改写尚未排空的注入 */
export function updateTurnSteer(conversationId: string, steerId: string, text: string): boolean {
  const prev = listPendingSteers(boxes, conversationId).find((item) => item.id === steerId)
  if (!prev) return false
  boxes = updatePendingSteerText(boxes, conversationId, steerId, text)
  return true
}

/** 测试用：清空信箱 */
export function __resetPendingSteerMailboxForTests(): void {
  boxes = {}
  steerable.clear()
}
