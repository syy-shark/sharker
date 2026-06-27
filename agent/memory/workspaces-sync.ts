/**
 * 与 AppSettings.workspaces 同步 PG workspaces 表。
 */
import type { AppSettings } from '../../shared/types'
import { getMemoryDb } from './db'
import { ensureProject } from './projects'

/** 将设置中的工作区列表 upsert 到 PG */
export async function syncWorkspacesFromSettings(settings: AppSettings): Promise<void> {
  const db = await getMemoryDb()
  const ids = settings.workspaces.map((w) => w.id)

  for (const w of settings.workspaces) {
    const projectId = w.path ? await ensureProject(w.path) : null
    await db.query(
      `INSERT INTO workspaces (id, project_id, path, label, is_home, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET
         project_id = EXCLUDED.project_id,
         path = EXCLUDED.path,
         label = EXCLUDED.label,
         is_home = EXCLUDED.is_home,
         updated_at = now()`,
      [w.id, projectId, w.path, w.label, Boolean(w.isHome)]
    )
  }

  if (ids.length > 0) {
    await db.query(
      `DELETE FROM workspaces WHERE id NOT IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`,
      ids
    )
  }
}

/** 获取 workspace 关联的 project_id */
export async function getWorkspaceProjectId(workspaceId: string): Promise<string | null> {
  const db = await getMemoryDb()
  const row = await db.query<{ project_id: string | null }>(
    'SELECT project_id FROM workspaces WHERE id = $1',
    [workspaceId]
  )
  return row.rows[0]?.project_id ?? null
}

/** 获取当前活跃 session id */
export async function getActiveSessionId(workspaceId: string): Promise<string | null> {
  const db = await getMemoryDb()
  const row = await db.query<{ active_session_id: string | null }>(
    'SELECT active_session_id FROM workspace_session_meta WHERE workspace_id = $1',
    [workspaceId]
  )
  return row.rows[0]?.active_session_id ?? null
}
