/**
 * 左侧边栏（ChatGPT 风格）：
 * 顶栏切换 · 新对话 · 置顶 / 项目 / 最近
 * 收起为图标轨；设置页切换为设置 Tab 列表
 * @see src/ARCH.md
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Bell,
  BellRing,
  ChartNoAxesColumn,
  Folder,
  Inbox,
  ListFilter,
  MoreHorizontal,
  Keyboard,
  Lightbulb,
  Palette,
  Pin,
  Smile,
  Settings,
  Settings2,
  Shield,
  Sparkles,
  SquarePen
} from 'lucide-react'
import type { ConversationSummary } from '../../shared/conversation'
import {
  filterSidebarChats,
  isActivitySidebarFilter,
  nextActivitySidebarFilter,
  SIDEBAR_CHAT_FILTERS,
  splitLiveConversations,
  splitPinnedConversations,
  type SidebarChatFilter
} from '../../shared/conversation'
import type { AppSettings, WorkspaceItem } from '../../shared/types'
import { sortWorkspaces } from '../../shared/workspace'
import type { AppPage, SettingsTab } from '../types/navigation'
import { useSlidingIndicator } from '../hooks/useSlidingIndicator'
import './Sidebar.css'
import { SIDEBAR_LAYOUT } from '../constants/layout'
import { loadThreadRuntime } from '../lib/thread-runtime'

interface Props {
  page: AppPage
  settingsTab: SettingsTab
  settings: AppSettings
  conversations: ConversationSummary[]
  activeConversationId: string | null
  /** 有 in-flight turn 的会话（侧栏显示进行中点） */
  liveConversationIds?: Set<string> | string[]
  /** 等待你回复审批的会话（对标 Codex Activity waiting） */
  waitingConversationIds?: Set<string> | string[]
  /** 定时任务绑定或审查队列里的对话（对标 Codex Activity Scheduled） */
  scheduledConversationIds?: Set<string> | string[]
  /** 递增以开关 Activity 视图（⌘⌥U） */
  activityToggleNonce?: number
  onSelectWorkspace: (id: string) => void
  onSelectConversation: (workspaceId: string, conversationId: string) => void
  onAddWorkspace: () => void
  onDeleteWorkspace: (id: string) => void
  onTogglePinWorkspace: (id: string) => void
  onRenameWorkspace: (id: string, label: string) => void
  onEditProjectFolders?: (id: string) => void
  onCreatePermanentWorktree?: (workspaceId: string) => void
  onNewConversation: (workspaceId: string) => void
  onDeleteConversation: (workspaceId: string, conversationId: string) => void
  onArchiveConversation: (workspaceId: string, conversationId: string) => void
  /** 项目菜单「归档对话」：一并归档该项目下的对话（进行中跳过） */
  onArchiveProjectChats?: (workspaceId: string) => void
  onRenameConversation?: (workspaceId: string, conversationId: string, title: string) => void
  onTogglePinConversation?: (workspaceId: string, conversationId: string) => void
  /** 快捷键 / `/rename` 无参数时进入行内改名 */
  renameRequestId?: string | null
  onRenameRequestHandled?: () => void
  onNavigate: (page: AppPage, tab?: SettingsTab) => void
  /** Activity「全部标为已读」：只清对话未读，不动审查队列 */
  onClearUnread?: () => void
  /** 侧栏铃铛：开关 Activity（对标 Codex 铃铛 / ⌘⌥U） */
  onToggleActivity?: () => void
  /** 自动化审查队列未读数（Codex Triage） */
  queueUnread?: number
  /** 受控收起态（与主区顶栏同步） */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** 收起后悬停 peek 是否可见（顶栏用：peek 时侧栏已有新对话，可隐藏顶栏笔按钮） */
  onPeekChange?: (peeking: boolean) => void
}

const SIDEBAR_CHAT_FILTER_KEY = 'sharker-sidebar-chat-filter'
const SIDEBAR_WIDTH_KEY = 'sharker-sidebar-width'

