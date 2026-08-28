/**
 * 审查面板 Git 动作：暂存 / 取消暂存 / 还原（文件级或全部）。
 * 路径必须落在工作区内；未跟踪还原只删工作区内文件。
 * @see shared/ARCH.md
 */
import path from 'path'
import type { GitStatusChange } from './git-status'
import { parseGitStatusPorcelain } from './git-status'

/** 审查 Git 动作 */
export type GitReviewAction = 'stage' | 'unstage' | 'revert'

/** 执行 git 的注入点（主进程用真实 runGit，单测可替） */
export type GitRunner = (
  cwd: string,
  args: string[],
  options?: { trim?: boolean; input?: string }
) => Promise<string>

/** 审查动作依赖（避免 shared 直接碰 fs / child_process） */
export interface GitReviewIo {
  runGit: GitRunner
  unlink: (absPath: string) => Promise<void>
  rmDir: (absPath: string) => Promise<void>
  stat: (absPath: string) => Promise<{ isFile: boolean; isDirectory: boolean } | null>
}

/**
 * 把用户传入的相对路径收成工作区内相对 posix 路径。
 * 越界、空路径、`.git` 一律拒绝。
 */
export function resolveReviewRelPath(cwd: string, filePath: string): string | null {
  const root = path.resolve(String(cwd || ''))
  const rel = String(filePath || '').replace(/^[/\\]+/, '')
  if (!root || !rel || rel.includes('\0')) return null
  const abs = path.resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  const posix = path.relative(root, abs).replaceAll('\\', '/')
  if (!posix || posix === '.' || posix === '.git' || posix.startsWith('.git/')) return null
  return posix
}

/** 判断 HEAD 是否已有该路径（新增 / 未跟踪为 false） */
async function existsInHead(runGit: GitRunner, cwd: string, rel: string): Promise<boolean> {
  try {
    await runGit(cwd, ['cat-file', '-e', `HEAD:${rel}`])
    return true
  } catch {
    return false
  }
}

/**
 * 执行审查动作。
 * `paths` 为空或省略时作用于当前全部匹配文件（stage=未暂存，unstage=已暂存，revert=全部）。
 */
export async function applyGitReviewAction(options: {
  cwd: string
  action: GitReviewAction
  paths?: string[]
  io: GitReviewIo
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const root = path.resolve(String(options.cwd || ''))
  if (!root) return { ok: false, error: '缺少工作区' }

  const requested = (options.paths ?? [])
    .map((p) => resolveReviewRelPath(root, p))
    .filter((p): p is string => Boolean(p))

  if ((options.paths?.length ?? 0) > 0 && requested.length === 0) {
    return { ok: false, error: '路径超出工作区' }
  }

  let files: GitStatusChange[] = []
  try {
    const porcelain = await options.io.runGit(root, ['status', '--porcelain', '-uall'], {
      trim: false
    })
    files = parseGitStatusPorcelain(porcelain)
  } catch {
    return { ok: false, error: '当前目录不是 git 仓库' }
  }

  let targets = requested
  if (!targets.length) {
    if (options.action === 'stage') {
      targets = files.filter((f) => f.unstaged || f.untracked).map((f) => f.path)
    } else if (options.action === 'unstage') {
      targets = files.filter((f) => f.staged).map((f) => f.path)
    } else {
      targets = files.map((f) => f.path)
    }
  }

  targets = targets
    .map((p) => resolveReviewRelPath(root, p))
    .filter((p): p is string => Boolean(p))

  if (!targets.length) return { ok: true }

  try {
    if (options.action === 'stage') {
      await options.io.runGit(root, ['add', '--', ...targets])
      return { ok: true }
    }
    if (options.action === 'unstage') {
      await options.io.runGit(root, ['restore', '--staged', '--', ...targets])
      return { ok: true }
    }

    for (const rel of targets) {
      const abs = path.join(root, rel)
      const row = files.find((f) => f.path === rel)
      const inHead = await existsInHead(options.io.runGit, root, rel)
      if (row?.untracked || !inHead) {
        try {
          await options.io.runGit(root, ['restore', '--staged', '--', rel])
        } catch {
          // 未暂存的新文件：没有索引条目
        }
        const st = await options.io.stat(abs)
        if (!st) continue
        if (st.isDirectory) await options.io.rmDir(abs)
        else if (st.isFile) await options.io.unlink(abs)
        continue
      }
      await options.io.runGit(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', rel])
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
