/**
 * 为会话准备隔离 Git worktree（对标 Codex 桌面端 Worktree 线程）。
 * 创建时按 `.worktreeinclude` 拷贝被忽略的本地文件。
 * @see tools/ARCH.md
 */
import { copyFile, lstat, mkdir, readFile, readdir } from 'fs/promises'
import os from 'os'
import path from 'path'
import { runGit } from './shared/git-runner'
import { IGNORE_DIRS } from './shared/ignore-dirs'
import {
  matchAnyWorktreeInclude,
  sanitizeWorktreeBaseRef,
  worktreeIncludePatterns
} from '../shared/worktree-include'

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

/** 在 ~/.sharker/worktrees 下为会话创建或复用 detached worktree */
export async function prepareThreadWorktree(options: {
  workspacePath: string
  conversationId: string
  baseRef?: string
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

  const dest = path.join(os.homedir(), '.sharker', 'worktrees', `${repoName}-${shortId(options.conversationId)}`)
  await mkdir(path.dirname(dest), { recursive: true })

  try {
    const existing = await runGit(cwd, ['worktree', 'list', '--porcelain'])
    if (existing.split('\n').some((line) => line === `worktree ${dest}`)) {
      let branch = 'detached'
      try {
        branch = (await runGit(dest, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || 'detached'
      } catch {
        /* detached */
      }
      return { ok: true, path: dest, branch }
    }
  } catch {
    /* list failed: try add */
  }

  const baseRef = sanitizeWorktreeBaseRef(options.baseRef)
  try {
    await runGit(cwd, ['worktree', 'add', '--detach', dest, baseRef])
    let branch = 'detached'
    try {
      branch = (await runGit(dest, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || 'detached'
    } catch {
      /* detached */
    }
    try {
      await copyWorktreeIncludes(cwd, dest)
    } catch (e) {
      console.warn('[worktree] copy include files failed', e)
    }
    return { ok: true, path: dest, branch }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || '创建 worktree 失败' }
  }
}
