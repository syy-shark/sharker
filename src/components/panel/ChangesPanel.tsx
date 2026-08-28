/**
 * 右侧「变更」审查：文件列表 + 点选看 unified diff（对标 Codex Review）。
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
}

interface Props {
  workspacePath: string
  /** 工具写盘后递增，立刻刷新审查列表 */
  revision?: number
}

function statusLabel(status: string): string {
  const s = status.trim()
  if (s === 'M' || s === 'MM') return '修改'
  if (s === 'A' || s === '??') return s === '??' ? '未跟踪' : '新增'
  if (s === 'D') return '删除'
  if (s.startsWith('R')) return '重命名'
  return s || '变更'
}

/** Codex 式变更审查：列表 + 当前文件 diff */
export function ChangesPanel({ workspacePath, revision = 0 }: Props) {
  const [branch, setBranch] = useState('')
  const [isRepo, setIsRepo] = useState(true)
  const [files, setFiles] = useState<ChangeFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<FileDiffModel | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

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
        if (prev && result.files.some((f) => f.path === prev)) return prev
        return result.files[0]?.path ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [workspacePath])

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
          disabled={loading}
          title="刷新"
          aria-label="刷新变更列表"
        >
          <RefreshCw size={14} className={loading ? 'is-spinning' : undefined} aria-hidden />
        </button>
      </div>

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
      ) : (
        <div className="changes-panel__body">
          <ul className="changes-panel__list" role="listbox" aria-label="变更文件">
            {files.map((f) => (
              <li key={f.raw}>
                <button
                  type="button"
                  className={`changes-panel__item${selectedPath === f.path ? ' is-selected' : ''}`}
                  title={f.raw}
                  aria-selected={selectedPath === f.path}
                  onClick={() => setSelectedPath(f.path)}
                >
                  <span className={`changes-panel__status status-${f.status.trim().charAt(0) || 'M'}`}>
                    {statusLabel(f.status)}
                  </span>
                  <span className="changes-panel__path">{f.path}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="changes-panel__diff">
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
