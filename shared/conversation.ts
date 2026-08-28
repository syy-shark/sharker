/**
 * 对话模型、标题推导与侧栏排序。
 * 详见 shared/ARCH.md
 */
import type { ChatMessage } from './types'

/** 侧栏上的「用 AI 总结」操作文案（动词，不是对话标题） */
export const AI_SUMMARIZE_ACTION = 'AI总结'

export const DEFAULT_CONVERSATION_TITLE = '新对话'

/** 旧版误把「AI总结」当作对话标题落盘时的标记 */
const LEGACY_TITLE_AS_NOUN = 'AI总结'

/** 对话状态：active 主列表；archived 设置 → 已归档 */
export type ConversationStatus = 'active' | 'archived'

/** 完整对话（含消息列表） */
export interface Conversation {
  id: string
  workspaceId: string
  title: string
  customTitle?: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  status?: ConversationStatus
}

/** 侧栏展示的对话摘要（无消息体） */
export interface ConversationSummary {
  id: string
  workspaceId: string
  title: string
  customTitle?: string
  createdAt: number
  updatedAt: number
  messageCount: number
  status?: ConversationStatus
  /** 归档列表展示用工作区名 */
  workspaceLabel?: string
}

/** 侧栏顺序：上面是老对话，下面是新对话 */
export function sortConversationsByCreatedAt(
  conversations: ConversationSummary[]
): ConversationSummary[] {
  return [...conversations].sort((a, b) => a.createdAt - b.createdAt)
}

/** 工作区下的对话列表与当前活跃 ID */
export interface WorkspaceConversationsState {
  conversations: ConversationSummary[]
  activeConversationId: string | null
}

/** 从首条用户消息截取侧栏标题 */
export function deriveConversationTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim())
  if (!firstUser) return DEFAULT_CONVERSATION_TITLE
  const text = firstUser.content.replace(/\s+/g, ' ').trim()
  if (!text) return DEFAULT_CONVERSATION_TITLE
  const max = 28
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

/** 优先 customTitle；忽略旧版误存的「AI总结」占位标题 */
export function resolveConversationTitle(conversation: Conversation): string {
  if (conversation.customTitle?.trim()) return conversation.customTitle.trim()
  const stored = conversation.title?.trim()
  if (stored && stored !== LEGACY_TITLE_AS_NOUN && stored !== DEFAULT_CONVERSATION_TITLE) return stored
  return deriveConversationTitle(conversation.messages)
}

/** 创建空白对话（内存，未落盘） */
export function createEmptyConversation(workspaceId: string): Conversation {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    workspaceId,
    title: DEFAULT_CONVERSATION_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now
  }
}

/** `/fork` 分叉标题（对标 Codex fork thread） */
export function forkConversationTitle(title: string): string {
  const base = String(title || '').trim() || DEFAULT_CONVERSATION_TITLE
  if (base.endsWith('（分叉）')) return base
  return `${base}（分叉）`
}

/** 用已创建的空对话装入源线程消息；不拷 worktreePath */
export function buildForkedConversation(
  created: Conversation,
  source: { title?: string; messages: ChatMessage[] }
): Conversation {
  return {
    ...created,
    title: forkConversationTitle(source.title || created.title),
    messages: source.messages.map((m) => ({ ...m })),
    updatedAt: Date.now()
  }
}

/** 把进行中的对话抽成侧栏「进行中」任务行（对标 Codex 并行线程） */
export function splitLiveConversations<T extends { id: string }>(
  items: T[],
  liveIds: Iterable<string>
): { live: T[]; rest: T[] } {
  const liveSet = liveIds instanceof Set ? liveIds : new Set(liveIds)
  const live: T[] = []
  const rest: T[] = []
  for (const item of items) {
    if (liveSet.has(item.id)) live.push(item)
    else rest.push(item)
  }
  return { live, rest }
}

/** 下一条需要关注的进行中对话（对标 Codex ⌘⌥A） */
export function nextLiveConversationId(
  liveIds: string[],
  current: string | null
): string | null {
  if (liveIds.length === 0) return null
  if (!current) return liveIds[0] ?? null
  const idx = liveIds.indexOf(current)
  if (idx < 0) return liveIds[0] ?? null
  return liveIds[(idx + 1) % liveIds.length] ?? null
}

/** ⌘G 搜索对话：按标题或 id 过滤（对标 Codex Search chats） */
export function filterChatList<T extends { id: string; title?: string }>(
  items: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((c) => {
    const title = String(c.title || '').toLowerCase()
    return title.includes(q) || c.id.toLowerCase().includes(q)
  })
}

/** Conversation → 侧栏摘要 */
export function toConversationSummary(c: Conversation): ConversationSummary {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    title: resolveConversationTitle(c),
    customTitle: c.customTitle,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
    status: c.status ?? 'active'
  }
}
