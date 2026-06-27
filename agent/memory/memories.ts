/**
 * 长期记忆 CRUD。
 */
import { createHash, randomUUID } from 'crypto'
import { getMemoryDb } from './db'
import type { MemoryKind, MemoryRow, MemoryScope, MemorySource } from './types'

export function hashMemoryContent(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex')
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as number[]
    } catch {
      return null
    }
  }
  return null
}

export interface InsertMemoryInput {
  scope: MemoryScope
  projectId?: string | null
  workspaceId?: string | null
  sessionId?: string | null
  kind: MemoryKind
  content: string
  source?: MemorySource
  confidence?: number
  importance?: number
  embedding?: number[] | null
}

/** 插入新记忆（已存在相同 hash 则跳过） */
export async function insertMemory(input: InsertMemoryInput): Promise<string | null> {
  const content = input.content.trim()
  if (!content) return null
  const hash = hashMemoryContent(content)
  const db = await getMemoryDb()
  const dup = await db.query<{ id: string }>(
    `SELECT id FROM memories WHERE content_hash = $1 AND scope = $2
       AND COALESCE(project_id,'') = COALESCE($3,'')
       AND COALESCE(workspace_id,'') = COALESCE($4,'')
       AND superseded_by IS NULL LIMIT 1`,
    [hash, input.scope, input.projectId ?? null, input.workspaceId ?? null]
  )
  if (dup.rows[0]) return dup.rows[0].id

  const id = randomUUID()
  await db.query(
    `INSERT INTO memories (
      id, scope, project_id, workspace_id, session_id, kind, content, content_hash,
      source, confidence, importance, embedding_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      input.scope,
      input.projectId ?? null,
      input.workspaceId ?? null,
      input.sessionId ?? null,
      input.kind,
      content,
      hash,
      input.source ?? 'writer',
      input.confidence ?? 0.8,
      input.importance ?? 0.5,
      input.embedding ? JSON.stringify(input.embedding) : null
    ]
  )
  return id
}

export async function touchMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getMemoryDb()
  for (const id of ids) {
    await db.query(
      `UPDATE memories SET last_accessed_at = now(), access_count = access_count + 1 WHERE id = $1`,
      [id]
    )
  }
}

/** 精确检索 */
export async function listMemoriesExact(opts: {
  projectId?: string | null
  workspaceId?: string | null
  sessionId?: string | null
  limit?: number
}): Promise<MemoryRow[]> {
  const db = await getMemoryDb()
  const limit = opts.limit ?? 20
  const res = await db.query<MemoryRow>(
    `SELECT * FROM memories
     WHERE superseded_by IS NULL AND (valid_until IS NULL OR valid_until > now())
       AND (
         scope = 'global'
         OR (scope = 'project' AND project_id = $1)
         OR (scope = 'workspace' AND workspace_id = $2)
         OR (scope = 'session' AND session_id = $3)
       )
     ORDER BY importance DESC, updated_at DESC
     LIMIT $4`,
    [opts.projectId ?? null, opts.workspaceId ?? null, opts.sessionId ?? null, limit]
  )
  return res.rows.map((r) => ({ ...r, embedding_json: parseEmbedding(r.embedding_json) }))
}

/** 关键词搜索 */
export async function searchMemoriesKeyword(
  query: string,
  opts: { projectId?: string | null; workspaceId?: string | null; limit?: number }
): Promise<MemoryRow[]> {
  const q = query.trim()
  if (!q) return []
  const db = await getMemoryDb()
  const limit = opts.limit ?? 10
  const pattern = `%${q}%`
  const res = await db.query<MemoryRow>(
    `SELECT * FROM memories
     WHERE superseded_by IS NULL AND content ILIKE $1
       AND (
         scope = 'global'
         OR (scope = 'project' AND ($2::text IS NULL OR project_id = $2))
         OR (scope = 'workspace' AND ($3::text IS NULL OR workspace_id = $3))
         OR scope = 'global'
       )
     ORDER BY importance DESC, updated_at DESC
     LIMIT $4`,
    [pattern, opts.projectId ?? null, opts.workspaceId ?? null, limit]
  )
  return res.rows.map((r) => ({ ...r, embedding_json: parseEmbedding(r.embedding_json) }))
}

export async function loadMemoryEmbeddingCandidates(opts: {
  projectId?: string | null
  workspaceId?: string | null
  limit?: number
}): Promise<MemoryRow[]> {
  const db = await getMemoryDb()
  const limit = opts.limit ?? 80
  const res = await db.query<MemoryRow>(
    `SELECT * FROM memories
     WHERE superseded_by IS NULL AND embedding_json IS NOT NULL
       AND (
         scope = 'global'
         OR (scope = 'project' AND project_id = $1)
         OR (scope = 'workspace' AND workspace_id = $2)
       )
     LIMIT $3`,
    [opts.projectId ?? null, opts.workspaceId ?? null, limit]
  )
  return res.rows.map((r) => ({ ...r, embedding_json: parseEmbedding(r.embedding_json) }))
}