function readSidebarChatFilter(): SidebarChatFilter {
  const raw = localStorage.getItem(SIDEBAR_CHAT_FILTER_KEY)
  if (
    raw === 'live' ||
    raw === 'waiting' ||
    raw === 'unread' ||
    raw === 'pinned' ||
    raw === 'scheduled' ||
    raw === 'chronological'
  ) {
    return raw
  }
  return 'chronological'
}
const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_LAYOUT.default
const SIDEBAR_MIN_WIDTH = SIDEBAR_LAYOUT.min
const SIDEBAR_MAX_WIDTH = SIDEBAR_LAYOUT.max
const SIDEBAR_LAYOUT_MS = 280
const SETTINGS_NAV: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: 'permissions', label: '权限', icon: Shield },
  { id: 'models', label: '模型', icon: Sparkles },
  { id: 'general', label: '通用', icon: Settings2 },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'notifications', label: '通知', icon: BellRing },
  { id: 'personalization', label: '个性化', icon: Smile },
  { id: 'suggested', label: '建议提示', icon: Lightbulb },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'archived', label: '已归档', icon: Archive },
  { id: 'usage', label: '用量', icon: ChartNoAxesColumn }
]

function readSidebarWidth(): number {
  const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
  const n = saved ? Number.parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, n))
}

function convTitle(c: ConversationSummary): string {
  return (c.customTitle || c.title || '新对话').trim() || '新对话'
}

