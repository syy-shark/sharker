/**
 * 聊天主视图：消息列表、流式展示、排队气泡；输入区在 ComposerDock（直播 token 不重绘）。
 * @see src/ARCH.md
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AssistantMeta,
  ApprovalRequest,
  ChatAttachment,
  ChatMessage,
  ProviderConfig,
  TurnSegment,
  WorkspaceItem
} from '../../shared/types'
import { sortWorkspaces } from '../../shared/workspace'
import type { QueuedPrompt, PromptSubmitMode } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { MessageActions } from './MessageActions'
import { ComposerDock, type ComposerDockHandle } from './ComposerDock'
import type { SlashCommandMeta } from '../../shared/slash-commands'
import { findInThread } from '../../shared/thread-search'
import { textForSpeech } from '../../shared/composer-dictation'
import type { ThreadMode } from '../lib/thread-runtime'
import { type ThreadGoal } from '../../shared/thread-goal'
import './ChatView.css'

/** 贴回底部：只有真正滚到尽头才恢复跟随 */
const AT_BOTTOM_PX = 16
/** 离开底部：超过这个距离才显示「回到底部」（避免误触） */
const LEAVE_BOTTOM_PX = 48

function AttachmentImage({ attachment }: { attachment: ChatAttachment }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    window.sharker
      .readAttachmentDataUrl(attachment.path)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [attachment.path])

  if (!src) return <div className="attachment-image-placeholder" aria-hidden />
  return <img src={src} alt={attachment.name} />
}

function MessageAttachments({ attachments }: { attachments?: ChatAttachment[] }) {
  if (!attachments?.length) return null
  return (
    <div className="message-attachments">
      {attachments.map((a) =>
        a.kind === 'text' ? (
          <figure key={a.id} className="message-attachment message-attachment--text">
            <figcaption>{a.name}</figcaption>
          </figure>
        ) : (
          <figure key={a.id} className="message-attachment">
            <AttachmentImage attachment={a} />
            <figcaption>{a.name}</figcaption>
          </figure>
        )
      )}
    </div>
  )
}

