/**
 * 多文件夹项目里的跨仓库审查：只把不同 Git 仓库收进选择器。
 * 对标 Codex Review changes across repositories。
 * @see shared/ARCH.md
 */
import { fileInLastTurn } from './git-compare'
import { workspaceAccessRoots } from './workspace-folders'

/** Official review pane (learn.chatgpt.com/docs/code-review). */
export const REVIEW_PANE_INTRO =
  'Open the review pane to understand what changed, give line-specific feedback, and decide what to stage, revert, commit, or push.'
/** Official review pane Git-state sentence (learn.chatgpt.com/docs/code-review). */
export const REVIEW_PANE_GIT_STATE =
  'The review pane reflects the state of your Git repository, not just what Codex edited.'
/** Official review pane default scope (learn.chatgpt.com/docs/code-review). */
export const REVIEW_PANE_SCOPE_INTRO =
  'By default, the review pane shows Unstaged changes. Use Staged for the Git index, Commit for a selected commit, Branch for the diff against your base branch, or Last turn for the most recent assistant turn.'
/** Official review pane expand hint (learn.chatgpt.com/docs/code-review). */
export const REVIEW_PANE_EXPAND_HINT =
  'Clicking the file name background expands or collapses the diff.'
/** Official review pane multi-repo selector (learn.chatgpt.com/docs/code-review). */
export const REVIEW_MULTI_REPO_INTRO =
  'When a local project includes multiple folders backed by different Git repositories, the review pane can show changes from each repository. Open the repository selector in the review header to inspect another repository and see the lines added or removed without leaving the current review pane.'
/** Official Last turn All repos sentence (learn.chatgpt.com/docs/code-review). */
export const REVIEW_LAST_TURN_ALL_REPOS_HINT =
  "Choose Last turn to see the assistant's latest changes across the attached repositories. The repository selector shows All repos for that view."
/** Official other-scope repo sentence (learn.chatgpt.com/docs/code-review). */
export const REVIEW_OTHER_SCOPE_REPO_HINT =
  'Other review scopes, such as Unstaged, Staged, and Branch, apply to the repository you select.'
/** Official review pane Last turn selector (learn.chatgpt.com/docs/code-review). */
export const ALL_REPOS_ID = 'all'
export const ALL_REPOS_LABEL = 'All repos'
export const LAST_TURN_LABEL = 'Last turn'
export const UNSTAGED_LABEL = 'Unstaged'
export const STAGED_LABEL = 'Staged'
export const BRANCH_REVIEW_LABEL = 'Branch'
export const COMMIT_REVIEW_LABEL = 'Commit'
export const STAGE_ALL_LABEL = 'Stage all'
/** Official entire-diff unstage, parallel to Stage all / Revert all. */
export const UNSTAGE_ALL_LABEL = 'Unstage all'
export const REVERT_ALL_LABEL = 'Revert all'
/** Official review pane per-file / per-hunk verbs (learn.chatgpt.com/docs/code-review). */
export const STAGE_LABEL = 'Stage'
export const UNSTAGE_LABEL = 'Unstage'
export const REVERT_LABEL = 'Revert'
/** Official review pane Stage / Revert leftover (learn.chatgpt.com/docs/code-review). */
export const REVIEW_HAPPY_WITH_CHANGE_HINT =
  "If you're happy with a change, you can stage it or revert changes you don't want."
/** Official review pane empty Git prompt (learn.chatgpt.com/docs/code-review). */
export const REVIEW_REQUIRES_GIT_LABEL =
  'The review pane requires a project inside a Git repository.'
export const REVIEW_CREATE_ONE_HINT =
  "If your project isn't a Git repository yet, the app prompts you to create one."
/** Official review wrap (learn.chatgpt.com remote / Wrap long diff lines). */
export const WRAP_LONG_DIFF_LINES_LABEL = 'Wrap long diff lines'
/** Official local Git controls (learn.chatgpt.com/docs/environments/local-environment). */
export const COMMIT_ACTION_LABEL = 'Commit'
export const PUSH_ACTION_LABEL = 'Push'
export const CREATE_A_PULL_REQUEST_LABEL = 'Create a pull request'
/** Official worktrees: open a pull request on GitHub after create. */
export const OPEN_A_PULL_REQUEST_LABEL = 'Open a pull request'

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

/**
 * 有 `/review` 发现的文件键。展开后评论才能画在 diff 行上
 * （对标 Codex：Review findings appear as inline comments）。
 */
export function reviewDiffKeysForFindings(
  files: Array<{ path: string; repoRoot?: string }>,
  findings: Array<{ path: string }>,
  fallbackRoot: string
): string[] {
  const wanted = new Set(
    findings.map((item) => posixPath(item.path)).filter(Boolean)
  )
  if (!wanted.size) return []
  const seen = new Set<string>()
  const out: string[] = []
  const fallback = posixPath(fallbackRoot)
  for (const file of files) {
    const path = posixPath(file.path)
    if (!path || !wanted.has(path)) continue
    const repo = posixPath(file.repoRoot || fallback)
    if (!repo) continue
    const key = reviewDiffKey(repo, path)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/** 把发现对应的 diff 键并进已展开列表；已有的不换引用 */
export function mergeReviewExpandedKeys(prev: string[], incoming: string[]): string[] {
  if (!incoming.length) return prev
  const extra = incoming.filter((key) => key && !prev.includes(key))
  return extra.length ? [...prev, ...extra] : prev
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

/** 本轮预览路径落到该仓的相对路径；还没进 git status 时也能占一行（对标 Codex Last turn） */
export function lastTurnPendingRelPath(
  raw: string,
  repoRoot: string,
  primaryRoot: string
): string | null {
  const p = posixPath(raw)
  const repo = posixPath(repoRoot)
  const primary = posixPath(primaryRoot)
  if (!p || !repo) return null
  const repoName = reviewRepoLabel(repo)
  const isPrimary = repo.toLowerCase() === primary.toLowerCase()
  if (isAbsolutePath(p)) {
    if (p === repo || !p.startsWith(`${repo}/`)) return null
    return p.slice(repo.length + 1) || null
  }
  if (repoName && (p === repoName || p.startsWith(`${repoName}/`))) {
    const rel = p === repoName ? '' : p.slice(repoName.length + 1)
    return rel || null
  }
  return isPrimary ? p : null
}

/** 本轮已点名、git status 还没见到的相对路径（不编造 diff） */
export function lastTurnPendingRelPaths(
  lastTurnPaths: string[],
  presentFiles: readonly { path: string; repoRoot?: string }[],
  repoRoot: string,
  primaryRoot: string
): string[] {
  const missing: string[] = []
  for (const raw of lastTurnPaths) {
    const rel = lastTurnPendingRelPath(raw, repoRoot, primaryRoot)
    if (!rel) continue
    const already = presentFiles.some((file) =>
      fileInLastTurnForRepo(file.path, [raw], file.repoRoot ?? repoRoot, primaryRoot)
    )
    if (!already) missing.push(rel)
  }
  return missing
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
