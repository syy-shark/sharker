/**
 * 隔离 worktree：在 detached HEAD 上创建命名分支（对标 Codex Create branch here）。
 * @see shared/ARCH.md
 */
import type { GitReviewIo } from './git-review-actions'

const BRANCH_SAFE = /^[A-Za-z0-9._/\-]+$/
const BRANCH_PREFIX_MAX = 64

/** 分支名：非空、非 flag、无空白与 `..` */
export function normalizeBranchName(name: string): string | null {
  const text = String(name || '').trim()
  if (!text || text.startsWith('-') || text.includes('..') || /\s/.test(text)) return null
  if (!BRANCH_SAFE.test(text)) return null
  return text
}

/** 设置里的分支前缀：去掉尾斜杠后校验；非法则空串 */
export function normalizeBranchPrefix(raw: unknown): string {
  const text = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '')
  if (!text || text.length > BRANCH_PREFIX_MAX) return ''
  if (text.startsWith('-') || text.includes('..') || /\s/.test(text)) return ''
  if (!BRANCH_SAFE.test(text)) return ''
  return text
}

/** 应用时补尾 `/`，空前缀保持空 */
export function formatBranchPrefix(prefix: unknown): string {
  const p = normalizeBranchPrefix(prefix)
  return p ? `${p}/` : ''
}

/** 名前没有此前缀时加上；已带则不重复 */
export function applyBranchPrefix(name: string, prefix?: string): string | null {
  const raw = String(name || '').trim()
  if (!raw) return null
  const p = formatBranchPrefix(prefix)
  if (!p) return normalizeBranchName(raw)
  if (raw.startsWith(p) || raw === p.slice(0, -1)) return normalizeBranchName(raw)
  return normalizeBranchName(`${p}${raw}`)
}

/** 在当前 HEAD 上 `git checkout -b` */
export async function createNamedBranch(options: {
  cwd: string
  name: string
  prefix?: string
  io: GitReviewIo
}): Promise<{ ok: true; branch: string } | { ok: false; error: string }> {
  const root = String(options.cwd || '')
  if (!root) return { ok: false, error: '缺少工作区' }
  const branch = applyBranchPrefix(options.name, options.prefix)
  if (!branch) return { ok: false, error: '无效分支名' }
  try {
    await options.io.runGit(root, ['checkout', '-b', branch])
    return { ok: true, branch }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
