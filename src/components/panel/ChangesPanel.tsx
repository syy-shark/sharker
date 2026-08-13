/**
 * 右侧「变更」面板：工作区 git status 文件列表（Changes 入口）。
 */
import { useCallback, useEffect, useState } from 'react'
import { FileDiff, GitBranch, RefreshCw } from 'lucide-react'
import './ChangesPanel.css'

interface ChangeFile {
  status: string
  path: string
  raw: string
}

interface Props {
  workspacePath: string
}

function statusLabel(status: string): string {
  const s = status.trim()
  if (s === 'M' || s === 'MM') return '修改'
  if (s === 'A' || s === '??') return s === '??' ? '未跟踪' : '新增'
  if (s === 'D') return '删除'
  if (s.startsWith('R')) return '重命名'
  return s || '变更'
}

/** 展示当前工作区 git 变更（会话内工具 diff 仍在消息流中） */
export function ChangesPanel({ workspacePath }: Props) {
  const [branch, setBranch] = useState('')
  const [isRepo, setIsRepo] = useState(true)
  const [files, setFiles] = useState<ChangeFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [workspacePath])

  useEffect(() => {
    void refresh()
    // 面板打开时轻量轮询，工具改文件后列表不会一直停在旧状态
    const id = window.setInterval(() => {
      void refresh()
    }, 4000)
    return () => window.clearInterval(id)
  }, [refresh])

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
          <span>变更</span>
          {isRepo && branch ? (
            <span className="changes-panel__branch" title={branch}>
              <GitBranch size={12} aria-hidden />
              {branch}
            </span>
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
          <p className="changes-panel__hint">工具写入产生的 diff 在对话消息中预览</p>
        </div>
      ) : (
        <ul className="changes-panel__list">
          {files.map((f) => (
            <li key={f.raw} className="changes-panel__item" title={f.raw}>
              <span className={`changes-panel__status status-${f.status.trim().charAt(0) || 'M'}`}>
                {statusLabel(f.status)}
              </span>
              <span className="changes-panel__path">{f.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
