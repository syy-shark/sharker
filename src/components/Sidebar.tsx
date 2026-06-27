/**
 * 侧栏壳：工作区列表、设置导航、折叠与宽度拖拽
 * @see src/README.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationSummary } from '../../shared/conversation'
import type { AppSettings } from '../../shared/types'
import type { AppPage, SettingsTab } from '../types/navigation'
import { useSlidingIndicator } from '../hooks/useSlidingIndicator'
import { WorkspaceList } from './WorkspaceList'
import './Sidebar.css'

/** Sidebar Props：页面模式、工作区/对话列表与导航回调 */
interface Props {
  page: AppPage
  settingsTab: SettingsTab
  settings: AppSettings
  conversations: ConversationSummary[]
  activeConversationId: string | null
  onSelectWorkspace: (id: string) => void
  onSelectConversation: (workspaceId: string, conversationId: string) => void
  onAddWorkspace: () => void
  onDeleteWorkspace: (id: string) => void
  onTogglePinWorkspace: (id: string) => void
  onNewConversation: (workspaceId: string) => void
  onDeleteConversation: (workspaceId: string, conversationId: string) => void
  onNavigate: (page: AppPage, tab?: SettingsTab) => void
  onOpenAutomations?: () => void
}

/** 设置齿轮图标 */
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 侧栏折叠/展开箭头 */
function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {direction === 'left' ? (
        <path
          d="M10 3L5 8L10 13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6 3L11 8L6 13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

const SIDEBAR_WIDTH_KEY = 'sharker-sidebar-width'
const SIDEBAR_DEFAULT_WIDTH = 200
const SIDEBAR_MIN_WIDTH = 168
const SIDEBAR_MAX_WIDTH = 420
const SIDEBAR_LAYOUT_MS = 340

/** 从 localStorage 读取侧栏宽度 */
function readSidebarWidth(): number {
  const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
  const n = saved ? Number.parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, n))
}

const SETTINGS_NAV: { id: SettingsTab; label: string }[] = [
  { id: 'permissions', label: '权限' },
  { id: 'models', label: '模型' },
  { id: 'skills', label: 'Skill' },
  { id: 'computerUse', label: 'Computer Use' },
  { id: 'browserUse', label: 'Browser Use' },
  { id: 'mcp', label: 'MCP' },
  { id: 'usage', label: 'Token' },
  { id: 'pet', label: '宠物' },
  { id: 'extensions', label: '扩展' }
]

/** 设置 Tab 对应图标 */
function SettingsNavIcon({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'permissions':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3L4 7v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V7l-8-4z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'models':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M9 9h6M9 12h6M9 15h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'skills':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2l2.4 4.8L20 8l-4 3.6L17 18l-5-2.8L7 18l1-6.4L4 8l5.6-1.2L12 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'mcp':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="18" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8.5 11L15.5 7M8.5 13l7 4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 'computerUse':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M7 9h4M7 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'browserUse':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
    case 'usage':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="14" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.5" />
          <rect x="10" y="10" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.7" />
          <rect x="16" y="6" width="3" height="14" rx="0.5" fill="currentColor" />
        </svg>
      )
    case 'pet':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="13" r="5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="9" cy="8" r="1.5" fill="currentColor" />
          <circle cx="15" cy="8" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'extensions':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
  }
}

