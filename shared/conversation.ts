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
  /** 置顶（对标 Codex ⌘⌥P） */
  pinned?: boolean
  /** 未读（对标 Codex ⌘⇧U） */
  unread?: boolean
  /** 本对话是否注入已有记忆；`null`/缺省跟随全局（对标 Codex chat-level /memories） */
  memoryInjection?: boolean | null
  /** 本对话是否写入新记忆；`null`/缺省跟随全局 */
  memoryGeneration?: boolean | null
  /** 最近一条用户/助手正文摘要（Search chats 扩匹配） */
  preview?: string
  /** 关联 git 分支 / worktree 名（Search chats 扩匹配） */
  gitBranch?: string
  /** 当前 `messages[0]` 在全量中的 seq；>0 表示还有更早页未加载（对标 Codex initialTurnsPage） */
  historyStartSeq?: number
  /** 全量消息条数；缺省按 `messages.length` */
  historyTotal?: number
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
  pinned?: boolean
  unread?: boolean
  /** 最近一条用户/助手正文摘要（Search chats 扩匹配） */
  preview?: string
  /** 关联 git 分支 / worktree 名（Search chats 扩匹配） */
  gitBranch?: string
}

/** 只改标题 / 置顶 / 未读 / 本对话记忆，不重写消息、不抢活跃会话 */
export interface ConversationMetaPatch {
  customTitle?: string | null
  pinned?: boolean
  unread?: boolean
  memoryInjection?: boolean | null
  memoryGeneration?: boolean | null
}

/** 侧栏顺序：置顶在前，同组里上面是老对话、下面是新对话 */
export function sortConversationsByCreatedAt(
  conversations: ConversationSummary[]
): ConversationSummary[] {
  return [...conversations].sort((a, b) => {
    const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    if (pin) return pin
    return a.createdAt - b.createdAt
  })
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

/** `/fork` 目标：默认新本地线程；`worktree` 另建隔离 checkout（对标 Codex /fork） */
export type ForkDestination = 'local' | 'worktree'

/** `/fork [local|worktree]`；空或无法识别则本地 */
export function parseForkDestination(raw: string): ForkDestination {
  const token = String(raw || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)[0]
  if (token === 'worktree' || token === 'wt' || token === 'isolated') return 'worktree'
  return 'local'
}

/** `/fork` 分叉标题（对标 Codex fork thread） */
export function forkConversationTitle(title: string): string {
  const base = String(title || '').trim() || DEFAULT_CONVERSATION_TITLE
  if (base.endsWith('（分叉）')) return base
  return `${base}（分叉）`
}

/**
 * 拷贝到指定消息（含该条），省略其后回合。
 * 对标 Codex `thread/fork` 的 `lastTurnId`（含该回合、丢掉更晚的）。
 * 未指定或找不到 id 时拷贝全部（`/fork` 默认）。
 */
export function messagesThroughInclusive(
  messages: ChatMessage[],
  lastMessageId?: string | null
): ChatMessage[] {
  const id = String(lastMessageId || '').trim()
  if (!id) return messages.map((m) => ({ ...m }))
  const idx = messages.findIndex((m) => m.id === id)
  if (idx < 0) return messages.map((m) => ({ ...m }))
  return messages.slice(0, idx + 1).map((m) => ({ ...m }))
}

/** 直播中的未完成助手行不能当分叉终点（对标 Codex 拒绝 in-progress lastTurnId） */
export function canForkThroughMessage(opts: {
  lastMessageId?: string | null
  liveAssistantId?: string | null
  streaming?: boolean
}): boolean {
  const id = String(opts.lastMessageId || '').trim()
  if (!id) return false
  if (opts.streaming && opts.liveAssistantId && id === opts.liveAssistantId) return false
  return true
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

/** 从后往前取最近一条用户/助手正文，压空白后截断（Search chats / 侧栏摘要） */
export function conversationPreview(
  messages: Array<{ role?: string; content?: string }>,
  max = 240
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if ((m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim()) {
      return String(m.content).replace(/\s+/g, ' ').trim().slice(0, max)
    }
  }
  return ''
}

/** 可被 Search chats 扩匹配的字段 */
export type ChatSearchItem = {
  id: string
  title?: string
  customTitle?: string
  preview?: string
  gitBranch?: string
}

/** 搜索对话（命令面板 / 可自绑快捷键）：标题 / 自定义标题 / id / 正文摘要 / git 分支 */
export function filterChatList<T extends ChatSearchItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((c) => chatSearchHaystack(c).includes(q))
}

/** 命中正文或分支时的副文案（标题命中则不重复） */
export function chatSearchMatchHint(item: ChatSearchItem, query: string): string {
  const q = query.trim().toLowerCase()
  if (!q) return ''
  const title = String(item.customTitle || item.title || '').toLowerCase()
  if (title.includes(q) || item.id.toLowerCase().includes(q)) return ''
  const branch = String(item.gitBranch || '').trim()
  if (branch.toLowerCase().includes(q)) return branch
  const preview = String(item.preview || '').trim()
  if (preview.toLowerCase().includes(q)) return preview
  return ''
}

function chatSearchHaystack(item: ChatSearchItem): string {
  return [
    item.customTitle,
    item.title,
    item.id,
    item.preview,
    item.gitBranch
  ]
    .map((v) => String(v || '').toLowerCase())
    .join('\n')
}

/** `/rename` 参数：空则进入行内改名；有文本则立刻写入 customTitle */
export function parseRenameArgs(args: string): { kind: 'prompt' } | { kind: 'set'; title: string } {
  const title = args.replace(/^\s+/, '').trim()
  if (!title) return { kind: 'prompt' }
  return { kind: 'set', title }
}

/** 空标题表示清除自定义名，回退到首条消息推导 */
export function applyCustomTitle(raw: string): string | undefined {
  const title = raw.trim()
  return title || undefined
}

export function formatRenameNote(title: string | undefined): string {
  if (!title) return '已清除自定义标题，侧栏将用首条消息推导。'
  return `对话已重命名为「${title}」。`
}

export function formatPinNote(pinned: boolean): string {
  return pinned ? '已置顶此对话。' : '已取消置顶。'
}

export function formatUnreadNote(): string {
  return '已将此对话标为未读。打开后会自动清未读。'
}

/** 侧栏对话筛选（对标 Codex Activity：未读 / 进行中 / 等待回复 / 定时 / 置顶） */
export type SidebarChatFilter =
  | 'chronological'
  | 'live'
  | 'waiting'
  | 'unread'
  | 'pinned'
  | 'scheduled'

export const SIDEBAR_CHAT_FILTERS: Array<{ id: SidebarChatFilter; label: string }> = [
  { id: 'chronological', label: '按时间' },
  { id: 'live', label: '进行中' },
  { id: 'waiting', label: '等待回复' },
  { id: 'unread', label: '未读' },
  { id: 'scheduled', label: '定时' },
  { id: 'pinned', label: '置顶' }
]

export function isActivitySidebarFilter(filter: SidebarChatFilter): boolean {
  return filter === 'live' || filter === 'waiting' || filter === 'unread' || filter === 'scheduled'
}

/** 对标 Codex ⌘⌥U：打开/关闭 Activity（默认落到等待回复） */
export function nextActivitySidebarFilter(current: SidebarChatFilter): SidebarChatFilter {
  return isActivitySidebarFilter(current) ? 'chronological' : 'waiting'
}

/** 按侧栏过滤器收对话；`chronological` 原样返回 */
export function filterSidebarChats<T extends { id: string; unread?: boolean; pinned?: boolean }>(
  items: T[],
  filter: SidebarChatFilter,
  liveIds: Iterable<string>,
  waitingIds?: Iterable<string>,
  scheduledIds?: Iterable<string>
): T[] {
  if (filter === 'chronological') return items
  if (filter === 'live') {
    const liveSet = liveIds instanceof Set ? liveIds : new Set(liveIds)
    return items.filter((item) => liveSet.has(item.id))
  }
  if (filter === 'waiting') {
    const waitingSet = waitingIds instanceof Set ? waitingIds : new Set(waitingIds ?? [])
    return items.filter((item) => waitingSet.has(item.id))
  }
  if (filter === 'unread') return items.filter((item) => item.unread)
  if (filter === 'scheduled') {
    const scheduledSet = scheduledIds instanceof Set ? scheduledIds : new Set(scheduledIds ?? [])
    return items.filter((item) => scheduledSet.has(item.id))
  }
  return items.filter((item) => item.pinned)
}

/** ⌘⌥A：先等你回复的审批，再切进行中对话 */
export function collectAttentionConversationIds(input: {
  conversations: Array<{ id: string }>
  liveIds: Iterable<string>
  waitingIds?: Iterable<string>
}): string[] {
  const waitingSet = input.waitingIds instanceof Set ? input.waitingIds : new Set(input.waitingIds ?? [])
  const liveSet = input.liveIds instanceof Set ? input.liveIds : new Set(input.liveIds)
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }
  for (const item of input.conversations) {
    if (waitingSet.has(item.id)) push(item.id)
  }
  for (const id of waitingSet) push(id)
  for (const item of input.conversations) {
    if (liveSet.has(item.id)) push(item.id)
  }
  for (const id of liveSet) push(id)
  return ids
}

