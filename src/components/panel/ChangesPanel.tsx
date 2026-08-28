/**
 * 右侧「变更」审查：对比范围 + 文件/hunk 动作 + 提交推送（对标 Codex Review）。
 * @see ./ARCH.md
 */
import { useCallback, useEffect, useState } from 'react'
import { FileDiff, GitBranch, RefreshCw } from 'lucide-react'
import type { FileDiff as FileDiffModel } from '../../../shared/types'
import { buildHunkPatch, type DiffHunk } from '../../../shared/diff-hunk'
import type { GitReviewAction } from '../../../shared/git-review-actions'
import { fileInLastTurn, type GitCommitRef } from '../../../shared/git-compare'
import {
  formatReviewCommentsPrompt,
  type ReviewLineComment
} from '../../../shared/review-comment'
import {
  formatPrCommentsPrompt,
  type PullRequestContext
} from '../../../shared/git-pr-context'
import { localCommentsForGithub } from '../../../shared/git-pr-review'
import { isDeletedGitChange, isNewGitChange } from '../../../shared/git-change-diff'
import { formatBranchPrefix } from '../../../shared/git-branch-create'
import { CodeDiffBlock } from '../CodeDiffBlock'
import './ChangesPanel.css'

interface ChangeFile {
  status: string
  path: string
  raw: string
  staged?: boolean
  unstaged?: boolean
  untracked?: boolean
}

type CompareMode = 'uncommitted' | 'last_turn' | 'branch' | 'commit'
type ReviewScope = 'unstaged' | 'staged'

