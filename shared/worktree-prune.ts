/**
 * Codex 式托管 worktree 清理：保留最近 N 个，受保护的不删。
 * @see shared/ARCH.md
 */

/** Codex 默认保留最近 15 个托管 worktree */
export const DEFAULT_MANAGED_WORKTREE_LIMIT = 15

/** 待清理的托管 worktree 条目（按目录 mtime） */
export interface ManagedWorktreeEntry {
  path: string
  mtimeMs: number
}

function resolveKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * 选出应删除的托管 worktree：保留最近 `keep` 个；
 * `protectPaths` 即使更旧也不删（进行中 / 当前正在用）。
 */
export function selectManagedWorktreesToPrune(
  entries: ManagedWorktreeEntry[],
  opts?: { keep?: number; protectPaths?: string[] }
): string[] {
  const keep = opts?.keep ?? DEFAULT_MANAGED_WORKTREE_LIMIT
  const protect = new Set((opts?.protectPaths ?? []).map(resolveKey))
  const sorted = [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
  const retained = new Set<string>()
  for (const entry of sorted) {
    if (retained.size >= keep) break
    retained.add(resolveKey(entry.path))
  }
  return sorted
    .filter((entry) => {
      const key = resolveKey(entry.path)
      if (protect.has(key)) return false
      return !retained.has(key)
    })
    .map((entry) => entry.path)
}

/** 目录名是否像 `repo-shortid` 托管 worktree */
export function isManagedWorktreeDirName(repoName: string, dirName: string): boolean {
  const prefix = `${repoName}-`
  return dirName.startsWith(prefix) && dirName.length > prefix.length
}