/** 侧栏：置顶组与其余（进行中拆分之后再用） */
export function splitPinnedConversations<T extends { pinned?: boolean }>(
  items: T[]
): { pinned: T[]; rest: T[] } {
  const pinned: T[] = []
  const rest: T[] = []
  for (const item of items) {
    if (item.pinned) pinned.push(item)
    else rest.push(item)
  }
  return { pinned, rest }
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
    status: c.status ?? 'active',
    pinned: c.pinned,
    unread: c.unread,
    preview: c.preview || conversationPreview(c.messages) || undefined,
    gitBranch: c.gitBranch
  }
}

/** 项目菜单「归档对话」：只收该项目未归档对话，可跳过进行中以免中断直播 */
export function conversationIdsToArchiveForProject(
  conversations: Array<{ id: string; workspaceId: string; status?: ConversationStatus }>,
  workspaceId: string,
  skipIds?: Iterable<string>
): string[] {
  const target = String(workspaceId || '')
  if (!target) return []
  const skip = skipIds instanceof Set ? skipIds : new Set(skipIds ?? [])
  return conversations
    .filter((c) => c.workspaceId === target && c.status !== 'archived' && !skip.has(c.id))
    .map((c) => c.id)
}

/** Search chats 用的 git 分支：显式字段 > worktree 起点 > 工作区当前分支 */
export function resolveConversationGitBranch(input: {
  gitBranch?: string
  baseRef?: string
  workspaceBranch?: string
}): string {
  for (const raw of [input.gitBranch, input.baseRef, input.workspaceBranch]) {
    const v = String(raw || '').trim()
    if (v && v !== 'HEAD' && v !== 'detached') return v
  }
  return ''
}

/** 对话路径：隔离 worktree 优先，否则工作区 cwd（对标 Codex Copy conversation path） */
export function resolveConversationPath(input: {
  worktreePath?: string
  workspacePath?: string
}): string {
  const isolated = String(input.worktreePath || '').trim()
  if (isolated) return isolated
  return String(input.workspacePath || '').trim()
}
