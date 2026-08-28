/**
 * 审查面板：项目还不是 Git 仓库时就地 `git init`（对标 Codex Review prompt to create one）。
 * @see shared/ARCH.md
 */
import { isUsableFolderPath, normalizeFolderPath } from './workspace-folders'
import type { GitRunner } from './git-review-actions'

/** 在工作区根创建仓库；已是仓库则拒绝。优先 `main`。 */
export async function initGitRepository(options: {
  cwd: string
  runGit: GitRunner
}): Promise<{ ok: true; branch: string } | { ok: false; error: string }> {
  const root = normalizeFolderPath(options.cwd)
  if (!isUsableFolderPath(root)) return { ok: false, error: '无效工作区' }
  try {
    const inside = (await options.runGit(root, ['rev-parse', '--is-inside-work-tree'])).trim()
    if (inside === 'true') return { ok: false, error: '已经是 git 仓库' }
  } catch {
    // 不是仓库
  }
  try {
    await options.runGit(root, ['init', '-b', 'main'])
    return { ok: true, branch: 'main' }
  } catch (first) {
    try {
      await options.runGit(root, ['init'])
      let branch = 'master'
      try {
        branch = (await options.runGit(root, ['symbolic-ref', '--short', 'HEAD'])).trim() || branch
      } catch {
        // detached / 空仓
      }
      return { ok: true, branch }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(first) }
    }
  }
}
