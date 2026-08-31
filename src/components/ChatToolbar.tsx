/**
 * 聊天区顶栏：
 * - 左簇（展开/收起 · 新对话）portal 到 body，贴红绿灯右侧，不被 view-enter transform 困住
 * - 右：Hand off / Open（worktree IDE）/ Create branch here / Local environment Actions（title/aria **Run environment action 1**）/ PR / Copy 子菜单 / Open Terminal / 右侧面板；中间空白拖窗
 * @see src/ARCH.md
 */
import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PanelLeft,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  SquarePen,
  SquareTerminal,
  AppWindow,
  Share2,
  GitFork,
  FolderOpen,
  GitBranch,
  Pin,
  Play,
  FlaskConical,
  Bug,
  ChevronDown,
  MoreHorizontal
} from 'lucide-react'
import type { LocalEnvironmentAction } from '../../shared/local-environment'
import {
  ALWAYS_ON_TOP_LABEL,
  COPY_LABEL,
  CREATE_BRANCH_HERE_LABEL,
  FORK_LABEL,
  OPEN_LABEL,
  HAND_OFF_INTRO,
  HAND_OFF_LABEL,
  NEW_CHAT_LABEL,
  OPEN_IN_POPUP_WINDOW_LABEL,
  OPEN_TERMINAL_MENU_LABEL,
  RUN_ENVIRONMENT_ACTION_1_LABEL,
  SHARE_LABEL,
  TOGGLE_BOTTOM_PANEL_LABEL,
  TOGGLE_SIDEBAR_LABEL,
  revealInFolderLabel,
  threadCopyMenuItems,
  type ThreadCopyAction
} from '../../shared/reveal-in-folder'
import { OPEN_A_PULL_REQUEST_LABEL } from '../../shared/review-repos'
import type { ThreadMode } from '../lib/thread-runtime'
import './ChatToolbar.css'

interface Props {
  rightPanelOpen: boolean
  /** 侧栏是否收起 */
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onToggleRightPanel: () => void
  /** View / 顶栏 Open Terminal（对标 Codex #30659 / learn.chatgpt.com Integrated terminal） */
  onOpenTerminal?: () => void
  onNewConversation?: () => void
  /** 弹出当前对话到独立窗（对标 Codex Open in Popup Window） */
  onPopOut?: () => void
  /** 分享只读快照（对标 Codex Share / `/share`） */
  onShare?: () => void
  /** 顶栏 Copy 子菜单（对标 Codex threadHeader Copy） */
  onCopyMenuAction?: (action: ThreadCopyAction) => void
  /** 分叉当前对话（对标 Codex 顶栏 Fork / `/fork`） */
  onFork?: () => void
  popout?: boolean
  /** 弹出窗 Always on top（对标 Codex） */
  alwaysOnTop?: boolean
  onToggleAlwaysOnTop?: () => void
  /** 当前分支若已有 PR，顶栏显示芯片并打开审查 */
  prLabel?: string | null
  onOpenPullRequest?: () => void
  /** 隔离 worktree：打开目录 / Create branch here（对标 Codex header） */
  worktreePath?: string | null
  onOpenWorktree?: () => void
  /** 当前线程项目目录（对标 Codex Open in Finder from thread menus） */
  threadFolderPath?: string | null
  onRevealThreadFolder?: () => void
  onCreateBranchHere?: () => void
  /** 顶栏 Hand off（对标 Codex：header 在 Local / Worktree 之间交接） */
  threadMode?: ThreadMode
  onThreadModeChange?: (mode: ThreadMode) => void
  /** 官方 Local environment `[[actions]]`；空则不画顶栏按钮 */
  environmentActions?: LocalEnvironmentAction[]
  onRunEnvironmentAction?: (action: LocalEnvironmentAction) => void
}

const EMPTY_ENVIRONMENT_ACTIONS: LocalEnvironmentAction[] = []

/** 官方 icon 只认出现过的 run / test / debug */
function actionIcon(icon?: string) {
  const name = String(icon || 'run').toLowerCase()
  if (name === 'test') return <FlaskConical size={12} strokeWidth={2} aria-hidden />
  if (name === 'debug') return <Bug size={12} strokeWidth={2} aria-hidden />
  return <Play size={12} strokeWidth={2} aria-hidden />
}

/** 挂到 body，用 fixed 相对视口，避免 flex 壳把 absolute 子节点挤到底部 */
function getChromeHost(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.body : null
}

