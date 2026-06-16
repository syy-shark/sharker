/**
 * 工作区对话落盘（.sharker/conversations/）CRUD。
 * @see electron/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import {
  DEFAULT_CONVERSATION_TITLE,
  type Conversation,
  type ConversationSummary,
  type WorkspaceConversationsState,
  deriveConversationTitle,
  resolveConversationTitle,
  sortConversationsByCreatedAt,
  toConversationSummary
} from '../shared/conversation'

/** meta.json：记录当前活跃对话 ID */
interface ConversationsMeta {
  activeConversationId: string | null
}

/** 工作区 .sharker/conversations 目录 */
function conversationsDir(workspacePath: string): string {
  return path.join(workspacePath, '.sharker', 'conversations')
}

/** meta.json 文件路径 */
function metaPath(workspacePath: string): string {
  return path.join(conversationsDir(workspacePath), 'meta.json')
}

/** 单条对话 JSON 文件路径 */
function conversationPath(workspacePath: string, id: string): string {
  return path.join(conversationsDir(workspacePath), `${id}.json`)
}

/** 读取活跃对话 meta */
async function readMeta(workspacePath: string): Promise<ConversationsMeta> {
  try {
    const raw = await fs.readFile(metaPath(workspacePath), 'utf8')
    const parsed = JSON.parse(raw) as ConversationsMeta
    return {
      activeConversationId:
        typeof parsed.activeConversationId === 'string'
          ? parsed.activeConversationId
          : null
    }
  } catch {
    return { activeConversationId: null }
  }
}

/** 写入活跃对话 meta */
async function writeMeta(workspacePath: string, meta: ConversationsMeta): Promise<void> {
  const dir = conversationsDir(workspacePath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(metaPath(workspacePath), JSON.stringify(meta, null, 2), 'utf8')
}

/** 校正落盘对话的字段与标题 */
function normalizeConversation(raw: Conversation, workspaceId: string): Conversation {
  const messages = Array.isArray(raw.messages) ? raw.messages : []
  const base: Conversation = {
    id: raw.id,
    workspaceId,
    title: raw.title?.trim() || DEFAULT_CONVERSATION_TITLE,
    customTitle: raw.customTitle?.trim(),
    messages,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now()
  }
  return { ...base, title: resolveConversationTitle(base) }
}

/** 列出工作区下全部对话摘要与当前活跃对话 ID。 */
export async function listWorkspaceConversations(
  workspacePath: string,
  workspaceId: string
): Promise<WorkspaceConversationsState> {
  if (!workspacePath) {
    return { conversations: [], activeConversationId: null }
  }

  const dir = conversationsDir(workspacePath)
  await fs.mkdir(dir, { recursive: true })
  const meta = await readMeta(workspacePath)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const summaries: ConversationSummary[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'meta.json') {
      continue
    }
    const id = entry.name.replace(/\.json$/, '')
    try {
      const raw = await fs.readFile(path.join(dir, entry.name), 'utf8')
      const conv = normalizeConversation(JSON.parse(raw) as Conversation, workspaceId)
      summaries.push(toConversationSummary(conv))
    } catch {
      /* skip corrupt file */
    }
  }

  const conversations = sortConversationsByCreatedAt(summaries)

  let activeId = meta.activeConversationId
  if (activeId && !conversations.some((s) => s.id === activeId)) {
    activeId = conversations[conversations.length - 1]?.id ?? null
  }

  return { conversations, activeConversationId: activeId }
}

/** 按 ID 加载单条对话完整内容。 */
export async function loadConversation(
  workspacePath: string,
  workspaceId: string,
  id: string
): Promise<Conversation | null> {
  try {
    const raw = await fs.readFile(conversationPath(workspacePath, id), 'utf8')
    return normalizeConversation(JSON.parse(raw) as Conversation, workspaceId)
  } catch {
    return null
  }
}

/** 消息列表指纹，用于判断是否需要更新 updatedAt */
function messagesFingerprint(messages: Conversation['messages']): string {
  return JSON.stringify(
    messages.map((m) => [m.role, m.content, m.toolName ?? '', m.toolCallId ?? ''])
  )
}

/** 保存对话；消息未变时保留 updatedAt，并同步活跃对话 meta。 */
export async function saveConversation(
  workspacePath: string,
  conversation: Conversation
): Promise<Conversation> {
  const dir = conversationsDir(workspacePath)
  await fs.mkdir(dir, { recursive: true })
  let touchUpdatedAt = true
  try {
    const raw = await fs.readFile(conversationPath(workspacePath, conversation.id), 'utf8')
    const existing = JSON.parse(raw) as Conversation
    touchUpdatedAt =
      messagesFingerprint(existing.messages ?? []) !==
      messagesFingerprint(conversation.messages)
  } catch {
    touchUpdatedAt = true
  }
  const now = Date.now()
  const next: Conversation = {
    ...conversation,
    title: conversation.customTitle ? conversation.title : deriveConversationTitle(conversation.messages),
    updatedAt: touchUpdatedAt ? now : conversation.updatedAt
  }
  await fs.writeFile(
    conversationPath(workspacePath, next.id),
    JSON.stringify(next, null, 2),
    'utf8'
  )
  const meta = await readMeta(workspacePath)
  if (meta.activeConversationId !== next.id) {
    await writeMeta(workspacePath, { activeConversationId: next.id })
  }
  return next
}

/** 删除对话文件并清理活跃 meta */
export async function deleteConversation(
  workspacePath: string,
  id: string
): Promise<void> {
  try {
    await fs.unlink(conversationPath(workspacePath, id))
  } catch {
    /* missing */
  }
  const meta = await readMeta(workspacePath)
  if (meta.activeConversationId === id) {
    await writeMeta(workspacePath, { activeConversationId: null })
  }
}

/** 设置当前活跃对话 ID */
export async function setActiveConversation(
  workspacePath: string,
  conversationId: string | null
): Promise<void> {
  await writeMeta(workspacePath, { activeConversationId: conversationId })
}

/** 在工作区创建新对话并设为活跃。 */
export async function createConversationOnDisk(
  workspacePath: string,
  workspaceId: string
): Promise<Conversation> {
  const conv = {
    id: crypto.randomUUID(),
    workspaceId,
    title: DEFAULT_CONVERSATION_TITLE,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  } satisfies Conversation
  await saveConversation(workspacePath, conv)
  await setActiveConversation(workspacePath, conv.id)
  return conv
}
