/**
 * 为会话准备隔离 Git worktree（对标 Codex 桌面端 Worktree 线程）。
 * 创建时按 `.worktreeinclude` 拷贝被忽略的本地文件。
 * @see tools/ARCH.md
 */
import { copyFile, lstat, mkdir, readFile, readdir, stat, utimes, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { runGit } from './shared/git-runner'
import { IGNORE_DIRS } from './shared/ignore-dirs'
import {
  matchAnyWorktreeInclude,
  sanitizeWorktreeBaseRef,
  worktreeIncludePatterns
} from '../shared/worktree-include'
import {
  DEFAULT_MANAGED_WORKTREE_LIMIT,
  isManagedWorktreeDirName,
  sanitizePermanentWorktreeName,
  selectManagedWorktreesToPrune
} from '../shared/worktree-prune'
import { clampWorktreeRoot } from '../shared/worktree-root'

export type PrepareWorktreeResult =
  | { ok: true; path: string; branch: string }
  | { ok: false; error: string }

function shortId(conversationId: string): string {
  return conversationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'thread'
}

async function collectRelFiles(dir: string, rel = '', depth = 0): Promise<string[]> {
  if (depth > 12) return []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectRelFiles(full, childRel, depth + 1)))
      continue
    }
    if (entry.isFile()) out.push(childRel)
  }
  return out
}

async function isIgnored(cwd: string, rel: string): Promise<boolean> {
  try {
    await runGit(cwd, ['check-ignore', '-q', '--', rel])
    return true
  } catch {
    return false
  }
}

/** 把 `.worktreeinclude` 命中且已被忽略的文件拷进新 worktree（不覆盖、不跟符号链接） */
export async function copyWorktreeIncludes(workspacePath: string, dest: string): Promise<string[]> {
  const root = path.resolve(workspacePath)
  const target = path.resolve(dest)
  let spec = ''
  try {
    spec = await readFile(path.join(root, '.worktreeinclude'), 'utf8')
  } catch {
    spec = ''
  }
  const patterns = worktreeIncludePatterns(spec)
  const copied: string[] = []
  for (const rel of await collectRelFiles(root)) {
    if (!matchAnyWorktreeInclude(rel, patterns)) continue
    if (!(await isIgnored(root, rel))) continue
    const from = path.join(root, rel)
    const to = path.join(target, rel)
    try {
      const st = await lstat(from)
      if (!st.isFile() || st.isSymbolicLink()) continue
      await mkdir(path.dirname(to), { recursive: true })
      try {
        await lstat(to)
        continue
      } catch {
        await copyFile(from, to)
        copied.push(rel)
      }
    } catch {
      /* skip unreadable */
    }
  }
  return copied
}

/** 未跟踪相对路径：拒绝 `..` */
function safeRelPath(rel: string): string | null {
  const n = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!n || n.split('/').some((part) => part === '..')) return null
  return n
}

/** 托管 worktree 与快照根目录（可注入 home / 绝对 override；空则 `~/.sharker/worktrees`） */
export function managedWorktreeRoot(home = os.homedir(), override?: string): string {
  const custom = clampWorktreeRoot(override)
  if (custom) return path.isAbsolute(custom) ? path.resolve(custom) : custom
  return path.join(home, '.sharker', 'worktrees')
}

/** 永久 worktree 根（不参与自动清理） */
export function permanentWorktreeRoot(home = os.homedir(), override?: string): string {
  return path.join(managedWorktreeRoot(home, override), 'permanent')
}

function snapshotFileFor(dest: string, home: string): string {
  return path.join(home, '.sharker', 'worktree-snapshots', `${path.basename(dest)}.json`)
}

/** 目录是否还在、删除前快照是否可恢复 */
export async function inspectWorktreePath(
  dest: string,
  home = os.homedir()
): Promise<{ exists: boolean; hasSnapshot: boolean }> {
  let exists = false
  try {
    exists = (await stat(dest)).isDirectory()
  } catch {
    exists = false
  }
  let hasSnapshot = false
  try {
    await readFile(snapshotFileFor(dest, home), 'utf8')
    hasSnapshot = true
  } catch {
    hasSnapshot = false
  }
  return { exists, hasSnapshot }
}

