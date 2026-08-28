/**
 * 会话与消息 CRUD（PostgreSQL 唯一数据源）。
 */
import { randomUUID } from 'crypto'
import type {
  Conversation,
  ConversationMetaPatch,
  ConversationSummary,
  WorkspaceConversationsState
} from '../../shared/conversation'
import {
  DEFAULT_CONVERSATION_TITLE,
  deriveConversationTitle,
  resolveConversationTitle,
  sortConversationsByCreatedAt,
  toConversationSummary
} from '../../shared/conversation'
import type { ChatMessage } from '../../shared/types'
import { getMemoryDb } from './db'
import { ensureProject } from './projects'

function messagesFingerprint(messages: ChatMessage[]): string {
  return JSON.stringify(
    messages.map((m) => [m.role, m.content, m.toolName ?? '', m.toolCallId ?? ''])
  )
}

async function ensureWorkspaceRow(workspaceId: string, workspacePath?: string): Promise<void> {
  const db = await getMemoryDb()
  const exists = await db.query('SELECT id FROM workspaces WHERE id = $1', [workspaceId])
  if (exists.rows.length > 0) return
  const projectId = workspacePath ? await ensureProject(workspacePath) : null
  await db.query(
    `INSERT INTO workspaces (id, project_id, path, label, is_home)
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (id) DO NOTHING`,
    [workspaceId, projectId, workspacePath ?? '', workspaceId]
  )
}

function rowToMessage(row: {
  id: string
  role: string
  content: string
  tool_call_id: string | null
  tool_name: string | null
  meta: unknown
}): ChatMessage {
  const msg: ChatMessage = {
    id: row.id,
    role: row.role as ChatMessage['role'],
    content: row.content
  }
  if (row.tool_call_id) msg.toolCallId = row.tool_call_id
  if (row.tool_name) msg.toolName = row.tool_name
  if (row.meta) {
    if (typeof row.meta === 'string') {
      try {
        msg.meta = JSON.parse(row.meta) as ChatMessage['meta']
      } catch {
        /* ignore */
      }
    } else if (typeof row.meta === 'object') {
      msg.meta = row.meta as ChatMessage['meta']
    }
  }
  return msg
}

async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await getMemoryDb()
  const res = await db.query<{
    id: string
    role: string
    content: string
    tool_call_id: string | null
    tool_name: string | null
    meta: unknown
  }>(
    `SELECT id, role, content, tool_call_id, tool_name, meta
     FROM session_messages WHERE session_id = $1 ORDER BY seq ASC`,
    [sessionId]
  )
  return res.rows.map(rowToMessage)
}

function normalizeConversation(raw: Conversation, workspaceId: string): Conversation {
  const messages = Array.isArray(raw.messages) ? raw.messages : []
  const base: Conversation = {
    id: raw.id,
    workspaceId,
    title: raw.title?.trim() || DEFAULT_CONVERSATION_TITLE,
    customTitle: raw.customTitle?.trim(),
    messages,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
    pinned: Boolean(raw.pinned),
    unread: Boolean(raw.unread)
  }
  return { ...base, title: resolveConversationTitle(base) }
}

