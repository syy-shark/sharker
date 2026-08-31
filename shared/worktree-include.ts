/**
 * Codex 式 `.worktreeinclude`：隔离 worktree 创建时拷贝被 gitignore 的本地文件。
 * 设置页挂官方 leftover，不发明文件编辑器。
 * @see shared/ARCH.md
 */

export const WORKTREE_INCLUDE_ALWAYS = ['AGENTS.override.md']
/** Official desktop leftover (learn.chatgpt.com/docs/environments/git-worktrees). */
export const WORKTREE_INCLUDE_INTRO =
  'If your repository ignores local setup files that a new worktree needs, add a `.worktreeinclude` file to the repository root and list the ignored paths or `.gitignore`-style patterns to copy when Codex creates a managed worktree.'
export const WORKTREE_INCLUDE_HINT =
  "Use this for files Git intentionally ignores, such as `.env`, `.env.local`, or `config/secrets.json`. Codex only copies ignored files that match `.worktreeinclude`; it doesn't copy other local files that Git doesn't track. Don't list tracked files."
export const WORKTREE_INCLUDE_AGENTS_HINT =
  "Codex automatically copies an ignored `AGENTS.override.md` into local managed worktrees, so you don't need to list it in `.worktreeinclude`."
/** Official leftover (learn.chatgpt.com/docs/reference/troubleshooting). */
export const CODE_DOESNT_RUN_ON_WORKTREE_HINT =
  'Worktrees are created in a different directory and inherit files checked into Git by default. Depending on how you manage dependencies and tooling for your project, you might have to run setup scripts on your worktree using a local environment or copy ignored setup files with `.worktreeinclude`. Alternatively, you can check out the changes in your regular local project.'

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
