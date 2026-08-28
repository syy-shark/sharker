/**
 * 右侧「变更」审查：文件列表 + 点选 unified diff + 暂存/还原（对标 Codex Review）。
 * @see ./ARCH.md
 */
import { useCallback, useEffect, useState } from 'react'
import { FileDiff, GitBranch, RefreshCw } from 'lucide-react'
import type { FileDiff as FileDiffModel } from '../../../shared/types'
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

type ReviewScope = 'unstaged' | 'staged'

interface Props {
  workspacePath: string
  /** 工具写盘后递增，立刻刷新审查列表 */
  revision?: number
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

/** Codex 式变更审查：列表 + 当前文件 diff + 文件级 Git 动作 */
export function ChangesPanel({ workspacePath, revision = 0 }: Props) {
  const [branch, setBranch] = useState('')
  const [isRepo, setIsRepo] = useState(true)
  const [files, setFiles] = useState<ChangeFile[]>([])
  const [scope, setScope] = useState<ReviewScope>('unstaged')
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<FileDiffModel | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const visible = files.filter((f) => (scope === 'staged' ? isStaged(f) : isUnstaged(f)))

  const refresh = useCallback(async () => {
    if (!workspacePath || !window.sharker?.getGitStatusChanges) {
      setIsRepo(false)
      setFiles([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.sharker.getGitStatusChanges(workspacePath)
      setIsRepo(result.isRepo)
      setBranch(result.branch)
      setFiles(result.files)
      setSelectedPath((prev) => {
        const nextList = result.files.filter((f) =>
          scope === 'staged' ? isStaged(f) : isUnstaged(f)
        )
        if (prev && nextList.some((f) => f.path === prev)) return prev
        return nextList[0]?.path ?? result.files[0]?.path ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [workspacePath, scope])

  /** 执行暂存 / 取消暂存 / 还原；还原前确认 */
  const runAction = useCallback(
    async (action: 'stage' | 'unstage' | 'revert', paths?: string[]) => {
      if (!workspacePath || !window.sharker?.applyGitReviewAction || acting) return
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
    [acting, refresh, workspacePath]
  )

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
    const file = files.find((f) => f.path === selectedPath)
    let cancelled = false
    setDiffLoading(true)
    setDiffError(null)
    void window.sharker
      .getGitFileDiff(workspacePath, selectedPath, file?.status ?? 'M')
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
  }, [files, selectedPath, workspacePath, revision])

  if (!workspacePath) {
    return (
      <div className="changes-panel changes-panel--empty">
        <p>请先选择工作区</p>
      </div>
    )
  }

  const selected = files.find((f) => f.path === selectedPath)

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
          {files.length > 0 ? (
            <span className="changes-panel__count">{files.length}</span>
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

      {isRepo && files.length > 0 ? (
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

      {error ? <p className="changes-panel__error">{error}</p> : null}

      {!isRepo ? (
        <div className="changes-panel--empty">
          <p>当前工作区不是 git 仓库</p>
          <p className="changes-panel__hint">会话内文件 diff 仍显示在助手消息中</p>
        </div>
      ) : files.length === 0 ? (
        <div className="changes-panel--empty">
          <p>工作区干净，无未提交变更</p>
          <p className="changes-panel__hint">Agent 改文件后，点左侧文件即可审查 diff</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="changes-panel--empty">
          <p>{scope === 'staged' ? '没有已暂存变更' : '没有未暂存变更'}</p>
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
                </div>
              </li>
            ))}
          </ul>
          <div className="changes-panel__diff">
            {selected && (isStaged(selected) || isUnstaged(selected)) ? (
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
              <CodeDiffBlock diff={diff} defaultExpanded showHeader />
            ) : (
              <p className="changes-panel__hint">选择一个文件查看 diff</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
