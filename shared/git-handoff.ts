/**
 * 线程交接：把未提交变更（及可快进的提交）在本地工作区与隔离 worktree 之间搬过去。
 * 对标 Codex Hand off。
 * @see shared/ARCH.md
 */
import path from 'path'
import { isDeletedGitChange } from './git-change-diff'
import { resolveReviewRelPath, type GitReviewIo } from './git-review-actions'
import { parseGitStatusPorcelain } from './git-status'

/** 交接方向 */
export type HandoffDirection = 'to_local' | 'to_worktree'

/** 交接 IO：审查 IO + 读写文件 */
export interface GitHandoffIo extends GitReviewIo {
  readFile: (absPath: string) => Promise<Buffer>
  writeFile: (absPath: string, data: Buffer) => Promise<void>
  mkdirp: (absPath: string) => Promise<void>
}

async function isClean(io: GitHandoffIo, cwd: string): Promise<boolean> {
  const porcelain = await io.runGit(cwd, ['status', '--porcelain', '-uall'], { trim: false })
  return !porcelain.trim()
}

async function headSha(io: GitHandoffIo, cwd: string): Promise<string> {
  return (await io.runGit(cwd, ['rev-parse', 'HEAD'])).trim()
}

async function sameRepo(io: GitHandoffIo, a: string, b: string): Promise<boolean> {
  try {
    const leftRaw = (await io.runGit(a, ['rev-parse', '--git-common-dir'])).trim()
    const rightRaw = (await io.runGit(b, ['rev-parse', '--git-common-dir'])).trim()
    const left = path.resolve(a, leftRaw)
    const right = path.resolve(b, rightRaw)
    return Boolean(left && left === right)
  } catch {
    return false
  }
}

/** 把 source 工作区脏文件拷到 dest（路径锁在两侧仓库内） */
export async function copyDirtyTree(
  source: string,
  dest: string,
  io: GitHandoffIo
): Promise<string[]> {
  const porcelain = await io.runGit(source, ['status', '--porcelain', '-uall'], { trim: false })
  const applied: string[] = []
  for (const file of parseGitStatusPorcelain(porcelain)) {
    const rel = resolveReviewRelPath(source, file.path)
    const destRel = resolveReviewRelPath(dest, file.path)
    if (!rel || !destRel) continue
    const srcAbs = path.join(source, rel)
    const destAbs = path.join(dest, destRel)
    if (isDeletedGitChange(file.status)) {
      await io.unlink(destAbs).catch(() => undefined)
      applied.push(rel)
      continue
    }
    const data = await io.readFile(srcAbs)
    await io.mkdirp(path.dirname(destAbs))
    await io.writeFile(destAbs, data)
    applied.push(rel)
  }
  return applied
}

/**
 * 交接：目标必须干净。先快进/合并 source HEAD，再拷未提交文件。
 */
export async function handoffCheckout(options: {
  direction: HandoffDirection
  localCwd: string
  worktreePath: string
  io: GitHandoffIo
}): Promise<{ ok: true; applied: string[] } | { ok: false; error: string }> {
  const local = path.resolve(String(options.localCwd || ''))
  const worktree = path.resolve(String(options.worktreePath || ''))
  if (!local || !worktree) return { ok: false, error: '缺少工作区' }
  if (local === worktree) return { ok: false, error: '本地与隔离路径相同' }
  const source = options.direction === 'to_local' ? worktree : local
  const dest = options.direction === 'to_local' ? local : worktree
  if (!(await sameRepo(options.io, local, worktree))) {
    return { ok: false, error: '隔离 worktree 不属于当前仓库' }
  }
  try {
    if (!(await isClean(options.io, dest))) {
      return { ok: false, error: '目标工作区有未提交变更，请先提交或还原后再交接' }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const fromHead = await headSha(options.io, source)
    const destHead = await headSha(options.io, dest)
    if (fromHead && destHead && fromHead !== destHead) {
      try {
        await options.io.runGit(dest, ['merge-base', '--is-ancestor', destHead, fromHead])
        await options.io.runGit(dest, ['merge', '--ff-only', fromHead])
      } catch {
        try {
          await options.io.runGit(dest, ['merge', '--no-edit', '-m', 'handoff', fromHead])
        } catch (e) {
          return {
            ok: false,
            error: `提交无法自动合并：${e instanceof Error ? e.message : String(e)}`
          }
        }
      }
    }
    const applied = await copyDirtyTree(source, dest, options.io)
    return { ok: true, applied }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
