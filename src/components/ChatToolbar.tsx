/**
 * 聊天区顶栏：
 * - 左簇（展开/收起 · 新对话）portal 到 body，贴红绿灯右侧，不被 view-enter transform 困住
 * - 右：Hand off / 隔离 worktree / PR / 右侧面板；中间空白拖窗
 * @see src/ARCH.md
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PanelLeft,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  SquarePen,
  AppWindow,
  Share2,
  FolderOpen,
  GitBranch,
  Pin
} from 'lucide-react'
import type { ThreadMode } from '../lib/thread-runtime'
import './ChatToolbar.css'

interface Props {
  rightPanelOpen: boolean
  /** 侧栏是否收起 */
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onToggleRightPanel: () => void
  onNewConversation?: () => void
  /** 弹出当前对话到独立窗（对标 Codex Open in Popup Window） */
  onPopOut?: () => void
  /** 分享只读快照（对标 Codex Share / `/share`） */
  onShare?: () => void
  popout?: boolean
  /** 弹出窗 Always on top（对标 Codex） */
  alwaysOnTop?: boolean
  onToggleAlwaysOnTop?: () => void
  /** 当前分支若已有 PR，顶栏显示芯片并打开审查 */
  prLabel?: string | null
  onOpenPullRequest?: () => void
  /** 隔离 worktree：打开目录 / 在此创建分支（对标 Codex header） */
  worktreePath?: string | null
  onOpenWorktree?: () => void
  onCreateBranchHere?: () => void
  /** 顶栏 Hand off（对标 Codex：header 在 Local / Worktree 之间交接） */
  threadMode?: ThreadMode
  onThreadModeChange?: (mode: ThreadMode) => void
}

/** 挂到 body，用 fixed 相对视口，避免 flex 壳把 absolute 子节点挤到底部 */
function getChromeHost(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.body : null
}

/** 顶栏：左簇始终可点切换侧栏；右为面板 */
export function ChatToolbar({
  rightPanelOpen,
  sidebarCollapsed = false,
  onToggleSidebar,
  onToggleRightPanel,
  onNewConversation,
  onPopOut,
  onShare,
  popout = false,
  alwaysOnTop = false,
  onToggleAlwaysOnTop,
  prLabel = null,
  onOpenPullRequest,
  worktreePath = null,
  onOpenWorktree,
  onCreateBranchHere,
  threadMode = 'local',
  onThreadModeChange
}: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHost(getChromeHost())
  }, [])

  const handleToggleSidebar = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleSidebar?.()
  }

  const leftCluster = (
    <div
      className={[
        'chat-toolbar-left',
        sidebarCollapsed ? 'chat-toolbar-left--collapsed' : 'chat-toolbar-left--expanded'
      ].join(' ')}
    >
      <button
        type="button"
        className="chat-toolbar-icon-btn chat-toolbar-sidebar-toggle"
        onClick={handleToggleSidebar}
        onMouseDown={(e) => e.stopPropagation()}
        title={sidebarCollapsed ? '固定展开边栏 ⌘B' : '收起边栏 ⌘B'}
        aria-label={sidebarCollapsed ? '固定展开边栏' : '收起边栏'}
        aria-pressed={!sidebarCollapsed}
      >
        {sidebarCollapsed ? (
          <PanelLeft size={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="chat-toolbar-icon-btn chat-toolbar-new-chat"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onNewConversation?.()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="新对话 ⌘N"
        aria-label="开启新对话"
      >
        <SquarePen size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )

  return (
    <>
      {/* 挂到 body + position:fixed：永远在视口左上，不被 flex / transform 挤到底部 */}
      {host ? createPortal(leftCluster, host) : null}

      <div
        className={[
          'chat-toolbar',
          sidebarCollapsed ? 'chat-toolbar--sidebar-collapsed' : 'chat-toolbar--sidebar-expanded'
        ].join(' ')}
      >
        <div className="chat-toolbar-drag" aria-hidden />

        <div className="chat-toolbar-right">
          {onThreadModeChange && !popout ? (
            <button
              type="button"
              className="chat-toolbar-pr-chip"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onThreadModeChange(threadMode === 'worktree' ? 'local' : 'worktree')
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={
                threadMode === 'worktree'
                  ? '交接回本地工作区（对标 Codex Hand off）'
                  : '交接进隔离 worktree（对标 Codex Hand off）'
              }
              aria-label={threadMode === 'worktree' ? '交接到本地' : '交接到隔离'}
            >
              {threadMode === 'worktree' ? '交接到本地' : '交接到隔离'}
            </button>
          ) : null}
          {worktreePath && onOpenWorktree && !popout ? (
            <button
              type="button"
              className="chat-toolbar-icon-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenWorktree()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="打开隔离 worktree"
              aria-label="打开隔离 worktree"
            >
              <FolderOpen size={18} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          {worktreePath && onCreateBranchHere && !popout ? (
            <button
              type="button"
              className="chat-toolbar-icon-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCreateBranchHere()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="在此创建分支"
              aria-label="在隔离 worktree 上创建分支"
            >
              <GitBranch size={18} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          {prLabel && onOpenPullRequest && !popout ? (
            <button
              type="button"
              className="chat-toolbar-pr-chip"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenPullRequest()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="打开审查中的 Pull Request"
              aria-label={`打开 ${prLabel}`}
            >
              {prLabel}
            </button>
          ) : null}
          {onShare && !popout ? (
            <button
              type="button"
              className="chat-toolbar-icon-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onShare()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="分享只读快照"
              aria-label="分享只读快照"
            >
              <Share2 size={18} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          {onPopOut && !popout ? (
            <button
              type="button"
              className="chat-toolbar-icon-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onPopOut()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="弹出当前对话"
              aria-label="弹出当前对话"
            >
              <AppWindow size={18} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          {popout ? (
            <>
              <button
                type="button"
                className={`chat-toolbar-icon-btn${alwaysOnTop ? ' chat-toolbar-icon-btn--on' : ''}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onToggleAlwaysOnTop?.()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={alwaysOnTop ? '取消置顶' : '窗口置顶'}
                aria-label={alwaysOnTop ? '取消置顶' : '窗口置顶'}
                aria-pressed={alwaysOnTop}
              >
                <Pin size={18} strokeWidth={1.75} aria-hidden />
              </button>
              <span className="chat-toolbar-popout-label">弹出对话</span>
            </>
          ) : (
          <button
            type="button"
            className={`panel-rail-toggle ${rightPanelOpen ? 'panel-rail-toggle--open' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleRightPanel()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={rightPanelOpen ? '收起右侧面板' : '展开右侧面板'}
            title={
              rightPanelOpen
                ? '收起面板'
                : '展开：文件 / 审查 ⌘⌥B / 面板 ⌘J / 终端 Ctrl+` · 命令 ⌘K'
            }
          >
            {rightPanelOpen ? (
              <PanelRightClose size={18} aria-hidden />
            ) : (
              <PanelRightOpen size={18} aria-hidden />
            )}
          </button>
          )}
        </div>
      </div>
    </>
  )
}
