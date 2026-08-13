/**
 * 左侧边栏（ChatGPT 风格）：
 * 顶栏切换 · 新对话 · 置顶 / 项目 / 最近
 * 收起为图标轨；设置页切换为设置 Tab 列表
 * @see src/ARCH.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Folder,
  MoreHorizontal,
  Palette,
  Pin,
  Settings,
  Shield,
  Sparkles,
  SquarePen
} from 'lucide-react'
import type { ConversationSummary } from '../../shared/conversation'
import type { AppSettings, WorkspaceItem } from '../../shared/types'
import { sortWorkspaces } from '../../shared/workspace'
import type { AppPage, SettingsTab } from '../types/navigation'
import { useSlidingIndicator } from '../hooks/useSlidingIndicator'
import './Sidebar.css'
import { SIDEBAR_LAYOUT } from '../constants/layout'

interface Props {
  page: AppPage
  settingsTab: SettingsTab
  settings: AppSettings
  conversations: ConversationSummary[]
  activeConversationId: string | null
  /** 有 in-flight turn 的会话（侧栏显示进行中点） */
  liveConversationIds?: Set<string> | string[]
  onSelectWorkspace: (id: string) => void
  onSelectConversation: (workspaceId: string, conversationId: string) => void
  onAddWorkspace: () => void
  onDeleteWorkspace: (id: string) => void
  onTogglePinWorkspace: (id: string) => void
  onRenameWorkspace: (id: string, label: string) => void
  onNewConversation: (workspaceId: string) => void
  onDeleteConversation: (workspaceId: string, conversationId: string) => void
  onArchiveConversation: (workspaceId: string, conversationId: string) => void
  onNavigate: (page: AppPage, tab?: SettingsTab) => void
  /** 受控收起态（与主区顶栏同步） */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** 收起后悬停 peek 是否可见（顶栏用：peek 时侧栏已有新对话，可隐藏顶栏笔按钮） */
  onPeekChange?: (peeking: boolean) => void
}

const SIDEBAR_WIDTH_KEY = 'sharker-sidebar-width'
const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_LAYOUT.default
const SIDEBAR_MIN_WIDTH = SIDEBAR_LAYOUT.min
const SIDEBAR_MAX_WIDTH = SIDEBAR_LAYOUT.max
const SIDEBAR_LAYOUT_MS = 280
const SETTINGS_NAV: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: 'permissions', label: '权限', icon: Shield },
  { id: 'models', label: '模型', icon: Sparkles },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'archived', label: '已归档', icon: Archive }
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
export function Sidebar({
  page,
  settingsTab,
  settings,
  conversations,
  activeConversationId,
  liveConversationIds,
  onSelectWorkspace,
  onSelectConversation,
  onAddWorkspace,
  onDeleteWorkspace,
  onTogglePinWorkspace,
  onRenameWorkspace,
  onNewConversation,
  onDeleteConversation: _onDeleteConversation,
  onArchiveConversation,
  onNavigate,
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

  const renderConvRow = (c: ConversationSummary) => {
    const active = c.id === activeConversationId
    const live = liveIdSet.has(c.id)
    return (
      <div
        key={c.id}
        className={`sidebar-row sidebar-row--conv ${active ? 'active' : ''} ${live ? 'sidebar-row--live' : ''}`}
        data-conversation-id={c.id}
        data-conversation-title={convTitle(c)}
        data-live={live ? 'true' : undefined}
      >
        <button
          type="button"
          className="sidebar-row-main"
          data-conversation-id={c.id}
          data-conversation-title={convTitle(c)}
          onClick={() => {
            onSelectConversation(c.workspaceId, c.id)
            if (page !== 'chat') onNavigate('chat')
          }}
          title={convTitle(c)}
        >
          <span className="sidebar-row-text">{convTitle(c)}</span>
          {live ? <span className="sidebar-live-dot" aria-label="进行中" title="进行中" /> : null}
        </button>
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

  /** 项目：文件夹 + 新对话 + 三点菜单（重命名 / 置顶 / 移除） */
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

          <section className="sidebar-section">
            <h3 className="sidebar-section-label">对话</h3>
            {dialogConvs.length === 0 ? (
              <p className="sidebar-section-empty">暂无对话</p>
            ) : (
              dialogConvs.map((c) => renderConvRow(c))
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
}
