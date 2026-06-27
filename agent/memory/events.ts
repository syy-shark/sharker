/**
 * Agent 事件落库。
 */
import { randomUUID } from 'crypto'
import { getMemoryDb } from './db'
import type { EventKind, TurnEventInput } from './types'

export async function recordEvent(
  sessionId: string,
  turnId: string | null,
  input: TurnEventInput
): Promise<string> {
  const id = randomUUID()
  const db = await getMemoryDb()
  await db.query(
    `INSERT INTO events (id, session_id, turn_id, kind, tool_name, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      sessionId,
      turnId,
      input.kind,
      input.toolName ?? null,
      JSON.stringify(input.payload ?? {})
    ]
  )
  return id
}

export async function recordEvents(
  sessionId: string,
  turnId: string | null,
  events: TurnEventInput[]
): Promise<void> {
  for (const e of events) {
    await recordEvent(sessionId, turnId, e)
  }
}

export async function listRecentEvents(
  sessionId: string,
  limit = 5
): Promise<Array<{ kind: EventKind; tool_name: string | null; payload: Record<string, unknown> }>> {
  const db = await getMemoryDb()
  const res = await db.query<{
    kind: EventKind
    tool_name: string | null
    payload: Record<string, unknown>
  }>(
    `SELECT kind, tool_name, payload FROM events
     WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [sessionId, limit]
  )
  return res.rows
}
