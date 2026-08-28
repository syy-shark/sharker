/**
 * 后台回合完成：是否弹系统通知、标未读、Dock 徽标。
 * 对标 Codex / ChatGPT 桌面端 turn-complete（正在看的对话且窗口在前台则不打扰）。
 * @see shared/ARCH.md
 */

/** 主进程 Notification 与点击回跳载荷 */
export interface TurnNotifyPayload {
  title: string
  body: string
  conversationId: string
  workspaceId: string
}

/** 回合结果（与 App turnOutcome 对齐） */
export type TurnNotifyOutcome = 'success' | 'error' | 'aborted'

/** 正在看该对话的聊天页时不要弹通知（窗口失焦仍要提醒） */
export function shouldNotifyTurnComplete(input: {
  conversationId?: string | null
  activeConversationId?: string | null
  page: string
  windowFocused: boolean
  outcome: TurnNotifyOutcome
}): boolean {
  if (!input.conversationId) return false
  if (input.outcome === 'aborted') return false
  const viewing =
    input.page === 'chat' && input.conversationId === input.activeConversationId
  if (viewing && input.windowFocused) return false
  return true
}

/** 未在聊天页看该对话时标未读（窗口是否在前台无关） */
export function shouldMarkConversationUnread(input: {
  conversationId?: string | null
  activeConversationId?: string | null
  page: string
}): boolean {
  if (!input.conversationId) return false
  if (input.page !== 'chat') return true
  return input.conversationId !== input.activeConversationId
}

/** 通知标题：自定义标题优先 */
export function turnNotifyTitle(input: { customTitle?: string; title?: string }): string {
  const custom = input.customTitle?.trim()
  if (custom) return custom
  const title = input.title?.trim()
  if (title && title !== '新对话') return title
  return title || '对话完成'
}

/** 通知正文：压空白并截断 */
export function turnNotifyPreview(text: string, max = 160): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return '回合已完成'
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(1, max - 1))}…`
}

/** Dock 徽标 = 未读对话数（只计本机会话，不拉 Cloud） */
export function unreadDockBadgeCount(list: Array<{ unread?: boolean }>): number {
  return list.reduce((n, c) => n + (c.unread ? 1 : 0), 0)
}