/** 删除前保存 HEAD + 脏文件，便于会话再打开时恢复 */
export async function snapshotManagedWorktree(dest: string, home = os.homedir()): Promise<void> {
  let head = ''
  try {
    head = (await runGit(dest, ['rev-parse', 'HEAD'])).trim()
  } catch {
    return
  }
  const dirty: Array<{ path: string; content: string }> = []
  let porcelain = ''
  try {
    porcelain = await runGit(dest, ['status', '--porcelain'], { trim: false })
  } catch {
    porcelain = ''
  }
  for (const raw of porcelain.split('\n')) {
    if (!raw.trim() || dirty.length >= 40) break
    const rel = safeRelPath(raw.slice(3).trim().replace(/ -> /g, '').split(' ').pop() || '')
    if (!rel) continue
    try {
      const abs = path.join(dest, rel)
      const st = await stat(abs)
      if (!st.isFile() || st.size > 256 * 1024) continue
      const content = await readFile(abs, 'utf8')
      if (content.includes('\0')) continue
      dirty.push({ path: rel, content })
    } catch {
      /* missing / unreadable */
    }
  }
  const file = snapshotFileFor(dest, home)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ head, dirty, savedAt: Date.now() }))
}

async function restoreWorktreeSnapshot(dest: string, home: string): Promise<boolean> {
  try {
    const raw = await readFile(snapshotFileFor(dest, home), 'utf8')
    const snap = JSON.parse(raw) as { head?: string; dirty?: Array<{ path: string; content: string }> }
    for (const file of snap.dirty ?? []) {
      const rel = safeRelPath(String(file.path || ''))
      if (!rel) continue
      const abs = path.join(dest, rel)
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, file.content ?? '')
    }
    return true
  } catch {
    return false
  }
}

function parseWorktreePaths(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
    .filter(Boolean)
}

/** 保留最近 N 个托管 worktree；删除前先快照 */
export async function pruneManagedWorktrees(options: {
  workspacePath: string
  repoName: string
  home?: string
  keep?: number
  /** Settings → Worktrees → Worktree root；空则默认 */
  root?: string
  protectPaths?: string[]
}): Promise<string[]> {
  const cwd = path.resolve(options.workspacePath)
  const home = options.home ?? os.homedir()
  const keep = options.keep ?? DEFAULT_MANAGED_WORKTREE_LIMIT
  if (keep === 0) return []
  const root = path.resolve(managedWorktreeRoot(home, options.root))
  let porcelain = ''
  try {
    porcelain = await runGit(cwd, ['worktree', 'list', '--porcelain'], { trim: false })
  } catch {
    return []
  }
  const entries: Array<{ path: string; mtimeMs: number }> = []
  for (const wt of parseWorktreePaths(porcelain)) {
    if (path.resolve(path.dirname(wt)) !== root) continue
    if (!isManagedWorktreeDirName(options.repoName, path.basename(wt))) continue
    try {
      const st = await stat(wt)
      entries.push({ path: wt, mtimeMs: st.mtimeMs })
    } catch {
      /* vanished */
    }
  }
  const removed: string[] = []
  for (const dest of selectManagedWorktreesToPrune(entries, {
    keep,
    protectPaths: options.protectPaths
  })) {
    try {
      await snapshotManagedWorktree(dest, home)
      await runGit(cwd, ['worktree', 'remove', '--force', dest])
      removed.push(dest)
    } catch (e) {
      console.warn('[worktree] prune failed', dest, e)
    }
  }
  return removed
}

