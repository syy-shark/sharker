/**
 * 聊天主视图：消息列表、流式展示、排队气泡与输入区
 * @see src/ARCH.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Folder } from 'lucide-react'
import { MarkdownBody } from './MarkdownBody'
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
import { ModelPicker } from './ModelPicker'
import { filterSlashCommands, SLASH_COMMANDS, type SlashCommandMeta } from '../../shared/slash-commands'
import { insertAtMention, parseAtMention } from '../../shared/at-mention'
import {
  filterSkillMentions,
  insertSkillMention,
  parseSkillMention,
  type SkillListItem
} from '../../shared/skill-mention'
import { findInThread } from '../../shared/thread-search'
import { resolveComposerSubmit } from '../../shared/composer-submit'
import type { ThreadMode } from '../lib/thread-runtime'
import './ChatView.css'

/** 贴回底部：只有真正滚到尽头才恢复跟随 */
const AT_BOTTOM_PX = 16
/** 离开底部：超过这个距离才显示「回到底部」（避免误触） */
const LEAVE_BOTTOM_PX = 48

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

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
      {attachments.map((a) => (
        <figure key={a.id} className="message-attachment">
          <AttachmentImage attachment={a} />
          <figcaption>{a.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

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
  approval?: ApprovalRequest | null
  approvalResponding?: boolean
  onApproval?: (decision: import('../../shared/approval-session').ApprovalDecision) => void | Promise<void>
  /** Codex 式线程目标：本地工作区或隔离 worktree */
  threadMode?: ThreadMode
  onThreadModeChange?: (mode: ThreadMode) => void
  /** `@` 搜索根目录：隔离线程用 worktree，否则当前工作区 */
  fileSearchRoot?: string
  /** 命令面板「引用文件」/「引用 Skill」/「查找」/「模型」 */
  composerIntent?: 'mention' | 'skill' | 'find' | 'model' | null
  onComposerIntentHandled?: () => void
  /** 暂停自动出队（对标 Codex hold queue） */
  queueHeld?: boolean
  onQueueHeldChange?: (held: boolean) => void
}

/** 消息区 + 底部输入框（工作区/模型选择、上下文环、发送/停止/插队） */
export function ChatView({
  sessionKey = null,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
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
  approval,
  approvalResponding,
  onApproval,
  threadMode = 'local',
  onThreadModeChange,
  fileSearchRoot = '',
  composerIntent = null,
  onComposerIntentHandled,
  queueHeld = false,
  onQueueHeldChange
}: Props) {
  const [input, setInput] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [stickToBottom, setStickToBottom] = useState(true)
  /** 内容溢出且用户不在底部时才显示「回到底部」 */
  const [canJumpToBottom, setCanJumpToBottom] = useState(false)
  const [composerFocus, setComposerFocus] = useState<'none' | 'pointer' | 'keyboard'>('none')
  const [historyActiveIndex, setHistoryActiveIndex] = useState(0)
  const historyActiveIndexRef = useRef(0)
  /** 受控历史弹层挂载/退出（关闭播 exit 后真正卸载，并回焦输入框） */
  const [historyMounted, setHistoryMounted] = useState(false)
  const [historyExiting, setHistoryExiting] = useState(false)
  const historyMountedRef = useRef(false)
  const historyCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const slashActiveIndexRef = useRef(0)
  const [cursor, setCursor] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [mentionHits, setMentionHits] = useState<Array<{ name: string; relativePath: string }>>([])
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0)
  const mentionActiveIndexRef = useRef(0)
  const [skillDismissed, setSkillDismissed] = useState(false)
  const [skillCatalog, setSkillCatalog] = useState<SkillListItem[]>([])
  const [skillActiveIndex, setSkillActiveIndex] = useState(0)
  const skillActiveIndexRef = useRef(0)
  const [modelOpenSignal, setModelOpenSignal] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findHit, setFindHit] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const messagesInnerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerFocusOriginRef = useRef<'pointer' | 'keyboard'>('pointer')
  /** 程序触发的滚动期间，忽略 scroll 事件对 stickToBottom 的干扰 */
  const programmaticScrollRef = useRef(false)
  /** 用户主动上翻；只有自己滚回尽头或点「回到底部」才解除。 */
  const userScrollLockRef = useRef(false)
  /** 最近一次用户滚动方向，避免上滑后仍被当成贴底而拉回去 */
  const lastScrollIntentRef = useRef<'up' | 'down' | null>(null)
  const lastScrollTopRef = useRef(0)
  const touchStartYRef = useRef<number | null>(null)
  const shownApprovalIdRef = useRef<string | null>(null)

  useEffect(() => {
    historyActiveIndexRef.current = historyActiveIndex
  }, [historyActiveIndex])

  // 受控历史弹层：打开立即挂载；关闭先 exit 再卸载，并回焦输入框
  useEffect(() => {
    historyMountedRef.current = historyMounted
  }, [historyMounted])

  useEffect(() => {
    if (showHistoryPicker) {
      if (historyCloseTimerRef.current) {
        clearTimeout(historyCloseTimerRef.current)
        historyCloseTimerRef.current = null
      }
      setHistoryExiting(false)
      setHistoryMounted(true)
      historyMountedRef.current = true
      return
    }
    // 关闭：用 ref 判断是否仍挂载，避免 effect 闭包读到旧 false
    if (!historyMountedRef.current) {
      const t = window.setTimeout(() => textareaRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
    setHistoryExiting(true)
    if (historyCloseTimerRef.current) clearTimeout(historyCloseTimerRef.current)
    historyCloseTimerRef.current = setTimeout(() => {
      setHistoryMounted(false)
      setHistoryExiting(false)
      historyMountedRef.current = false
      historyCloseTimerRef.current = null
      textareaRef.current?.focus()
    }, 180)
    // 注意：不要在 cleanup 里 clearTimeout，否则 StrictMode/并发更新会取消卸载
  }, [showHistoryPicker])

  useEffect(() => {
    return () => {
      if (historyCloseTimerRef.current) {
        clearTimeout(historyCloseTimerRef.current)
        historyCloseTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!showHistoryPicker) return
    const list = conversationTitles
    if (!list?.length) return
    const id = list[historyActiveIndex]?.id
    if (!id) return
    const el = document.getElementById(`history-option-${id}`)
    if (!el) return
    // 在弹层容器内滚动，避免带动整页；深色长列表键盘浏览更稳
    const menu = el.closest('.history-picker, .slash-menu') as HTMLElement | null
    if (!menu) {
      el.scrollIntoView({ block: 'nearest' })
      return
    }
    const er = el.getBoundingClientRect()
    const mr = menu.getBoundingClientRect()
    if (er.top < mr.top) {
      menu.scrollTop -= mr.top - er.top + 6
    } else if (er.bottom > mr.bottom) {
      menu.scrollTop += er.bottom - mr.bottom + 6
    }
  }, [historyActiveIndex, showHistoryPicker, conversationTitles])

  // 历史选择器键盘：↑↓ 移动高亮，Enter 打开，Esc 关闭；与 hover 同步
  useEffect(() => {
    if (!showHistoryPicker) return
    setHistoryActiveIndex(0)
    historyActiveIndexRef.current = 0
    const total = conversationTitles?.length ?? 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseHistoryPicker?.()
        return
      }
      if (!total) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHistoryActiveIndex((i) => {
          const n = (i + 1) % total
          historyActiveIndexRef.current = n
          return n
        })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHistoryActiveIndex((i) => {
          const n = (i - 1 + total) % total
          historyActiveIndexRef.current = n
          return n
        })
        return
      }
      if (e.key === 'Enter') {
        const item = conversationTitles?.[historyActiveIndexRef.current]
        if (!item) return
        e.preventDefault()
        onPickConversation?.(item.id)
        onCloseHistoryPicker?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showHistoryPicker, conversationTitles, onCloseHistoryPicker, onPickConversation])

  const stickToBottomRef = useRef(stickToBottom)
  stickToBottomRef.current = stickToBottom
  const isEmpty =
    messages.length === 0 &&
    queuedPrompts.length === 0 &&
    liveSegments.length === 0 &&
    !streaming &&
    !turnThinking &&
    !loading
  const canSend = Boolean(input.trim() || pendingAttachments.length > 0)
  const activeWorkspace =
    sortWorkspaces(workspaces ?? []).find((w) => w.id === activeWorkspaceId) ??
    sortWorkspaces(workspaces ?? [])[0]
  const hasWorkspace = Boolean(activeWorkspace?.path?.trim())
  const activeProvider = providers.find((p) => p.id === activeProviderId)
  const modelLabel = activeProvider?.model?.trim() || activeProvider?.name
  const slashQuery =
    !showHistoryPicker &&
    !slashDismissed &&
    input.startsWith('/') &&
    !input.includes('\n') &&
    !/\s/.test(input.slice(1))
      ? input.slice(1)
      : null
  const slashItems = slashQuery != null ? filterSlashCommands(slashQuery) : []
  const showSlashMenu = slashItems.length > 0
  const mentionQuery =
    !showHistoryPicker && !showSlashMenu && !mentionDismissed
      ? parseAtMention(input, cursor)
      : null
  const showMentionMenu = Boolean(mentionQuery && fileSearchRoot)
  const skillQuery =
    !showHistoryPicker && !showSlashMenu && !showMentionMenu && !skillDismissed
      ? parseSkillMention(input, cursor)
      : null
  const skillHits = skillQuery ? filterSkillMentions(skillCatalog, skillQuery.query) : []
  const showSkillMenu = Boolean(skillQuery && skillHits.length > 0)

  useEffect(() => {
    slashActiveIndexRef.current = slashActiveIndex
  }, [slashActiveIndex])

  useEffect(() => {
    setSlashActiveIndex(0)
    slashActiveIndexRef.current = 0
  }, [slashQuery])

  useEffect(() => {
    mentionActiveIndexRef.current = mentionActiveIndex
  }, [mentionActiveIndex])

  useEffect(() => {
    setMentionActiveIndex(0)
    mentionActiveIndexRef.current = 0
  }, [mentionQuery?.query, mentionQuery?.start])

  useEffect(() => {
    if (!mentionQuery || !fileSearchRoot || !window.sharker?.searchWorkspaceFiles) {
      setMentionHits([])
      return
    }
    let cancelled = false
    const id = window.setTimeout(() => {
      void window.sharker
        .searchWorkspaceFiles(fileSearchRoot, mentionQuery.query)
        .then((hits) => {
          if (!cancelled) setMentionHits(hits)
        })
        .catch(() => {
          if (!cancelled) setMentionHits([])
        })
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [fileSearchRoot, mentionQuery?.query, mentionQuery?.start])

  useEffect(() => {
    skillActiveIndexRef.current = skillActiveIndex
  }, [skillActiveIndex])

  useEffect(() => {
    setSkillActiveIndex(0)
    skillActiveIndexRef.current = 0
  }, [skillQuery?.query, skillQuery?.start])

  useEffect(() => {
    if (!skillQuery || !window.sharker?.listSkills) {
      return
    }
    let cancelled = false
    void window.sharker
      .listSkills(fileSearchRoot)
      .then((list) => {
        if (!cancelled) setSkillCatalog(list)
      })
      .catch(() => {
        if (!cancelled) setSkillCatalog([])
      })
    return () => {
      cancelled = true
    }
  }, [fileSearchRoot, skillQuery?.start])

  /** 把当前 `@query` 换成选中的工作区相对路径 */
  const pickMention = (relativePath: string) => {
    const next = insertAtMention(input, cursor, relativePath)
    setInput(next.text)
    setCursor(next.cursor)
    setMentionDismissed(false)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.cursor, next.cursor)
      syncTextareaHeight()
    })
  }

  /** 把当前 `$query` 换成选中的 Skill 名 */
  const pickSkill = (name: string) => {
    const next = insertSkillMention(input, cursor, name)
    setInput(next.text)
    setCursor(next.cursor)
    setSkillDismissed(false)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.cursor, next.cursor)
      syncTextareaHeight()
    })
  }

  useEffect(() => {
    if (composerIntent === 'model') {
      setModelOpenSignal((n) => n + 1)
      onComposerIntentHandled?.()
      return
    }
    if (composerIntent === 'find') {
      setFindOpen(true)
      onComposerIntentHandled?.()
      requestAnimationFrame(() => findInputRef.current?.focus())
      return
    }
    if (composerIntent === 'skill') {
      setInput('$')
      setCursor(1)
      setSkillDismissed(false)
      setSlashDismissed(true)
      setMentionDismissed(true)
      onComposerIntentHandled?.()
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(1, 1)
        syncTextareaHeight()
      })
      return
    }
    if (composerIntent !== 'mention') return
    setInput('@')
    setCursor(1)
    setMentionDismissed(false)
    setSlashDismissed(true)
    setSkillDismissed(true)
    onComposerIntentHandled?.()
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(1, 1)
      syncTextareaHeight()
    })
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
          if (target !== textareaRef.current) return
        }
        e.preventDefault()
        setFindOpen(true)
        requestAnimationFrame(() => findInputRef.current?.focus())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickSlashCommand = (cmd: SlashCommandMeta) => {
    if (cmd.action === 'mention_file') {
      setInput('@')
      setCursor(1)
      setMentionDismissed(false)
      setSkillDismissed(true)
      setSlashDismissed(true)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(1, 1)
        syncTextareaHeight()
      })
      return
    }
    if (cmd.action === 'mention_skill') {
      setInput('$')
      setCursor(1)
      setSkillDismissed(false)
      setMentionDismissed(true)
      setSlashDismissed(true)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(1, 1)
        syncTextareaHeight()
      })
      return
    }
    if (cmd.scope === 'ui' && onSlashAction) {
      setInput('')
      setPendingAttachments([])
      setAttachmentError('')
      onSlashAction(cmd, '')
      requestAnimationFrame(() => {
        syncTextareaHeight()
        textareaRef.current?.focus()
      })
      return
    }
    setInput(`/${cmd.name}${cmd.argsHint ? ' ' : ''}`)
    requestAnimationFrame(() => {
      syncTextareaHeight()
      textareaRef.current?.focus()
    })
  }

  useEffect(() => {
    const onPointerDown = () => {
      composerFocusOriginRef.current = 'pointer'
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') composerFocusOriginRef.current = 'keyboard'
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
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
      const resume =
        lastScrollIntentRef.current === 'down' && distance <= AT_BOTTOM_PX
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
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
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
  }, [readScrollMetrics, syncScrollFlags])

  const resumeStickToBottom = useCallback(() => {
    lastScrollIntentRef.current = 'down'
    userScrollLockRef.current = false
    stickToBottomRef.current = true
    setStickToBottom(true)
    setCanJumpToBottom(false)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  /** 根据内容自动调整输入框高度（最高 200px） */
  const syncTextareaHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

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

  useEffect(() => {
    syncTextareaHeight()
  }, [input])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [loading])

  const addImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return
    setAttachmentError('')
    try {
      const saved = await Promise.all(
        imageFiles.map(async (file) =>
          window.sharker.saveAttachment({
            name: file.name || 'clipboard-image.png',
            mimeType: file.type || 'image/png',
            dataUrl: await readFileAsDataUrl(file)
          })
        )
      )
      setPendingAttachments((prev) => [...prev, ...saved])
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : String(e))
    }
  }

  /** 提交输入：空闲直接发送，忙时默认排队；UI 斜杠命令本地拦截 */
  const submit = (mode: PromptSubmitMode = loading ? 'queue' : 'send') => {
    const t = input.trim()
    const attachments = pendingAttachments
    if (!t && attachments.length === 0) return

    // /automations /settings 等 UI 命令：不进模型，直接路由
    if (t.startsWith('/') && attachments.length === 0) {
      const body = t.slice(1).trim()
      const space = body.search(/\s/)
      const name = (space >= 0 ? body.slice(0, space) : body).toLowerCase()
      const args = space >= 0 ? body.slice(space + 1).trim() : ''
      const cmd = SLASH_COMMANDS.find((c) => c.name === name && c.scope === 'ui')
      if (cmd && onSlashAction) {
        setInput('')
        setPendingAttachments([])
        setAttachmentError('')
        onSlashAction(cmd, args)
        requestAnimationFrame(() => {
          syncTextareaHeight()
          textareaRef.current?.focus()
        })
        return
      }
    }

    setInput('')
    setPendingAttachments([])
    setAttachmentError('')
    setStickToBottom(true)
    onSend(t || '请看这张图片。', mode, attachments)
    requestAnimationFrame(() => {
      syncTextareaHeight()
      textareaRef.current?.focus()
    })
  }

  /** 输入框与底部工具栏（模型、发送）；斜杠目录 / `@` 文件选择 / 历史弹层 */
  const composer = (
    <div
      className={`composer-box composer-box--focus-${composerFocus}`}
      onFocusCapture={() => setComposerFocus(composerFocusOriginRef.current)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setComposerFocus('none')
        }
      }}
    >
      {showMentionMenu && mentionHits.length > 0 ? (
        <div className="composer-popover-slot">
          <div
            className="slash-menu popover-enter"
            role="listbox"
            aria-label="引用文件"
            aria-activedescendant={
              mentionHits[mentionActiveIndex]
                ? `mention-option-${mentionHits[mentionActiveIndex].relativePath}`
                : undefined
            }
          >
            <ul className="slash-menu-list">
              {mentionHits.map((hit, index) => (
                <li key={hit.relativePath} role="presentation">
                  <button
                    type="button"
                    id={`mention-option-${hit.relativePath}`}
                    role="option"
                    aria-selected={index === mentionActiveIndex}
                    className={`slash-menu-item${index === mentionActiveIndex ? ' slash-menu-item--active' : ''}`}
                    onMouseEnter={() => {
                      setMentionActiveIndex(index)
                      mentionActiveIndexRef.current = index
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickMention(hit.relativePath)
                    }}
                  >
                    <span className="slash-menu-name">@{hit.name}</span>
                    <span className="slash-menu-desc">{hit.relativePath}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {showSkillMenu ? (
        <div className="composer-popover-slot">
          <div
            className="slash-menu popover-enter"
            role="listbox"
            aria-label="引用 Skill"
            aria-activedescendant={
              skillHits[skillActiveIndex]
                ? `skill-option-${skillHits[skillActiveIndex].name}`
                : undefined
            }
          >
            <ul className="slash-menu-list">
              {skillHits.map((hit, index) => (
                <li key={hit.name} role="presentation">
                  <button
                    type="button"
                    id={`skill-option-${hit.name}`}
                    role="option"
                    aria-selected={index === skillActiveIndex}
                    className={`slash-menu-item${index === skillActiveIndex ? ' slash-menu-item--active' : ''}`}
                    onMouseEnter={() => {
                      setSkillActiveIndex(index)
                      skillActiveIndexRef.current = index
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSkill(hit.name)
                    }}
                  >
                    <span className="slash-menu-name">${hit.name}</span>
                    <span className="slash-menu-desc">{hit.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {showSlashMenu ? (
        <div className="composer-popover-slot">
          <div
            className="slash-menu popover-enter"
            role="listbox"
            aria-label="斜杠命令"
            aria-activedescendant={
              slashItems[slashActiveIndex]
                ? `slash-option-${slashItems[slashActiveIndex].name}`
                : undefined
            }
          >
            <ul className="slash-menu-list">
              {slashItems.map((cmd, index) => (
                <li key={cmd.name} role="presentation">
                  <button
                    type="button"
                    id={`slash-option-${cmd.name}`}
                    role="option"
                    aria-selected={index === slashActiveIndex}
                    className={`slash-menu-item${index === slashActiveIndex ? ' slash-menu-item--active' : ''}`}
                    onMouseEnter={() => {
                      setSlashActiveIndex(index)
                      slashActiveIndexRef.current = index
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSlashCommand(cmd)
                    }}
                  >
                    <span className="slash-menu-name">/{cmd.name}</span>
                    <span className="slash-menu-desc">{cmd.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {historyMounted && conversationTitles?.length ? (
        <div className="composer-popover-slot">
          <div
            className={`slash-menu history-picker ${historyExiting ? 'popover-exit' : 'popover-enter'}`.trim()}
            role="listbox"
            aria-label="历史对话"
            aria-activedescendant={
              conversationTitles[historyActiveIndex]
                ? `history-option-${conversationTitles[historyActiveIndex].id}`
                : undefined
            }
          >
            <ul className="slash-menu-list">
              {conversationTitles.map((c, index) => (
                <li key={c.id} role="presentation">
                  <button
                    type="button"
                    id={`history-option-${c.id}`}
                    role="option"
                    aria-selected={index === historyActiveIndex}
                    className={`slash-menu-item${index === historyActiveIndex ? ' slash-menu-item--active' : ''}`}
                    onMouseEnter={() => {
                      setHistoryActiveIndex(index)
                      historyActiveIndexRef.current = index
                    }}
                    onMouseMove={() => {
                      if (historyActiveIndexRef.current !== index) {
                        setHistoryActiveIndex(index)
                        historyActiveIndexRef.current = index
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onPickConversation?.(c.id)
                      onCloseHistoryPicker?.()
                    }}
                  >
                    <span className="slash-menu-desc">{c.title || '未命名对话'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        className="composer-input"
        value={input}
        onChange={(e) => {
          setSlashDismissed(false)
          setMentionDismissed(false)
          setSkillDismissed(false)
          setInput(e.target.value)
          setCursor(e.target.selectionStart ?? e.target.value.length)
        }}
        onSelect={(e) => {
          setCursor(e.currentTarget.selectionStart ?? 0)
        }}
        onKeyDown={(e) => {
          // 中文输入法组字中按 Enter 不应发送（keyCode 229 = 组字中）
          const composing =
            e.nativeEvent.isComposing ||
            e.key === 'Process' ||
            (e.nativeEvent as KeyboardEvent).keyCode === 229
          if (composing) return
          if (showSkillMenu) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSkillActiveIndex((i) => {
                const n = (i + 1) % skillHits.length
                skillActiveIndexRef.current = n
                return n
              })
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSkillActiveIndex((i) => {
                const n = (i - 1 + skillHits.length) % skillHits.length
                skillActiveIndexRef.current = n
                return n
              })
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setSkillDismissed(true)
              return
            }
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
              e.preventDefault()
              const hit = skillHits[skillActiveIndexRef.current]
              if (hit) pickSkill(hit.name)
              return
            }
          }
          if (showMentionMenu && mentionHits.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setMentionActiveIndex((i) => {
                const n = (i + 1) % mentionHits.length
                mentionActiveIndexRef.current = n
                return n
              })
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setMentionActiveIndex((i) => {
                const n = (i - 1 + mentionHits.length) % mentionHits.length
                mentionActiveIndexRef.current = n
                return n
              })
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setMentionDismissed(true)
              return
            }
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
              e.preventDefault()
              const hit = mentionHits[mentionActiveIndexRef.current]
              if (hit) pickMention(hit.relativePath)
              return
            }
          }
          if (showSlashMenu) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSlashActiveIndex((i) => {
                const n = (i + 1) % slashItems.length
                slashActiveIndexRef.current = n
                return n
              })
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSlashActiveIndex((i) => {
                const n = (i - 1 + slashItems.length) % slashItems.length
                slashActiveIndexRef.current = n
                return n
              })
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setSlashDismissed(true)
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              const cmd = slashItems[slashActiveIndexRef.current]
              if (cmd) pickSlashCommand(cmd)
              return
            }
            if (e.key === 'Tab') {
              e.preventDefault()
              const cmd = slashItems[slashActiveIndexRef.current]
              if (cmd) pickSlashCommand(cmd)
              return
            }
          }
          const menuOpen = showMentionMenu || showSkillMenu || showSlashMenu || historyMounted
          const mode = resolveComposerSubmit({
            key: e.key,
            shiftKey: e.shiftKey,
            loading,
            menuOpen
          })
          if (mode) {
            e.preventDefault()
            submit(mode)
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault()
            void addImageFiles(files)
          }
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files)
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault()
            void addImageFiles(files)
          }
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => i.type.startsWith('image/'))) {
            e.preventDefault()
          }
        }}
        placeholder={
          loading
            ? 'Enter 注入当前回合，Tab 排队下一条…'
            : '输入消息，/ 命令，@ 文件，$ Skill…'
        }
        rows={1}
      />
      {pendingAttachments.length > 0 || attachmentError ? (
        <div className="composer-attachments">
          {pendingAttachments.map((a) => (
            <div key={a.id} className="composer-attachment">
              <AttachmentImage attachment={a} />
              <span title={a.name}>{a.name}</span>
              <button
                type="button"
                onClick={() =>
                  setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))
                }
                aria-label={`移除 ${a.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {attachmentError ? (
            <span className="composer-attachment-error">{attachmentError}</span>
          ) : null}
        </div>
      ) : null}
      <div className="composer-footer">
        <div className="composer-footer-left">
          {activeWorkspace?.label || activeWorkspace?.path ? (
            <span
              className="composer-workspace-label"
              title={activeWorkspace.path || activeWorkspace.label || ''}
            >
              <Folder size={13} strokeWidth={2} aria-hidden />
              <span className="composer-workspace-name">
                {activeWorkspace.label || activeWorkspace.path}
              </span>
            </span>
          ) : null}
          {onThreadModeChange ? (
            <div className="composer-thread-mode" role="group" aria-label="线程模式">
              <button
                type="button"
                className={`composer-thread-chip${threadMode === 'local' ? ' is-active' : ''}`}
                aria-pressed={threadMode === 'local'}
                onClick={() => onThreadModeChange('local')}
                title="交接回本地工作区（把隔离变更带过来）"
              >
                本地
              </button>
              <button
                type="button"
                className={`composer-thread-chip${threadMode === 'worktree' ? ' is-active' : ''}`}
                aria-pressed={threadMode === 'worktree'}
                onClick={() => onThreadModeChange('worktree')}
                title="交接进隔离 worktree（把当前未提交变更带过去）"
              >
                隔离
              </button>
            </div>
          ) : null}
        </div>
        <div className="composer-footer-right">
          <ModelPicker
            providers={providers}
            activeProviderId={activeProviderId}
            onSelect={onSelectProvider}
            onThinkingLevelChange={onThinkingLevelChange}
            openSignal={modelOpenSignal}
          />
          {onQueueHeldChange && (loading || queuedPrompts.length > 0 || queueHeld) ? (
            <button
              type="button"
              className={`composer-jump${queueHeld ? ' is-active' : ''}`}
              onClick={() => onQueueHeldChange(!queueHeld)}
              title={queueHeld ? '恢复回合结束后自动执行排队' : '暂停：当前回合结束后不要自动执行排队'}
              aria-pressed={queueHeld}
            >
              {queueHeld ? '继续队列' : '暂停队列'}
            </button>
          ) : null}
          {loading && canSend ? (
            <button
              type="button"
              className="composer-jump"
              onClick={() => submit('jump')}
              title="注入：中止当前任务并立即执行本条（Enter）"
              aria-label="注入当前回合"
            >
              注入
            </button>
          ) : null}
          <span className="composer-send-slot" data-mode={loading ? 'stop' : 'send'}>
            <button
              type="button"
              className={`composer-send composer-send--stop ${loading ? 'composer-send--visible' : ''}`}
              onClick={onAbort}
              title="停止"
              aria-label="停止"
              aria-hidden={!loading}
              tabIndex={loading ? 0 : -1}
            >
              <span className="composer-send-stop" />
            </button>
            <button
              type="button"
              className={`composer-send composer-send--submit ${canSend ? 'composer-send--active' : ''} ${!loading ? 'composer-send--visible' : ''}`}
              onClick={() => submit('send')}
              disabled={!canSend || loading}
              title="发送 (Enter)"
              aria-label="发送"
              aria-hidden={loading}
              tabIndex={loading ? -1 : 0}
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          </span>
        </div>
      </div>
    </div>
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
                    textareaRef.current?.focus()
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
                onClick={() =>
                  setFindHit((i) => (i - 1 + findHits.length) % findHits.length)
                }
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
            {messages.map((m, index) =>
              m.role === 'user' ? (
                <div
                  key={m.id}
                  id={`msg-${m.id}`}
                  className={`message-row message-row--user${
                    findHits.some((h) => h.messageId === m.id) ? ' is-find-hit' : ''
                  }${findHits[findHit]?.messageId === m.id ? ' is-find-current' : ''}`}
                >
                  <div className="message-user-wrap">
                    <div className="message-bubble message-bubble--user">
                      <MessageAttachments attachments={m.attachments} />
                      <p>{m.content}</p>
                    </div>
                    <MessageActions content={m.content} messageId={m.id} />
                  </div>
                </div>
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
                    onRetry={
                      index === messages.length - 1 && m.meta?.retryOfUserMessageId && onRetry
                        ? () => onRetry(m.meta!.retryOfUserMessageId!)
                        : undefined
                    }
                  />
                </div>
              )
            )}

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
          {composer}
        </div>
      </div>
    </div>
  )
}
