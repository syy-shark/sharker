/**
 * 右侧「变更」审查：对比范围 + 跨仓库选择器 + 文件/hunk 动作 + 提交推送（对标 Codex Review）。
 * 已展开 diff 且面板聚焦时 ⌘L 跳到行并打开预览（对标 Codex Go to line）。
 * 面板聚焦时 ⌘F / ⌘G 在审查 diff 内查找并跳到屏外命中（对标 Codex review search）。
 * 文件列表按文件树排序；右键打开菜单；刷新时保住滚动（对标 Codex review file tree / scroll jumps）。
 * 行内评论「插入输入框」只接草稿，不自动开一轮（对标 Codex send a follow-up after comments）。
 * 直播 `/review` 围栏一闭合就挂发现并展开对应 diff，不抬 App（对标 Codex review findings appear inline）。
 * @see ./ARCH.md
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FileDiff, GitBranch, RefreshCw, Search } from 'lucide-react'
import type { FileDiff as FileDiffModel } from '../../../shared/types'
import { buildHunkPatch, type DiffHunk } from '../../../shared/diff-hunk'
import type { GitReviewAction } from '../../../shared/git-review-actions'
import { type GitCommitRef } from '../../../shared/git-compare'
import {
  formatReviewCommentsPrompt,
  parseLiveReviewFindings,
  sameReviewFindings,
  type ReviewLineComment
} from '../../../shared/review-comment'
import { useLiveStreamUiSelect } from '../../hooks/useLiveStreamUi'
import {
  formatPrCommentsPrompt,
  type PullRequestContext
} from '../../../shared/git-pr-context'
import { localCommentsForGithub } from '../../../shared/git-pr-review'
import { isDeletedGitChange, isNewGitChange } from '../../../shared/git-change-diff'
import { formatBranchPrefix } from '../../../shared/git-branch-create'
import { CodeDiffBlock } from '../CodeDiffBlock'
import { seedFindQuery } from '../../../shared/thread-search'
import {
  findInReviewDiffs,
  isReviewFindFocus,
  sameReviewFindMatch,
  shouldHandleReviewFindShortcut,
  wrapFindIndex
} from '../../../shared/review-diff-search'
import { maxDiffGotoLine, parseGoToLineInput } from '../../../shared/file-preview'
import { dispatchOpenWorkspaceFile } from '../../lib/open-workspace-file'
import {
  clampReviewMenuPosition,
  resolveReviewFileClick,
  reviewFileClickTargetFromElement,
  reviewFileMenuItems
} from '../../../shared/review-file-click'
import {
  ALL_REPOS_ID,
  expandAllReviewDiffKeys,
  mergeReviewExpandedKeys,
  reviewDiffKeysForFindings,
  fileInLastTurnForRepo,
  lastTurnPendingRelPaths,
  formatReviewLineStats,
  parseReviewDiffKey,
  pruneReviewDiffKeys,
  resolveReviewRepoId,
  reviewDiffKey,
  reviewFileOpenPath,
  reviewProbeRoots,
  shouldShowReviewRepoSelector,
  sortReviewFilesLikeFileTree,
  sumReviewLineStats,
  toggleReviewDiffKey,
  uniqueReviewRepos,
  type ReviewRepo
} from '../../../shared/review-repos'
import './ChangesPanel.css'

interface ChangeFile {
  status: string
  path: string
  raw: string
  staged?: boolean
  unstaged?: boolean
  untracked?: boolean
  repoRoot?: string
}

type RepoSnapshot = ReviewRepo & { files: ChangeFile[] }

type CompareMode = 'uncommitted' | 'last_turn' | 'branch' | 'commit'
type ReviewScope = 'unstaged' | 'staged'

interface Props {
  workspacePath: string
  /** 工具写盘后递增，立刻刷新审查列表 */
  revision?: number
  /** 上一轮助手写过的相对路径（Codex Last turn） */
  lastTurnPaths?: string[]
  /** 把行内评论写入输入框，由用户再发跟进（对标 Codex：评论后自己发送，不自动开一轮） */
  onSendComments?: (prompt: string) => void
  /** `/review` 解析出的行内发现 */
  agentFindings?: ReviewLineComment[]
  /** 审查队列接受后预填提交说明 */
  suggestedCommit?: string
  /** Settings → Git 分支名前缀（占位提示；真正加前缀在主进程） */
  gitBranchPrefix?: string
  /** `/review` 打开时切到对应对比（对标 Codex Review a commit / branch） */
  reviewFocus?: { mode: CompareMode; sha?: string; token: number } | null
  /** 项目附加文件夹：其中不同 Git 仓库出现在审查选择器 */
  extraRoots?: string[]
}

function statusLabel(file: ChangeFile): string {
  if (file.untracked) return '未跟踪'
  const s = file.status.trim()
  if (s === 'M' || s === 'MM') return '修改'
  if (s === 'A' || s.endsWith('A')) return '新增'
  if (s === 'D' || s.startsWith('D')) return '删除'
  if (s.startsWith('R')) return '重命名'
  return s || '变更'
}

function isStaged(file: ChangeFile): boolean {
  return file.staged ?? /^[A-Z]/.test(file.raw.slice(0, 1))
}

function isUnstaged(file: ChangeFile): boolean {
  return file.unstaged ?? file.untracked ?? file.raw.slice(1, 2) !== ' '
}

function keepRecordKeys<T>(prev: Record<string, T>, keep: (key: string) => boolean): Record<string, T> {
  let same = true
  const next: Record<string, T> = {}
  for (const key of Object.keys(prev)) {
    if (keep(key)) next[key] = prev[key] as T
    else same = false
  }
  if (same && Object.keys(next).length === Object.keys(prev).length) return prev
  return next
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index])
}

