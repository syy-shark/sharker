/**
 * 聊天主视图：消息列表、流式展示、排队气泡；输入区在 ComposerDock（直播 token 不重绘）。
 * 贴底跟随在 ResizeObserver 回调里同帧写 scrollTop（内容和滚动视口都盯）。
 * 长线程先挂最近一段，上滑再揭示更早行（对标 Codex older history fetched as needed）。
 * @see src/ARCH.md
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { ChatImage, ChatImageWorkspaceProvider } from './ChatImage'
import { MessageActions } from './MessageActions'
import {
  ComposerDock,
  type ComposerDockHandle,
  type ComposerDockIntent,
  type ComposerSeed
} from './ComposerDock'
import { ComposerQueue } from './ComposerQueue'
import type { ChatSearchItem } from '../../shared/conversation'
import {
  lastUserMessageId,
  shouldStickAfterComposerSubmit,
  type ComposerEnterBehavior
} from '../../shared/composer-submit'
import {
  hasLiveAssistantBody,
  historicalMessagesDuringLive,
  liveRowMessageId,
  shouldRenderLiveAssistantRow
} from '../../shared/session-runtime'
import type { SuggestedPrompt } from '../../shared/suggested-prompts'
import {
  isNearLiveMessageRow,
  liveStickNeedsFollow,
  liveStickScrollTop,
  shouldFocusTranscriptScroller,
  shouldLockStickOnTranscriptKey,
  transcriptNavIntent,
  TRANSCRIPT_NAV_BLOCK,
  nextRowIntrinsicHeights,
  resolveRowIntrinsicHeight,
  rowIntrinsicSizeStyle,
  shouldForceStickScroll,
  shouldFollowApprovalIntoView
} from '../../shared/live-display'
import {
  captureTranscriptScroll,
  resolveRestoredScrollTop,
  shouldDeferScrollRestore,
  type TranscriptScrollSnapshot
} from '../../shared/transcript-scroll'
import {
  effectiveTranscriptWindowEnd,
  effectiveTranscriptWindowStart,
  revealNewerWindowStart,
  revealOlderWindowStart,
  restoreTranscriptWindowStart,
  shouldFetchOlderHistoryPage,
  shouldFetchSlimHistoryOnJumpTop,
  shouldRevealNewerTranscript,
  shouldRevealOlderTranscript,
  shiftPinnedStartAfterPrepend,
  stickTranscriptWindowStart,
  windowIncludesLatest,
  windowStartToCoverIndex
} from '../../shared/transcript-window'
import { lastCompletedAssistantText, type CopyOutputTarget } from '../../shared/copy-output'
import { normalizeStreamingText } from '../../shared/streaming-markdown'
import type { KeymapOverrides } from '../../shared/keymap'
import type { SlashCommandMeta } from '../../shared/slash-commands'
import {
  findHitNeedsHistory,
  findInThread,
  mergeThreadSearchHits,
  resolveFindHitIndex,
  seedFindQuery,
  type ThreadSearchHit
} from '../../shared/thread-search'
import {
  isReviewFindFocus,
  shouldHandleReviewFindShortcut
} from '../../shared/review-diff-search'
import { clearFindHighlight, paintFindHighlight } from '../lib/find-highlight'
import { textForSpeech } from '../../shared/composer-dictation'
import {
  formatComposerInsert,
  formatSideChatPrompt,
  isTranscriptSelectionRange,
  normalizeTranscriptSelection,
  placeSelectionAskBar
} from '../../shared/side-chat-quote'
import type { ThreadMode } from '../lib/thread-runtime'
import { type GoalCommand, type ThreadGoal } from '../../shared/thread-goal'
import './ChatView.css'

const EMPTY_FIND_HITS: ThreadSearchHit[] = []

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
  return <ChatImage src={src} alt={attachment.name} filePath={attachment.path} name={attachment.name} />
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
  nearLive,
  intrinsicHeight,
  editRequested,
  onEditRequestHandled,
  onEdit
}: {
  id: string
  content: string
  attachments?: ChatAttachment[]
  findHit: boolean
  findCurrent: boolean
  nearLive?: boolean
  intrinsicHeight?: number
  editRequested?: boolean
  onEditRequestHandled?: () => void
  onEdit?: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!editRequested) return
    setDraft(content)
    setEditing(true)
    onEditRequestHandled?.()
    requestAnimationFrame(() => {
      const el = editInputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }, [content, editRequested, onEditRequestHandled])
  return (
    <div
      id={`msg-${id}`}
      className={`message-row message-row--user${nearLive ? ' message-row--near-live' : ''}${
        findHit ? ' is-find-hit' : ''
      }${findCurrent ? ' is-find-current' : ''}`}
      style={nearLive ? undefined : rowIntrinsicSizeStyle(intrinsicHeight)}
    >
      <div className="message-user-wrap">
        <div className="message-bubble message-bubble--user">
          <MessageAttachments attachments={attachments} />
          {editing ? (
            <div className="message-user-edit">
              <textarea
                ref={editInputRef}
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
            <p>{normalizeStreamingText(content)}</p>
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
  /** 本轮助手预留 id：直播行与收束后历史行共用，避免整行卸载重挂 */
  liveAssistantId?: string | null
  queuedPrompts: QueuedPrompt[]
  /** 已接受、下一工具/采样后写入当前回合（对标 Codex pending steer） */
  pendingSteers?: QueuedPrompt[]
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
  onEditQueued?: (id: string, text: string) => void
  onMoveQueued?: (id: string, direction: -1 | 1) => void
  onSendQueued?: (id: string) => void
  followUpBehavior?: 'queue' | 'steer'
  composerEnterBehavior?: ComposerEnterBehavior
  suggestedPrompts?: SuggestedPrompt[]
  onSuggestedPrompt?: (item: SuggestedPrompt) => void
  onAbort: () => void
  onSlashAction?: (cmd: SlashCommandMeta, args: string) => void
  showHistoryPicker?: boolean
  onCloseHistoryPicker?: () => void
  conversationTitles?: ChatSearchItem[]
  onPickConversation?: (id: string) => void
  onRetry?: (userMessageId: string) => void
  onEditUserMessage?: (userMessageId: string, text: string) => void
  approval?: ApprovalRequest | null
  approvalResponding?: boolean
  onApproval?: (decision: import('../../shared/approval-session').ApprovalDecision) => void | Promise<void>
  /** 主线程活动点开子 Agent */
  onOpenSubAgent?: (id: string | null) => void
  /** 完成后改文件芯片打开审查 */
  onOpenChangedFiles?: (paths: string[]) => void
  /** Codex 式线程目标：本地工作区或隔离 worktree */
  threadMode?: ThreadMode
  threadGoal?: ThreadGoal | null
  onGoalCommand?: (command: GoalCommand) => void
  goalEditTick?: number
  onThreadModeChange?: (mode: ThreadMode) => void
  /** 首次创建隔离 worktree 的起点分支 */
  worktreeBaseRef?: string
  onWorktreeBaseRefChange?: (ref: string) => void
  /** `@` 搜索根目录：隔离线程用 worktree，否则当前工作区 */
  fileSearchRoot?: string
  fileSearchExtraRoots?: string[]
  /** 命令面板「引用文件」/「引用 Skill」/「查找」/「模型」 */
  composerIntent?: ComposerDockIntent | 'find'
  onComposerIntentHandled?: () => void
  /** 暂停自动出队（对标 Codex hold queue） */
  queueHeld?: boolean
  onQueueHeldChange?: (held: boolean) => void
  /** 隔离 worktree 目录已被清理，可从快照恢复 */
  worktreeMissing?: boolean
  onRestoreWorktree?: () => void
  composerSeed?: ComposerSeed | null
  /** 计划模式芯片（对标 Codex /plan） */
  planMode?: boolean
  onPlanModeChange?: (enabled: boolean) => void
  /** 对话里命令输出展示量（对标 Codex command output） */
  toolOutputDisplay?: 'brief' | 'standard' | 'verbose'
  /** 划选正文后旁路提问（对标 Codex Ask in side chat） */
  onAskInSideChat?: (prompt: string) => void
  /** 划选正文插入当前输入框（对标 Codex send selection to composer） */
  onInsertComposer?: (text: string) => void
  /** `/copy` 有代码块或引用时先选再复制（对标 Codex /copy picker） */
  copyPicker?: CopyOutputTarget[] | null
  onCopyPick?: (target: CopyOutputTarget) => void
  onCopyPickerClose?: () => void
  /** 本会话上次离开时的滚动（对标 Codex 26.406 按对话记住位置） */
  scrollSnapshot?: TranscriptScrollSnapshot | null
  onScrollSnapshot?: (conversationId: string, snap: TranscriptScrollSnapshot) => void
  keyboardShortcuts?: KeymapOverrides
  /** 盘上还有更早消息未进内存（对标 Codex olderCursor） */
  hasOlderHistory?: boolean
  /** 上滑到顶且内存窗已到头时取更早一页 */
  onLoadOlderHistory?: () => void | Promise<void>
  /** 跳到对话顶时取最旧一页（不灌瘦身全文） */
  onNeedFullHistory?: () => void | Promise<void>
  /** 头页下翻取更新一段，接上尾页则清掉头页 */
  onNeedNewerHead?: () => void | Promise<void>
  /** 头页上翻取更旧一段 */
  onNeedOlderHead?: () => void | Promise<void>
  /** 回到尾页（跳底 / 发送 / 查找命中在尾） */
  onLeaveHistoryHead?: () => void
  /** 点开瘦身后的命令输出 / 思考时取一条完整消息 */
  onNeedFullMessage?: (messageId: string) => void
  /** 已加载尾页的盘上起点 seq，给查找命中对齐 */
  historyStartSeq?: number
  /** ⌘↑ / 查找命中用的最旧一段，与尾页 messages 分开，禁止拼成一段假连续列表 */
  historyHead?: ChatMessage[] | null
  historyHeadStartSeq?: number
  /** 分页线程查找：只扫用户/助手正文，不回放整段（对标 Codex #33907） */
  onSearchThread?: (query: string) => void | Promise<ThreadSearchHit[]>
  /** 查找跳到未加载的更早命中时揭开命中起的有界一段 */
  onRevealFindHit?: (fromSeq: number) => void | Promise<void>
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
  liveAssistantId = null,
  queuedPrompts,
  pendingSteers = [],
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
  onEditQueued,
  onMoveQueued,
  onSendQueued,
  followUpBehavior = 'queue',
  composerEnterBehavior = 'enter',
  suggestedPrompts = [],
  onSuggestedPrompt,
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
  onOpenChangedFiles,
  threadMode = 'local',
  threadGoal = null,
  onGoalCommand,
  goalEditTick = 0,
  onThreadModeChange,
  worktreeBaseRef = '',
  onWorktreeBaseRefChange,
  fileSearchRoot = '',
  fileSearchExtraRoots = [],
  composerIntent = null,
  onComposerIntentHandled,
  queueHeld = false,
  onQueueHeldChange,
  worktreeMissing = false,
  onRestoreWorktree,
  composerSeed = null,
  planMode = false,
  onPlanModeChange,
  toolOutputDisplay = 'standard',
  onAskInSideChat,
  onInsertComposer,
  copyPicker = null,
  onCopyPick,
  onCopyPickerClose,
  scrollSnapshot = null,
  onScrollSnapshot,
  keyboardShortcuts,
  hasOlderHistory = false,
  onLoadOlderHistory,
  onNeedFullHistory,
  onNeedNewerHead,
  onNeedOlderHead,
  onLeaveHistoryHead,
  onNeedFullMessage,
  historyStartSeq = 0,
  historyHead = null,
  historyHeadStartSeq = 0,
  onSearchThread,
  onRevealFindHit
}: Props) {
  const composerRef = useRef<ComposerDockHandle>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  /** 内容溢出且用户不在底部时才显示「回到底部」 */
  const [canJumpToBottom, setCanJumpToBottom] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findHit, setFindHit] = useState(0)
  const [diskFindHits, setDiskFindHits] = useState<ThreadSearchHit[]>(EMPTY_FIND_HITS)
  const findAnchorRef = useRef<Pick<ThreadSearchHit, 'messageId' | 'occurrence'> | null>(null)
  const [editUserMessageId, setEditUserMessageId] = useState<string | null>(null)
  const [pinnedStart, setPinnedStart] = useState<number | null>(() =>
    restoreTranscriptWindowStart(scrollSnapshot)
  )
  const [pinnedSession, setPinnedSession] = useState(sessionKey)
  if (sessionKey !== pinnedSession) {
    setPinnedSession(sessionKey)
    setPinnedStart(restoreTranscriptWindowStart(scrollSnapshot))
    setDiskFindHits(EMPTY_FIND_HITS)
    findAnchorRef.current = null
  }
  const [sideAsk, setSideAsk] = useState<{ text: string; top: number; left: number } | null>(null)
  const [copyPickIndex, setCopyPickIndex] = useState(0)
  const copyPickIndexRef = useRef(0)

  useEffect(() => {
    copyPickIndexRef.current = copyPickIndex
  }, [copyPickIndex])

  useEffect(() => {
    setCopyPickIndex(0)
    copyPickIndexRef.current = 0
  }, [copyPicker])

  useEffect(() => {
    setEditUserMessageId(null)
    setSideAsk(null)
    measuredRowHeightsRef.current = new Map()
    setIntrinsicHeights(new Map())
    onCopyPickerClose?.()
  }, [sessionKey, onCopyPickerClose])

  useEffect(() => {
    if (!copyPicker?.length) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onCopyPickerClose?.()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setCopyPickIndex((i) => {
          const next = Math.min(copyPicker.length - 1, i + 1)
          copyPickIndexRef.current = next
          return next
        })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setCopyPickIndex((i) => {
          const next = Math.max(0, i - 1)
          copyPickIndexRef.current = next
          return next
        })
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault()
        e.stopImmediatePropagation()
        const target = copyPicker[copyPickIndexRef.current]
        if (target) onCopyPick?.(target)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [copyPicker, onCopyPick, onCopyPickerClose])
  const findInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const messagesInnerRef = useRef<HTMLDivElement>(null)
  const measuredRowHeightsRef = useRef(new Map<string, number>())
  const [intrinsicHeights, setIntrinsicHeights] = useState<ReadonlyMap<string, number>>(
    () => new Map()
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const syncSideAsk = useCallback(() => {
    if (!onAskInSideChat && !onInsertComposer) {
      setSideAsk(null)
      return
    }
    const root = messagesInnerRef.current
    const scroller = messagesRef.current
    if (!root || !scroller) {
      setSideAsk(null)
      return
    }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSideAsk(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!isTranscriptSelectionRange(range, root)) {
      setSideAsk(null)
      return
    }
    const text = normalizeTranscriptSelection(sel.toString())
    if (!text) {
      setSideAsk(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const box = scroller.getBoundingClientRect()
    if (rect.bottom < box.top || rect.top > box.bottom) {
      setSideAsk(null)
      return
    }
    const placed = placeSelectionAskBar(rect, box)
    const next = { text, top: placed.top, left: placed.left }
    setSideAsk((prev) =>
      prev && prev.text === next.text && prev.top === next.top && prev.left === next.left ? prev : next
    )
  }, [onAskInSideChat, onInsertComposer])
  useEffect(() => {
    if (!onAskInSideChat && !onInsertComposer) return
    const onSel = () => syncSideAsk()
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [onAskInSideChat, onInsertComposer, syncSideAsk])
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
  const lastSnapshotRef = useRef<TranscriptScrollSnapshot | null>(null)
  const pendingRestoreRef = useRef<TranscriptScrollSnapshot | null>(null)
  const sessionKeyRef = useRef<string | null | undefined>(undefined)
  const pinnedStartRef = useRef<number | null>(pinnedStart)
  pinnedStartRef.current = pinnedStart
  const messagesLengthRef = useRef(0)
  const revealPreserveHeightRef = useRef<number | null>(null)
  const pendingJumpTopRef = useRef(false)
  /** 从尾页上滑进头页：滚到头页底（与尾页相接），不要跳到头页顶 */
  const pendingHeadJunctionRef = useRef(false)
  const pendingFullHistoryAfterLiveRef = useRef(false)
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const loadOlderBusyRef = useRef(false)
  const hasOlderHistoryRef = useRef(hasOlderHistory)
  hasOlderHistoryRef.current = hasOlderHistory
  const onLoadOlderHistoryRef = useRef(onLoadOlderHistory)
  onLoadOlderHistoryRef.current = onLoadOlderHistory
  const onNeedFullHistoryRef = useRef(onNeedFullHistory)
  onNeedFullHistoryRef.current = onNeedFullHistory
  const onNeedNewerHeadRef = useRef(onNeedNewerHead)
  onNeedNewerHeadRef.current = onNeedNewerHead
  const onNeedOlderHeadRef = useRef(onNeedOlderHead)
  onNeedOlderHeadRef.current = onNeedOlderHead
  const onLeaveHistoryHeadRef = useRef(onLeaveHistoryHead)
  onLeaveHistoryHeadRef.current = onLeaveHistoryHead
  const viewingHead = Boolean(historyHead?.length)
  const viewingHeadRef = useRef(viewingHead)
  viewingHeadRef.current = viewingHead
  const historyHeadStartSeqRef = useRef(historyHeadStartSeq)
  historyHeadStartSeqRef.current = historyHeadStartSeq
  const transcriptMessages = viewingHead ? historyHead! : messages
  messagesLengthRef.current = transcriptMessages.length
  const messagesListRef = useRef(transcriptMessages)
  messagesListRef.current = transcriptMessages
  const trimTopIdsRef = useRef<string[]>([])
  const prevHeadRef = useRef<{
    id?: string
    len: number
    session?: string | null
    head?: boolean
  }>({
    id: transcriptMessages[0]?.id,
    len: transcriptMessages.length,
    session: sessionKey,
    head: viewingHead
  })
  const prevViewRef = useRef({ head: viewingHead, session: sessionKey })
  if (
    prevViewRef.current.head &&
    !viewingHead &&
    prevViewRef.current.session === sessionKey &&
    userScrollLockRef.current
  ) {
    setPinnedStart(0)
    pendingJumpTopRef.current = true
  }
  prevViewRef.current = { head: viewingHead, session: sessionKey }
  if (sessionKey !== prevHeadRef.current.session || viewingHead !== prevHeadRef.current.head) {
    prevHeadRef.current = {
      id: transcriptMessages[0]?.id,
      len: transcriptMessages.length,
      session: sessionKey,
      head: viewingHead
    }
    if (viewingHead) {
      setPinnedStart(0)
      if (!pendingJumpTopRef.current && !findOpen) pendingHeadJunctionRef.current = true
    }
  } else if (
    transcriptMessages[0]?.id &&
    transcriptMessages[0].id !== prevHeadRef.current.id &&
    transcriptMessages.length > prevHeadRef.current.len
  ) {
    const delta = transcriptMessages.length - prevHeadRef.current.len
    prevHeadRef.current = {
      id: transcriptMessages[0].id,
      len: transcriptMessages.length,
      session: sessionKey,
      head: viewingHead
    }
    if (pendingJumpTopRef.current) {
      setPinnedStart(0)
    } else {
      setPinnedStart((p) => shiftPinnedStartAfterPrepend(p, delta))
    }
  } else {
    prevHeadRef.current = {
      id: transcriptMessages[0]?.id,
      len: transcriptMessages.length,
      session: sessionKey,
      head: viewingHead
    }
  }
  const queuedPersistRef = useRef<{ id: string; snap: TranscriptScrollSnapshot } | null>(null)
  const onScrollSnapshotRef = useRef(onScrollSnapshot)
  onScrollSnapshotRef.current = onScrollSnapshot
  if (sessionKeyRef.current !== sessionKey) {
    const prev = sessionKeyRef.current
    if (prev && lastSnapshotRef.current) {
      queuedPersistRef.current = { id: prev, snap: lastSnapshotRef.current }
    }
    sessionKeyRef.current = sessionKey
    pendingRestoreRef.current = scrollSnapshot ?? null
  }

  const rememberTranscriptSnapshot = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    lastSnapshotRef.current = captureTranscriptScroll(
      el,
      stickToBottomRef.current,
      userScrollLockRef.current,
      pinnedStartRef.current
    )
  }, [])

  const applyTranscriptRestore = useCallback((el: HTMLElement, snap: TranscriptScrollSnapshot | null) => {
    const r = resolveRestoredScrollTop(el, snap)
    programmaticScrollRef.current = true
    el.scrollTop = r.scrollTop
    programmaticScrollRef.current = false
    stickToBottomRef.current = r.stickToBottom
    userScrollLockRef.current = r.userLocked
    lastScrollIntentRef.current = r.userLocked ? 'up' : null
    lastScrollTopRef.current = el.scrollTop
    setStickToBottom(r.stickToBottom)
    lastSnapshotRef.current = captureTranscriptScroll(
      el,
      r.stickToBottom,
      r.userLocked,
      pinnedStartRef.current
    )
    pendingRestoreRef.current =
      snap && shouldDeferScrollRestore(el, snap) ? snap : null
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
    const distance = Math.max(0, maxTop - el.scrollTop)
    setCanJumpToBottom(!r.stickToBottom && maxTop > 12 && distance > LEAVE_BOTTOM_PX)
  }, [])

  useLayoutEffect(() => {
    const queued = queuedPersistRef.current
    queuedPersistRef.current = null
    if (queued) onScrollSnapshotRef.current?.(queued.id, queued.snap)
    const el = messagesRef.current
    if (!el) return
    applyTranscriptRestore(el, pendingRestoreRef.current)
  }, [sessionKey, applyTranscriptRestore])

  useEffect(() => {
    return () => {
      const id = sessionKeyRef.current
      const el = messagesRef.current
      const snap = el
        ? captureTranscriptScroll(
            el,
            stickToBottomRef.current,
            userScrollLockRef.current,
            pinnedStartRef.current
          )
        : lastSnapshotRef.current
      if (id && snap) onScrollSnapshotRef.current?.(id, snap)
    }
  }, [])
  const isEmpty =
    messages.length === 0 &&
    queuedPrompts.length === 0 &&
    pendingSteers.length === 0 &&
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

  const openFindBar = useCallback((selected?: string) => {
    const seeded = seedFindQuery(selected ?? '')
    if (seeded) {
      setFindQuery(seeded)
      setFindHit(0)
    }
    setFindOpen(true)
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      if (seeded) findInputRef.current?.select()
    })
  }, [])

  useEffect(() => {
    if (composerIntent === 'find') {
      const selected =
        typeof window !== 'undefined' && !findInputRef.current?.contains(document.activeElement)
          ? window.getSelection()?.toString() ?? ''
          : ''
      openFindBar(selected)
      onComposerIntentHandled?.()
    }
  }, [composerIntent, onComposerIntentHandled, openFindBar])

  const liveRowId = liveRowMessageId(liveAssistantId)

  const memoryFindHits = useMemo(() => {
    if (!findQuery.trim()) return EMPTY_FIND_HITS
    const rows: { id: string; content: string; seq: number }[] = []
    if (historyHead?.length) {
      for (let i = 0; i < historyHead.length; i++) {
        const m = historyHead[i]
        rows.push({ id: m.id, content: m.content, seq: historyHeadStartSeq + i })
      }
    }
    const start = historyStartSeq
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      rows.push({ id: m.id, content: m.content, seq: start + i })
    }
    if (streaming.trim()) {
      rows.push({ id: liveRowId, content: streaming, seq: start + messages.length })
    }
    return findInThread(rows, findQuery)
  }, [historyHead, historyHeadStartSeq, historyStartSeq, liveRowId, messages, findQuery, streaming])

  const findHits = useMemo(
    () => mergeThreadSearchHits(memoryFindHits, diskFindHits),
    [memoryFindHits, diskFindHits]
  )

  useEffect(() => {
    setFindHit(0)
    findAnchorRef.current = null
  }, [findQuery])

  useEffect(() => {
    const next = resolveFindHitIndex(findHits, findAnchorRef.current, findHit)
    if (next !== findHit) setFindHit(next)
  }, [findHits])

  useEffect(() => {
    const cur = findHits[findHit]
    findAnchorRef.current = cur
      ? { messageId: cur.messageId, occurrence: cur.occurrence }
      : null
  }, [findHit, findHits])

  useEffect(() => {
    if (!findOpen) {
      setDiskFindHits(EMPTY_FIND_HITS)
      return
    }
    const q = findQuery.trim()
    if (!q || !onSearchThread) {
      setDiskFindHits(EMPTY_FIND_HITS)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void Promise.resolve(onSearchThread(q)).then((hits) => {
        if (!cancelled) setDiskFindHits(hits ?? EMPTY_FIND_HITS)
      })
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [findOpen, findQuery, onSearchThread, sessionKey])

  const stepFindHit = useCallback((direction: 1 | -1) => {
    if (!findHits.length) return
    setFindHit((i) => {
      const next = (i + direction + findHits.length) % findHits.length
      const hit = findHits[next]
      findAnchorRef.current = hit
        ? { messageId: hit.messageId, occurrence: hit.occurrence }
        : null
      return next
    })
  }, [findHits])

  /** 官方 Find next / previous：⌘G / ⌘⇧G / F3，查找未开时先打开再跳 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if (
        shouldHandleReviewFindShortcut({
          focusInsideReview:
            isReviewFindFocus(e.target) || isReviewFindFocus(document.activeElement)
        })
      ) {
        return
      }
      const isF3 = e.key === 'F3'
      const isFindNext =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key === 'g' || e.key === 'G')
      if (!isF3 && !isFindNext) return
      e.preventDefault()
      e.stopPropagation()
      const back = e.shiftKey
      if (!findOpen) {
        setFindOpen(true)
        requestAnimationFrame(() => findInputRef.current?.focus())
      }
      stepFindHit(back ? -1 : 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [findOpen, stepFindHit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'f' && !e.altKey && !e.shiftKey) {
        const target = e.target
        if (
          shouldHandleReviewFindShortcut({
            focusInsideReview:
              isReviewFindFocus(target) || isReviewFindFocus(document.activeElement)
          })
        ) {
          return
        }
        if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable=true]')) {
          if (target === findInputRef.current) {
            e.preventDefault()
            return
          }
          if (!target.closest('.composer-box')) return
        }
        const selected =
          target instanceof HTMLElement && target.closest('.chat-find')
            ? ''
            : window.getSelection()?.toString() ?? ''
        e.preventDefault()
        openFindBar(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFindBar])

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
      if (viewingHeadRef.current) {
        stickToBottomRef.current = false
        setStickToBottom(false)
        setCanJumpToBottom(true)
        return
      }
      if (pinnedStartRef.current != null) {
        stickToBottomRef.current = false
        setStickToBottom(false)
        setCanJumpToBottom(false)
        return
      }
      userScrollLockRef.current = false
      stickToBottomRef.current = true
      setStickToBottom(true)
      setCanJumpToBottom(false)
      return
    }
    if (userScrollLockRef.current) {
      const total = messagesLengthRef.current
      const start = effectiveTranscriptWindowStart(total, pinnedStartRef.current)
      const moreBelow =
        viewingHeadRef.current || effectiveTranscriptWindowEnd(total, start) < total
      const resume =
        !moreBelow && lastScrollIntentRef.current === 'down' && distance <= AT_BOTTOM_PX
      if (resume) {
        userScrollLockRef.current = false
        lastScrollIntentRef.current = null
        stickToBottomRef.current = true
        setStickToBottom(true)
        setCanJumpToBottom(false)
        setPinnedStart(null)
        return
      }
      stickToBottomRef.current = false
      setStickToBottom(false)
      setCanJumpToBottom(viewingHeadRef.current || distance > LEAVE_BOTTOM_PX)
      return
    }
    if (distance > LEAVE_BOTTOM_PX) {
      userScrollLockRef.current = true
      stickToBottomRef.current = false
      setStickToBottom(false)
      setCanJumpToBottom(true)
      setPinnedStart((p) => p ?? stickTranscriptWindowStart(messagesLengthRef.current))
      return
    }
    stickToBottomRef.current = true
    setStickToBottom(true)
    setCanJumpToBottom(false)
    setPinnedStart(null)
  }, [readScrollMetrics])

  const lockUserScroll = useCallback(() => {
    const { overflowing } = readScrollMetrics()
    if (!overflowing) return
    lastScrollIntentRef.current = 'up'
    userScrollLockRef.current = true
    stickToBottomRef.current = false
    setStickToBottom(false)
    setPinnedStart((p) => p ?? stickTranscriptWindowStart(messagesLengthRef.current))
  }, [readScrollMetrics])

  const findCurrent = findHits[findHit]
  const loadedFindIds = useMemo(() => {
    const ids = new Set(messages.map((m) => m.id))
    if (historyHead) {
      for (const m of historyHead) ids.add(m.id)
    }
    ids.add(liveRowId)
    return ids
  }, [historyHead, liveRowId, messages])

  useEffect(() => {
    if (!findOpen || !findCurrent || !onRevealFindHit) return
    if (!findHitNeedsHistory(findCurrent, loadedFindIds)) return
    if (findCurrent.seq == null) return
    void onRevealFindHit(findCurrent.seq)
  }, [findOpen, findCurrent, loadedFindIds, onRevealFindHit])

  const findHitIndex =
    findOpen && findCurrent && findCurrent.messageId !== liveRowId
      ? transcriptMessages.findIndex((m) => m.id === findCurrent.messageId)
      : -1
  const windowStart = effectiveTranscriptWindowStart(
    transcriptMessages.length,
    findHitIndex >= 0
      ? windowStartToCoverIndex(transcriptMessages.length, pinnedStart, findHitIndex)
      : pinnedStart
  )
  const windowEnd = effectiveTranscriptWindowEnd(transcriptMessages.length, windowStart)
  const windowedMessages = useMemo(
    () => transcriptMessages.slice(windowStart, windowEnd),
    [transcriptMessages, windowStart, windowEnd]
  )
  const atLatestWindow = !viewingHead && windowIncludesLatest(transcriptMessages.length, windowEnd)

  useLayoutEffect(() => {
    if (findHitIndex < 0) return
    setPinnedStart((p) => {
      const next = windowStartToCoverIndex(transcriptMessages.length, p, findHitIndex)
      return next === p ? p : next
    })
  }, [findHitIndex, transcriptMessages.length])

  useLayoutEffect(() => {
    if (!findOpen || !findCurrent || !viewingHead) return
    if (historyHead!.some((m) => m.id === findCurrent.messageId)) return
    if (
      findCurrent.messageId === liveRowId ||
      messages.some((m) => m.id === findCurrent.messageId)
    ) {
      onLeaveHistoryHeadRef.current?.()
    }
  }, [findCurrent, findOpen, historyHead, liveRowId, messages, viewingHead])

  useLayoutEffect(() => {
    const el = messagesRef.current
    if (!el) return
    if (pendingJumpTopRef.current) {
      pendingJumpTopRef.current = false
      pendingHeadJunctionRef.current = false
      revealPreserveHeightRef.current = null
      trimTopIdsRef.current = []
      programmaticScrollRef.current = true
      el.scrollTop = 0
      programmaticScrollRef.current = false
      lastScrollTopRef.current = 0
      rememberTranscriptSnapshot()
      return
    }
    if (pendingHeadJunctionRef.current) {
      pendingHeadJunctionRef.current = false
      revealPreserveHeightRef.current = null
      trimTopIdsRef.current = []
      programmaticScrollRef.current = true
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
      programmaticScrollRef.current = false
      lastScrollTopRef.current = el.scrollTop
      rememberTranscriptSnapshot()
      return
    }
    const trimmed = trimTopIdsRef.current
    if (trimmed.length) {
      trimTopIdsRef.current = []
      revealPreserveHeightRef.current = null
      const removedH = trimmed.reduce(
        (n, id) => n + (measuredRowHeightsRef.current.get(id) ?? 0),
        0
      )
      if (removedH) {
        programmaticScrollRef.current = true
        el.scrollTop = Math.max(0, el.scrollTop - removedH)
        programmaticScrollRef.current = false
        lastScrollTopRef.current = el.scrollTop
        rememberTranscriptSnapshot()
      }
      return
    }
    const prev = revealPreserveHeightRef.current
    if (prev == null) return
    revealPreserveHeightRef.current = null
    const delta = el.scrollHeight - prev
    if (!delta) return
    programmaticScrollRef.current = true
    el.scrollTop += delta
    programmaticScrollRef.current = false
    lastScrollTopRef.current = el.scrollTop
    rememberTranscriptSnapshot()
  }, [windowStart, windowEnd, rememberTranscriptSnapshot])

  /** 换命中才滚；直播 token 不反复抢镜头 */
  useEffect(() => {
    if (!findOpen || !findCurrent) return
    if (findCurrent.messageId === liveRowId && !atLatestWindow) {
      setPinnedStart(null)
      return
    }
    const el = document.getElementById(`msg-${findCurrent.messageId}`)
    if (!el) return
    lockUserScroll()
    setCanJumpToBottom(true)
    programmaticScrollRef.current = true
    el.scrollIntoView({ block: 'center', behavior: 'auto' })
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false
      rememberTranscriptSnapshot()
    })
  }, [
    findCurrent?.messageId,
    findCurrent?.occurrence,
    findOpen,
    windowStart,
    liveRowId,
    atLatestWindow,
    lockUserScroll,
    rememberTranscriptSnapshot
  ])

  /** 高亮当前词；直播重绘文本节点后要重标 */
  useEffect(() => {
    if (!findOpen || !findCurrent) {
      clearFindHighlight()
      return
    }
    const el = document.getElementById(`msg-${findCurrent.messageId}`)
    if (!el) {
      clearFindHighlight()
      return
    }
    paintFindHighlight(el, findQuery, findCurrent.occurrence)
    return () => clearFindHighlight()
  }, [
    findCurrent?.messageId,
    findCurrent?.occurrence,
    findOpen,
    findQuery,
    liveRowId,
    windowStart,
    findCurrent?.messageId === liveRowId ? streaming : ''
  ])

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
        rememberTranscriptSnapshot()
        return
      }
      const finish = () => {
        programmaticScrollRef.current = false
        if (!userScrollLockRef.current) syncScrollFlags()
        rememberTranscriptSnapshot()
      }
      window.setTimeout(finish, 500)
    },
    [readScrollMetrics, syncScrollFlags, rememberTranscriptSnapshot]
  )

  const resumeStickToBottom = useCallback(() => {
    lastScrollIntentRef.current = 'down'
    userScrollLockRef.current = false
    stickToBottomRef.current = true
    setStickToBottom(true)
    setCanJumpToBottom(false)
    pendingFullHistoryAfterLiveRef.current = false
    setPinnedStart(null)
    onLeaveHistoryHeadRef.current?.()
    scrollToBottom(loading ? 'auto' : 'smooth')
  }, [loading, scrollToBottom])

  const handleComposerSubmitted = useCallback((mode: PromptSubmitMode) => {
    // Official #13698: sending a follow-up that adds transcript content
    // jumps to bottom by design. Queue / Steer add no transcript row —
    // keep reading position (official #38220).
    if (!shouldStickAfterComposerSubmit(mode)) return
    userScrollLockRef.current = false
    stickToBottomRef.current = true
    setStickToBottom(true)
    pendingFullHistoryAfterLiveRef.current = false
    setPinnedStart(null)
    onLeaveHistoryHeadRef.current?.()
  }, [])

  const dockIntent = composerIntent === 'find' ? null : composerIntent
  const speechHint = loading
    ? ''
    : textForSpeech(lastCompletedAssistantText(messages) || streaming)

  /** ⌘↑ / ⌘↓ / Home / End：长对话跳到顶/底（输入框与右侧预览不抢，对标 Codex #39181） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target
      const blocked =
        target instanceof HTMLElement && Boolean(target.closest(TRANSCRIPT_NAV_BLOCK))
      const intent = transcriptNavIntent(e, blocked)
      if (!intent) return
      const el = messagesRef.current
      if (!el) return
      e.preventDefault()
      if (intent === 'top') {
        lastScrollIntentRef.current = 'up'
        userScrollLockRef.current = true
        stickToBottomRef.current = false
        setStickToBottom(false)
        setCanJumpToBottom(true)
        pendingJumpTopRef.current = true
        setPinnedStart(0)
        const alreadyAtHead =
          viewingHeadRef.current && historyHeadStartSeqRef.current <= 0
        if (
          shouldFetchSlimHistoryOnJumpTop({
            hasOlder: hasOlderHistoryRef.current,
            loading: loadingRef.current,
            alreadyAtHead
          })
        ) {
          void onNeedFullHistoryRef.current?.()
        } else if (hasOlderHistoryRef.current && loadingRef.current) {
          pendingFullHistoryAfterLiveRef.current = true
        }
        if (alreadyAtHead || (pinnedStartRef.current === 0 && !hasOlderHistoryRef.current)) {
          programmaticScrollRef.current = true
          el.scrollTo({ top: 0, behavior: 'smooth' })
          window.setTimeout(() => {
            programmaticScrollRef.current = false
            rememberTranscriptSnapshot()
          }, 400)
        }
        return
      }
      resumeStickToBottom()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resumeStickToBottom, rememberTranscriptSnapshot])

  useEffect(() => {
    if (loading) return
    if (!pendingFullHistoryAfterLiveRef.current) return
    if (!hasOlderHistoryRef.current) {
      pendingFullHistoryAfterLiveRef.current = false
      return
    }
    pendingFullHistoryAfterLiveRef.current = false
    pendingJumpTopRef.current = true
    setPinnedStart(0)
    void onNeedFullHistoryRef.current?.()
  }, [loading])

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
      rememberTranscriptSnapshot()
      const total = messagesLengthRef.current
      const currentStart = effectiveTranscriptWindowStart(total, pinnedStartRef.current)
      const currentEnd = effectiveTranscriptWindowEnd(total, currentStart)
      const distanceFromBottom = Math.max(0, el.scrollHeight - el.clientHeight - top)
      if (viewingHeadRef.current) {
        if (
          !loadOlderBusyRef.current &&
          shouldFetchOlderHistoryPage({
            scrollTop: top,
            locked: userScrollLockRef.current,
            windowStart: currentStart,
            hasOlder: historyHeadStartSeqRef.current > 0
          })
        ) {
          loadOlderBusyRef.current = true
          revealPreserveHeightRef.current = el.scrollHeight
          void Promise.resolve(onNeedOlderHeadRef.current?.()).finally(() => {
            loadOlderBusyRef.current = false
          })
        } else if (
          !loadOlderBusyRef.current &&
          shouldRevealNewerTranscript({
            distanceFromBottom,
            locked: userScrollLockRef.current,
            canReveal: true
          })
        ) {
          loadOlderBusyRef.current = true
          revealPreserveHeightRef.current = el.scrollHeight
          void Promise.resolve(onNeedNewerHeadRef.current?.()).finally(() => {
            loadOlderBusyRef.current = false
          })
        }
        return
      }
      if (
        shouldRevealOlderTranscript({
          scrollTop: top,
          locked: userScrollLockRef.current,
          canReveal: currentStart > 0
        })
      ) {
        revealPreserveHeightRef.current = el.scrollHeight
        setPinnedStart(revealOlderWindowStart(currentStart))
      } else if (
        !loadOlderBusyRef.current &&
        shouldFetchOlderHistoryPage({
          scrollTop: top,
          locked: userScrollLockRef.current,
          windowStart: currentStart,
          hasOlder: hasOlderHistoryRef.current
        })
      ) {
        loadOlderBusyRef.current = true
        revealPreserveHeightRef.current = el.scrollHeight
        void Promise.resolve(onLoadOlderHistoryRef.current?.()).finally(() => {
          loadOlderBusyRef.current = false
        })
      } else if (
        shouldRevealNewerTranscript({
          distanceFromBottom,
          locked: userScrollLockRef.current,
          canReveal: currentEnd < total
        })
      ) {
        const nextStart = revealNewerWindowStart(currentStart, total)
        if (nextStart > currentStart) {
          trimTopIdsRef.current = messagesListRef.current
            .slice(currentStart, nextStart)
            .map((m) => m.id)
          setPinnedStart(nextStart)
        }
      }
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
    rememberTranscriptSnapshot()
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [isEmpty, syncScrollFlags, rememberTranscriptSnapshot])

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
      if (document.activeElement !== el) return
      if (shouldLockStickOnTranscriptKey(event)) lockUserScroll()
    }

    el.addEventListener('wheel', onWheel, { passive: true, capture: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('wheel', onWheel, true)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('keydown', onKeyDown)
    }
  }, [lockUserScroll])

  useEffect(() => {
    if (!approval || shownApprovalIdRef.current === approval.id) return
    shownApprovalIdRef.current = approval.id
    if (
      !shouldFollowApprovalIntoView({
        userLocked: userScrollLockRef.current,
        stickToBottom: stickToBottomRef.current
      })
    ) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      const el = messagesRef.current
      if (!el) return
      if (userScrollLockRef.current) return
      programmaticScrollRef.current = true
      el.scrollTop = liveStickScrollTop(el.scrollHeight, el.clientHeight)
      programmaticScrollRef.current = false
    })
    return () => window.cancelAnimationFrame(frame)
  }, [approval])

  /** 内容增高时贴底：ResizeObserver 在布局后、绘制前写 scrollTop，避免多等一帧 */
  useEffect(() => {
    if (isEmpty) return
    const scroller = messagesRef.current
    const content = messagesInnerRef.current
    if (!scroller || !content) return
    let lastHeight = 0
    let lastClient = 0
    const follow = () => {
      const pending = pendingRestoreRef.current
      if (pending) {
        applyTranscriptRestore(scroller, pending)
        if (pendingRestoreRef.current) return
      }
      if (!stickToBottomRef.current || userScrollLockRef.current || viewingHeadRef.current) return
      const h = scroller.scrollHeight
      const client = scroller.clientHeight
      if (
        !liveStickNeedsFollow(
          { scrollHeight: lastHeight, clientHeight: lastClient },
          { scrollHeight: h, clientHeight: client }
        )
      ) {
        return
      }
      lastHeight = h
      lastClient = client
      programmaticScrollRef.current = true
      scroller.scrollTop = liveStickScrollTop(h, client)
      programmaticScrollRef.current = false
      rememberTranscriptSnapshot()
    }
    const ro = new ResizeObserver(follow)
    ro.observe(content)
    // 输入框变高 / 窗口变矮会挤视口，只盯内容高度会把直播尾藏进底部（对标 Codex #40788）
    ro.observe(scroller)
    follow()
    return () => {
      ro.disconnect()
    }
  }, [isEmpty, loading, sessionKey, applyTranscriptRestore, rememberTranscriptSnapshot])

  useEffect(() => {
    const root = messagesInnerRef.current
    if (!root || isEmpty) return
    const remember = (el: Element) => {
      const id = el.id.startsWith('msg-') ? el.id.slice(4) : ''
      if (!id || id === 'streaming') return
      const height = Math.round((el as HTMLElement).offsetHeight)
      if (height > 0) measuredRowHeightsRef.current.set(id, height)
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) remember(entry.target)
    })
    const watch = () => {
      root.querySelectorAll('.message-row').forEach((el) => {
        remember(el)
        ro.observe(el)
      })
    }
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(root, { childList: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [isEmpty, sessionKey])

  useLayoutEffect(() => {
    if (isEmpty) return
    setIntrinsicHeights((prev) =>
      nextRowIntrinsicHeights(
        prev,
        windowedMessages.map((m, index) => ({
          id: m.id,
          nearLive: isNearLiveMessageRow(index, windowedMessages.length),
          height: measuredRowHeightsRef.current.get(m.id)
        }))
      )
    )
  }, [isEmpty, windowedMessages])

  useEffect(() => {
    if (isEmpty || loading || viewingHead) return
    const { distance } = readScrollMetrics()
    if (
      !shouldForceStickScroll({
        stickToBottom: stickToBottomRef.current,
        userLocked: userScrollLockRef.current,
        distanceFromBottom: distance,
        atBottomPx: AT_BOTTOM_PX
      })
    ) {
      return
    }
    scrollToBottom('auto')
  }, [messages, isEmpty, loading, findOpen, viewingHead, scrollToBottom, readScrollMetrics])

  const handleEditLastUser = useCallback(() => {
    const id = lastUserMessageId(messages)
    if (!id) return
    if (viewingHeadRef.current) onLeaveHistoryHeadRef.current?.()
    const idx = messages.findIndex((m) => m.id === id)
    if (idx >= 0) {
      setPinnedStart((p) => windowStartToCoverIndex(messages.length, p, idx))
    }
    setEditUserMessageId(id)
    requestAnimationFrame(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'center' })
    })
  }, [messages])

  const handleEditRequestHandled = useCallback(() => {
    setEditUserMessageId(null)
  }, [])

  const liveBody = hasLiveAssistantBody({
    streaming,
    liveSegmentCount: liveSegments.length,
    thinking: turnThinking,
    approvalWaiting: Boolean(approval)
  })
  const historicalRows = useMemo(
    () =>
      historicalMessagesDuringLive(windowedMessages, liveAssistantId, loading, liveBody).map((m, index, rows) => {
        const nearLive = isNearLiveMessageRow(index, rows.length)
        return m.role === 'user' ? (
          <UserMessageRow
            key={m.id}
            id={m.id}
            content={m.content}
            attachments={m.attachments}
            findHit={findHits.some((h) => h.messageId === m.id)}
            findCurrent={findHits[findHit]?.messageId === m.id}
            nearLive={nearLive}
            intrinsicHeight={resolveRowIntrinsicHeight(
              intrinsicHeights.get(m.id),
              measuredRowHeightsRef.current.get(m.id)
            )}
            editRequested={editUserMessageId === m.id}
            onEditRequestHandled={handleEditRequestHandled}
            onEdit={onEditUserMessage ? (text) => onEditUserMessage(m.id, text) : undefined}
          />
        ) : (
          <div
            key={m.id}
            id={`msg-${m.id}`}
            className={`message-row message-row--assistant${
              nearLive ? ' message-row--near-live' : ''
            }${findHits.some((h) => h.messageId === m.id) ? ' is-find-hit' : ''}${
              findHits[findHit]?.messageId === m.id ? ' is-find-current' : ''
            }`}
            style={
              nearLive
                ? undefined
                : rowIntrinsicSizeStyle(
                    resolveRowIntrinsicHeight(
                      intrinsicHeights.get(m.id),
                      measuredRowHeightsRef.current.get(m.id)
                    )
                  )
            }
          >
            <AssistantMessage
              messageId={m.id}
              content={m.content}
              meta={m.meta}
              modelLabel={m.meta?.model ?? modelLabel}
              onOpenSubAgent={onOpenSubAgent}
              onOpenChangedFiles={onOpenChangedFiles}
              toolOutputDisplay={toolOutputDisplay}
              onNeedFullMessage={onNeedFullMessage}
              onRetry={
                index === rows.length - 1 && m.meta?.retryOfUserMessageId && onRetry
                  ? () => onRetry(m.meta!.retryOfUserMessageId!)
                  : undefined
              }
            />
          </div>
        )
      }),
    [
      editUserMessageId,
      findHit,
      findHits,
      handleEditRequestHandled,
      intrinsicHeights,
      liveAssistantId,
      liveBody,
      loading,
      windowedMessages,
      modelLabel,
      onOpenSubAgent,
      onOpenChangedFiles,
      onRetry,
      onEditUserMessage,
      onNeedFullMessage,
      toolOutputDisplay
    ]
  )

  const showLiveAssistant =
    atLatestWindow &&
    shouldRenderLiveAssistantRow({
      loading,
      hasLiveBody: liveBody,
      historyHasReserved: Boolean(
        liveAssistantId && messages.some((m) => m.id === liveAssistantId)
      )
    })
  // 有 segment 流时由 TurnFlow 负责；这里仅给旧路径/无实质工具时的思考态
  const isThinkingLive =
    loading &&
    !streaming.trim() &&
    (Boolean(turnThinking.trim()) ||
      liveSegments.some((s) => s.kind === 'thinking' && s.status === 'active') ||
      liveSegments.some((s) => s.kind === 'status' && s.status === 'active'))

  return (
    <ChatImageWorkspaceProvider
      workspacePath={fileSearchRoot}
      extraRoots={fileSearchExtraRoots}
    >
    <div
      className={`chat ${isEmpty ? 'chat--empty' : 'chat--active'}`}
      data-session-key={sessionKey || undefined}
      data-transcript-window-start={windowStart}
      data-transcript-window-end={windowEnd}
      data-transcript-head={viewingHead ? '1' : undefined}
      data-transcript-head-start={viewingHead ? historyHeadStartSeq : undefined}
    >
      {!isEmpty && (
        /* 全宽滚动层：滚动条贴主区最右侧；内容柱仍居中 */
        <div
          className="messages-scroll"
          ref={messagesRef}
          data-transcript-window-start={windowStart}
          data-transcript-window-end={windowEnd}
          data-transcript-head={viewingHead ? '1' : undefined}
          tabIndex={0}
          role="region"
          aria-label="对话"
          onMouseUp={syncSideAsk}
          onClick={(e) => {
            if (!shouldFocusTranscriptScroller(e.target instanceof HTMLElement ? e.target : null)) {
              return
            }
            messagesRef.current?.focus({ preventScroll: true })
          }}
        >
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
                    composerRef.current?.focus()
                    return
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    stepFindHit(e.shiftKey ? -1 : 1)
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
                onClick={() => stepFindHit(-1)}
                aria-label="上一条"
              >
                ↑
              </button>
              <button
                type="button"
                className="chat-find__nav"
                disabled={findHits.length === 0}
                onClick={() => stepFindHit(1)}
                aria-label="下一条"
              >
                ↓
              </button>
              <button
                type="button"
                className="chat-find__nav"
                onClick={() => {
                  setFindOpen(false)
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
              <div
                key={liveRowId}
                id={`msg-${liveRowId}`}
                className={`message-row message-row--assistant message-row--live${
                  findHits.some((hit) => hit.messageId === liveRowId) ? ' is-find-hit' : ''
                }${findHits[findHit]?.messageId === liveRowId ? ' is-find-current' : ''}`}
              >
                <AssistantMessage
                  messageId={liveRowId}
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
                  toolOutputDisplay={toolOutputDisplay}
                  onNeedFullMessage={onNeedFullMessage}
                />
              </div>
            )}

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
        {isEmpty && hasWorkspace && suggestedPrompts.length > 0 && onSuggestedPrompt ? (
          <div className="suggested-prompts" role="list">
            {suggestedPrompts.map((item) => (
              <button
                key={item.id}
                type="button"
                className="suggested-prompts__chip"
                role="listitem"
                onClick={() => onSuggestedPrompt(item)}
              >
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        ) : null}
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
          {copyPicker?.length ? (
            <div className="copy-picker-slot">
              <div
                className="slash-menu popover-enter"
                role="listbox"
                aria-label="复制内容"
                aria-activedescendant={
                  copyPicker[copyPickIndex] ? `copy-option-${copyPicker[copyPickIndex]!.id}` : undefined
                }
              >
                <ul className="slash-menu-list">
                  {copyPicker.map((target, index) => (
                    <li key={target.id} role="presentation">
                      <button
                        type="button"
                        id={`copy-option-${target.id}`}
                        role="option"
                        aria-selected={index === copyPickIndex}
                        className={`slash-menu-item${index === copyPickIndex ? ' slash-menu-item--active' : ''}`}
                        onMouseEnter={() => {
                          setCopyPickIndex(index)
                          copyPickIndexRef.current = index
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onCopyPick?.(target)
                        }}
                      >
                        <span className="slash-menu-name">
                          {target.kind === 'full' ? '整段' : target.kind === 'code' ? '代码' : '引用'}
                        </span>
                        <span className="slash-menu-desc">{target.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {onEditQueued && onMoveQueued && onSendQueued ? (
            <ComposerQueue
              steers={pendingSteers}
              items={queuedPrompts}
              onEdit={onEditQueued}
              onMove={onMoveQueued}
              onSend={onSendQueued}
              onCancel={onCancelQueued}
              busy={loading}
            />
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
            onSelectWorkspace={onSelectWorkspace}
            threadMode={threadMode}
            threadGoal={threadGoal}
            goalEditTick={goalEditTick}
            onGoalCommand={onGoalCommand}
            onThreadModeChange={onThreadModeChange}
            worktreeBaseRef={worktreeBaseRef}
            onWorktreeBaseRefChange={onWorktreeBaseRefChange}
            fileSearchRoot={fileSearchRoot}
            fileSearchExtraRoots={fileSearchExtraRoots}
            composerIntent={dockIntent}
            onComposerIntentHandled={onComposerIntentHandled}
            queueHeld={queueHeld}
            onQueueHeldChange={onQueueHeldChange}
            speechHint={speechHint}
            onSubmitted={handleComposerSubmitted}
            composerSeed={composerSeed}
            onEditLastUser={handleEditLastUser}
            followUpBehavior={followUpBehavior}
            composerEnterBehavior={composerEnterBehavior}
            approvalOpen={Boolean(approval)}
            approvalResponding={approvalResponding}
            onApprovalHotkey={onApproval}
            planMode={planMode}
            onPlanModeChange={onPlanModeChange}
            keyboardShortcuts={keyboardShortcuts}
          />
        </div>
      </div>
      {sideAsk && (onAskInSideChat || onInsertComposer) ? (
        <div className="chat-side-ask-bar" style={{ top: sideAsk.top, left: sideAsk.left }}>
          {onInsertComposer ? (
            <button
              type="button"
              className="chat-side-ask glass-pill"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onInsertComposer(formatComposerInsert(sideAsk.text))
                setSideAsk(null)
                window.getSelection()?.removeAllRanges()
              }}
            >
              插入输入框
            </button>
          ) : null}
          {onAskInSideChat ? (
            <button
              type="button"
              className="chat-side-ask glass-pill"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onAskInSideChat(formatSideChatPrompt(sideAsk.text))
                setSideAsk(null)
                window.getSelection()?.removeAllRanges()
              }}
            >
              旁路提问
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
    </ChatImageWorkspaceProvider>
  )
}
