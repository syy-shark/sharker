/**
 * Embedded PostgreSQL (PGlite) singleton connection.
 */
import fs from 'fs/promises'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { runMigrations } from './schema'

let db: PGlite | null = null
let initPromise: Promise<PGlite> | null = null

/** PGlite data directory. */
export function memoryDbDir(homeDir: string): string {
  return path.join(homeDir, '.sharker', 'memory-db')
}

async function removeStalePostmasterPid(dir: string): Promise<void> {
  if (process.platform !== 'win32') return

  const pidFile = path.join(dir, 'postmaster.pid')
  let raw = ''
  try {
    raw = await fs.readFile(pidFile, 'utf8')
  } catch {
    return
  }

  const firstLine = raw.split(/\r?\n/, 1)[0]?.trim()
  const pid = firstLine ? Number(firstLine) : NaN
  if (!Number.isInteger(pid) || pid <= 0) {
    await fs.rm(pidFile, { force: true })
    return
  }

  try {
    process.kill(pid, 0)
  } catch {
    await fs.rm(pidFile, { force: true })
  }
}

function backupName(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

async function quarantineMemoryDb(dir: string): Promise<string | null> {
  try {
    await fs.access(dir)
  } catch {
    return null
  }

  const parent = path.dirname(dir)
  const base = path.basename(dir)
  let target = path.join(parent, `${base}.failed-${backupName()}`)
  for (let i = 2; ; i++) {
    try {
      await fs.rename(dir, target)
      return target
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw e
      target = path.join(parent, `${base}.failed-${backupName()}-${i}`)
    }
  }
}

async function openMemoryDb(dir: string): Promise<PGlite> {
  await fs.mkdir(dir, { recursive: true })
  await removeStalePostmasterPid(dir)
  const instance = new PGlite(dir)
  await runMigrations(instance)
  db = instance
  return instance
}

async function initMemoryDb(homeDir?: string): Promise<PGlite> {
  const dir = memoryDbDir(homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '.')
  try {
    return await openMemoryDb(dir)
  } catch (firstError) {
    initPromise = null
    const backup = await quarantineMemoryDb(dir).catch(() => null)
    if (!backup) throw firstError
    console.warn(`[memory] PGlite startup failed; moved database to ${backup} and retrying`, firstError)
    return openMemoryDb(dir)
  }
}

/** Initialize or return the open PGlite instance. */
export async function getMemoryDb(homeDir?: string): Promise<PGlite> {
  if (db) return db
  if (!initPromise) {
    initPromise = initMemoryDb(homeDir).catch((e) => {
      initPromise = null
      throw e
    })
  }
  return initPromise
}

/** Close the database when the app exits. */
export async function closeMemoryDb(): Promise<void> {
  if (db) {
    await db.close()
    db = null
    initPromise = null
  }
}

/** Test/reset helper. */
export async function resetMemoryDbForTests(): Promise<void> {
  await closeMemoryDb()
}