/** Codex 式变更审查：对比范围 + 当前文件 diff + Git 动作 */
export const ChangesPanel = memo(function ChangesPanel({
  workspacePath,
  revision = 0,
  lastTurnPaths = [],
  onSendComments,
  agentFindings = [],
  suggestedCommit = '',
  gitBranchPrefix = '',
  reviewFocus = null,
  extraRoots = []
}: Props) {
  const [branch, setBranch] = useState('')
  const [isRepo, setIsRepo] = useState(true)
  const [repoSnapshots, setRepoSnapshots] = useState<RepoSnapshot[]>([])
  const [repoId, setRepoId] = useState('')
  const [files, setFiles] = useState<ChangeFile[]>([])
  const [branchFiles, setBranchFiles] = useState<ChangeFile[]>([])
  const [branchBase, setBranchBase] = useState<string | null>(null)
  const [commits, setCommits] = useState<GitCommitRef[]>([])
  const [commitSha, setCommitSha] = useState('')
  const [commitFiles, setCommitFiles] = useState<ChangeFile[]>([])
  const [compare, setCompare] = useState<CompareMode>('uncommitted')
  const [scope, setScope] = useState<ReviewScope>('unstaged')
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [diffs, setDiffs] = useState<Record<string, FileDiffModel>>({})
  const [diffErrors, setDiffErrors] = useState<Record<string, string>>({})
  const [diffLoadingKeys, setDiffLoadingKeys] = useState<string[]>([])
  const [comments, setComments] = useState<ReviewLineComment[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [commitHint, setCommitHint] = useState<string | null>(null)
  const [prTitle, setPrTitle] = useState('')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [prContext, setPrContext] = useState<PullRequestContext | null>(null)
  const [wrapLines, setWrapLines] = useState(() => {
    try {
      return localStorage.getItem('sharker-diff-wrap') !== '0'
    } catch {
      return true
    }
  })
  const [goToOpen, setGoToOpen] = useState(false)
  const [goToDraft, setGoToDraft] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findHit, setFindHit] = useState(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const goToInputRef = useRef<HTMLInputElement | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const lastReviewKeyRef = useRef('')
  const findAnchorRef = useRef<{ fileKey: string; lineIndex: number; start: number } | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const listScrollTopRef = useRef(0)
  const [fileMenu, setFileMenu] = useState<{
    fileKey: string
    openPath: string
    expanded: boolean
    x: number
    y: number
  } | null>(null)

  const liveFindings = useLiveStreamUiSelect(
    (ui) => parseLiveReviewFindings(ui.streaming),
    sameReviewFindings
  )

  useEffect(() => {
    const incoming = liveFindings.length ? [...liveFindings, ...agentFindings] : agentFindings
    if (!incoming.length) return
    setComments((prev) => {
      const keys = new Set(prev.map((c) => `${c.path}:${c.line}:${c.text}`))
      const extra = incoming.filter((f) => !keys.has(`${f.path}:${f.line}:${f.text}`))
      return extra.length ? [...prev, ...extra] : prev
    })
  }, [agentFindings, liveFindings])

  useEffect(() => {
    const hint = suggestedCommit.trim()
    if (!hint) return
    setCommitMessage((prev) => prev.trim() || hint)
  }, [suggestedCommit])

  useEffect(() => {
    if (!reviewFocus) return
    setCompare(reviewFocus.mode)
    if (reviewFocus.sha) setCommitSha(reviewFocus.sha)
  }, [reviewFocus])

  const gitRepos = repoSnapshots
  const effectiveRepoId = resolveReviewRepoId({
    compare,
    selectedId: repoId,
    repoRoots: gitRepos.map((r) => r.root)
  })
  const isAllRepos = effectiveRepoId === ALL_REPOS_ID
  const activeRepo = gitRepos.find((r) => r.root === effectiveRepoId) ?? gitRepos[0]
  const reviewCwd = isAllRepos ? workspacePath : (activeRepo?.root ?? workspacePath)
  const showRepoSelector = shouldShowReviewRepoSelector(gitRepos.length)
  const allRepoStats = sumReviewLineStats(gitRepos)

  const taggedRepoFiles = (activeRepo?.files ?? files).map((f) => ({
    ...f,
    repoRoot: activeRepo?.root ?? workspacePath
  }))
  const lastTurnAllFiles = gitRepos.flatMap((repo) =>
    repo.files
      .filter((f) => fileInLastTurnForRepo(f.path, lastTurnPaths, repo.root, workspacePath))
      .map((f) => ({ ...f, repoRoot: repo.root }))
  )
  const lastTurnPresent = isAllRepos ? lastTurnAllFiles : taggedRepoFiles
  const pendingLastTurnFiles =
    compare === 'last_turn'
      ? (isAllRepos ? gitRepos : activeRepo ? [activeRepo] : []).flatMap((repo) =>
          lastTurnPendingRelPaths(lastTurnPaths, lastTurnPresent, repo.root, workspacePath).map(
            (path) => ({
              status: '',
              path,
              raw: path,
              repoRoot: repo.root
            })
          )
        )
      : []
  const lastTurnFiles = [...lastTurnPresent, ...pendingLastTurnFiles]
  const sourceFiles =
    compare === 'branch'
      ? branchFiles.map((f) => ({ ...f, repoRoot: reviewCwd }))
      : compare === 'commit'
        ? commitFiles.map((f) => ({ ...f, repoRoot: reviewCwd }))
        : compare === 'last_turn'
          ? lastTurnFiles
          : taggedRepoFiles
  const readOnly = compare === 'branch' || compare === 'commit'
  const visible = sortReviewFilesLikeFileTree(
    sourceFiles.filter((f) => {
      if (compare === 'last_turn') {
        return isAllRepos
          ? true
          : fileInLastTurnForRepo(f.path, lastTurnPaths, f.repoRoot ?? reviewCwd, workspacePath)
      }
      if (compare === 'branch') return true
      return scope === 'staged' ? isStaged(f) : isUnstaged(f)
    }),
    workspacePath
  )
  const findingExpandKeySig = reviewDiffKeysForFindings(
    visible,
    liveFindings.length ? [...liveFindings, ...agentFindings] : agentFindings,
    reviewCwd
  ).join('\0')
  const autoExpandedFindingKeysRef = useRef<string[]>([])
  useEffect(() => {
    const keys = findingExpandKeySig ? findingExpandKeySig.split('\0') : []
    const fresh = keys.filter((key) => !autoExpandedFindingKeysRef.current.includes(key))
    if (!fresh.length) return
    autoExpandedFindingKeysRef.current = [...autoExpandedFindingKeysRef.current, ...fresh]
    setExpandedKeys((prev) => mergeReviewExpandedKeys(prev, fresh))
  }, [findingExpandKeySig])
  const stagedCount = taggedRepoFiles.filter(isStaged).length

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!workspacePath || !window.sharker?.getGitStatusChanges) {
      setIsRepo(false)
      setFiles([])
      setRepoSnapshots([])
      setBranchFiles([])
      return
    }
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const probes = reviewProbeRoots(workspacePath, extraRoots)
      const snapshots = await Promise.all(
        probes.map(async (root) => {
          const result = await window.sharker.getGitStatusChanges(root)
          return {
            probeRoot: root,
            isRepo: result.isRepo,
            toplevel: result.toplevel,
            commonDir: result.commonDir,
            branch: result.branch,
            added: result.added ?? 0,
            removed: result.removed ?? 0,
            files: result.files
          }
        })
      )
      const unique = uniqueReviewRepos(snapshots)
      const nextRepos: RepoSnapshot[] = unique.map((repo) => {
        const hit =
          snapshots.find((row) => (row.toplevel || row.probeRoot) === repo.root) ??
          snapshots.find((row) => row.probeRoot === repo.root)
        return { ...repo, files: hit?.files ?? [] }
      })
      setRepoSnapshots(nextRepos)
      const nextId = resolveReviewRepoId({
        compare,
        selectedId: repoId,
        repoRoots: nextRepos.map((r) => r.root)
      })
      const nextAll = nextId === ALL_REPOS_ID
      const nextActive = nextRepos.find((r) => r.root === nextId) ?? nextRepos[0]
      const cwd = nextAll ? workspacePath : (nextActive?.root ?? workspacePath)
      setIsRepo(nextRepos.length > 0)
      setBranch(nextActive?.branch ?? '')
      setFiles(nextActive?.files ?? [])

      if (!nextAll && window.sharker.getGitBranchChanges) {
        const branchResult = await window.sharker.getGitBranchChanges(cwd)
        setBranchBase(branchResult.base)
        setBranchFiles(branchResult.files)
        if (compare === 'branch') {
          const allowed = expandAllReviewDiffKeys(branchResult.files, cwd)
          setExpandedKeys((prev) => pruneReviewDiffKeys(prev, allowed))
        }
      } else if (nextAll) {
        setBranchBase(null)
        setBranchFiles([])
      }
      if (!nextAll && compare === 'commit' && window.sharker.getGitCommitChanges) {
        const commitResult = await window.sharker.getGitCommitChanges(cwd, commitSha)
        setCommits(commitResult.commits)
        setCommitSha(commitResult.sha)
        setCommitFiles(commitResult.files)
        if (compare === 'commit') {
          const allowed = expandAllReviewDiffKeys(commitResult.files, cwd)
          setExpandedKeys((prev) => pruneReviewDiffKeys(prev, allowed))
        }
      }
      if (compare !== 'branch' && compare !== 'commit') {
        const nextList = nextAll
          ? nextRepos.flatMap((repo) =>
              repo.files
                .filter((f) => fileInLastTurnForRepo(f.path, lastTurnPaths, repo.root, workspacePath))
                .map((f) => ({ ...f, repoRoot: repo.root }))
            )
          : (nextActive?.files ?? []).filter((f) => {
              if (compare === 'last_turn') {
                return fileInLastTurnForRepo(
                  f.path,
                  lastTurnPaths,
                  nextActive?.root ?? cwd,
                  workspacePath
                )
              }
              return scope === 'staged' ? isStaged(f) : isUnstaged(f)
            })
        const allowed = expandAllReviewDiffKeys(nextList, cwd)
        setExpandedKeys((prev) => pruneReviewDiffKeys(prev, allowed))
      }
      if (!nextAll && window.sharker.getPullRequestContext) {
        const pr = await window.sharker.getPullRequestContext(cwd)
        if (pr.ok) {
          setPrContext(pr.context)
          if (pr.context.comments.length) {
            setComments((prev) => {
              const keys = new Set(prev.map((c) => `${c.path}:${c.line}:${c.text}`))
              const extra = pr.context.comments.filter(
                (f) => !keys.has(`${f.path}:${f.line}:${f.text}`)
              )
              return extra.length ? [...prev, ...extra] : prev
            })
          }
        } else {
          setPrContext(null)
        }
      } else if (nextAll) {
        setPrContext(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFiles([])
      setRepoSnapshots([])
      setBranchFiles([])
      setCommitFiles([])
    } finally {
      setLoading(false)
    }
  }, [workspacePath, extraRoots, repoId, scope, compare, lastTurnPaths, commitSha])

  /** 执行暂存 / 取消暂存 / 还原；还原前确认 */
  const runAction = useCallback(
    async (action: 'stage' | 'unstage' | 'revert', paths?: string[], cwd?: string) => {
      const gitRoot = cwd || reviewCwd
      if (!gitRoot || !window.sharker?.applyGitReviewAction || acting || readOnly) return
      if (isAllRepos && !cwd) {
        setError('选择一个仓库后再批量暂存或还原')
        return
      }
      if (action === 'revert') {
        const label = paths?.length === 1 ? paths[0] : '全部未提交变更'
        if (!window.confirm(`确定还原 ${label}？此操作不可撤销。`)) return
      }
      setActing(true)
      setError(null)
      try {
        const result = await window.sharker.applyGitReviewAction(gitRoot, action, paths)
        if (!result.ok) setError(result.error || 'Git 操作失败')
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setActing(false)
      }
    },
    [acting, isAllRepos, readOnly, refresh, reviewCwd]
  )

  /** hunk 级暂存 / 取消暂存 / 还原 */
  const runHunkAction = useCallback(
    async (file: ChangeFile, hunk: DiffHunk, action: GitReviewAction) => {
      const gitRoot = file.repoRoot ?? reviewCwd
      if (!gitRoot || !file.path || !window.sharker?.applyGitHunkAction || acting || readOnly) {
        return
      }
      setActing(true)
      setError(null)
      try {
        const result = await window.sharker.applyGitHunkAction(gitRoot, {
          action,
          path: file.path,
          scope,
          patch: buildHunkPatch({
            path: file.path,
            hunk,
            isNew: isNewGitChange(file.status),
            isDeleted: isDeletedGitChange(file.status)
          })
        })
        if (!result.ok) setError(result.error || 'hunk 操作失败')
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setActing(false)
      }
    },
    [acting, readOnly, refresh, reviewCwd, scope]
  )

  const runCommit = useCallback(async () => {
    if (!reviewCwd || isAllRepos || !window.sharker?.commitGitChanges || acting) return
    setActing(true)
    setError(null)
    setCommitHint(null)
    try {
      const result = await window.sharker.commitGitChanges(reviewCwd, commitMessage)
      if (!result.ok) {
        setError(result.error || '提交失败')
        return
      }
      setCommitMessage('')
      setCommitHint(`已提交 ${result.sha}`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(false)
    }
  }, [acting, commitMessage, isAllRepos, refresh, reviewCwd])

  const runCreateBranch = useCallback(async () => {
    if (!reviewCwd || isAllRepos || !window.sharker?.createGitBranch || acting) return
    setActing(true)
    setError(null)
    try {
      const result = await window.sharker.createGitBranch(reviewCwd, branchName)
      if (!result.ok) {
        setError(result.error || '创建分支失败')
        return
      }
      setBranchName('')
      setCommitHint(`已创建分支 ${result.branch}`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(false)
    }
  }, [acting, branchName, isAllRepos, refresh, reviewCwd])

  const runCreatePr = useCallback(async () => {
    if (!reviewCwd || isAllRepos || !window.sharker?.createGitPullRequest || acting) return
    setActing(true)
    setError(null)
    setCommitHint(null)
    try {
      const title = prTitle.trim() || commitMessage.trim()
      const result = await window.sharker.createGitPullRequest(reviewCwd, {
        title,
        body: commitMessage.trim() && prTitle.trim() ? commitMessage.trim() : undefined,
        base: branchBase ?? undefined
      })
      if (!result.ok) {
        setError(result.error || '创建 PR 失败')
        return
      }
      setPrUrl(result.url)
      setCommitHint('已创建 Pull Request')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(false)
    }
  }, [acting, branchBase, commitMessage, isAllRepos, prTitle, reviewCwd])

  const runPush = useCallback(async () => {
    if (!reviewCwd || isAllRepos || !window.sharker?.pushGitBranch || acting) return
    setActing(true)
    setError(null)
    setCommitHint(null)
    try {
      const result = await window.sharker.pushGitBranch(reviewCwd)
      if (!result.ok) {
        setError(result.error || '推送失败')
        return
      }
      setCommitHint('已推送到上游')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(false)
    }
  }, [acting, isAllRepos, reviewCwd])

  const runInit = useCallback(async () => {
    if (!workspacePath || !window.sharker?.initGitRepository || acting) return
    setActing(true)
    setError(null)
    setCommitHint(null)
    try {
      const result = await window.sharker.initGitRepository(workspacePath)
      if (!result.ok) {
        setError(result.error || '创建仓库失败')
        return
      }
      setCommitHint(`已创建 git 仓库（${result.branch}）`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(false)
    }
  }, [acting, refresh, workspacePath])

  useEffect(() => {
    void refresh({ silent: revision > 0 })
    const id = window.setInterval(() => {
      void refresh({ silent: true })
    }, 2500)
    return () => window.clearInterval(id)
  }, [refresh, revision])

  const visibleKeySig = visible
    .map((file) => reviewDiffKey(file.repoRoot ?? reviewCwd, file.path))
    .join('\n')

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTop = listScrollTopRef.current
  }, [visibleKeySig, revision, expandedKeys.length])

  useEffect(() => {
    if (!window.sharker?.getGitFileDiff) {
      setDiffs({})
      setDiffErrors({})
      setDiffLoadingKeys([])
      return
    }
    const prefetch =
      findOpen && findQuery.trim()
        ? visible.map((file) => reviewDiffKey(file.repoRoot ?? reviewCwd, file.path))
        : []
    const allowed = new Set([...expandedKeys, ...prefetch])
    const legal = new Set(visible.map((file) => reviewDiffKey(file.repoRoot ?? reviewCwd, file.path)))
    const keepCached = (key: string) => allowed.has(key) || (findOpen && legal.has(key))
    setDiffs((prev) => keepRecordKeys(prev, keepCached))
    setDiffErrors((prev) => keepRecordKeys(prev, keepCached))
    const keyList = [...allowed]
    if (keyList.length === 0) {
      setDiffLoadingKeys((prev) => (prev.length === 0 ? prev : []))
      return
    }
    let cancelled = false
    const diffScope = compare === 'branch' ? 'branch' : compare === 'commit' ? 'commit' : scope
    setDiffLoadingKeys((prev) => (sameStringList(prev, keyList) ? prev : keyList))
    void Promise.all(
      keyList.map(async (key) => {
        const parsed = parseReviewDiffKey(key)
        if (!parsed) return
        const file = visible.find(
          (row) =>
            row.path === parsed.path && (row.repoRoot ?? reviewCwd) === parsed.repoRoot
        )
        try {
          const result = await window.sharker.getGitFileDiff(
            parsed.repoRoot,
            parsed.path,
            file?.status ?? 'M',
            diffScope,
            compare === 'commit' ? commitSha : undefined
          )
          if (cancelled || !allowed.has(key)) return
          if (!result.ok || !result.diff) {
            setDiffs((prev) => {
              const next = { ...prev }
              delete next[key]
              return next
            })
            setDiffErrors((prev) => ({ ...prev, [key]: result.error || '无法加载 diff' }))
            return
          }
          setDiffs((prev) => ({ ...prev, [key]: result.diff }))
          setDiffErrors((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
          })
        } catch (e) {
          if (cancelled || !allowed.has(key)) return
          setDiffs((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
          setDiffErrors((prev) => ({
            ...prev,
            [key]: e instanceof Error ? e.message : String(e)
          }))
        }
      })
    ).finally(() => {
      if (!cancelled) setDiffLoadingKeys([])
    })
    return () => {
      cancelled = true
    }
  }, [
    expandedKeys,
    reviewCwd,
    revision,
    scope,
    compare,
    commitSha,
    findOpen,
    findQuery,
    visible
      .map((file) => reviewDiffKey(file.repoRoot ?? reviewCwd, file.path))
      .sort()
      .join('\n')
  ])

  const applyReviewGoToLine = useCallback(() => {
    const preferred =
      lastReviewKeyRef.current && expandedKeys.includes(lastReviewKeyRef.current)
        ? lastReviewKeyRef.current
        : expandedKeys[0]
    if (!preferred) return
    const parsed = parseReviewDiffKey(preferred)
    if (!parsed) return
    const line = parseGoToLineInput(goToDraft, maxDiffGotoLine(diffs[preferred]?.lines))
    if (line == null) return
    dispatchOpenWorkspaceFile({
      path: reviewFileOpenPath(parsed.path, parsed.repoRoot, workspacePath),
      line
    })
    setGoToOpen(false)
  }, [diffs, expandedKeys, goToDraft, workspacePath])

  useEffect(() => {
    if (!expandedKeys.length) setGoToOpen(false)
  }, [expandedKeys.length])

  /** 官方 Go to line：审查聚焦且已展开 diff 时 ⌘L；不抢输入框 / 浏览器 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey || e.shiftKey) return
      if (e.key !== 'l' && e.key !== 'L') return
      if (!expandedKeys.length) return
      const root = panelRef.current
      if (!root) return
      const active = document.activeElement
      const target = e.target
      const inside =
        (active instanceof Node && root.contains(active)) ||
        (target instanceof Node && root.contains(target))
      if (!inside) return
      if (target instanceof HTMLElement) {
        if (target.closest('.composer-box, .embedded-browser, textarea, [contenteditable=true]')) {
          return
        }
        if (target instanceof HTMLInputElement && target !== goToInputRef.current) return
      }
      e.preventDefault()
      e.stopPropagation()
      setGoToOpen(true)
      setGoToDraft('')
      requestAnimationFrame(() => {
        goToInputRef.current?.focus()
        goToInputRef.current?.select()
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [expandedKeys.length])

  const reviewFindFiles = useMemo(
    () =>
      visible.map((file) => {
        const fileKey = reviewDiffKey(file.repoRoot ?? reviewCwd, file.path)
        return { fileKey, filePath: file.path, diff: diffs[fileKey] }
      }),
    [visible, reviewCwd, diffs]
  )
  const findMatches = useMemo(
    () => (findOpen ? findInReviewDiffs(reviewFindFiles, findQuery) : []),
    [findOpen, reviewFindFiles, findQuery]
  )

  useEffect(() => {
    findAnchorRef.current = null
    setFindHit(0)
  }, [findQuery])

  useEffect(() => {
    const anchor = findAnchorRef.current
    if (!anchor || !findMatches.length) return
    const next = findMatches.findIndex((hit) => sameReviewFindMatch(hit, anchor))
    if (next >= 0) {
      if (next !== findHit) setFindHit(next)
      return
    }
    if (findHit >= findMatches.length) setFindHit(0)
  }, [findMatches, findHit])

  const currentFind = findOpen ? findMatches[findHit] : undefined

  useEffect(() => {
    if (!currentFind) return
    findAnchorRef.current = currentFind
    setExpandedKeys((prev) =>
      prev.includes(currentFind.fileKey) ? prev : [...prev, currentFind.fileKey]
    )
    const parsed = parseReviewDiffKey(currentFind.fileKey)
    const root = panelRef.current
    if (!parsed || !root) return
    const row = Array.from(root.querySelectorAll('[data-review-diff-path]')).find(
      (el) =>
        el.getAttribute('data-review-diff-path') === parsed.path &&
        el.getAttribute('data-review-diff-root') === parsed.repoRoot
    )
    row?.scrollIntoView({ block: 'nearest' })
  }, [currentFind?.fileKey, currentFind?.lineIndex, currentFind?.start])

  const openReviewFind = useCallback((selected?: string) => {
    const seeded = seedFindQuery(selected ?? '')
    if (seeded) setFindQuery(seeded)
    setFindOpen(true)
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      if (seeded) findInputRef.current?.select()
    })
  }, [])

  const stepReviewFind = useCallback(
    (delta: 1 | -1) => {
      setFindOpen(true)
      if (!findMatches.length) return
      setFindHit((index) => {
        const next = wrapFindIndex(index, findMatches.length, delta)
        const hit = findMatches[next]
        if (hit) findAnchorRef.current = hit
        return next
      })
    },
    [findMatches]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const focusInsideReview =
        isReviewFindFocus(event.target) || isReviewFindFocus(document.activeElement)
      if (!shouldHandleReviewFindShortcut({ focusInsideReview })) return
      if (event.target instanceof HTMLElement) {
        if (event.target.closest('.composer-box, .embedded-browser, .embedded-terminal')) return
      }
      const mod = event.metaKey || event.ctrlKey
      const findOpenKey = mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f'
      const findNextKey =
        event.key === 'F3' || (mod && !event.altKey && (event.key === 'g' || event.key === 'G'))
      if (!findOpenKey && !findNextKey) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (findOpenKey) {
        const selected =
          event.target instanceof HTMLElement && event.target.closest('.changes-panel__find')
            ? ''
            : window.getSelection()?.toString() ?? ''
        openReviewFind(selected)
        return
      }
      stepReviewFind(event.shiftKey ? -1 : 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [openReviewFind, stepReviewFind])

  useEffect(() => {
    if (!fileMenu) return
    const close = () => setFileMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    const onDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.changes-panel__file-menu')) return
      close()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [fileMenu])

  if (!workspacePath) {
    return (
      <div className="changes-panel changes-panel--empty" ref={panelRef} tabIndex={-1}>
        <p>请先选择工作区</p>
      </div>
    )
  }

  const emptyCopy =
    compare === 'last_turn'
      ? lastTurnPaths.length === 0
        ? '本轮还没有改文件'
        : '本轮改动已提交或不在工作区'
      : compare === 'commit'
        ? commitSha
          ? '这个 commit 没有文件变更'
          : '没有可预览的 commit'
        : compare === 'branch'
        ? branchBase
          ? `相对 ${branchBase} 没有已提交变更`
          : '无法检测基线分支（main / master）'
        : scope === 'staged'
          ? '没有已暂存变更'
          : '没有未暂存变更'

  return (
    <div className="changes-panel" ref={panelRef} tabIndex={-1}>
      <div className="changes-panel__head">
        <div className="changes-panel__title">
          <FileDiff size={15} aria-hidden />
          <span>审查</span>
          {isRepo && !isAllRepos && branch ? (
            <span className="changes-panel__branch" title={branch}>
              <GitBranch size={12} aria-hidden />
              {branch}
            </span>
          ) : null}
          {visible.length > 0 ? (
            <span className="changes-panel__count">{visible.length}</span>
          ) : null}
        </div>
        <div className="changes-panel__head-actions">
          {visible.length > 0 ? (
            <button
              type="button"
              className="changes-panel__refresh"
              title={expandedKeys.length === visible.length ? '收起全部 diff' : '展开全部 diff'}
              aria-label={expandedKeys.length === visible.length ? '收起全部 diff' : '展开全部 diff'}
              onClick={() => {
                const all = expandAllReviewDiffKeys(visible, reviewCwd)
                setExpandedKeys((prev) =>
                  prev.length === all.length && all.every((key) => prev.includes(key)) ? [] : all
                )
              }}
            >
              {expandedKeys.length === visible.length ? '收起全部' : '展开全部'}
            </button>
          ) : null}
          <button
            type="button"
            className={`changes-panel__refresh${findOpen ? ' is-pressed' : ''}`}
            title="在审查中查找"
            aria-label="在审查中查找"
            aria-pressed={findOpen}
            onClick={() => {
              if (findOpen) {
                setFindOpen(false)
                return
              }
              openReviewFind(window.getSelection()?.toString() ?? '')
            }}
          >
            <Search size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={`changes-panel__refresh changes-panel__wrap${wrapLines ? ' is-pressed' : ''}`}
            aria-pressed={wrapLines}
            title={wrapLines ? '不换行长 diff' : '换行长 diff'}
            aria-label={wrapLines ? '关闭长 diff 换行' : '换行长 diff'}
            onClick={() => {
              setWrapLines((on) => {
                const next = !on
                try {
                  localStorage.setItem('sharker-diff-wrap', next ? '1' : '0')
                } catch {
                  /* ignore quota / private mode */
                }
                return next
              })
            }}
          >
            换行
          </button>
          <button
            type="button"
            className="changes-panel__refresh"
            onClick={() => void refresh()}
            disabled={loading || acting}
            title="刷新"
            aria-label="刷新变更列表"
          >
            <RefreshCw size={14} className={loading ? 'is-spinning' : undefined} aria-hidden />
          </button>
        </div>
      </div>
      {findOpen ? (
        <div className="changes-panel__find review-find glass-pill" role="search">
          <input
            ref={findInputRef}
            className="changes-panel__find-input"
            value={findQuery}
            placeholder="查找审查…"
            aria-label="在审查中查找"
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setFindOpen(false)
                panelRef.current?.focus()
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                stepReviewFind(event.shiftKey ? -1 : 1)
              }
            }}
          />
          <span className="changes-panel__find-count">
            {findQuery.trim()
              ? findMatches.length
                ? `${findHit + 1}/${findMatches.length}`
                : '无结果'
              : ''}
          </span>
          <button
            type="button"
            className="changes-panel__find-nav"
            disabled={findMatches.length === 0}
            onClick={() => stepReviewFind(-1)}
            aria-label="上一条"
          >
            ↑
          </button>
          <button
            type="button"
            className="changes-panel__find-nav"
            disabled={findMatches.length === 0}
            onClick={() => stepReviewFind(1)}
            aria-label="下一条"
          >
            ↓
          </button>
          <button
            type="button"
            className="changes-panel__find-nav"
            onClick={() => setFindOpen(false)}
            aria-label="关闭查找"
          >
            ×
          </button>
        </div>
      ) : null}
      {goToOpen ? (
        <form
          className="changes-panel__goto glass-pill"
          onSubmit={(event) => {
            event.preventDefault()
            applyReviewGoToLine()
          }}
        >
          <label className="changes-panel__goto-label">
            行
            <input
              ref={goToInputRef}
              className="changes-panel__goto-input"
              inputMode="numeric"
              value={goToDraft}
              onChange={(event) => setGoToDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  setGoToOpen(false)
                  panelRef.current?.focus()
                }
              }}
              aria-label="跳到行"
              placeholder="行号"
            />
          </label>
          <button type="submit" className="changes-panel__goto-go">
            跳转
          </button>
        </form>
      ) : null}

      {showRepoSelector ? (
        <label className="changes-panel__commit-pick">
          <span className="changes-panel__commit-pick-label">仓库</span>
          <select
            className="changes-panel__commit-select"
            value={effectiveRepoId}
            onChange={(event) => setRepoId(event.target.value)}
            aria-label="选择要审查的仓库"
          >
            {compare === 'last_turn' ? (
              <option value={ALL_REPOS_ID}>
                全部仓库
                {formatReviewLineStats(allRepoStats.added, allRepoStats.removed)
                  ? `  ${formatReviewLineStats(allRepoStats.added, allRepoStats.removed)}`
                  : ''}
              </option>
            ) : (
              gitRepos.map((repo) => {
                const stats = formatReviewLineStats(repo.added, repo.removed)
                return (
                  <option key={repo.root} value={repo.root} title={repo.root}>
                    {repo.label}
                    {stats ? `  ${stats}` : ''}
                  </option>
                )
              })
            )}
          </select>
        </label>
      ) : null}

      {isRepo && !isAllRepos && branch === 'HEAD' ? (
        <form
          className="changes-panel__commit"
          onSubmit={(e) => {
            e.preventDefault()
            void runCreateBranch()
          }}
        >
          <input
            className="changes-panel__commit-input"
            value={branchName}
            placeholder={
              formatBranchPrefix(gitBranchPrefix)
                ? `在此创建分支（${formatBranchPrefix(gitBranchPrefix)}…）`
                : '在此创建分支（隔离 worktree）'
            }
            aria-label="新分支名"
            disabled={acting}
            onChange={(e) => setBranchName(e.target.value)}
          />
          <button type="submit" className="changes-panel__action" disabled={acting || !branchName.trim()}>
            创建分支
          </button>
        </form>
      ) : null}

      {prContext ? (
        <div className="changes-panel__comments-bar">
          <span>
            PR #{prContext.number} · {prContext.comments.length} 条 GitHub 评论
          </span>
          {prContext.url ? (
            <button
              type="button"
              className="changes-panel__action"
              onClick={() => void window.sharker.openExternal?.(prContext.url)}
            >
              打开
            </button>
          ) : null}
          {prContext.comments.length > 0 && onSendComments ? (
            <button
              type="button"
              className="changes-panel__action"
              onClick={() => onSendComments(formatPrCommentsPrompt(prContext))}
            >
              处理评论
            </button>
          ) : null}
        </div>
      ) : null}

      {isRepo ? (
        <div className="changes-panel__compare" role="tablist" aria-label="对比范围">
          <button
            type="button"
            role="tab"
            aria-selected={compare === 'uncommitted'}
            className={`changes-panel__scope${compare === 'uncommitted' ? ' is-active' : ''}`}
            onClick={() => setCompare('uncommitted')}
          >
            未提交
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compare === 'last_turn'}
            className={`changes-panel__scope${compare === 'last_turn' ? ' is-active' : ''}`}
            onClick={() => {
              setRepoId(ALL_REPOS_ID)
              setCompare('last_turn')
            }}
          >
            本轮
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compare === 'branch'}
            className={`changes-panel__scope${compare === 'branch' ? ' is-active' : ''}`}
            onClick={() => setCompare('branch')}
          >
            分支{branchBase ? ` · ${branchBase}` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compare === 'commit'}
            className={`changes-panel__scope${compare === 'commit' ? ' is-active' : ''}`}
            onClick={() => setCompare('commit')}
          >
            提交
          </button>
        </div>
      ) : null}

      {isRepo && compare === 'commit' ? (
        <label className="changes-panel__commit-pick">
          <span className="changes-panel__commit-pick-label">Commit</span>
          <select
            className="changes-panel__commit-select"
            value={commitSha}
            onChange={(event) => setCommitSha(event.target.value)}
            aria-label="选择要审查的 commit"
          >
            {commits.length === 0 ? <option value="">没有提交</option> : null}
            {commits.map((item) => (
              <option key={item.sha} value={item.sha}>
                {item.sha.slice(0, 7)} {item.subject}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {isRepo && !readOnly && !isAllRepos && files.length > 0 && compare === 'uncommitted' ? (
        <div className="changes-panel__toolbar">
          <div className="changes-panel__scopes" role="tablist" aria-label="暂存范围">
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'unstaged'}
              className={`changes-panel__scope${scope === 'unstaged' ? ' is-active' : ''}`}
              onClick={() => setScope('unstaged')}
            >
              未暂存
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'staged'}
              className={`changes-panel__scope${scope === 'staged' ? ' is-active' : ''}`}
              onClick={() => setScope('staged')}
            >
              已暂存
            </button>
          </div>
          <div className="changes-panel__bulk">
            {scope === 'unstaged' ? (
              <button
                type="button"
                className="changes-panel__action"
                disabled={acting || visible.length === 0}
                onClick={() => void runAction('stage')}
              >
                全部暂存
              </button>
            ) : (
              <button
                type="button"
                className="changes-panel__action"
                disabled={acting || visible.length === 0}
                onClick={() => void runAction('unstage')}
              >
                全部取消暂存
              </button>
            )}
            <button
              type="button"
              className="changes-panel__action changes-panel__action--danger"
              disabled={acting || visible.length === 0}
              onClick={() =>
                void runAction(
                  'revert',
                  visible.map((f) => f.path)
                )
              }
            >
              全部还原
            </button>
          </div>
        </div>
      ) : null}

      {isRepo && !readOnly && !isAllRepos ? (
        <form
          className="changes-panel__commit"
          onSubmit={(e) => {
            e.preventDefault()
            void runCommit()
          }}
        >
          <input
            className="changes-panel__commit-input"
            value={commitMessage}
            placeholder="提交说明"
            aria-label="提交说明"
            disabled={acting}
            onChange={(e) => setCommitMessage(e.target.value)}
          />
          <button
            type="submit"
            className="changes-panel__action"
            disabled={acting || stagedCount === 0 || !commitMessage.trim()}
          >
            提交{stagedCount ? ` ${stagedCount}` : ''}
          </button>
          <button
            type="button"
            className="changes-panel__action"
            disabled={acting}
            onClick={() => void runPush()}
          >
            推送
          </button>
        </form>
      ) : null}

      {isRepo && !readOnly && !isAllRepos ? (
        <form
          className="changes-panel__commit"
          onSubmit={(e) => {
            e.preventDefault()
            void runCreatePr()
          }}
        >
          <input
            className="changes-panel__commit-input"
            value={prTitle}
            placeholder="PR 标题（可留空，用提交说明）"
            aria-label="Pull Request 标题"
            disabled={acting}
            onChange={(e) => setPrTitle(e.target.value)}
          />
          <button
            type="submit"
            className="changes-panel__action"
            disabled={acting || !(prTitle.trim() || commitMessage.trim())}
          >
            创建 PR
          </button>
        </form>
      ) : null}

      {prUrl ? (
        <p className="changes-panel__hint changes-panel__hint--bar">
          <button
            type="button"
            className="changes-panel__action"
            onClick={() => void window.sharker.openExternal(prUrl)}
          >
            打开 PR
          </button>
          <span className="changes-panel__path" title={prUrl}>
            {prUrl}
          </span>
        </p>
      ) : null}

      {commitHint ? <p className="changes-panel__hint changes-panel__hint--bar">{commitHint}</p> : null}
      {error ? <p className="changes-panel__error">{error}</p> : null}

      {!isRepo ? (
        <div className="changes-panel--empty">
          <p>当前项目还不是 git 仓库</p>
          <p className="changes-panel__hint">审查需要 Git。创建后即可看未提交、本轮与分支变更。</p>
          <button
            type="button"
            className="changes-panel__action"
            disabled={acting || !workspacePath}
            onClick={() => void runInit()}
          >
            创建仓库
          </button>
        </div>
      ) : compare !== 'branch' && taggedRepoFiles.length === 0 && compare === 'uncommitted' ? (
        <div className="changes-panel--empty">
          <p>工作区干净，无未提交变更</p>
          <p className="changes-panel__hint">Agent 改文件后，点文件名打开预览，点行背景展开 diff</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="changes-panel--empty">
          <p>{emptyCopy}</p>
        </div>
      ) : (
        <div className="changes-panel__body">
          <ul
            className="changes-panel__list"
            role="listbox"
            aria-label="变更文件"
            ref={listRef}
            onScroll={(event) => {
              listScrollTopRef.current = event.currentTarget.scrollTop
            }}
          >
            {visible.map((f) => {
              const gitRoot = f.repoRoot ?? reviewCwd
              const openPath = reviewFileOpenPath(f.path, gitRoot, workspacePath)
              const displayPath = isAllRepos ? openPath : f.path
              const key = reviewDiffKey(gitRoot, f.path)
              const expanded = expandedKeys.includes(key)
              const fileDiff = diffs[key]
              const fileError = diffErrors[key]
              const fileLoading = diffLoadingKeys.includes(key)
              return (
              <li
                key={key}
                data-review-diff-path={f.path}
                data-review-diff-root={gitRoot}
              >
                <div className={`changes-panel__row${expanded ? ' is-selected' : ''}`}>
                  <button
                    type="button"
                    className="changes-panel__item"
                    title="展开或收起 diff · 右键打开"
                    aria-selected={expanded}
                    aria-expanded={expanded}
                    onClick={(e) => {
                      const intent = resolveReviewFileClick(reviewFileClickTargetFromElement(e.target))
                      if (intent === 'open') {
                        dispatchOpenWorkspaceFile({ path: openPath })
                        return
                      }
                      lastReviewKeyRef.current = key
                      setExpandedKeys((prev) => toggleReviewDiffKey(prev, key))
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      lastReviewKeyRef.current = key
                      const next = clampReviewMenuPosition(
                        event.clientX,
                        event.clientY,
                        { width: 168, height: 76 },
                        { width: window.innerWidth, height: window.innerHeight }
                      )
                      setFileMenu({
                        fileKey: key,
                        openPath,
                        expanded,
                        x: next.x,
                        y: next.y
                      })
                    }}
                  >
                    <span className={`changes-panel__status status-${f.status.trim().charAt(0) || 'M'}`}>
                      {statusLabel(f)}
                    </span>
                    <span className="changes-panel__path" data-review-file-name title={`${openPath} · 打开预览`}>
                      {displayPath}
                    </span>
                  </button>
                  {!readOnly ? (
                    <div className="changes-panel__row-actions">
                      {isUnstaged(f) ? (
                        <button
                          type="button"
                          className="changes-panel__action"
                          disabled={acting}
                          onClick={() => void runAction('stage', [f.path], gitRoot)}
                        >
                          暂存
                        </button>
                      ) : null}
                      {isStaged(f) ? (
                        <button
                          type="button"
                          className="changes-panel__action"
                          disabled={acting}
                          onClick={() => void runAction('unstage', [f.path], gitRoot)}
                        >
                          取消暂存
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="changes-panel__action changes-panel__action--danger"
                        disabled={acting}
                        onClick={() => void runAction('revert', [f.path], gitRoot)}
                      >
                        还原
                      </button>
                    </div>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="changes-panel__diff">
                    {fileLoading && !fileDiff ? (
                      <p className="changes-panel__hint">正在加载 diff…</p>
                    ) : fileError ? (
                      <p className="changes-panel__error">{fileError}</p>
                    ) : fileDiff ? (
                      <CodeDiffBlock
                        diff={fileDiff}
                        defaultExpanded
                        showHeader
                        wrapLines={wrapLines}
                        findQuery={findOpen ? findQuery : undefined}
                        findLineIndex={currentFind?.fileKey === key ? currentFind.lineIndex : -1}
                        findStart={currentFind?.fileKey === key ? currentFind.start : undefined}
                        onOpenLine={(line) =>
                          dispatchOpenWorkspaceFile({
                            path: openPath,
                            line
                          })
                        }
                        review={{
                          scope: readOnly ? 'unstaged' : scope,
                          acting,
                          readOnly,
                          comments: comments.filter((c) => c.path === f.path),
                          onHunkAction: readOnly
                            ? undefined
                            : (hunk, action) => void runHunkAction(f, hunk, action),
                          onAddComment: (comment) =>
                            setComments((prev) => [
                              ...prev,
                              { ...comment, id: crypto.randomUUID(), path: f.path }
                            ])
                        }}
                      />
                    ) : (
                      <p className="changes-panel__hint">正在加载 diff…</p>
                    )}
                  </div>
                ) : null}
              </li>
              )
            })}
          </ul>
          {comments.length > 0 && onSendComments ? (
            <div className="changes-panel__comments-bar">
              <span>{comments.length} 条行内评论</span>
              <button
                type="button"
                className="changes-panel__action"
                onClick={() => {
                  onSendComments(formatReviewCommentsPrompt(comments))
                }}
              >
                插入输入框
              </button>
              {prContext && window.sharker.postPullRequestReview ? (
                <button
                  type="button"
                  className="changes-panel__action"
                  disabled={acting || localCommentsForGithub(comments).length === 0}
                  onClick={() => {
                    void (async () => {
                      if (!reviewCwd || isAllRepos) return
                      setActing(true)
                      setError(null)
                      try {
                        const result = await window.sharker.postPullRequestReview(
                          reviewCwd,
                          comments
                        )
                        if (!result.ok) {
                          setError(result.error || '发布到 GitHub 失败')
                          return
                        }
                        setCommitHint(`已发布 ${result.posted} 条评论到 PR #${prContext.number}`)
                        setComments((prev) => prev.filter((c) => String(c.id).startsWith('gh-')))
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e))
                      } finally {
                        setActing(false)
                      }
                    })()
                  }}
                >
                  发布到 GitHub
                </button>
              ) : null}
              <button
                type="button"
                className="changes-panel__action"
                onClick={() => setComments([])}
              >
                清空
              </button>
            </div>
          ) : null}
        </div>
      )}
      {fileMenu ? (
        <div
          className="changes-panel__file-menu glass-popover popover-enter"
          role="menu"
          style={{ top: fileMenu.y, left: fileMenu.x }}
        >
          {reviewFileMenuItems(fileMenu.expanded).map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className="changes-panel__file-menu-item"
              onClick={() => {
                if (item.action === 'open') {
                  dispatchOpenWorkspaceFile({ path: fileMenu.openPath })
                } else {
                  lastReviewKeyRef.current = fileMenu.fileKey
                  setExpandedKeys((prev) => toggleReviewDiffKey(prev, fileMenu.fileKey))
                }
                setFileMenu(null)
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
})