/** 可折叠侧栏：聊天模式展示工作区，设置模式展示 Tab 导航 */
export function Sidebar({
  page,
  settingsTab,
  settings,
  conversations,
  activeConversationId,
  onSelectWorkspace,
  onSelectConversation,
  onAddWorkspace,
  onDeleteWorkspace,
  onTogglePinWorkspace,
  onNewConversation,
  onDeleteConversation,
  onNavigate,
  onOpenAutomations
}: Props) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sharker-sidebar-collapsed') === '1'
  )
  const [width, setWidth] = useState(readSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const [layoutAnimating, setLayoutAnimating] = useState(false)
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef({ startX: 0, startWidth: SIDEBAR_DEFAULT_WIDTH })
  const settingsNavRef = useRef<HTMLElement>(null)
  const settingsNavItemRefs = useRef(new Map<SettingsTab, HTMLButtonElement>())
  const collapsedNavRef = useRef<HTMLElement>(null)
  const collapsedNavItemRefs = useRef(new Map<SettingsTab, HTMLButtonElement>())

  const getSettingsNavEl = useCallback(
    (id: string) => settingsNavItemRefs.current.get(id as SettingsTab),
    []
  )

  const settingsNavSlide = useSlidingIndicator(
    settingsTab,
    settingsNavRef,
    getSettingsNavEl,
    [page, collapsed],
    {
      enabled: !collapsed && page === 'settings',
      animating: layoutAnimating
    }
  )

  const getCollapsedNavEl = useCallback(
    (id: string) => collapsedNavItemRefs.current.get(id as SettingsTab),
    []
  )

  const collapsedNavSlide = useSlidingIndicator(
    settingsTab,
    collapsedNavRef,
    getCollapsedNavEl,
    [page, collapsed],
    {
      enabled: collapsed && page === 'settings',
      animating: layoutAnimating
    }
  )

  useEffect(() => {
    localStorage.setItem('sharker-sidebar-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
    }
  }, [])

  const toggleCollapsed = useCallback(() => {
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
    setLayoutAnimating(true)
    setCollapsed((c) => !c)
    layoutTimerRef.current = setTimeout(() => {
      setLayoutAnimating(false)
      layoutTimerRef.current = null
    }, SIDEBAR_LAYOUT_MS)
  }, [])

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

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_WIDTH)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH))
  }, [])

  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''} ${resizing ? 'resizing' : ''} ${layoutAnimating ? 'sidebar--layout-animating' : ''} ${collapsed && page === 'settings' ? 'settings-mode' : ''}`}
      style={collapsed ? undefined : { width }}
    >
      <div
        className={`sidebar-top ${!collapsed && page === 'chat' ? 'sidebar-top--with-label' : ''}`}
      >
        {!collapsed && page === 'settings' ? (
          <button
            type="button"
            className="sidebar-back"
            onClick={() => onNavigate('chat')}
          >
            ← 返回对话
          </button>
        ) : !collapsed && page === 'chat' ? (
          <span className="sidebar-section-label">工作区</span>
        ) : (
          <span className="sidebar-top-spacer" aria-hidden />
        )}
        <div className="sidebar-top-actions">
          {!collapsed && page === 'chat' ? (
            <button
              type="button"
              className="sidebar-auto-btn"
              title="自动化"
              aria-label="自动化"
              onClick={() => onOpenAutomations?.()}
            >
              <svg className="sidebar-auto-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
              <span>自动</span>
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            <ChevronIcon direction={collapsed ? 'right' : 'left'} />
          </button>
        </div>
      </div>

      {collapsed && page === 'settings' && (
        <nav ref={collapsedNavRef} className="sidebar-collapsed-nav" aria-label="设置导航">
          {collapsedNavSlide.ready && (
            <div
              className="sidebar-collapsed-slide"
              style={{
                transform: `translate3d(${collapsedNavSlide.left}px, ${collapsedNavSlide.top}px, 0)`,
                width: collapsedNavSlide.width,
                height: collapsedNavSlide.height
              }}
              aria-hidden
            />
          )}
          {SETTINGS_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              ref={(el) => {
                if (el) collapsedNavItemRefs.current.set(item.id, el)
                else collapsedNavItemRefs.current.delete(item.id)
              }}
              className={`sidebar-icon-btn ${settingsTab === item.id ? 'active' : ''}`}
              title={item.label}
              aria-label={item.label}
              onClick={() => onNavigate('settings', item.id)}
            >
              <SettingsNavIcon tab={item.id} />
            </button>
          ))}
        </nav>
      )}

      {collapsed && page === 'chat' && (
        <div className="sidebar-collapsed-footer">
          <button
            type="button"
            className="sidebar-icon-btn"
            title="设置"
            aria-label="设置"
            onClick={() => onNavigate('settings', 'models')}
          >
            <GearIcon />
          </button>
        </div>
      )}

      <div
        className={`sidebar-body ${collapsed ? 'sidebar-body--hidden' : ''}`}
        aria-hidden={collapsed}
        inert={collapsed ? true : undefined}
      >
        {page === 'settings' ? (
          <nav ref={settingsNavRef} className="sidebar-nav sidebar-nav-top">
            {settingsNavSlide.ready && !collapsed && (
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
            {SETTINGS_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                ref={(el) => {
                  if (el) settingsNavItemRefs.current.set(item.id, el)
                  else settingsNavItemRefs.current.delete(item.id)
                }}
                className={`sidebar-nav-item ${settingsTab === item.id ? 'active' : ''}`}
                onClick={() => onNavigate('settings', item.id)}
              >
                <span className="sidebar-nav-icon">
                  <SettingsNavIcon tab={item.id} />
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        ) : (
          <>
            <WorkspaceList
              settings={settings}
              conversations={conversations}
              activeConversationId={activeConversationId}
              layoutAnimating={layoutAnimating}
              sidebarCollapsed={collapsed}
              onSelect={onSelectWorkspace}
              onSelectConversation={onSelectConversation}
              onAdd={onAddWorkspace}
              onDelete={onDeleteWorkspace}
              onTogglePin={onTogglePinWorkspace}
              onNewConversation={onNewConversation}
              onDeleteConversation={onDeleteConversation}
            />
            <button
              type="button"
              className="sidebar-btn sidebar-settings-btn"
              onClick={() => onNavigate('settings', 'models')}
            >
              <GearIcon />
              <span>设置</span>
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整侧栏宽度"
          title="拖动调整宽度 · 双击恢复默认"
          onMouseDown={startResize}
          onDoubleClick={resetWidth}
        />
      )}
    </aside>
  )
}
