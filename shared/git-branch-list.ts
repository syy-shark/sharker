/**
 * Composer 隔离 worktree 起点分支：解析本地 + 远程跟踪分支，并按关键字过滤。
 * 对标 Codex desktop local branch search；远程只保留 `origin/…` 完整 ref，避免 #22635。
 * @see shared/ARCH.md
 */

export type GitBranchSource = 'local' | 'remote'

/** 可供 `git worktree add` 使用的一条分支 */
export interface GitBranchRef {
  /** 传给 worktree add 的 ref；远程保留 `origin/feature` */
  ref: string
  /** 搜索用短名（不含 remote 前缀） */
  short: string
  source: GitBranchSource
}

/** 解析 `git for-each-ref --format=%(refname) refs/heads refs/remotes` */
export function parseGitRefNames(text: string): GitBranchRef[] {
  const locals: GitBranchRef[] = []
  const remotes: GitBranchRef[] = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.includes(' -> ')) continue
    if (line.startsWith('refs/heads/')) {
      const short = line.slice('refs/heads/'.length)
      if (!short || short === 'HEAD') continue
      locals.push({ ref: short, short, source: 'local' })
      continue
    }
    if (line.startsWith('refs/remotes/')) {
      const rest = line.slice('refs/remotes/'.length)
      if (!rest || rest.endsWith('/HEAD')) continue
      const slash = rest.indexOf('/')
      if (slash <= 0) continue
      const short = rest.slice(slash + 1)
      if (!short || short === 'HEAD') continue
      remotes.push({ ref: rest, short, source: 'remote' })
    }
  }
  const localShorts = new Set(locals.map((b) => b.short))
  const remoteOnly = remotes.filter((b) => !localShorts.has(b.short))
  const byRef = new Map<string, GitBranchRef>()
  for (const item of [...locals, ...remoteOnly]) byRef.set(item.ref, item)
  return [...byRef.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'local' ? -1 : 1
    return a.ref.localeCompare(b.ref)
  })
}

/** 标题 / 短名 / 完整 ref 都可搜（对标 Codex Search for `autorego`） */
export function filterGitBranchRefs(items: GitBranchRef[], query: string): GitBranchRef[] {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) => item.ref.toLowerCase().includes(q) || item.short.toLowerCase().includes(q)
  )
}

/** 选择器行：空 ref 是 HEAD（当前提交） */
export function gitBranchPickerRows(
  items: GitBranchRef[]
): Array<{ ref: string; label: string; source?: GitBranchSource }> {
  return [
    { ref: '', label: 'HEAD' },
    ...items.map((item) => ({
      ref: item.ref,
      label: item.source === 'remote' ? item.ref : item.short,
      source: item.source
    }))
  ]
}

/** 当前选中值的展示名 */
export function gitBranchPickerLabel(
  ref: string,
  items: GitBranchRef[]
): string {
  const trimmed = String(ref || '').trim()
  if (!trimmed) return 'HEAD'
  const hit = items.find((item) => item.ref === trimmed)
  if (hit) return hit.source === 'remote' ? hit.ref : hit.short
  return trimmed
}