/** 列出工作区下全部对话 */
export async function listWorkspaceConversations(
  workspacePath: string,
  workspaceId: string
): Promise<WorkspaceConversationsState> {
  if (!workspaceId) {
    return { conversations: [], activeConversationId: null }
  }

  await ensureWorkspaceRow(workspaceId, workspacePath)
  const db = await getMemoryDb()

  // 主列表只含未归档；一条 SQL 带上 messageCount，避免 N+1 拖死 UI
  const sessions = await db.query<{
    id: string
    title: string
    custom_title: string | null
    created_at: number
    updated_at: number
    status: string | null
    pinned: boolean | null
    unread: boolean | null
    msg_count: number
    preview: string | null
  }>(
    `SELECT s.id, s.title, s.custom_title, s.created_at, s.updated_at, s.status,
            COALESCE(s.pinned, false) AS pinned,
            COALESCE(s.unread, false) AS unread,
            COALESCE(c.msg_count, 0)::int AS msg_count,
            (
              SELECT left(m.content, 240)
              FROM session_messages m
              WHERE m.session_id = s.id
                AND m.role IN ('user', 'assistant')
                AND length(trim(m.content)) > 0
              ORDER BY m.seq DESC
              LIMIT 1
            ) AS preview
     FROM sessions s
     LEFT JOIN (
       SELECT session_id, COUNT(*)::int AS msg_count
       FROM session_messages
       GROUP BY session_id
     ) c ON c.session_id = s.id
     WHERE s.workspace_id = $1 AND (s.status IS NULL OR s.status = 'active')
     ORDER BY s.created_at ASC`,
    [workspaceId]
  )

  const summaries: ConversationSummary[] = sessions.rows.map((s) => {
    const conv: Conversation = {
      id: s.id,
      workspaceId,
      title: s.title,
      customTitle: s.custom_title ?? undefined,
      messages: [],
      createdAt: Number(s.created_at),
      updatedAt: Number(s.updated_at),
      status: 'active',
      pinned: Boolean(s.pinned),
      unread: Boolean(s.unread),
      preview: s.preview?.replace(/\s+/g, ' ').trim() || undefined
    }
    return {
      ...toConversationSummary(conv),
      messageCount: Number(s.msg_count) || 0
    }
  })

  const conversations = sortConversationsByCreatedAt(summaries)
  const meta = await db.query<{ active_session_id: string | null }>(
    'SELECT active_session_id FROM workspace_session_meta WHERE workspace_id = $1',
    [workspaceId]
  )
  let activeId = meta.rows[0]?.active_session_id ?? null
  if (activeId && !conversations.some((c) => c.id === activeId)) {
    activeId = conversations[conversations.length - 1]?.id ?? null
  }
  return { conversations, activeConversationId: activeId }
}

/** 加载单条对话 */
export async function loadConversation(
  workspacePath: string,
  workspaceId: string,
  id: string
): Promise<Conversation | null> {
  await ensureWorkspaceRow(workspaceId, workspacePath)
  const db = await getMemoryDb()
  const row = await db.query<{
    id: string
    title: string
    custom_title: string | null
    created_at: number
    updated_at: number
    pinned: boolean | null
    unread: boolean | null
  }>(
    `SELECT id, title, custom_title, created_at, updated_at,
            COALESCE(pinned, false) AS pinned,
            COALESCE(unread, false) AS unread
     FROM sessions WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  )
  const s = row.rows[0]
  if (!s) return null

  const messages = await loadMessages(id)
  return normalizeConversation(
    {
      id: s.id,
      workspaceId,
      title: s.title,
      customTitle: s.custom_title ?? undefined,
      messages,
      createdAt: Number(s.created_at),
      updatedAt: Number(s.updated_at),
      pinned: Boolean(s.pinned),
      unread: Boolean(s.unread)
    },
    workspaceId
  )
}

/** 保存对话（消息全量替换）。默认把该会话设为活跃。 */
export async function saveConversation(
  workspacePath: string,
  conversation: Conversation,
  options?: { activate?: boolean }
): Promise<Conversation> {
  await ensureWorkspaceRow(conversation.workspaceId, workspacePath)
  const db = await getMemoryDb()

  let touchUpdatedAt = true
  const existing = await loadConversation(workspacePath, conversation.workspaceId, conversation.id)
  if (existing) {
    touchUpdatedAt =
      messagesFingerprint(existing.messages) !== messagesFingerprint(conversation.messages)
  }

  const now = Date.now()
  const next: Conversation = {
    ...conversation,
    title: conversation.customTitle
      ? conversation.title
      : deriveConversationTitle(conversation.messages),
    pinned: Boolean(conversation.pinned),
    unread: Boolean(conversation.unread),
    updatedAt: touchUpdatedAt ? now : conversation.updatedAt
  }

  await db.query(
    `INSERT INTO sessions (id, workspace_id, title, custom_title, created_at, updated_at, pinned, unread)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       custom_title = EXCLUDED.custom_title,
       updated_at = EXCLUDED.updated_at,
       pinned = EXCLUDED.pinned,
       unread = EXCLUDED.unread`,
    [
      next.id,
      next.workspaceId,
      next.title,
      next.customTitle ?? null,
      next.createdAt,
      next.updatedAt,
      next.pinned ?? false,
      next.unread ?? false
    ]
  )

  await db.query('DELETE FROM session_messages WHERE session_id = $1', [next.id])
  for (let seq = 0; seq < next.messages.length; seq++) {
    const m = next.messages[seq]
    await db.query(
      `INSERT INTO session_messages (id, session_id, role, content, tool_call_id, tool_name, meta, seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        m.id,
        next.id,
        m.role,
        m.content,
        m.toolCallId ?? null,
        m.toolName ?? null,
        m.meta ? (m.meta as object) : null,
        seq
      ]
    )
  }

  const active = await db.query<{ active_session_id: string | null }>(
    'SELECT active_session_id FROM workspace_session_meta WHERE workspace_id = $1',
    [next.workspaceId]
  )
  if (options?.activate !== false && active.rows[0]?.active_session_id !== next.id) {
    await setActiveConversation(workspacePath, next.workspaceId, next.id)
  }

  return next
}