/** ChatGPT 风格左侧边栏 */
export const Sidebar = memo(function Sidebar({
  page,
  settingsTab,
  settings,
  conversations,
  activeConversationId,
  liveConversationIds,
  waitingConversationIds,
  scheduledConversationIds,
  activityToggleNonce = 0,
  onSelectWorkspace,
  onSelectConversation,
  onAddWorkspace,
  onDeleteWorkspace,
  onTogglePinWorkspace,
  onRenameWorkspace,
  onEditProjectFolders,
  onCreatePermanentWorktree,
  onNewConversation,
  onDeleteConversation: _onDeleteConversation,
  onArchiveConversation,
  onArchiveProjectChats,
  onRenameConversation,
  onTogglePinConversation,
  renameRequestId = null,
  onRenameRequestHandled,
  onNavigate,
  onClearUnread,
  onToggleActivity,
  queueUnread = 0,
  collapsed: collapsedProp,
  onCollapsedChange,
  onPeekChange
}: Props) {
  const [collapsedInner, setCollapsedInner] = useState(
    () => localStorage.getItem('sharker-sidebar-collapsed') === '1'
  )
  const liveIdSet = (() => {
    if (!liveConversationIds) return new Set<string>()
    return liveConversationIds instanceof Set
      ? liveConversationIds
      : new Set(liveConversationIds)
  })()
  const waitingIdSet = (() => {
    if (!waitingConversationIds) return new Set<string>()
    return waitingConversationIds instanceof Set
      ? waitingConversationIds
      : new Set(waitingConversationIds)
  })()
  const scheduledIdSet = (() => {
    if (!scheduledConversationIds) return new Set<string>()
    return scheduledConversationIds instanceof Set
      ? scheduledConversationIds
      : new Set(scheduledConversationIds)
  })()
  const collapsed = collapsedProp ?? collapsedInner
  /** 单一写入口：不在 setState updater 里调父回调（StrictMode 会双调） */
  const setCollapsed = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const prev = collapsedProp ?? collapsedInner
      const value = typeof next === 'function' ? next(prev) : next
      if (value === prev) return
      localStorage.setItem('sharker-sidebar-collapsed', value ? '1' : '0')
      if (onCollapsedChange) {
        onCollapsedChange(value)
      } else {
        setCollapsedInner(value)
      }
    },
    [collapsedProp, collapsedInner, onCollapsedChange]
  )
  // 受控：跟父状态同步
  useEffect(() => {
    if (collapsedProp === undefined) return
    setCollapsedInner(collapsedProp)
  }, [collapsedProp])

  const [width, setWidth] = useState(readSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const [layoutAnimating, setLayoutAnimating] = useState(false)
  /** 收起后贴左边悬停临时滑出 */
  const [peeking, setPeeking] = useState(false)
  /** 项目行三点菜单：逻辑打开 id */
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null)
  const projectMenuIdRef = useRef<string | null>(null)
  /** 正在播退出动画的菜单 id（关闭后短暂保留 DOM） */
  const [projectMenuClosingId, setProjectMenuClosingId] = useState<string | null>(null)
  const projectMenuClosingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    projectMenuIdRef.current = projectMenuId
  }, [projectMenuId])

  const clearProjectMenuCloseTimer = () => {
    if (projectMenuClosingTimerRef.current) {
      clearTimeout(projectMenuClosingTimerRef.current)
      projectMenuClosingTimerRef.current = null
    }
  }

  /** 带动画关闭项目菜单（统一 180ms 退出卸载） */
  const closeProjectMenu = useCallback(() => {
    const openId = projectMenuIdRef.current
    if (!openId) return
    projectMenuIdRef.current = null
    setProjectMenuId(null)
    setProjectMenuClosingId(openId)
    clearProjectMenuCloseTimer()
    projectMenuClosingTimerRef.current = setTimeout(() => {
      setProjectMenuClosingId((cur) => (cur === openId ? null : cur))
      projectMenuClosingTimerRef.current = null
    }, 180)
  }, [])

  const openProjectMenu = useCallback((id: string) => {
    clearProjectMenuCloseTimer()
    setProjectMenuClosingId(null)
    projectMenuIdRef.current = id
    setProjectMenuId(id)
  }, [])

  useEffect(() => () => clearProjectMenuCloseTimer(), [])
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef({ startX: 0, startWidth: SIDEBAR_DEFAULT_WIDTH as number })
  const settingsNavRef = useRef<HTMLElement>(null)
  const settingsNavItemRefs = useRef(new Map<SettingsTab, HTMLButtonElement>())
  const effectiveSettingsTab: SettingsTab = settingsTab
  const expanded = !collapsed

  useEffect(() => {
    if (!projectMenuId) return
    const onDoc = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        closeProjectMenu()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeProjectMenu()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [projectMenuId, closeProjectMenu])
  /** 固定展开，或收起态下的悬停 peek */
  const panelVisible = !collapsed || peeking

  const workspaces = useMemo(
    () => sortWorkspaces(settings.workspaces ?? []),
    [settings.workspaces]
  )
  const activeWsId = settings.activeWorkspaceId || workspaces[0]?.id || ''

  const pinnedWorkspaces = useMemo(
    () => workspaces.filter((w) => w.pinned),
    [workspaces]
  )

  /** 对话列表：与项目分开，按更新时间倒序 */
  const dialogConvs = useMemo(() => {
    return [...conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 60)
  }, [conversations])
  const [chatFilter, setChatFilter] = useState<SidebarChatFilter>(readSidebarChatFilter)
  const [chatFilterOpen, setChatFilterOpen] = useState(false)
  const chatFilterRef = useRef<HTMLDivElement>(null)
  const groupedChats = chatFilter === 'chronological'
  const filteredConvs = useMemo(
    () => filterSidebarChats(dialogConvs, chatFilter, liveIdSet, waitingIdSet, scheduledIdSet),
    [chatFilter, dialogConvs, liveIdSet, waitingIdSet, scheduledIdSet]
  )
  const { live: liveConvs, rest: restConvs } = useMemo(
    () => splitLiveConversations(groupedChats ? dialogConvs : [], liveIdSet),
    [dialogConvs, groupedChats, liveIdSet]
  )
  const { pinned: pinnedConvs, rest: recentConvs } = useMemo(
    () => splitPinnedConversations(restConvs),
    [restConvs]
  )

  useEffect(() => {
    if (!chatFilterOpen) return
    const onDoc = (e: MouseEvent) => {
      if (chatFilterRef.current && !chatFilterRef.current.contains(e.target as Node)) {
        setChatFilterOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChatFilterOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [chatFilterOpen])

  const applyChatFilter = (next: SidebarChatFilter) => {
    setChatFilter(next)
    localStorage.setItem(SIDEBAR_CHAT_FILTER_KEY, next)
    setChatFilterOpen(false)
  }

  const unreadChatCount = conversations.reduce((n, c) => n + (c.unread ? 1 : 0), 0)
  const hasUnread = unreadChatCount > 0
  const activityOpen = isActivitySidebarFilter(chatFilter)

  useEffect(() => {
    if (!activityToggleNonce) return
    setChatFilter((current) => {
      const next = nextActivitySidebarFilter(current)
      localStorage.setItem(SIDEBAR_CHAT_FILTER_KEY, next)
      return next
    })
    setChatFilterOpen(false)
  }, [activityToggleNonce])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameCancelRef = useRef(false)

  useEffect(() => {
    if (!renameRequestId) return
    const hit = conversations.find((c) => c.id === renameRequestId)
    if (hit) {
      renameCancelRef.current = false
      setRenamingId(hit.id)
      setRenameDraft(convTitle(hit))
    }
    onRenameRequestHandled?.()
  }, [conversations, onRenameRequestHandled, renameRequestId])

  useEffect(() => {
    if (!renamingId) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renamingId])

  const getSettingsNavEl = useCallback(
    (id: string) => settingsNavItemRefs.current.get(id as SettingsTab),
    []
  )

  const settingsNavSlide = useSlidingIndicator(
    effectiveSettingsTab,
    settingsNavRef,
    getSettingsNavEl,
    [page, collapsed],
    {
      enabled: expanded && page === 'settings',
      animating: layoutAnimating
    }
  )

  useEffect(() => {
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
      if (peekHideTimerRef.current) clearTimeout(peekHideTimerRef.current)
    }
  }, [])

  // 固定展开时清掉 peek
  useEffect(() => {
    if (!collapsed) setPeeking(false)
  }, [collapsed])

  // 同步 peek 给主区顶栏（决定是否显示「新对话」笔按钮）
  useEffect(() => {
    onPeekChange?.(peeking)
  }, [peeking, onPeekChange])

  // 把侧栏宽度写到 .app，peek 时主区可按同宽让出并压缩输入框
  useEffect(() => {
    const app = document.querySelector('.app')
    if (!(app instanceof HTMLElement)) return
    app.style.setProperty('--sidebar-w', `${width}px`)
  }, [width])

  const clearPeekHide = useCallback(() => {
    if (peekHideTimerRef.current) {
      clearTimeout(peekHideTimerRef.current)
      peekHideTimerRef.current = null
    }
  }, [])

  const openPeek = useCallback(() => {
    if (!collapsed) return
    clearPeekHide()
    setPeeking(true)
  }, [clearPeekHide, collapsed])

  const scheduleClosePeek = useCallback(() => {
    if (!collapsed) return
    clearPeekHide()
    peekHideTimerRef.current = setTimeout(() => {
      setPeeking(false)
      peekHideTimerRef.current = null
    }, 220)
  }, [clearPeekHide, collapsed])

  const handleNewChat = useCallback(() => {
    if (!activeWsId) {
      onAddWorkspace()
      return
    }
    onNewConversation(activeWsId)
    if (page !== 'chat') onNavigate('chat')
  }, [activeWsId, onAddWorkspace, onNewConversation, onNavigate, page])

  useEffect(() => {
    if (!resizing) return
    document.body.classList.add('sidebar-resizing')
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - dragRef.current.startX
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, dragRef.current.startWidth + delta)
      )
      setWidth(next)
    }
    const onUp = () => {
      setResizing(false)
      document.body.classList.remove('sidebar-resizing')
      setWidth((w) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w))
        return w
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('sidebar-resizing')
    }
  }, [resizing])

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startWidth: width }
      setResizing(true)
    },
    [collapsed, width]
  )

  const shellWidth = width

  const commitRename = (c: ConversationSummary, value: string) => {
    setRenamingId(null)
    const next = value.trim()
    if (next === convTitle(c) && c.customTitle) return
    onRenameConversation?.(c.workspaceId, c.id, next)
  }

  const renderConvRow = (c: ConversationSummary) => {
    const active = c.id === activeConversationId
    const live = liveIdSet.has(c.id)
    const isolated = loadThreadRuntime(c.id).mode === 'worktree'
    const renaming = renamingId === c.id
    return (
      <div
        key={c.id}
        className={`sidebar-row sidebar-row--conv ${active ? 'active' : ''} ${live ? 'sidebar-row--live' : ''} ${c.unread ? 'sidebar-row--unread' : ''} ${c.pinned ? 'sidebar-row--pinned' : ''}`}
        data-conversation-id={c.id}
        data-conversation-title={convTitle(c)}
        data-live={live ? 'true' : undefined}
        data-unread={c.unread ? 'true' : undefined}
        data-pinned={c.pinned ? 'true' : undefined}
      >
        {renaming ? (
          <input
            ref={renameInputRef}
            className="sidebar-rename-input"
            value={renameDraft}
            aria-label="重命名对话"
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename(c, renameDraft)
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                renameCancelRef.current = true
                setRenamingId(null)
              }
            }}
            onBlur={() => {
              if (renameCancelRef.current) {
                renameCancelRef.current = false
                return
              }
              commitRename(c, renameDraft)
            }}
          />
        ) : (
          <button
            type="button"
            className="sidebar-row-main"
            data-conversation-id={c.id}
            data-conversation-title={convTitle(c)}
            onClick={() => {
              onSelectConversation(c.workspaceId, c.id)
              if (page !== 'chat') onNavigate('chat')
            }}
            onDoubleClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              renameCancelRef.current = false
              setRenamingId(c.id)
              setRenameDraft(convTitle(c))
            }}
            title={convTitle(c)}
          >
            {c.pinned ? (
              <Pin size={12} className="sidebar-pin-icon" aria-hidden />
            ) : null}
            <span className="sidebar-row-text">{convTitle(c)}</span>
            {isolated ? (
              <span className="sidebar-worktree-badge" title="隔离 Worktree 线程">
                隔离
              </span>
            ) : null}
            <span className="sidebar-row-status">
              {live ? (
                <span className="sidebar-live-dot" aria-label="进行中" title="进行中" />
              ) : c.unread ? (
                <span className="sidebar-unread-dot" aria-label="未读" title="未读" />
              ) : null}
            </span>
          </button>
        )}
        {onTogglePinConversation ? (
          <button
            type="button"
            className="sidebar-row-archive sidebar-row-pin"
            title={c.pinned ? '取消置顶' : '置顶'}
            aria-label={c.pinned ? `取消置顶 ${convTitle(c)}` : `置顶 ${convTitle(c)}`}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onTogglePinConversation(c.workspaceId, c.id)
            }}
          >
            <Pin size={14} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="sidebar-row-archive"
          title="归档"
          aria-label={`归档 ${convTitle(c)}`}
          onMouseDown={(e) => {
            // 避免 mousedown 被父级抢走焦点
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onArchiveConversation(c.workspaceId, c.id)
          }}
        >
          <Archive size={14} aria-hidden />
        </button>
      </div>
    )
  }

  /** 项目：文件夹 + 新对话 + 三点菜单（重命名 / 置顶 / 归档对话 / 移除） */
  const renderProject = (ws: WorkspaceItem, keyPrefix = '') => {
    const menuOpen = projectMenuId === ws.id
    const menuClosing = projectMenuClosingId === ws.id
    const menuVisible = menuOpen || menuClosing
    return (
      <div
        key={`${keyPrefix}${ws.id}`}
        className={`sidebar-row sidebar-row--project ${ws.id === activeWsId ? 'sidebar-row--project-active' : ''}`}
      >
        <button
          type="button"
          className="sidebar-row-main"
          onClick={() => {
            onSelectWorkspace(ws.id)
            if (page !== 'chat') onNavigate('chat')
          }}
          title={ws.path}
        >
          <Folder size={16} className="sidebar-row-icon" aria-hidden />
          <span className="sidebar-row-text">{ws.label || '项目'}</span>
        </button>
        <div className="sidebar-project-actions">
          <button
            type="button"
            className="sidebar-row-action"
            title="在此项目中新对话"
            aria-label={`在 ${ws.label} 中新对话`}
            onClick={(e) => {
              e.stopPropagation()
              onSelectWorkspace(ws.id)
              onNewConversation(ws.id)
              if (page !== 'chat') onNavigate('chat')
            }}
          >
            <SquarePen size={14} aria-hidden />
          </button>
          <div className="sidebar-project-menu-wrap" ref={menuVisible ? projectMenuRef : undefined}>
            <button
              type="button"
              className={`sidebar-row-action ${menuOpen ? 'sidebar-row-action--open' : ''}`}
              title="更多"
              aria-label={`${ws.label} 更多操作`}
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation()
                if (projectMenuId === ws.id) closeProjectMenu()
                else openProjectMenu(ws.id)
              }}
            >
              <MoreHorizontal size={14} aria-hidden />
            </button>
            {menuVisible ? (
              <div
                className={`sidebar-project-menu ${menuClosing ? 'popover-exit' : 'popover-enter'}`}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeProjectMenu()
                    const next = window.prompt('重命名项目', ws.label || '')
                    if (next == null) return
                    const label = next.trim()
                    if (!label || label === ws.label) return
                    onRenameWorkspace(ws.id, label)
                  }}
                >
                  重命名
                </button>
                {onEditProjectFolders && !ws.isHome ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeProjectMenu()
                      onEditProjectFolders(ws.id)
                    }}
                  >
                    编辑项目
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeProjectMenu()
                    onTogglePinWorkspace(ws.id)
                  }}
                >
                  <Pin size={13} aria-hidden />
                  {ws.pinned ? '取消置顶' : '置顶项目'}
                </button>
                {onCreatePermanentWorktree && !ws.isHome ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeProjectMenu()
                      onCreatePermanentWorktree(ws.id)
                    }}
                  >
                    创建永久 worktree
                  </button>
                ) : null}
                {onArchiveProjectChats ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeProjectMenu()
                      onArchiveProjectChats(ws.id)
                    }}
                  >
                    归档对话
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="sidebar-project-menu-danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeProjectMenu()
                    const ok = window.confirm(
                      `确定从侧栏移除项目「${ws.label}」？\n不会删除磁盘上的文件夹。`
                    )
                    if (ok) onDeleteWorkspace(ws.id)
                  }}
                >
                  移除项目
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  /** 展开态主内容 */
  const expandedBody =
    page === 'settings' ? (
      <nav ref={settingsNavRef} className="sidebar-nav" aria-label="设置">
        {settingsNavSlide.ready && expanded && (
          <div
            className="sidebar-nav-slide"
            style={{
              transform: `translate3d(${settingsNavSlide.left}px, ${settingsNavSlide.top}px, 0)`,
              width: settingsNavSlide.width,
              height: settingsNavSlide.height
            }}
            aria-hidden
          />
        )}
        {SETTINGS_NAV.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              ref={(el) => {
                if (el) settingsNavItemRefs.current.set(item.id, el)
                else settingsNavItemRefs.current.delete(item.id)
              }}
              className={`sidebar-nav-item ${effectiveSettingsTab === item.id ? 'active' : ''}`}
              onClick={() => onNavigate('settings', item.id)}
            >
              <Icon size={18} className="sidebar-nav-ico" aria-hidden />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    ) : (
      <>
        <nav className="sidebar-primary" aria-label="主导航">
          <button type="button" className="sidebar-nav-item" onClick={handleNewChat}>
            <SquarePen size={18} className="sidebar-nav-ico" aria-hidden />
            <span>新对话</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-item${activityOpen ? ' active' : ''}`}
            title="活动视图（⌘⌥U）"
            aria-pressed={activityOpen}
            aria-label="活动视图"
            onClick={() => onToggleActivity?.()}
          >
            <Bell size={18} className="sidebar-nav-ico" aria-hidden />
            <span>活动</span>
            {unreadChatCount > 0 ? (
              <span className="sidebar-nav-badge" aria-label={`${unreadChatCount} 条未读对话`}>
                {unreadChatCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`sidebar-nav-item${page === 'skills' ? ' active' : ''}`}
            onClick={() => onNavigate('skills')}
          >
            <Sparkles size={18} className="sidebar-nav-ico" aria-hidden />
            <span>Skills</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-item${page === 'automations' ? ' active' : ''}`}
            onClick={() => onNavigate('automations')}
          >
            <Inbox size={18} className="sidebar-nav-ico" aria-hidden />
            <span>审查队列</span>
            {queueUnread > 0 ? (
              <span className="sidebar-nav-badge" aria-label={`${queueUnread} 条未读`}>
                {queueUnread}
              </span>
            ) : null}
          </button>
        </nav>

        <div className="sidebar-scroll">
          {pinnedWorkspaces.length > 0 ? (
            <section className="sidebar-section">
              <h3 className="sidebar-section-label">置顶</h3>
              {pinnedWorkspaces.map((ws) => renderProject(ws, 'pin-'))}
            </section>
          ) : null}

          <section className="sidebar-section">
            <div className="sidebar-section-head">
              <h3 className="sidebar-section-label">项目</h3>
              <button
                type="button"
                className="sidebar-section-action"
                onClick={onAddWorkspace}
                title="添加项目"
              >
                +
              </button>
            </div>
            {workspaces.length === 0 ? (
              <button type="button" className="sidebar-row sidebar-row--muted" onClick={onAddWorkspace}>
                <span className="sidebar-row-text">添加项目文件夹…</span>
              </button>
            ) : (
              workspaces.map((ws) => renderProject(ws))
            )}
          </section>

          {groupedChats && liveConvs.length > 0 ? (
            <section className="sidebar-section" aria-label="进行中">
              <h3 className="sidebar-section-label">进行中</h3>
              {liveConvs.map((c) => renderConvRow(c))}
            </section>
          ) : null}

          {groupedChats && pinnedConvs.length > 0 ? (
            <section className="sidebar-section" aria-label="置顶">
              <h3 className="sidebar-section-label">置顶</h3>
              {pinnedConvs.map((c) => renderConvRow(c))}
            </section>
          ) : null}

          <section className="sidebar-section">
            <div className="sidebar-section-head">
              <h3 className="sidebar-section-label">
                {groupedChats
                  ? '对话'
                  : `对话 · ${SIDEBAR_CHAT_FILTERS.find((f) => f.id === chatFilter)?.label ?? ''}`}
              </h3>
              <div className="sidebar-chat-filter" ref={chatFilterRef}>
                <button
                  type="button"
                  className={`sidebar-section-action${chatFilterOpen || !groupedChats ? ' sidebar-section-action--active' : ''}`}
                  title="筛选对话（对标 Codex：找不到时选「按时间」）"
                  aria-label="筛选对话"
                  aria-expanded={chatFilterOpen}
                  onClick={() => setChatFilterOpen((open) => !open)}
                >
                  <ListFilter size={14} aria-hidden />
                </button>
                {chatFilterOpen ? (
                  <div className="sidebar-project-menu sidebar-chat-filter-menu popover-enter" role="menu">
                    {SIDEBAR_CHAT_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={chatFilter === item.id}
                        className={chatFilter === item.id ? 'is-active' : undefined}
                        onClick={() => applyChatFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                    {hasUnread && onClearUnread ? (
                      <>
                        <div className="sidebar-chat-filter-sep" role="separator" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onClearUnread()
                            setChatFilterOpen(false)
                          }}
                        >
                          全部标为已读
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {dialogConvs.length === 0 ? (
              <p className="sidebar-section-empty">暂无对话</p>
            ) : groupedChats ? (
              recentConvs.length === 0 ? null : (
                recentConvs.map((c) => renderConvRow(c))
              )
            ) : filteredConvs.length === 0 ? (
              <p className="sidebar-section-empty">没有匹配的对话。选「按时间」可看到全部。</p>
            ) : (
              filteredConvs.map((c) => renderConvRow(c))
            )}
          </section>
        </div>
      </>
    )

  const panel = (
    <aside
      className={[
        'sidebar',
        collapsed ? 'sidebar--collapsed' : 'sidebar--expanded',
        collapsed && peeking ? 'sidebar--peek-visible' : '',
        collapsed && !peeking ? 'sidebar--peek-hidden' : '',
        resizing ? 'resizing' : '',
        layoutAnimating ? 'sidebar--layout-animating' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: shellWidth, ['--sidebar-w' as string]: `${shellWidth}px` }}
      aria-label="侧边栏"
      aria-hidden={collapsed && !peeking}
      onMouseEnter={collapsed ? openPeek : undefined}
      onPointerEnter={collapsed ? openPeek : undefined}
      onMouseLeave={collapsed ? scheduleClosePeek : undefined}
      onPointerLeave={collapsed ? scheduleClosePeek : undefined}
    >
      <div className="sidebar-traffic-spacer" aria-hidden />

      {/* 设置页：返回对话 */}
      {page === 'settings' ? (
        <div className="sidebar-top">
          <button
            type="button"
            className="sidebar-back-chat"
            onClick={() => onNavigate('chat')}
          >
            ← 返回对话
          </button>
        </div>
      ) : null}

      <div className="sidebar-body" inert={collapsed && !peeking ? true : undefined}>
        {/* 收起/展开由窗口左上固定簇（ChatToolbar 左簇）统一控制 */}
        {expandedBody}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-footer-settings"
          aria-label="设置"
          onClick={() => onNavigate('settings', 'models')}
        >
          <Settings size={16} aria-hidden />
          <span>设置</span>
        </button>
      </div>

      {!collapsed ? (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整侧栏宽度"
          onMouseDown={startResize}
          onDoubleClick={() => {
            setWidth(SIDEBAR_DEFAULT_WIDTH)
            localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH))
          }}
        />
      ) : null}
    </aside>
  )

  return (
    <>
      {/* 收起后：左缘热区，鼠标碰到左边自动滑出侧栏 */}
      {collapsed ? (
        <div
          className="sidebar-edge-hotzone"
          onMouseEnter={openPeek}
          onPointerEnter={openPeek}
          onMouseOver={openPeek}
          aria-hidden
        />
      ) : null}
      {panel}
    </>
  )
})