interface Props {
  workspacePath: string
  /** 工具写盘后递增，立刻刷新审查列表 */
  revision?: number
  /** 上一轮助手写过的相对路径（Codex Last turn） */
  lastTurnPaths?: string[]
  /** 把行内评论派发给当前对话 */
  onSendComments?: (prompt: string) => void
  /** `/review` 解析出的行内发现 */
  agentFindings?: ReviewLineComment[]
  /** 审查队列接受后预填提交说明 */
  suggestedCommit?: string
  /** Settings → Git 分支名前缀（占位提示；真正加前缀在主进程） */
  gitBranchPrefix?: string
  /** `/review` 打开时切到对应对比（对标 Codex Review a commit / branch） */
  reviewFocus?: { mode: CompareMode; sha?: string; token: number } | null
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

/** Codex 式变更审查：对比范围 + 当前文件 diff + Git 动作 */
export function ChangesPanel({
  workspacePath,
  revision = 0,
  lastTurnPaths = [],
  onSendComments,
  agentFindings = [],
  suggestedCommit = '',
  gitBranchPrefix = '',
  reviewFocus = null
}: Props) {
  const [branch, setBranch] = useState('')
  const [isRepo, setIsRepo] = useState(true)
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
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<FileDiffModel | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [comments, setComments] = useState<ReviewLineComment[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [commitHint, setCommitHint] = useState<string | null>(null)
  const [prTitle, setPrTitle] = useState('')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [prContext, setPrContext] = useState<PullRequestContext | null>(null)

  useEffect(() => {
    if (!agentFindings.length) return
    setComments((prev) => {
      const keys = new Set(prev.map((c) => `${c.path}:${c.line}:${c.text}`))
      const extra = agentFindings.filter((f) => !keys.has(`${f.path}:${f.line}:${f.text}`))
      return extra.length ? [...prev, ...extra] : prev
    })
  }, [agentFindings])

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

  const sourceFiles = compare === 'branch' ? branchFiles : compare === 'commit' ? commitFiles : files
  const readOnly = compare === 'branch' || compare === 'commit'
  const visible = sourceFiles.filter((f) => {
    if (compare === 'last_turn') return fileInLastTurn(f.path, lastTurnPaths)
    if (compare === 'branch') return true
    return scope === 'staged' ? isStaged(f) : isUnstaged(f)
  })
  const stagedCount = files.filter(isStaged).length

  const refresh = useCallback(async () => {
    if (!workspacePath || !window.sharker?.getGitStatusChanges) {
      setIsRepo(false)
      setFiles([])
      setBranchFiles([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.sharker.getGitStatusChanges(workspacePath)
      setIsRepo(result.isRepo)
      setBranch(result.branch)
      setFiles(result.files)
      if (window.sharker.getGitBranchChanges) {
        const branchResult = await window.sharker.getGitBranchChanges(workspacePath)
        setBranchBase(branchResult.base)
        setBranchFiles(branchResult.files)
        if (compare === 'branch') {
          setSelectedPath((prev) => {
            if (prev && branchResult.files.some((f) => f.path === prev)) return prev
            return branchResult.files[0]?.path ?? null
          })
        }
      }
      if (compare === 'commit' && window.sharker.getGitCommitChanges) {
        const commitResult = await window.sharker.getGitCommitChanges(workspacePath, commitSha)
        setCommits(commitResult.commits)
        setCommitSha(commitResult.sha)
        setCommitFiles(commitResult.files)
        if (compare === 'commit') {
          setSelectedPath((prev) => {
            if (prev && commitResult.files.some((f) => f.path === prev)) return prev
            return commitResult.files[0]?.path ?? null
          })
        }
      }
      if (compare !== 'branch' && compare !== 'commit') {
        setSelectedPath((prev) => {
          const nextList = result.files.filter((f) => {
            if (compare === 'last_turn') return fileInLastTurn(f.path, lastTurnPaths)
            return scope === 'staged' ? isStaged(f) : isUnstaged(f)
          })
          if (prev && nextList.some((f) => f.path === prev)) return prev
          return nextList[0]?.path ?? result.files[0]?.path ?? null
        })
      }
      if (window.sharker.getPullRequestContext) {
        const pr = await window.sharker.getPullRequestContext(workspacePath)
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFiles([])
      setBranchFiles([])
      setCommitFiles([])
    } finally {
      setLoading(false)
    }
  }, [workspacePath, scope, compare, lastTurnPaths, commitSha])

  /** 执行暂存 / 取消暂存 / 还原；还原前确认 */
  const runAction = useCallback(
    async (action: 'stage' | 'unstage' | 'revert', paths?: string[]) => {
      if (!workspacePath || !window.sharker?.applyGitReviewAction || acting || readOnly) return
      if (action === 'revert') {
        const label = paths?.length === 1 ? paths[0] : '全部未提交变更'
        if (!window.confirm(`确定还原 ${label}？此操作不可撤销。`)) return
      }
      setActing(true)
      setError(null)
      try {
        const result = await window.sharker.applyGitReviewAction(workspacePath, action, paths)
        if (!result.ok) setError(result.error || 'Git 操作失败')
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setActing(false)
      }
    },
    [acting, readOnly, refresh, workspacePath]
  )

  /** hunk 级暂存 / 取消暂存 / 还原 */
  const runHunkAction = useCallback(
    async (hunk: DiffHunk, action: GitReviewAction) => {
      if (
        !workspacePath ||
        !selectedPath ||
        !window.sharker?.applyGitHunkAction ||
        acting ||
        readOnly
      ) {
        return
      }
      setActing(true)
      setError(null)
      try {
        const result = await window.sharker.applyGitHunkAction(workspacePath, {
          action,
          path: selectedPath,
          scope,
          patch: buildHunkPatch({
            path: selectedPath,
            hunk,
            isNew: isNewGitChange(files.find((f) => f.path === selectedPath)?.status ?? ''),
            isDeleted: isDeletedGitChange(files.find((f) => f.path === selectedPath)?.status ?? '')
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
    [acting, files, readOnly, refresh, scope, selectedPath, workspacePath]
  )

  const runCommit = useCallback(async () => {
    if (!workspacePath || !window.sharker?.commitGitChanges || acting) return
    setActing(true)
    setError(null)
    setCommitHint(null)
    try {
      const result = await window.sharker.commitGitChanges(workspacePath, commitMessage)
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
  }, [acting, commitMessage, refresh, workspacePath])

  const runCreateBranch = useCallback(async () => {
    if (!workspacePath || !window.sharker?.createGitBranch || acting) return
    setActing(true)
    setError(null)
    try {
      const result = await window.sharker.createGitBranch(workspacePath, branchName)
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
  }, [acting, branchName, refresh, workspacePath])

  const runCreatePr = useCallback(async () => {
    if (!workspacePath || !window.sharker?.createGitPullRequest || acting) return
    setActing(true)
    setError(null)
    setCommitHint(null)
    try {
      const title = prTitle.trim() || commitMessage.trim()
      const result = await window.sharker.createGitPullRequest(workspacePath, {
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
  }, [acting, branchBase, commitMessage, prTitle, workspacePath])

  const runPush = useCallback(async () => {
    if (!workspacePath || !window.sharker?.pushGitBranch || acting) return
    setActing(true)
    setError(null)
    setCommitHint(null)
    try {
      const result = await window.sharker.pushGitBranch(workspacePath)
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
  }, [acting, workspacePath])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, 2500)
    return () => window.clearInterval(id)
  }, [refresh, revision])

  useEffect(() => {
    if (!workspacePath || !selectedPath || !window.sharker?.getGitFileDiff) {
      setDiff(null)
      setDiffError(null)
      return
    }
    const file = sourceFiles.find((f) => f.path === selectedPath)
    let cancelled = false
    setDiffLoading(true)
    setDiffError(null)
    const diffScope = compare === 'branch' ? 'branch' : compare === 'commit' ? 'commit' : scope
    void window.sharker
      .getGitFileDiff(
        workspacePath,
        selectedPath,
        file?.status ?? 'M',
        diffScope,
        compare === 'commit' ? commitSha : undefined
      )
      .then((result) => {
        if (cancelled) return
        if (!result.ok || !result.diff) {
          setDiff(null)
          setDiffError(result.error || '无法加载 diff')
          return
        }
        setDiff(result.diff)
        setDiffError(null)
      })
      .catch((e) => {
        if (!cancelled) {
          setDiff(null)
          setDiffError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sourceFiles, selectedPath, workspacePath, revision, scope, compare, commitSha])

  if (!workspacePath) {
    return (
      <div className="changes-panel changes-panel--empty">
        <p>请先选择工作区</p>
      </div>
    )
  }

  const selected = sourceFiles.find((f) => f.path === selectedPath)
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
    <div className="changes-panel">
      <div className="changes-panel__head">
        <div className="changes-panel__title">
          <FileDiff size={15} aria-hidden />
          <span>审查</span>
          {isRepo && branch ? (
            <span className="changes-panel__branch" title={branch}>
              <GitBranch size={12} aria-hidden />
              {branch}
            </span>
          ) : null}
          {visible.length > 0 ? (
            <span className="changes-panel__count">{visible.length}</span>
          ) : null}
        </div>
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

      {isRepo && branch === 'HEAD' ? (
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
            onClick={() => setCompare('last_turn')}
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

      {isRepo && !readOnly && files.length > 0 && compare === 'uncommitted' ? (
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

      {isRepo && !readOnly ? (
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

      {isRepo && !readOnly ? (
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
          <p>当前工作区不是 git 仓库</p>
          <p className="changes-panel__hint">会话内文件 diff 仍显示在助手消息中</p>
        </div>
      ) : compare !== 'branch' && files.length === 0 && compare === 'uncommitted' ? (
        <div className="changes-panel--empty">
          <p>工作区干净，无未提交变更</p>
          <p className="changes-panel__hint">Agent 改文件后，点左侧文件即可审查 diff</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="changes-panel--empty">
          <p>{emptyCopy}</p>
        </div>
      ) : (
        <div className="changes-panel__body">
          <ul className="changes-panel__list" role="listbox" aria-label="变更文件">
            {visible.map((f) => (
              <li key={`${f.raw}:${f.path}`}>
                <div className={`changes-panel__row${selectedPath === f.path ? ' is-selected' : ''}`}>
                  <button
                    type="button"
                    className="changes-panel__item"
                    title={f.raw}
                    aria-selected={selectedPath === f.path}
                    onClick={() => setSelectedPath(f.path)}
                  >
                    <span className={`changes-panel__status status-${f.status.trim().charAt(0) || 'M'}`}>
                      {statusLabel(f)}
                    </span>
                    <span className="changes-panel__path">{f.path}</span>
                  </button>
                  {!readOnly ? (
                    <div className="changes-panel__row-actions">
                      {isUnstaged(f) ? (
                        <button
                          type="button"
                          className="changes-panel__action"
                          disabled={acting}
                          onClick={() => void runAction('stage', [f.path])}
                        >
                          暂存
                        </button>
                      ) : null}
                      {isStaged(f) ? (
                        <button
                          type="button"
                          className="changes-panel__action"
                          disabled={acting}
                          onClick={() => void runAction('unstage', [f.path])}
                        >
                          取消暂存
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="changes-panel__action changes-panel__action--danger"
                        disabled={acting}
                        onClick={() => void runAction('revert', [f.path])}
                      >
                        还原
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="changes-panel__diff">
            {selected && !readOnly && (isStaged(selected) || isUnstaged(selected)) ? (
              <div className="changes-panel__file-actions">
                {isUnstaged(selected) ? (
                  <button
                    type="button"
                    className="changes-panel__action"
                    disabled={acting}
                    onClick={() => void runAction('stage', [selected.path])}
                  >
                    暂存此文件
                  </button>
                ) : null}
                {isStaged(selected) ? (
                  <button
                    type="button"
                    className="changes-panel__action"
                    disabled={acting}
                    onClick={() => void runAction('unstage', [selected.path])}
                  >
                    取消暂存此文件
                  </button>
                ) : null}
                <button
                  type="button"
                  className="changes-panel__action changes-panel__action--danger"
                  disabled={acting}
                  onClick={() => void runAction('revert', [selected.path])}
                >
                  还原此文件
                </button>
              </div>
            ) : null}
            {diffLoading && !diff ? (
              <p className="changes-panel__hint">正在加载 diff…</p>
            ) : diffError ? (
              <p className="changes-panel__error">{diffError}</p>
            ) : diff ? (
              <>
                <CodeDiffBlock
                  diff={diff}
                  defaultExpanded
                  showHeader
                  review={{
                    scope: readOnly ? 'unstaged' : scope,
                    acting,
                    readOnly,
                    comments: comments.filter((c) => c.path === selectedPath),
                    onHunkAction: readOnly
                      ? undefined
                      : (hunk, action) => void runHunkAction(hunk, action),
                    onAddComment: (comment) =>
                      setComments((prev) => [
                        ...prev,
                        { ...comment, id: crypto.randomUUID() }
                      ])
                  }}
                />
                {comments.length > 0 && onSendComments ? (
                  <div className="changes-panel__comments-bar">
                    <span>{comments.length} 条行内评论</span>
                    <button
                      type="button"
                      className="changes-panel__action"
                      onClick={() => {
                        onSendComments(formatReviewCommentsPrompt(comments))
                        setComments([])
                      }}
                    >
                      发送评论
                    </button>
                    {prContext && window.sharker.postPullRequestReview ? (
                      <button
                        type="button"
                        className="changes-panel__action"
                        disabled={acting || localCommentsForGithub(comments).length === 0}
                        onClick={() => {
                          void (async () => {
                            if (!workspacePath) return
                            setActing(true)
                            setError(null)
                            try {
                              const result = await window.sharker.postPullRequestReview(
                                workspacePath,
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
              </>
            ) : (
              <p className="changes-panel__hint">选择一个文件查看 diff</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
