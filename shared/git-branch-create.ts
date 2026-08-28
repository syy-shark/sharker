/**
 * 隔离 worktree：在 detached HEAD 上创建命名分支（对标 Codex Create branch here）。
 * @see shared/ARCH.md
 */
import type { GitReviewIo } from './git-review-actions'

/** 分支名：非空、非 flag、无空白与 `..` */
export function normalizeBranchName(name: string): string | null {
  const text = String(name || '').trim()
  if (!text || text.startsWith('-') || text.includes('..') || /\s/.test(text)) return null
  if (!/^[A-Za-z0-9._/\-]+$/.test(text)) return null
  return text
}

/** 在当前 HEAD 上 `git checkout -b` */
export async function createNamedBranch(options: {
  cwd: string
  name: string
  io: GitReviewIo
}): Promise<{ ok: true; branch: string } | { ok: false; error: string }> {
  const root = String(options.cwd || '')
  if (!root) return { ok: false, error: '缺少工作区' }
  const branch = normalizeBranchName(options.name)
  if (!branch) return { ok: false, error: '无效分支名' }
  try {
    await options.io.runGit(root, ['checkout', '-b', branch])
    return { ok: true, branch }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
