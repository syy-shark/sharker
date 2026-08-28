/**
 * 审查面板提交 / 推送：只提交已暂存内容，message 不能当 flag；推送可按设置加 `--force-with-lease`。
 * @see shared/ARCH.md
 */
import type { GitReviewIo } from './git-review-actions'

/** 规范化提交说明：去掉首尾空白，拒绝空或 `-` 开头 */
export function normalizeCommitMessage(message: string): string | null {
  const text = String(message || '').trim()
  if (!text || text.startsWith('-')) return null
  return text
}

/** 提交当前已暂存变更 */
export async function commitStagedChanges(options: {
  cwd: string
  message: string
  io: GitReviewIo
}): Promise<{ ok: true; sha: string } | { ok: false; error: string }> {
  const root = String(options.cwd || '')
  if (!root) return { ok: false, error: '缺少工作区' }
  const message = normalizeCommitMessage(options.message)
  if (!message) return { ok: false, error: '请填写提交说明' }
  try {
    const staged = await options.io.runGit(root, ['diff', '--cached', '--name-only'])
    if (!staged.trim()) return { ok: false, error: '没有已暂存变更' }
    await options.io.runGit(root, ['commit', '-m', message])
    const sha = (await options.io.runGit(root, ['rev-parse', '--short', 'HEAD'])).trim()
    return { ok: true, sha }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 推送参数：默认 `push`；打开设置后用 `--force-with-lease`，从不 `--force` */
export function gitPushArgs(forceWithLease?: boolean): string[] {
  return forceWithLease === true ? ['push', '--force-with-lease'] : ['push']
}

/** 推送当前分支到已配置的上游 */
export async function pushCurrentBranch(options: {
  cwd: string
  io: GitReviewIo
  forceWithLease?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const root = String(options.cwd || '')
  if (!root) return { ok: false, error: '缺少工作区' }
  try {
    await options.io.runGit(root, gitPushArgs(options.forceWithLease))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
