/**
 * Settings → Worktrees 的托管根目录（对标 Codex Worktree root）。
 * @see shared/ARCH.md
 */

const WORKTREE_ROOT_MAX = 512

/** 规范化用户填写的 worktree 根：必须是绝对路径；空或非法则空串（用默认） */
export function clampWorktreeRoot(raw: unknown): string {
  const text = String(raw ?? '')
    .trim()
    .replace(/[\\/]+$/, '')
  if (!text || text.length > WORKTREE_ROOT_MAX) return ''
  if (text.startsWith('-') || text.includes('\0') || text.includes('..')) return ''
  if (text === '/' || text === '\\') return ''
  if (!(text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text) || text.startsWith('\\\\'))) return ''
  return text
}