/** 只改标题 / 置顶 / 未读，不重写消息、不抢活跃会话 */
export async function patchConversationMeta(
  workspacePath: string,
  workspaceId: string,
  id: string,
  patch: ConversationMetaPatch
): Promise<ConversationSummary | null> {
  await ensureWorkspaceRow(workspaceId, workspacePath)
  const existing = await loadConversation(workspacePath, workspaceId, id)
  if (!existing) return null
  const next: Conversation = {
    ...existing,
    customTitle:
      'customTitle' in patch
        ? patch.customTitle?.trim() || undefined
        : existing.customTitle,
    pinned: patch.pinned ?? existing.pinned,
    unread: patch.unread ?? existing.unread
  }
  next.title = next.customTitle || deriveConversationTitle(existing.messages)
  const db = await getMemoryDb()
  await db.query(
    `UPDATE sessions
     SET custom_title = $1, pinned = $2, unread = $3, title = $4
     WHERE id = $5 AND workspace_id = $6`,
    [
      next.customTitle ?? null,
      Boolean(next.pinned),
      Boolean(next.unread),
      next.title,
      id,
      workspaceId
    ]
  )
  return toConversationSummary(next)
}

/** 清掉工作区下全部对话未读（对标 Codex ⇧Esc） */
export async function clearWorkspaceConversationUnread(
  workspacePath: string,
  workspaceId: string
): Promise<number> {
  await ensureWorkspaceRow(workspaceId, workspacePath)
  const db = await getMemoryDb()
  const res = await db.query<{ id: string }>(
    `UPDATE sessions SET unread = false
     WHERE workspace_id = $1 AND unread = true
     RETURNING id`,
    [workspaceId]
  )
  return res.rows.length
}

/** 归档 / 回档对话（status: active | archived） */
export async function setConversationArchived(
  workspacePath: string,
  workspaceId: string,
  id: string,
  archived: boolean
): Promise<void> {
  await ensureWorkspaceRow(workspaceId, workspacePath)
  const db = await getMemoryDb()
  const status = archived ? 'archived' : 'active'
  const now = Date.now()
  await db.query(
    `UPDATE sessions SET status = $1, updated_at = $2
     WHERE id = $3 AND workspace_id = $4`,
    [status, now, id, workspaceId]
  )
  if (archived) {
    const meta = await db.query<{ active_session_id: string | null }>(
      'SELECT active_session_id FROM workspace_session_meta WHERE workspace_id = $1',
      [workspaceId]
    )
    if (meta.rows[0]?.active_session_id === id) {
      await db.query(
        `INSERT INTO workspace_session_meta (workspace_id, active_session_id)
         VALUES ($1, NULL) ON CONFLICT (workspace_id) DO UPDATE SET active_session_id = NULL`,
        [workspaceId]
      )
    }
  }
}

