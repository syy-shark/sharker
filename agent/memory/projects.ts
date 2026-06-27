/**
 * 代码项目识别与 upsert（git 根 / package.json 根）。
 */
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { getMemoryDb } from './db'

/** 向上解析项目根目录 */
export async function resolveProjectRoot(workspacePath: string): Promise<string> {
  if (!workspacePath) return workspacePath
  let dir = path.resolve(workspacePath)
  for (let depth = 0; depth < 12; depth++) {
    try {
      await fs.access(path.join(dir, '.git'))
      return dir
    } catch {
      /* continue */
    }
    try {
      await fs.access(path.join(dir, 'package.json'))
      return dir
    } catch {
      /* continue */
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(workspacePath)
}

async function readPackageName(root: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(root, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { name?: string }
    return typeof pkg.name === 'string' ? pkg.name : null
  } catch {
    return null
  }
}

/** 确保 project 行存在，返回 project id */
export async function ensureProject(workspacePath: string): Promise<string | null> {
  if (!workspacePath) return null
  const root = await resolveProjectRoot(workspacePath)
  const db = await getMemoryDb()
  const existing = await db.query<{ id: string }>(
    'SELECT id FROM projects WHERE root_path = $1',
    [root]
  )
  if (existing.rows[0]) return existing.rows[0].id

  const name = (await readPackageName(root)) ?? path.basename(root)
  const id = randomUUID()
  await db.query(`INSERT INTO projects (id, root_path, name) VALUES ($1, $2, $3)`, [id, root, name])
  return id
}

/** 读取项目摘要 */
export async function getProjectSummary(projectId: string): Promise<string | null> {
  const db = await getMemoryDb()
  const row = await db.query<{ summary: string | null; name: string | null }>(
    'SELECT summary, name FROM projects WHERE id = $1',
    [projectId]
  )
  const p = row.rows[0]
  if (!p) return null
  return p.summary ?? p.name
}
