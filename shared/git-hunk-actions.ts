/**
 * 审查面板 hunk 级暂存 / 取消暂存 / 还原：对 unified patch 调 git apply。
 * @see shared/ARCH.md
 */
import type { GitReviewAction, GitReviewIo } from './git-review-actions'
import { resolveReviewRelPath } from './git-review-actions'

/** hunk 动作参数 */
export interface GitHunkActionInput {
  cwd: string
  action: GitReviewAction
  /** 已是完整 unified patch */
  patch: string
  path: string
  io: GitReviewIo
}

/**
 * 对单个 hunk 执行审查动作。
 * 未暂存：stage = apply --cached；revert = apply --reverse。
 * 已暂存：unstage = apply --cached --reverse；revert = 索引与工作区各 reverse 一次。
 */
export async function applyGitHunkAction(
  options: GitHunkActionInput & { scope?: 'unstaged' | 'staged' }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const root = String(options.cwd || '')
  const rel = resolveReviewRelPath(root, options.path)
  if (!rel) return { ok: false, error: '路径超出工作区' }
  const patch = String(options.patch || '')
  if (!patch.includes('@@')) return { ok: false, error: '缺少 hunk patch' }

  const apply = (args: string[]) =>
    options.io.runGit(root, ['apply', '--whitespace=nowarn', ...args, '-'], { input: patch })

  const scope = options.scope ?? 'unstaged'
  try {
    if (options.action === 'stage') {
      await apply(['--cached'])
      return { ok: true }
    }
    if (options.action === 'unstage') {
      await apply(['--cached', '--reverse'])
      return { ok: true }
    }
    if (scope === 'staged') {
      try {
        await apply(['--cached', '--reverse'])
      } catch {
        // 索引可能已与该 hunk 不一致
      }
      await apply(['--reverse'])
      return { ok: true }
    }
    await apply(['--reverse'])
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