/** 顶栏：左簇始终可点切换侧栏；右为面板 */
export const ChatToolbar = memo(function ChatToolbar({
  rightPanelOpen,
  sidebarCollapsed = false,
  onToggleSidebar,
  onToggleRightPanel,
  onOpenTerminal,
  onNewConversation,
  onPopOut,
  onShare,
  onCopyMenuAction,
  onFork,
  popout = false,
  alwaysOnTop = false,
  onToggleAlwaysOnTop,
  prLabel = null,
  onOpenPullRequest,
  worktreePath = null,
  onOpenWorktree,
  threadFolderPath = null,
  onRevealThreadFolder,
  onCreateBranchHere,
  threadMode = 'local',
  onThreadModeChange,
  environmentActions = EMPTY_ENVIRONMENT_ACTIONS,
  onRunEnvironmentAction
}: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHost(getChromeHost())
  }, [])

  useEffect(() => {
    if (!actionsOpen && !copyOpen) return
    const onDoc = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof Node && actionsRef.current?.contains(node)) return
      if (node instanceof Node && copyRef.current?.contains(node)) return
      setActionsOpen(false)
      setCopyOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionsOpen(false)
        setCopyOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [actionsOpen, copyOpen])

  const primaryAction = environmentActions[0] ?? null
  const runAction = (action: LocalEnvironmentAction) => {
    setActionsOpen(false)
    onRunEnvironmentAction?.(action)
  }

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
        title={`${TOGGLE_SIDEBAR_LABEL} ⌘B`}
        aria-label={TOGGLE_SIDEBAR_LABEL}
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
        title={`${NEW_CHAT_LABEL} ⌘N`}
        aria-label={NEW_CHAT_LABEL}
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
          {primaryAction && onRunEnvironmentAction && !popout ? (
            <div className="chat-toolbar-actions" ref={actionsRef}>
              <button
                type="button"
                className="chat-toolbar-pr-chip"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (environmentActions.length > 1) {
                    setActionsOpen((open) => !open)
                    return
                  }
                  runAction(primaryAction)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={RUN_ENVIRONMENT_ACTION_1_LABEL}
                aria-label={RUN_ENVIRONMENT_ACTION_1_LABEL}
                aria-expanded={environmentActions.length > 1 ? actionsOpen : undefined}
                aria-haspopup={environmentActions.length > 1 ? 'menu' : undefined}
              >
                {actionIcon(primaryAction.icon)}
                <span>{primaryAction.name}</span>
                {environmentActions.length > 1 ? (
                  <ChevronDown size={12} strokeWidth={2} aria-hidden />
                ) : null}
              </button>
              {actionsOpen && environmentActions.length > 1 ? (
                <div className="chat-toolbar-actions-menu glass-popover" role="menu">
                  {environmentActions.map((action, index) => (
                    <button
                      key={`${action.name}:${action.command}`}
                      type="button"
                      role="menuitem"
                      className="chat-toolbar-actions-item"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        runAction(action)
                      }}
                    >
                      {actionIcon(action.icon)}
                      <span>{action.name}</span>
                      {index === 0 ? (
                        <span className="chat-toolbar-actions-chord">⌘⇧D</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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
              title={HAND_OFF_INTRO}
              aria-label={HAND_OFF_LABEL}
            >
              {HAND_OFF_LABEL}
            </button>
          ) : null}
          {(threadFolderPath || worktreePath) && (onRevealThreadFolder || onOpenWorktree) && !popout ? (
            <button
              type="button"
              className="chat-toolbar-icon-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                ;(onRevealThreadFolder || onOpenWorktree)?.()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={revealInFolderLabel(window.sharker?.platform)}
              aria-label={revealInFolderLabel(window.sharker?.platform)}
            >
              <FolderOpen size={18} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          {worktreePath && onOpenWorktree && !popout ? (
            <button
              type="button"
              className="chat-toolbar-pr-chip"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenWorktree()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={OPEN_LABEL}
              aria-label={OPEN_LABEL}
            >
              {OPEN_LABEL}
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
              title={CREATE_BRANCH_HERE_LABEL}
              aria-label={CREATE_BRANCH_HERE_LABEL}
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
              title={OPEN_A_PULL_REQUEST_LABEL}
              aria-label={OPEN_A_PULL_REQUEST_LABEL}
            >
              {prLabel}
            </button>
          ) : null}
          {onFork && !popout ? (
            <button
              type="button"
              className="chat-toolbar-icon-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onFork()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={FORK_LABEL}
              aria-label={FORK_LABEL}
            >
              <GitFork size={18} strokeWidth={1.75} aria-hidden />
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
              title={SHARE_LABEL}
              aria-label={SHARE_LABEL}
            >
              <Share2 size={18} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          {onCopyMenuAction && !popout ? (
            <div className="chat-toolbar-actions" ref={copyRef}>
              <button
                type="button"
                className="chat-toolbar-icon-btn"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setActionsOpen(false)
                  setCopyOpen((open) => !open)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={COPY_LABEL}
                aria-label={COPY_LABEL}
                aria-expanded={copyOpen}
                aria-haspopup="menu"
              >
                <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />
              </button>
              {copyOpen ? (
                <div className="chat-toolbar-actions-menu glass-popover" role="menu" aria-label={COPY_LABEL}>
                  {threadCopyMenuItems().map((item) => (
                    <button
                      key={item.action}
                      type="button"
                      role="menuitem"
                      className="chat-toolbar-actions-item"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setCopyOpen(false)
                        onCopyMenuAction(item.action)
                      }}
                    >
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
              title={OPEN_IN_POPUP_WINDOW_LABEL}
              aria-label={OPEN_IN_POPUP_WINDOW_LABEL}
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
                title={ALWAYS_ON_TOP_LABEL}
                aria-label={ALWAYS_ON_TOP_LABEL}
                aria-pressed={alwaysOnTop}
              >
                <Pin size={18} strokeWidth={1.75} aria-hidden />
              </button>
              <span className="chat-toolbar-popout-label">{OPEN_IN_POPUP_WINDOW_LABEL}</span>
            </>
          ) : (
          <>
          {onOpenTerminal ? (
            <button
              type="button"
              className="chat-toolbar-icon-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenTerminal()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={OPEN_TERMINAL_MENU_LABEL}
              aria-label={OPEN_TERMINAL_MENU_LABEL}
            >
              <SquareTerminal size={18} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className={`panel-rail-toggle ${rightPanelOpen ? 'panel-rail-toggle--open' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleRightPanel()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={TOGGLE_BOTTOM_PANEL_LABEL}
            title={TOGGLE_BOTTOM_PANEL_LABEL}
          >
            {rightPanelOpen ? (
              <PanelRightClose size={18} aria-hidden />
            ) : (
              <PanelRightOpen size={18} aria-hidden />
            )}
          </button>
          </>
          )}
        </div>
      </div>
    </>
  )
})
