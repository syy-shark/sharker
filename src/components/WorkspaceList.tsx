/**
 * 侧栏工作区与对话树列表
 * @see src/README.md
 */
import { useCallback, useRef, useState } from 'react'
import type { ConversationSummary } from '../../shared/conversation'
import type { AppSettings, WorkspaceItem } from '../../shared/types'
import { sortWorkspaces } from '../../shared/workspace'
import { useSlidingIndicator } from '../hooks/useSlidingIndicator'
import { formatConversationTime } from '../lib/format-time'
import './WorkspaceList.css'

/** WorkspaceList Props：工作区树、对话列表与操作回调 */
interface Props {
  settings: AppSettings
  conversations: ConversationSummary[]
  activeConversationId: string | null
  layoutAnimating?: boolean
  sidebarCollapsed?: boolean
  onSelect: (id: string) => void
  onSelectConversation: (workspaceId: string, conversationId: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
  onNewConversation: (workspaceId: string) => void
  onDeleteConversation: (workspaceId: string, conversationId: string) => void
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h6l2 2h8v10H4V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle
        cx="5.25"
        cy="5.25"
        r="2.35"
        stroke="currentColor"
        strokeWidth="1.25"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M7.1 7.1L11.75 11.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10.25 11.75H13.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 7h12M9 7V5h6v2M10 11v5M14 11v5M8 7l1 12h6l1-12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

const CONV_COLLAPSED_KEY = 'sharker-workspace-conv-collapsed'

/** 读取已收起对话列表的工作区 ID 集合 */
function readCollapsedConvSet(): Set<string> {
  try {
    const raw = localStorage.getItem(CONV_COLLAPSED_KEY)
    if (!raw) return new Set()
    const ids = JSON.parse(raw) as string[]
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function MessageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 单行工作区：选中、置顶、新建对话、删除 */
function WorkspaceRow({
  item,
  active,
  convCount,
  onSelect,
  onNewChat,
  onDelete,
  onTogglePin
}: {
  item: WorkspaceItem
  active: boolean
  convCount: number
  onSelect: () => void
  onNewChat: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const canToggleConv = active && convCount > 1

  return (
    <div className={`workspace-row ${active ? 'active' : ''}`}>
      <div className="workspace-row-main">
        <button
          type="button"
          className={`workspace-row-select ${canToggleConv ? 'workspace-row-select--toggle' : ''}`}
          onClick={onSelect}
          title={canToggleConv ? `${item.path}（点击展开/收起对话）` : item.path}
          aria-expanded={canToggleConv ? true : undefined}
        >
          <span className="workspace-icon"><FolderIcon /></span>
          <span className="workspace-label">{item.label}</span>
          {active && convCount > 1 ? (
            <span className="workspace-conv-count" aria-hidden>
              {convCount}
            </span>
          ) : null}
        </button>
      </div>
      <div className="workspace-actions">
        <button
          type="button"
          className="workspace-action-btn"
          title="新对话"
          aria-label="新对话"
          onClick={(e) => {
            e.stopPropagation()
            onNewChat()
          }}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className={`workspace-action-btn ${item.pinned ? 'pinned' : ''}`}
          title={item.pinned ? '取消置顶' : '置顶'}
          aria-label={item.pinned ? '取消置顶' : '置顶'}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
        >
          <PinIcon filled={Boolean(item.pinned)} />
        </button>
        <button
          type="button"
          className="workspace-action-btn danger"
          title="删除"
          aria-label="删除工作区"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

/** 单行对话条目 */
function ConversationRow({
  convId,
  title,
  timeLabel,
  active,
  isNew,
  onSelect,
  onDelete,
  setRowRef
}: {
  convId: string
  title: string
  timeLabel: string
  active: boolean
  isNew: boolean
  onSelect: () => void
  onDelete: () => void
  setRowRef: (el: HTMLLIElement | null) => void
}) {
  return (
    <li
      ref={setRowRef}
      data-conv-id={convId}
      className={`conv-row ${active ? 'conv-active' : ''} ${isNew ? 'conv-new' : ''}`}
    >
      <button type="button" className="conv-btn" onClick={onSelect}>
        <span className="conv-icon">
          <MessageIcon />
        </span>
        <span className="conv-body">
          <span className="conv-title">{title || '新对话'}</span>
          {timeLabel ? <span className="conv-time">{timeLabel}</span> : null}
        </span>
      </button>
      <div className="conv-actions">
        <button
          type="button"
          className="conv-action conv-action--danger"
          title="删除对话"
          aria-label="删除对话"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  )
}

/** 当前工作区下的对话列表与滑动指示器 */
function ConversationList({
  conversations,
  activeConversationId,
  showTimes,
  layoutAnimating,
  convExpanded,
  onSelectConversation,
  onDeleteConversation,
  workspaceId
}: {
  conversations: ConversationSummary[]
  activeConversationId: string | null
  showTimes: boolean
  layoutAnimating?: boolean
  convExpanded: boolean
  workspaceId: string
  onSelectConversation: (workspaceId: string, conversationId: string) => void
  onDeleteConversation: (workspaceId: string, conversationId: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLLIElement>())

  const getRowEl = useCallback((id: string) => rowRefs.current.get(id) ?? null, [])

  const slide = useSlidingIndicator(
    activeConversationId ?? '',
    listRef,
    getRowEl,
    [conversations.length, convExpanded],
    {
      animating: layoutAnimating,
      enabled: convExpanded && Boolean(activeConversationId)
    }
  )

  return (
    <div
      className={`conversation-list-wrap ${convExpanded ? 'conversation-list-wrap--open' : ''}`}
    >
      <div className="conversation-list" ref={listRef}>
        {slide.ready && (
          <div
            className="conv-slide-indicator"
            style={{
              transform: `translate3d(${slide.left}px, ${slide.top}px, 0)`,
              width: slide.width,
              height: slide.height
            }}
            aria-hidden
          />
        )}
        {conversations.map((c) => (
          <ConversationRow
            key={c.id}
            convId={c.id}
            title={c.title}
            timeLabel={showTimes ? formatConversationTime(c.updatedAt) : ''}
            active={c.id === activeConversationId}
            isNew={!c.customTitle && c.messageCount > 4}
            setRowRef={(el) => {
              if (el) rowRefs.current.set(c.id, el)
              else rowRefs.current.delete(c.id)
            }}
            onSelect={() => onSelectConversation(workspaceId, c.id)}
            onDelete={() => onDeleteConversation(workspaceId, c.id)}
          />
        ))}
      </div>
    </div>
  )
}

/** 工作区块列表：展开/收起对话、添加工作区 */
export function WorkspaceList({
  settings,
  conversations,
  activeConversationId,
  layoutAnimating,
  onSelect,
  onSelectConversation,
  onAdd,
  onDelete,
  onTogglePin,
  onNewConversation,
  onDeleteConversation
}: Props) {
  const items = sortWorkspaces(settings.workspaces ?? [])
  const activeWorkspaceId = settings.activeWorkspaceId
  const showTimes = conversations.length > 1

  const [collapsedConv, setCollapsedConv] = useState(readCollapsedConvSet)

  const persistCollapsed = useCallback((next: Set<string>) => {
    localStorage.setItem(CONV_COLLAPSED_KEY, JSON.stringify([...next]))
  }, [])

  const toggleConvList = useCallback(
    (workspaceId: string) => {
      setCollapsedConv((prev) => {
        const next = new Set(prev)
        if (next.has(workspaceId)) next.delete(workspaceId)
        else next.add(workspaceId)
        persistCollapsed(next)
        return next
      })
    },
    [persistCollapsed]
  )

  const expandConvList = useCallback(
    (workspaceId: string) => {
      setCollapsedConv((prev) => {
        if (!prev.has(workspaceId)) return prev
        const next = new Set(prev)
        next.delete(workspaceId)
        persistCollapsed(next)
        return next
      })
    },
    [persistCollapsed]
  )

  return (
    <div className="workspace-list">
      {items.map((item) => {
        const isActive = item.id === activeWorkspaceId
        const convCount = isActive ? conversations.length : 0
        const convExpanded =
          isActive && convCount > 0 && (convCount <= 1 || !collapsedConv.has(item.id))

        return (
          <div key={item.id} className="workspace-block">
            <WorkspaceRow
              item={item}
              active={isActive}
              convCount={convCount}
              onSelect={() => {
                if (isActive && convCount > 1) {
                  toggleConvList(item.id)
                  return
                }
                onSelect(item.id)
              }}
              onNewChat={() => {
                expandConvList(item.id)
                onNewConversation(item.id)
              }}
              onDelete={() => onDelete(item.id)}
              onTogglePin={() => onTogglePin(item.id)}
            />
            {isActive && convCount > 0 && (
              <ConversationList
                conversations={conversations}
                activeConversationId={activeConversationId}
                showTimes={showTimes}
                layoutAnimating={layoutAnimating}
                convExpanded={convExpanded}
                workspaceId={item.id}
                onSelectConversation={(wsId, convId) => {
                  expandConvList(wsId)
                  onSelectConversation(wsId, convId)
                }}
                onDeleteConversation={onDeleteConversation}
              />
            )}
          </div>
        )
      })}
      <button type="button" className="workspace-add-btn" onClick={onAdd} title="添加工作区">
        <PlusIcon />
        <span>添加工作区</span>
      </button>
    </div>
  )
}