async function currentBranchName(dest: string): Promise<string> {
  try {
    return (await runGit(dest, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || 'detached'
  } catch {
    return 'detached'
  }
}

/** 在托管根（默认 ~/.sharker/worktrees）下为会话创建或复用 detached worktree */
export async function prepareThreadWorktree(options: {
  workspacePath: string
  conversationId: string
  baseRef?: string
  /** 测试可注入，默认 os.homedir() */
  home?: string
  keep?: number
  /** Settings → Worktrees → Worktree root；空则默认 */
  root?: string
}): Promise<PrepareWorktreeResult> {
  const cwd = path.resolve(options.workspacePath)
  try {
    const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (inside.trim() !== 'true') {
      return { ok: false, error: '当前工作区不是 git 仓库，无法使用隔离 Worktree' }
    }
  } catch {
    return { ok: false, error: '当前工作区不是 git 仓库，无法使用隔离 Worktree' }
  }

  let repoName = path.basename(cwd)
  try {
    const toplevel = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (toplevel) repoName = path.basename(toplevel)
  } catch {
    /* keep basename */
  }

  const home = options.home ?? os.homedir()
  const dest = path.join(
    managedWorktreeRoot(home, options.root),
    `${repoName}-${shortId(options.conversationId)}`
  )
  await mkdir(path.dirname(dest), { recursive: true })

  const finish = async (branch: string): Promise<PrepareWorktreeResult> => {
    try {
      await utimes(dest, new Date(), new Date())
    } catch {
      /* ignore */
    }
    try {
      await pruneManagedWorktrees({
        workspacePath: cwd,
        repoName,
        home,
        keep: options.keep,
        root: options.root,
        protectPaths: [dest]
      })
    } catch (e) {
      console.warn('[worktree] prune skipped', e)
    }
    return { ok: true, path: dest, branch }
  }

  try {
    const existing = await runGit(cwd, ['worktree', 'list', '--porcelain'])
    if (existing.split('\n').some((line) => line === `worktree ${dest}`)) {
      return finish(await currentBranchName(dest))
    }
  } catch {
    /* list failed: try add */
  }

  const snapFile = snapshotFileFor(dest, home)
  let start = sanitizeWorktreeBaseRef(options.baseRef)
  try {
    const snap = JSON.parse(await readFile(snapFile, 'utf8')) as { head?: string }
    if (typeof snap.head === 'string' && /^[0-9a-f]{7,40}$/i.test(snap.head)) {
      start = snap.head
    }
  } catch {
    /* no snapshot */
  }

  try {
    await runGit(cwd, ['worktree', 'add', '--detach', dest, start])
    await restoreWorktreeSnapshot(dest, home)
    try {
      await copyWorktreeIncludes(cwd, dest)
    } catch (e) {
      console.warn('[worktree] copy include files failed', e)
    }
    return finish(await currentBranchName(dest))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || '创建 worktree 失败' }
  }
}

async function resolveRepoName(cwd: string): Promise<string> {
  try {
    const toplevel = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (toplevel) return path.basename(toplevel)
  } catch {
    /* keep basename */
  }
  return path.basename(cwd)
}

/** 项目菜单：创建永久 worktree 并作为独立 checkout */
export async function createPermanentWorktree(options: {
  workspacePath: string
  name: string
  baseRef?: string
  home?: string
  root?: string
}): Promise<PrepareWorktreeResult> {
  const cwd = path.resolve(options.workspacePath)
  const name = sanitizePermanentWorktreeName(options.name)
  if (!name) return { ok: false, error: '名称只能包含字母、数字、点、下划线和连字符' }
  try {
    const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (inside.trim() !== 'true') {
      return { ok: false, error: '当前工作区不是 git 仓库，无法创建永久 Worktree' }
    }
  } catch {
    return { ok: false, error: '当前工作区不是 git 仓库，无法创建永久 Worktree' }
  }
  const home = options.home ?? os.homedir()
  const repoName = await resolveRepoName(cwd)
  const dest = path.join(permanentWorktreeRoot(home, options.root), `${repoName}-${name}`)
  await mkdir(path.dirname(dest), { recursive: true })
  const start = sanitizeWorktreeBaseRef(options.baseRef)
  const branch = `perm/${name}`
  try {
    await runGit(cwd, ['worktree', 'add', '-b', branch, dest, start])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || '创建永久 worktree 失败' }
  }
  try {
    await copyWorktreeIncludes(cwd, dest)
  } catch (e) {
    console.warn('[worktree] copy include files failed', e)
  }
  return { ok: true, path: dest, branch }
}

/** 归档对话时删掉该会话的托管 worktree（先快照） */
export async function removeManagedWorktree(options: {
  workspacePath: string
  conversationId: string
  home?: string
  root?: string
}): Promise<{ ok: true; removed: boolean } | { ok: false; error: string }> {
  const cwd = path.resolve(options.workspacePath)
  const home = options.home ?? os.homedir()
  const repoName = await resolveRepoName(cwd)
  const dest = path.join(
    managedWorktreeRoot(home, options.root),
    `${repoName}-${shortId(options.conversationId)}`
  )
  try {
    const listed = await runGit(cwd, ['worktree', 'list', '--porcelain'], { trim: false })
    if (!listed.split('\n').some((line) => line === `worktree ${dest}`)) {
      return { ok: true, removed: false }
    }
    await snapshotManagedWorktree(dest, home)
    await runGit(cwd, ['worktree', 'remove', '--force', dest])
    return { ok: true, removed: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
