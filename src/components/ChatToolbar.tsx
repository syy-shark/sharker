/**
 * 聊天区顶栏：Git 分支切换 + 右上角面板展开按钮（Codex 风格）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import './ChatToolbar.css'

interface GitInfo {
  branch: string
  isRepo: boolean
  dirty?: boolean
}

interface Props {
  gitInfo: GitInfo | null
  workspacePath: string
  rightPanelOpen: boolean
  onToggleRightPanel: () => void
  onRefreshGit?: () => void
  onCheckoutBranch?: (branch: string) => Promise<void>
}

/** 顶栏：分支名 + 右侧展开/收起 */
export function ChatToolbar({
  gitInfo,
  workspacePath,
  rightPanelOpen,
  onToggleRightPanel,
  onRefreshGit,
  onCheckoutBranch
}: Props) {
  const [branchOpen, setBranchOpen] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [branchBusy, setBranchBusy] = useState(false)
  const [branchMsg, setBranchMsg] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const loadBranches = useCallback(async () => {
    if (!workspacePath || !window.sharker?.listGitBranches) return
    const res = await window.sharker.listGitBranches(workspacePath)
    if (res.isRepo) setBranches(res.branches)
  }, [workspacePath])

  useEffect(() => {
    if (!branchOpen) return
    void loadBranches()
  }, [branchOpen, loadBranches])

  useEffect(() => {
    if (!branchOpen) return
    const onDoc = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setBranchOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [branchOpen])

  const handleCheckout = async (branch: string) => {
    if (!onCheckoutBranch || branch === gitInfo?.branch) {
      setBranchOpen(false)
      return
    }
    setBranchBusy(true)
    setBranchMsg('')
    try {
      await onCheckoutBranch(branch)
      onRefreshGit?.()
      setBranchOpen(false)
    } catch (e) {
      setBranchMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBranchBusy(false)
    }
  }

  return (
    <div className="chat-toolbar">
      <div className="chat-toolbar-left">
        {gitInfo?.isRepo ? (
          <div className="git-branch-wrap" ref={popoverRef}>
            <button
              type="button"
              className={`git-branch-chip ${branchOpen ? 'git-branch-chip--open' : ''}`}
              onClick={() => setBranchOpen((o) => !o)}
              aria-expanded={branchOpen}
              aria-haspopup="listbox"
              title="切换 Git 分支"
            >
              <span className="git-branch-icon" aria-hidden>
                ⎇
              </span>
              {gitInfo.branch}
              {gitInfo.dirty ? <span className="git-branch-dirty">*</span> : null}
            </button>
            {branchOpen ? (
              <div className="git-branch-popover" role="listbox" aria-label="分支列表">
                {branchMsg ? <p className="git-branch-popover-msg git-branch-popover-msg--err">{branchMsg}</p> : null}
                {branches.length === 0 ? (
                  <p className="git-branch-popover-msg">加载分支…</p>
                ) : (
                  <ul className="git-branch-list">
                    {branches.map((b) => (
                      <li key={b}>
                        <button
                          type="button"
                          className={`git-branch-item ${b === gitInfo.branch ? 'git-branch-item--active' : ''}`}
                          disabled={branchBusy}
                          onClick={() => void handleCheckout(b)}
                        >
                          {b}
                          {b === gitInfo.branch ? <span className="git-branch-item-check">✓</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={`panel-rail-toggle ${rightPanelOpen ? 'panel-rail-toggle--open' : ''}`}
        onClick={onToggleRightPanel}
        aria-label={rightPanelOpen ? '收起右侧面板' : '展开右侧面板'}
        title={rightPanelOpen ? '收起面板' : '展开：文件 / 终端 / 浏览器'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15 4v16" stroke="currentColor" strokeWidth="1.5" />
          {rightPanelOpen ? (
            <path d="M17 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M17 10h3M17 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
      </button>
    </div>
  )
}

export type { GitInfo }
