/**
 * 嵌入式 PostgreSQL（PGlite）单例连接。
 */
import fs from 'fs/promises'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { runMigrations } from './schema'

let db: PGlite | null = null
let initPromise: Promise<PGlite> | null = null

/** PGlite 数据目录 */
export function memoryDbDir(homeDir: string): string {
  return path.join(homeDir, '.sharker', 'memory-db')
}

/** 初始化或返回已打开的 PGlite 实例 */
export async function getMemoryDb(homeDir?: string): Promise<PGlite> {
  if (db) return db
  if (initPromise) return initPromise

  initPromise = (async () => {
    const dir = memoryDbDir(homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '.')
    await fs.mkdir(dir, { recursive: true })
    const instance = new PGlite(dir)
    await runMigrations(instance)
    db = instance
    return instance
  })()

  return initPromise
}

/** 关闭数据库（应用退出时） */
export async function closeMemoryDb(): Promise<void> {
  if (db) {
    await db.close()
    db = null
    initPromise = null
  }
}

/** 测试/重置用 */
export async function resetMemoryDbForTests(): Promise<void> {
  await closeMemoryDb()
}
