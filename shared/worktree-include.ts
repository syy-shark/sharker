/**
 * Codex 式 `.worktreeinclude`：隔离 worktree 创建时拷贝被 gitignore 的本地文件。
 * @see shared/ARCH.md
 */

export const WORKTREE_INCLUDE_ALWAYS = ['AGENTS.override.md']

/** 解析 `.worktreeinclude`：去注释与空行 */
export function parseWorktreeInclude(text: string): string[] {
  const out: string[] = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    out.push(line.replaceAll('\\', '/').replace(/^\.\//, ''))
  }
  return out
}

/** 始终带上 AGENTS.override.md，再合并文件里的模式 */
export function worktreeIncludePatterns(fileText: string | null | undefined): string[] {
  return [...new Set([...WORKTREE_INCLUDE_ALWAYS, ...parseWorktreeInclude(fileText || '')])]
}

function globToRegExp(pattern: string): RegExp {
  const body = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${body}$`)
}

/** 相对路径是否命中一条 include 模式（支持 * / ** / 纯文件名） */
export function matchWorktreeIncludePath(relPath: string, pattern: string): boolean {
  const posix = relPath.replaceAll('\\', '/').replace(/^\.\//, '')
  const pat = pattern.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!posix || !pat) return false
  if (pat.endsWith('/')) {
    const prefix = pat.slice(0, -1)
    return posix === prefix || posix.startsWith(`${prefix}/`)
  }
  const re = globToRegExp(pat)
  if (re.test(posix)) return true
  const base = posix.split('/').pop() || ''
  return re.test(base)
}

export function matchAnyWorktreeInclude(relPath: string, patterns: string[]): boolean {
  return patterns.some((p) => matchWorktreeIncludePath(relPath, p))
}

/** worktree add 的起点：拒绝 flag / 空白，默认 HEAD */
export function sanitizeWorktreeBaseRef(raw?: string | null): string {
  const ref = String(raw || '').trim()
  if (!ref || /\s/.test(ref) || ref.startsWith('-')) return 'HEAD'
  return ref
}
