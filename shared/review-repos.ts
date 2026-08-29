/**
 * 多文件夹项目里的跨仓库审查：只把不同 Git 仓库收进选择器。
 * 对标 Codex Review changes across repositories。
 * @see shared/ARCH.md
 */
import { fileInLastTurn } from './git-compare'
import { workspaceAccessRoots } from './workspace-folders'

/** 本轮对比：选择器显示「全部仓库」 */
export const ALL_REPOS_ID = 'all'

/** 审查最多再探几个附加根（含主根一共 cap） */
export const MAX_REVIEW_REPOS = 8

export type ReviewCompareMode = 'uncommitted' | 'last_turn' | 'branch' | 'commit'

export type ReviewRepoProbe = {
  probeRoot: string
  isRepo: boolean
  toplevel?: string
  commonDir?: string
  branch?: string
  added?: number
  removed?: number
}

export type ReviewRepo = {
  root: string
  label: string
  identity: string
  branch: string
  added: number
  removed: number
}

function posixPath(value: string): string {
  return String(value ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//.test(value)
}

/** 主路径 + 附加文件夹，主根在前 */
export function reviewProbeRoots(primary: string, extras: unknown, max = MAX_REVIEW_REPOS): string[] {
  const roots = workspaceAccessRoots(primary, extras)
  if (roots.length <= max) return roots
  return [roots[0]!, ...roots.slice(1, max)]
}

/** 仓库展示名：目录末段 */
export function reviewRepoLabel(root: string): string {
  const p = posixPath(root)
  return p.split('/').pop() || p
}

/** 同一 common-dir 只留先出现的（主根优先） */
export function uniqueReviewRepos(probes: ReviewRepoProbe[]): ReviewRepo[] {
  const seen = new Set<string>()
  const out: ReviewRepo[] = []
  for (const probe of probes) {
    if (!probe.isRepo) continue
    const root = posixPath(probe.toplevel || probe.probeRoot)
    if (!root) continue
    const identity = posixPath(probe.commonDir || root).toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    out.push({
      root,
      label: reviewRepoLabel(root),
      identity,
      branch: probe.branch ?? '',
      added: probe.added ?? 0,
      removed: probe.removed ?? 0
    })
  }
  return out
}

/**
 * 本轮固定 All repos（对标 Codex Last turn 看附加仓全部改动）；其它范围落到选中仓库。
 */
export function resolveReviewRepoId(options: {
  compare: ReviewCompareMode
  selectedId: string
  repoRoots: string[]
}): string {
  const roots = options.repoRoots.map(posixPath).filter(Boolean)
  if (roots.length <= 1) return roots[0] ?? ''
  if (options.compare === 'last_turn') return ALL_REPOS_ID
  const selected = posixPath(options.selectedId)
  if (!selected || selected === ALL_REPOS_ID || !roots.includes(selected)) return roots[0] ?? ''
  return selected
}

export function shouldShowReviewRepoSelector(repoCount: number): boolean {
  return repoCount > 1
}

/** 审查列表里一份文件的稳定键（仓根 + 相对路径） */
export function reviewDiffKey(repoRoot: string, path: string): string {
  return `${posixPath(repoRoot)}\0${posixPath(path)}`
}

export function parseReviewDiffKey(key: string): { repoRoot: string; path: string } | null {
  const raw = String(key ?? '')
  const split = raw.indexOf('\0')
  if (split <= 0) return null
  const repoRoot = posixPath(raw.slice(0, split))
  const path = posixPath(raw.slice(split + 1))
  if (!repoRoot || !path) return null
  return { repoRoot, path }
}

export function toggleReviewDiffKey(keys: string[], key: string): string[] {
  const next = String(key ?? '')
  if (!next) return keys.slice()
  return keys.includes(next) ? keys.filter((item) => item !== next) : [...keys, next]
}

export function expandAllReviewDiffKeys(
  files: Array<{ path: string; repoRoot?: string }>,
  fallbackRoot: string
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const fallback = posixPath(fallbackRoot)
  for (const file of files) {
    const path = posixPath(file.path)
    const repo = posixPath(file.repoRoot || fallback)
    if (!path || !repo) continue
    const key = reviewDiffKey(repo, path)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export function pruneReviewDiffKeys(keys: string[], allowed: string[]): string[] {
  const allow = new Set(allowed)
  return keys.filter((key) => allow.has(key))
}

export function formatReviewLineStats(added: number, removed: number): string {
  if (!added && !removed) return ''
  return `+${Math.max(0, added)} −${Math.max(0, removed)}`
}

export function sumReviewLineStats(
  repos: Array<{ added: number; removed: number }>
): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const repo of repos) {
    added += repo.added
    removed += repo.removed
  }
  return { added, removed }
}

/**
 * 与工作区文件树同一套顺序：同层目录在文件前，再按名字（对标 Codex
 * Kept review diff ordering consistent with the file tree）。
 */
export function compareFileTreePaths(leftPath: string, rightPath: string): number {
  const left = posixPath(leftPath).split('/').filter(Boolean)
  const right = posixPath(rightPath).split('/').filter(Boolean)
  const n = Math.min(left.length, right.length)
  for (let i = 0; i < n; i++) {
    const leftLeaf = i === left.length - 1
    const rightLeaf = i === right.length - 1
    if (leftLeaf !== rightLeaf) return leftLeaf ? 1 : -1
    const cmp = left[i]!.localeCompare(right[i]!, undefined, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
  }
  return left.length - right.length
}

export function sortReviewFilesLikeFileTree<T extends { path: string; repoRoot?: string }>(
  files: T[],
  primaryRoot = ''
): T[] {
  const primary = posixPath(primaryRoot)
  return files.slice().sort((a, b) => {
    const aPath = primary ? reviewFileOpenPath(a.path, a.repoRoot ?? primary, primary) : posixPath(a.path)
    const bPath = primary ? reviewFileOpenPath(b.path, b.repoRoot ?? primary, primary) : posixPath(b.path)
    return compareFileTreePaths(aPath, bPath) || compareFileTreePaths(a.path, b.path)
  })
}

/** 附加仓库文件用目录名前缀打开预览（与 `@` / 文件引用一致） */
export function reviewFileOpenPath(filePath: string, repoRoot: string, primaryRoot: string): string {
  const file = posixPath(filePath)
  if (!file) return ''
  if (posixPath(repoRoot).toLowerCase() === posixPath(primaryRoot).toLowerCase()) return file
  const label = reviewRepoLabel(repoRoot)
  return label ? `${label}/${file}` : file
}

/**
 * 本轮路径是否属于该仓库的这条变更。
 * 绝对路径按仓库根切；`目录名/…` 前缀跟附加根；相对路径只算主仓库。
 */
export function fileInLastTurnForRepo(
  filePath: string,
  lastTurnPaths: string[],
  repoRoot: string,
  primaryRoot: string
): boolean {
  if (!lastTurnPaths.length) return false
  const file = posixPath(filePath)
  const repo = posixPath(repoRoot)
  const primary = posixPath(primaryRoot)
  if (!file || !repo) return false
  const repoName = reviewRepoLabel(repo)
  const isPrimary = repo.toLowerCase() === primary.toLowerCase()

  return lastTurnPaths.some((raw) => {
    const p = posixPath(raw)
    if (!p) return false
    if (isAbsolutePath(p)) {
      if (p === repo) return false
      if (!p.startsWith(`${repo}/`)) return false
      const rel = p.slice(repo.length + 1)
      return rel === file || file.endsWith(`/${rel}`) || rel.endsWith(`/${file}`)
    }
    if (repoName && (p === repoName || p.startsWith(`${repoName}/`))) {
      const rel = p === repoName ? '' : p.slice(repoName.length + 1)
      return Boolean(rel) && (rel === file || file.endsWith(`/${rel}`) || rel.endsWith(`/${file}`))
    }
    return isPrimary && fileInLastTurn(file, [p])
  })
}
