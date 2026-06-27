/**
 * Memory 系统类型定义（PostgreSQL / PGlite）。
 */
import type { AssistantMeta, MessageRole } from '../../shared/types'

export type MemoryScope = 'global' | 'project' | 'workspace' | 'session'

export type MemoryKind =
  | 'preference'
  | 'fact'
  | 'decision'
  | 'gotcha'
  | 'workflow'
  | 'summary'
  | 'relationship'

export type MemorySource = 'user' | 'assistant' | 'writer' | 'manual'

export type EventKind =
  | 'tool_start'
  | 'tool_done'
  | 'tool_error'
  | 'verify'
  | 'approval'
  | 'user_message'
  | 'assistant_message'
  | 'plan_ready'
  | 'context_compress'

export interface MemoryRow {
  id: string
  scope: MemoryScope
  project_id: string | null
  workspace_id: string | null
  session_id: string | null
  kind: MemoryKind
  content: string
  content_hash: string
  source: MemorySource
  confidence: number
  importance: number
  valid_from: string
  valid_until: string | null
  superseded_by: string | null
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  access_count: number
  embedding_json: number[] | null
}

export interface RetrievedMemory {
  id: string
  scope: MemoryScope
  kind: MemoryKind
  content: string
  score: number
  source: 'exact' | 'keyword' | 'semantic'
}

export interface TurnEventInput {
  kind: EventKind
  toolName?: string
  payload?: Record<string, unknown>
}

export interface WriterInput {
  settings: import('../../shared/types').AppSettings
  workspaceId: string
  sessionId: string | null
  projectId: string | null
  userText: string
  assistantText: string
  events: TurnEventInput[]
}

export interface WriterMemoryCandidate {
  scope: MemoryScope
  kind: MemoryKind
  content: string
  supersedesHint?: string
}

export interface RetrieveContext {
  workspaceId: string
  projectId: string | null
  sessionId: string | null
  userMessage: string
  recentMessages?: string[]
  limit?: number
}

export interface AssembledMemoryContext {
  block: string
  memoryIds: string[]
  charEstimate: number
}

export interface SessionMessageRow {
  id: string
  session_id: string
  role: MessageRole
  content: string
  tool_call_id: string | null
  tool_name: string | null
  meta: AssistantMeta | null
  seq: number
}