const UserMessageRow = memo(function UserMessageRow({
  id,
  content,
  attachments,
  findHit,
  findCurrent,
  onEdit
}: {
  id: string
  content: string
  attachments?: ChatAttachment[]
  findHit: boolean
  findCurrent: boolean
  onEdit?: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  return (
    <div
      id={`msg-${id}`}
      className={`message-row message-row--user${findHit ? ' is-find-hit' : ''}${
        findCurrent ? ' is-find-current' : ''
      }`}
    >
      <div className="message-user-wrap">
        <div className="message-bubble message-bubble--user">
          <MessageAttachments attachments={attachments} />
          {editing ? (
            <div className="message-user-edit">
              <textarea
                className="message-user-edit-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setDraft(content)
                    setEditing(false)
                  }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.trim()) {
                    e.preventDefault()
                    onEdit?.(draft)
                    setEditing(false)
                  }
                }}
              />
              <div className="message-user-edit-actions">
                <button
                  type="button"
                  className="message-user-edit-btn message-user-edit-btn--primary"
                  disabled={!draft.trim()}
                  onClick={() => {
                    if (!draft.trim()) return
                    onEdit?.(draft)
                    setEditing(false)
                  }}
                >
                  发送
                </button>
                <button
                  type="button"
                  className="message-user-edit-btn"
                  onClick={() => {
                    setDraft(content)
                    setEditing(false)
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <p>{content}</p>
          )}
        </div>
        {editing ? null : (
          <MessageActions
            content={content}
            messageId={id}
            onEdit={
              onEdit
                ? () => {
                    setDraft(content)
                    setEditing(true)
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  )
})

/** ChatView Props：工作区/模型选择、消息与流式状态、发送回调 */
interface Props {
  /** 会话切换时触发消息区轻过渡，避免硬切空白 */
  sessionKey?: string | null
  workspaces: WorkspaceItem[]
  activeWorkspaceId: string
  onSelectWorkspace?: (id: string) => void
  providers: ProviderConfig[]
  activeProviderId: string
  onSelectProvider: (providerId: string, model: string) => void
  onThinkingLevelChange?: (providerId: string, level: string) => void
  messages: ChatMessage[]
  queuedPrompts: QueuedPrompt[]
  liveSegments: TurnSegment[]
  streaming: string
  turnThinking: string
  loading: boolean
  activeTool: string | null
  liveTurnMeta: AssistantMeta | null
  turnStartedAt: number | null
  turnHadThinking: boolean
  onSend: (text: string, mode?: PromptSubmitMode, attachments?: ChatAttachment[]) => void
  onCancelQueued: (id: string) => void
  onAbort: () => void
  onSlashAction?: (cmd: SlashCommandMeta, args: string) => void
  showHistoryPicker?: boolean
  onCloseHistoryPicker?: () => void
  conversationTitles?: Array<{ id: string; title: string }>
  onPickConversation?: (id: string) => void
  onRetry?: (userMessageId: string) => void
  onEditUserMessage?: (userMessageId: string, text: string) => void
  approval?: ApprovalRequest | null
  approvalResponding?: boolean
  onApproval?: (decision: import('../../shared/approval-session').ApprovalDecision) => void | Promise<void>
  /** 主线程活动点开子 Agent */
  onOpenSubAgent?: (id: string | null) => void
  /** Codex 式线程目标：本地工作区或隔离 worktree */
  threadMode?: ThreadMode
  threadGoal?: ThreadGoal | null
  onClearThreadGoal?: () => void
  onThreadModeChange?: (mode: ThreadMode) => void
  /** 首次创建隔离 worktree 的起点分支 */
  worktreeBaseRef?: string
  onWorktreeBaseRefChange?: (ref: string) => void
  /** `@` 搜索根目录：隔离线程用 worktree，否则当前工作区 */
  fileSearchRoot?: string
  /** 命令面板「引用文件」/「引用 Skill」/「查找」/「模型」 */
  composerIntent?: 'mention' | 'skill' | 'find' | 'model' | 'dictate' | 'voice' | null
  onComposerIntentHandled?: () => void
  /** 暂停自动出队（对标 Codex hold queue） */
  queueHeld?: boolean
  onQueueHeldChange?: (held: boolean) => void
  /** 隔离 worktree 目录已被清理，可从快照恢复 */
  worktreeMissing?: boolean
  onRestoreWorktree?: () => void
}

/** 消息区 + 底部输入框（工作区/模型选择、上下文环、发送/停止/插队） */
export function ChatView({
  sessionKey = null,
  workspaces,
  activeWorkspaceId,
  providers,
  activeProviderId,
  onSelectProvider,
  onThinkingLevelChange,
  messages,
  queuedPrompts,
  liveSegments,
  streaming,
  turnThinking,
  loading,
  activeTool,
  liveTurnMeta,
  turnStartedAt,
  turnHadThinking,
  onSend,
  onCancelQueued,
  onAbort,
  onSlashAction,
  showHistoryPicker,
  onCloseHistoryPicker,
  conversationTitles,
  onPickConversation,
  onRetry,
  onEditUserMessage,
  approval,
  approvalResponding,
  onApproval,
  onOpenSubAgent,
  threadMode = 'local',
  threadGoal = null,
  onClearThreadGoal,
  onThreadModeChange,
  worktreeBaseRef = '',
  onWorktreeBaseRefChange,
  fileSearchRoot = '',
  composerIntent = null,
  onComposerIntentHandled,
  queueHeld = false,
  onQueueHeldChange,
  worktreeMissing = false,
  onRestoreWorktree
}: Props) {
  const composerRef = useRef<ComposerDockHandle>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  /** 内容溢出且用户不在底部时才显示「回到底部」 */
  const [canJumpToBottom, setCanJumpToBottom] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findHit, setFindHit] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const messagesInnerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  /** 程序触发的滚动期间，忽略 scroll 事件对 stickToBottom 的干扰 */
  const programmaticScrollRef = useRef(false)
  /** 用户主动上翻；只有自己滚回尽头或点「回到底部」才解除。 */
  const userScrollLockRef = useRef(false)
  /** 最近一次用户滚动方向，避免上滑后仍被当成贴底而拉回去 */
  const lastScrollIntentRef = useRef<'up' | 'down' | null>(null)
  const lastScrollTopRef = useRef(0)
  const touchStartYRef = useRef<number | null>(null)
  const shownApprovalIdRef = useRef<string | null>(null)

  const stickToBottomRef = useRef(stickToBottom)
  stickToBottomRef.current = stickToBottom
  const isEmpty =
    messages.length === 0 &&
    queuedPrompts.length === 0 &&
    liveSegments.length === 0 &&
    !streaming &&
    !turnThinking &&
    !loading
  const activeWorkspace =
    sortWorkspaces(workspaces ?? []).find((w) => w.id === activeWorkspaceId) ??
    sortWorkspaces(workspaces ?? [])[0]
  const hasWorkspace = Boolean(activeWorkspace?.path?.trim())
  const activeProvider = providers.find((p) => p.id === activeProviderId)
  const modelLabel = activeProvider?.model?.trim() || activeProvider?.name

  useEffect(() => {
    if (composerIntent === 'find') {
      setFindOpen(true)
      onComposerIntentHandled?.()
      requestAnimationFrame(() => findInputRef.current?.focus())
    }
  }, [composerIntent, onComposerIntentHandled])

  const findHits = useMemo(() => findInThread(messages, findQuery), [messages, findQuery])

  useEffect(() => {
    if (findHit >= findHits.length) setFindHit(0)
  }, [findHit, findHits.length])

  useEffect(() => {
    const current = findHits[findHit]
    if (!findOpen || !current) return
    const el = document.getElementById(`msg-${current.messageId}`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [findHit, findHits, findOpen])

  /** 查找打开时 ⌘G / ⌘⇧G 跳命中（对标 Codex Find next），不抢全局搜对话 */
  useEffect(() => {
    if (!findOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.key !== 'g' && e.key !== 'G') return
      e.preventDefault()
      e.stopPropagation()
      if (!findHits.length) return
      setFindHit((i) =>
        e.shiftKey ? (i - 1 + findHits.length) % findHits.length : (i + 1) % findHits.length
      )
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [findOpen, findHits.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'f' && !e.altKey && !e.shiftKey) {
        const target = e.target
        if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable=true]')) {
          if (target === findInputRef.current) {
            e.preventDefault()
            return
          }
          if (!target.closest('.composer-box')) return
        }
        e.preventDefault()
        setFindOpen(true)
        requestAnimationFrame(() => findInputRef.current?.focus())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** 滚动度量：是否溢出、距底部距离 */
  const readScrollMetrics = useCallback(() => {
    const el = messagesRef.current
    if (!el) return { overflowing: false, distance: 0, maxTop: 0 }
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
    const overflowing = maxTop > 12
    const distance = overflowing ? Math.max(0, maxTop - el.scrollTop) : 0
    return { overflowing, distance, maxTop }
  }, [])

  /** 根据当前滚动位置同步贴底跟随与「回到底部」显隐。用户上翻锁住后，不会因仍靠近底部而被拉回去。 */
  const syncScrollFlags = useCallback(() => {
    const { overflowing, distance } = readScrollMetrics()
    if (!overflowing) {
      userScrollLockRef.current = false
      stickToBottomRef.current = true
      setStickToBottom(true)
      setCanJumpToBottom(false)
      return
    }
    if (userScrollLockRef.current) {
      const resume = lastScrollIntentRef.current === 'down' && distance <= AT_BOTTOM_PX
      if (resume) {
        userScrollLockRef.current = false
        lastScrollIntentRef.current = null
        stickToBottomRef.current = true
        setStickToBottom(true)
        setCanJumpToBottom(false)
        return
      }
      stickToBottomRef.current = false
      setStickToBottom(false)
      setCanJumpToBottom(distance > LEAVE_BOTTOM_PX)
      return
    }
    if (distance > LEAVE_BOTTOM_PX) {
      userScrollLockRef.current = true
      stickToBottomRef.current = false
      setStickToBottom(false)
      setCanJumpToBottom(true)
      return
    }
    stickToBottomRef.current = true
    setStickToBottom(true)
    setCanJumpToBottom(false)
  }, [readScrollMetrics])

  const lockUserScroll = useCallback(() => {
    const { overflowing } = readScrollMetrics()
    if (!overflowing) return
    lastScrollIntentRef.current = 'up'
    userScrollLockRef.current = true
    stickToBottomRef.current = false
    setStickToBottom(false)
  }, [readScrollMetrics])

  /** 滚动到底部：流式贴底用即时 scrollTop，离散事件才用 smooth */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = messagesRef.current
      if (!el) return
      programmaticScrollRef.current = true
      const { maxTop } = readScrollMetrics()
      el.scrollTo({ top: maxTop, behavior })
      if (behavior === 'auto') {
        programmaticScrollRef.current = false
        if (!userScrollLockRef.current) syncScrollFlags()
        return
      }
      const finish = () => {
        programmaticScrollRef.current = false
        if (!userScrollLockRef.current) syncScrollFlags()
      }
      window.setTimeout(finish, 500)
    },
    [readScrollMetrics, syncScrollFlags]
  )

  const resumeStickToBottom = useCallback(() => {
    lastScrollIntentRef.current = 'down'
    userScrollLockRef.current = false
    stickToBottomRef.current = true
    setStickToBottom(true)
    setCanJumpToBottom(false)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  const handleComposerSubmitted = useCallback(() => {
    userScrollLockRef.current = false
    stickToBottomRef.current = true
    setStickToBottom(true)
  }, [])

  const dockIntent = composerIntent === 'find' ? null : composerIntent
  const speechHint = loading
    ? ''
    : textForSpeech(
        [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())?.content ||
          streaming
      )

  /** ⌘↑ / ⌘↓：长对话跳到顶/底（输入框内不抢光标） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('textarea, input, [contenteditable="true"]')) {
        return
      }
      const el = messagesRef.current
      if (!el) return
      e.preventDefault()
      if (e.key === 'ArrowUp') {
        lastScrollIntentRef.current = 'up'
        userScrollLockRef.current = true
        stickToBottomRef.current = false
        setStickToBottom(false)
        setCanJumpToBottom(true)
        programmaticScrollRef.current = true
        el.scrollTo({ top: 0, behavior: 'smooth' })
        window.setTimeout(() => {
          programmaticScrollRef.current = false
        }, 400)
        return
      }
      resumeStickToBottom()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resumeStickToBottom])

  useEffect(() => {
    const el = messagesRef.current
    if (!el || isEmpty) {
      setCanJumpToBottom(false)
      return
    }
    const onScroll = () => {
      if (programmaticScrollRef.current) return
      const top = el.scrollTop
      if (top < lastScrollTopRef.current - 0.5) lastScrollIntentRef.current = 'up'
      else if (top > lastScrollTopRef.current + 0.5) lastScrollIntentRef.current = 'down'
      lastScrollTopRef.current = top
      syncScrollFlags()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => {
      if (programmaticScrollRef.current) return
      if (stickToBottomRef.current && !userScrollLockRef.current) return
      syncScrollFlags()
    })
    ro.observe(el)
    lastScrollTopRef.current = el.scrollTop
    syncScrollFlags()
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [isEmpty, syncScrollFlags])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) lockUserScroll()
      else if (event.deltaY > 0) lastScrollIntentRef.current = 'down'
    }
    const onTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY
      if (y != null && touchStartYRef.current != null && y > touchStartYRef.current) {
        lockUserScroll()
      }
      if (y != null) touchStartYRef.current = y
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'PageUp' || event.key === 'Home') lockUserScroll()
    }

    el.addEventListener('wheel', onWheel, { passive: true, capture: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      el.removeEventListener('wheel', onWheel, true)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [lockUserScroll])

  useEffect(() => {
    if (!approval || shownApprovalIdRef.current === approval.id) return
    shownApprovalIdRef.current = approval.id
    const frame = window.requestAnimationFrame(() => {
      const el = messagesRef.current
      if (!el) return
      programmaticScrollRef.current = true
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
      programmaticScrollRef.current = false
      lockUserScroll()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [approval, lockUserScroll])

  /** 内容增高时贴底：ResizeObserver 只在高度变化时写 scrollTop，避免每帧 rAF 抢布局 */
  useEffect(() => {
    if (isEmpty) return
    const scroller = messagesRef.current
    const content = messagesInnerRef.current
    if (!scroller || !content) return
    let lastHeight = 0
    let raf = 0
    const follow = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        if (!stickToBottomRef.current || userScrollLockRef.current) return
        const h = scroller.scrollHeight
        if (h === lastHeight) return
        lastHeight = h
        programmaticScrollRef.current = true
        scroller.scrollTop = Math.max(0, h - scroller.clientHeight)
        programmaticScrollRef.current = false
      })
    }
    const ro = new ResizeObserver(follow)
    ro.observe(content)
    follow()
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [isEmpty, loading, sessionKey])

  useEffect(() => {
    if (isEmpty || loading) return
    if (!stickToBottomRef.current || userScrollLockRef.current) return
    scrollToBottom('auto')
  }, [messages, isEmpty, loading, scrollToBottom])

  const historicalRows = useMemo(
    () =>
      messages.map((m, index) =>
        m.role === 'user' ? (
          <UserMessageRow
            key={m.id}
            id={m.id}
            content={m.content}
            attachments={m.attachments}
            findHit={findHits.some((h) => h.messageId === m.id)}
            findCurrent={findHits[findHit]?.messageId === m.id}
            onEdit={onEditUserMessage ? (text) => onEditUserMessage(m.id, text) : undefined}
          />
        ) : (
          <div
            key={m.id}
            id={`msg-${m.id}`}
            className={`message-row message-row--assistant${
              findHits.some((h) => h.messageId === m.id) ? ' is-find-hit' : ''
            }${findHits[findHit]?.messageId === m.id ? ' is-find-current' : ''}`}
          >
            <AssistantMessage
              messageId={m.id}
              content={m.content}
              meta={m.meta}
              modelLabel={m.meta?.model ?? modelLabel}
              onOpenSubAgent={onOpenSubAgent}
              onRetry={
                index === messages.length - 1 && m.meta?.retryOfUserMessageId && onRetry
                  ? () => onRetry(m.meta!.retryOfUserMessageId!)
                  : undefined
              }
            />
          </div>
        )
      ),
    [findHit, findHits, messages, modelLabel, onOpenSubAgent, onRetry, onEditUserMessage]
  )

  const showLiveAssistant = loading
  // 有 segment 流时由 TurnFlow 负责；这里仅给旧路径/无实质工具时的思考态
  const isThinkingLive =
    loading &&
    !streaming.trim() &&
    (Boolean(turnThinking.trim()) ||
      liveSegments.some((s) => s.kind === 'thinking' && s.status === 'active') ||
      liveSegments.some((s) => s.kind === 'status' && s.status === 'active'))

  return (
    <div
      className={`chat ${isEmpty ? 'chat--empty' : 'chat--active'}`}
      data-session-key={sessionKey || undefined}
    >
      {!isEmpty && (
        /* 全宽滚动层：滚动条贴主区最右侧；内容柱仍居中 */
        <div className="messages-scroll" ref={messagesRef}>
          {findOpen ? (
            <div className="chat-find glass-tile" role="search">
              <input
                ref={findInputRef}
                className="chat-find__input"
                value={findQuery}
                placeholder="在对话中查找"
                aria-label="在对话中查找"
                onChange={(e) => {
                  setFindQuery(e.target.value)
                  setFindHit(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setFindOpen(false)
                    setFindQuery('')
                    composerRef.current?.focus()
                    return
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!findHits.length) return
                    setFindHit((i) =>
                      e.shiftKey
                        ? (i - 1 + findHits.length) % findHits.length
                        : (i + 1) % findHits.length
                    )
                  }
                }}
              />
              <span className="chat-find__count">
                {findQuery.trim()
                  ? findHits.length
                    ? `${findHit + 1}/${findHits.length}`
                    : '无结果'
                  : ''}
              </span>
              <button
                type="button"
                className="chat-find__nav"
                disabled={findHits.length === 0}
                onClick={() => setFindHit((i) => (i - 1 + findHits.length) % findHits.length)}
                aria-label="上一条"
              >
                ↑
              </button>
              <button
                type="button"
                className="chat-find__nav"
                disabled={findHits.length === 0}
                onClick={() => setFindHit((i) => (i + 1) % findHits.length)}
                aria-label="下一条"
              >
                ↓
              </button>
              <button
                type="button"
                className="chat-find__nav"
                onClick={() => {
                  setFindOpen(false)
                  setFindQuery('')
                }}
                aria-label="关闭查找"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="messages" ref={messagesInnerRef}>
            {historicalRows}

            {showLiveAssistant && (
              <div className="message-row message-row--assistant message-row--live">
                <AssistantMessage
                  messageId="streaming"
                  content={streaming}
                  meta={liveTurnMeta ?? undefined}
                  liveSegments={liveSegments}
                  modelLabel={modelLabel}
                  hadThinkingLive={turnHadThinking}
                  isThinkingLive={isThinkingLive}
                  activeTool={activeTool}
                  liveStartedAt={turnStartedAt ?? undefined}
                  isStreaming
                  approval={approval}
                  approvalResponding={approvalResponding}
                  onApproval={onApproval}
                  onOpenSubAgent={onOpenSubAgent}
                />
              </div>
            )}

            {queuedPrompts.map((q) => (
              <div key={q.id} className="message-row message-row--user message-row--queued">
                <div className="message-user-wrap">
                  <div className="message-bubble message-bubble--user message-bubble--queued">
                    <span className="queued-badge">排队中</span>
                    <MessageAttachments attachments={q.attachments} />
                    <p>{q.text}</p>
                  </div>
                  <button
                    type="button"
                    className="queued-cancel"
                    onClick={() => onCancelQueued(q.id)}
                    title="取消排队"
                    aria-label="取消排队"
                  >
                    取消
                  </button>
                </div>
              </div>
            ))}
            <div ref={bottomRef} className="messages-end" aria-hidden />
          </div>
        </div>
      )}

      <div className="composer-stage">
        {/* 空对话不再堆欢迎语 / 快捷卡片 / 最近对话，只留输入区 */}
        {isEmpty && !hasWorkspace && (
          <h2 className="chat-empty-prompt chat-empty-prompt--hint">
            请先在侧栏或设置中添加一个工作区文件夹，然后开始对话。
          </h2>
        )}
        <div className="composer-wrap">
          {worktreeMissing ? (
            <div className="composer-worktree-banner" role="status">
              <span>隔离 worktree 已被清理。可从快照恢复后继续。</span>
              {onRestoreWorktree ? (
                <button type="button" className="composer-worktree-banner-btn" onClick={onRestoreWorktree}>
                  恢复
                </button>
              ) : null}
            </div>
          ) : null}
          {canJumpToBottom ? (
            <div className="chat-scroll-bottom-wrap">
              <button
                type="button"
                className="chat-scroll-bottom"
                onClick={resumeStickToBottom}
                aria-label="回到底部"
              >
                回到底部
              </button>
            </div>
          ) : null}
          <ComposerDock
            ref={composerRef}
            sessionKey={sessionKey}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            providers={providers}
            activeProviderId={activeProviderId}
            onSelectProvider={onSelectProvider}
            onThinkingLevelChange={onThinkingLevelChange}
            messages={messages}
            loading={loading}
            queuedCount={queuedPrompts.length}
            onSend={onSend}
            onAbort={onAbort}
            onSlashAction={onSlashAction}
            showHistoryPicker={showHistoryPicker}
            onCloseHistoryPicker={onCloseHistoryPicker}
            conversationTitles={conversationTitles}
            onPickConversation={onPickConversation}
            threadMode={threadMode}
            threadGoal={threadGoal}
            onClearThreadGoal={onClearThreadGoal}
            onThreadModeChange={onThreadModeChange}
            worktreeBaseRef={worktreeBaseRef}
            onWorktreeBaseRefChange={onWorktreeBaseRefChange}
            fileSearchRoot={fileSearchRoot}
            composerIntent={dockIntent}
            onComposerIntentHandled={onComposerIntentHandled}
            queueHeld={queueHeld}
            onQueueHeldChange={onQueueHeldChange}
            speechHint={speechHint}
            onSubmitted={handleComposerSubmitted}
          />
        </div>
      </div>
    </div>
  )
}