/** 列出全部已归档对话（跨工作区，供设置页） */
export async function listArchivedConversations(): Promise<ConversationSummary[]> {
  const db = await getMemoryDb()
  const sessions = await db.query<{
    id: string
    workspace_id: string
    title: string
    custom_title: string | null
    created_at: number
    updated_at: number
    workspace_label: string | null
    workspace_path: string | null
    pinned: boolean | null
    unread: boolean | null
  }>(
    `SELECT s.id, s.workspace_id, s.title, s.custom_title, s.created_at, s.updated_at,
            COALESCE(s.pinned, false) AS pinned,
            COALESCE(s.unread, false) AS unread,
            w.label AS workspace_label, w.path AS workspace_path
     FROM sessions s
     LEFT JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.status = 'archived'
     ORDER BY s.updated_at DESC`
  )

  const out: ConversationSummary[] = []
  for (const s of sessions.rows) {
    const countRes = await db.query<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM session_messages WHERE session_id = $1',
      [s.id]
    )
    const conv: Conversation = {
      id: s.id,
      workspaceId: s.workspace_id,
      title: s.title,
      customTitle: s.custom_title ?? undefined,
      messages: [],
      createdAt: Number(s.created_at),
      updatedAt: Number(s.updated_at),
      status: 'archived',
      pinned: Boolean(s.pinned),
      unread: Boolean(s.unread)
    }
    out.push({
      ...toConversationSummary(conv),
      messageCount: countRes.rows[0]?.c ?? 0,
      workspaceLabel: s.workspace_label || s.workspace_path || s.workspace_id
    })
  }
  return out
}

/** 删除对话 */
export async function deleteConversation(
  workspacePath: string,
  workspaceId: string,
  id: string
): Promise<void> {
  await ensureWorkspaceRow(workspaceId, workspacePath)
  const db = await getMemoryDb()
  await db.query('DELETE FROM sessions WHERE id = $1 AND workspace_id = $2', [id, workspaceId])
  const meta = await db.query<{ active_session_id: string | null }>(
    'SELECT active_session_id FROM workspace_session_meta WHERE workspace_id = $1',
    [workspaceId]
  )
  if (meta.rows[0]?.active_session_id === id) {
    await db.query(
      `INSERT INTO workspace_session_meta (workspace_id, active_session_id)
       VALUES ($1, NULL) ON CONFLICT (workspace_id) DO UPDATE SET active_session_id = NULL`,
      [workspaceId]
    )
  }
}

/** 设置活跃对话 */
export async function setActiveConversation(
  workspacePath: string,
  workspaceId: string,
  conversationId: string | null
): Promise<void> {
  await ensureWorkspaceRow(workspaceId, workspacePath)
  const db = await getMemoryDb()
  await db.query(
    `INSERT INTO workspace_session_meta (workspace_id, active_session_id)
     VALUES ($1, $2)
     ON CONFLICT (workspace_id) DO UPDATE SET active_session_id = EXCLUDED.active_session_id`,
    [workspaceId, conversationId]
  )
}

/** 创建新对话 */
export async function createConversationOnDisk(
  workspacePath: string,
  workspaceId: string,
  options?: { activate?: boolean }
): Promise<Conversation> {
  const conv: Conversation = {
    id: randomUUID(),
    workspaceId,
    title: DEFAULT_CONVERSATION_TITLE,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  await saveConversation(workspacePath, conv, { activate: options?.activate !== false })
  if (options?.activate !== false) {
    await setActiveConversation(workspacePath, workspaceId, conv.id)
  }
  return conv
}
