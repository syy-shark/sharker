/**
 * 应用根组件：全局状态、发送/流式、设置与工作区/对话切换
 * @see src/ARCH.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationSummary } from '../shared/conversation'
import {
  DEFAULT_CONVERSATION_TITLE,
  applyCustomTitle,
  buildForkedConversation,
  conversationPreview,
  deriveConversationTitle,
  formatPinNote,
  formatRenameNote,
  collectAttentionConversationIds,
  formatUnreadNote,
  nextLiveConversationId,
  parseRenameArgs,
  resolveConversationGitBranch,
  resolveConversationPath,
  sortConversationsByCreatedAt
} from '../shared/conversation'
import { formatUsageReport, parseUsageScope, usageHistoryDays } from '../shared/token-usage-format'
import type {
  AppSettings,
  ApprovalRequest,
  AssistantMeta,
  ChatAttachment,
  ChatMessage,
  TurnSegment
} from '../shared/types'
import {
  extractBrowsedPaths,
  extractChangedRelPaths,
  formatToolActivity
} from '../shared/turn-meta'
import { stampSubAgentActivity } from '../shared/subagent'
import { prToolbarLabel } from '../shared/git-pr-context'
import {
  activitiesFromSegments,
  applyStreamChunk,
  browsedFilesFromSegments,
  cloneSegments,
  extractFinalContent,
  findLastSegment,
  finalizeSegments,
  thinkingPreviewFromSegments
} from '../shared/turn-segments'
import { DEFAULT_SETTINGS } from '../shared/types'
import {
  GLOBAL_WORKSPACE_ID,
  getActiveWorkspacePath,
  sortWorkspaces,
  pickActiveWorkspaceId,
  withActiveWorkspace
} from '../shared/workspace'
import { knownModelsForProvider } from '../shared/provider-catalog'
import {
  defaultThinkingLevel,
  formatReasoningStatus,
  parseReasoningArgs,
  resolveThinkingOptions,
  stepThinkingLevel
} from '../shared/thinking-levels'
import { ChatView } from './components/ChatView'
import { ChatToolbar } from './components/ChatToolbar'
import { PlanBuildBar } from './components/PlanBuildBar'
import { RightPanel, type RightPanelTab } from './components/RightPanel'
import { AutomationsPage } from './pages/AutomationsPage'
import { Sidebar } from './components/Sidebar'
import type { SlashCommandMeta } from '../shared/slash-commands'
import { SLASH_COMMANDS } from '../shared/slash-commands'
import {
  adjacentConversationId,
  isEmbeddedTerminalTarget,
  isTerminalClearChord
} from '../shared/workbench-shortcuts'
import { matchWorkbenchShortcut } from '../shared/keymap'
import { mouseNavDirection, navBack, navForward, pushNav, type NavEntry } from '../shared/nav-history'
import {
  clampUiFontScale,
  stepUiFontScale,
  UI_FONT_SCALE_DEFAULT
} from '../shared/ui-font-scale'
import { parseThreadWindowHash } from '../shared/thread-window'
import {
  REVIEW_BRANCH_PROMPT,
  REVIEW_WORKING_TREE_PROMPT,
  parseReviewRequest
} from '../shared/review-prompt'
import {
  nextPersonality,
  parsePersonality,
  parsePersonalityArg,
  personalitySwitchNote
} from '../shared/personality'
import {
  attachQueueChangedPaths,
  createPrAfterApprovePush,
  enqueueAutomationRun,
  markAllQueueRead,
  pushAfterApproveCommit,
  resolveQueueTriagePaths,
  unreadQueueCount
} from '../shared/automation-queue'
import type { AutomationQueueItem, QueueTriageAction } from '../shared/automation-queue'
import { parseReviewFindings } from '../shared/review-comment'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import type { PaletteCommand } from '../shared/command-palette'
import { SettingsPage } from './pages/SettingsPage'
import { applyAppearanceDom } from './components/settings/AppearanceSettings'
import type { QueuedPrompt, PromptSubmitMode } from './types/chat'
import type { AppPage, SettingsTab } from './types/navigation'
import type { ApprovalDecision } from '../shared/approval-session'
import {
  loadThreadRuntime,
  runtimeForConversation,
  saveThreadRuntime,
  type ThreadMode,
  type ThreadRuntime
} from './lib/thread-runtime'
import { goalTextForConversation, loadThreadGoal, saveThreadGoal } from './lib/thread-goal'
import {
  applyGoalCommand,
  parseGoalCommand,
  type GoalCommand,
  type ThreadGoal
} from '../shared/thread-goal'
import { formatThreadStatus } from '../shared/thread-status'
import { formatMcpStatus } from '../shared/mcp-status'
import { formatFeedbackBundle } from '../shared/feedback-bundle'
import { resolveApprovalHotkey } from '../shared/composer-submit'
import { buildSuggestedPrompts } from '../shared/suggested-prompts'
import { formatMemoryStatus, parseMemoryCommand } from '../shared/memory-command'
import { lastCompletedAssistantText } from '../shared/copy-output'
import {
  createAppUndoStack,
  execNativeUndoRedo,
  isNativeUndoTarget,
  type AppUndoRecord
} from '../shared/app-undo'
import {
  shouldMarkConversationUnread,
  shouldNotifyApproval,
  shouldNotifyTurnComplete,
  turnNotifyBody,
  turnNotifyPreview,
  turnNotifyTitle,
  unreadDockBadgeCount
} from '../shared/turn-notify'
import {
  formatThreadDeeplink,
  matchWorkspaceByOrigin,
  matchWorkspaceByPath,
  parseDeeplink
} from '../shared/deeplink'
import { formatDebugConfig } from '../shared/debug-config'
import { formatApproveRetry } from '../shared/approval-session'
import {
  formatFastStatus,
  isFastThinkingLevel,
  parseFastCommand,
  pickFastThinkingLevel
} from '../shared/fast-mode'
import { formatSkillsStatus } from '../shared/skills-status'
import type { McpStatusServer } from '../shared/mcp-status'
import { estimateContextUsage } from '../shared/token-estimate'
import { resolveContextLimit } from '../shared/context-limit'
import {
  appendAssistantMessage,
  cancelQueuedPrompt,
  clearDoneCommitted,
  createQueuedPrompt,
  enqueueForConversation,
  listQueuedForConversation,
  moveQueuedPrompt,
  takeQueuedPrompt,
  updateQueuedPromptText,
  markDoneCommitted,
  nextFollowUpAfterTurn,
  resolveCommitConversationId,
  resolveStopAction,
  shouldAcceptDoneEvent,
  shouldApplyStreamToActive,
  shouldCommitToActiveUi,
  type DoneCommittedMap,
  type SessionQueueMap
} from '../shared/session-runtime'
import './App.css'

/** 非当前可见会话的流式缓冲（切换会话不丢 in-flight） */
interface SessionLiveBuffer {
  messages: ChatMessage[]
  loading: boolean
  segments: TurnSegment[]
  streaming: string
  turnThinking: string
  approval: ApprovalRequest | null
  liveTurnMeta: AssistantMeta | null
  turnStartedAt: number | null
  turnHadThinking: boolean
  activeTool: string | null
  sendInFlight: boolean
  doneCommitted: boolean
  turnOutcome: 'success' | 'error' | 'aborted'
  activeUserMessageId?: string
  turnMeta: AssistantMeta
  changedRelPaths?: string[]
  lastTurnPaths?: string[]
}

/** DEV 专用：把审批/错误/直播态注入真实 React 树，供 CDP 与本地验收 */
export interface SharkerDevDebugApi {
  injectApproval: (partial?: Partial<ApprovalRequest>) => ApprovalRequest
  clearApproval: () => void
  injectError: (message?: string | { message?: string }) => ChatMessage
  injectAborted: (message?: string | { message?: string }) => ChatMessage
  seedLiveProcess: (mode?: 'preparing' | 'tool' | 'chain' | 'planning' | 'answer' | 'approval') => TurnSegment[]
  /** 渐进播一段工具链，便于验收直播头连续推进与呼吸不中断 */
  playLiveSequence: () => Promise<string[]>
  clearLiveProcess: () => void
  resetChatVisual: () => void
  getSnapshot: () => {
    page: AppPage
    loading: boolean
    approval: ApprovalRequest | null
    liveSegmentCount: number
    messageCount: number
    messageRoles?: Array<ChatMessage['role']>
    activeConversationId: string | null
    hasLiveSegments?: boolean
    streamingLen?: number
    streamOwner?: string | null
    bufferCount?: number
    bufferIds?: string[]
  }
  navigateTo: (page: AppPage, tab?: SettingsTab) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openHistoryPicker: () => void
  openRightPanel: (tab?: RightPanelTab) => void
  closeRightPanel: () => void
  selectConversation: (conversationId: string) => Promise<boolean>
  /** 多会话调试：列出内存 buffer 概况 */
  listSessionBuffers: () => Array<{
    id: string
    loading: boolean
    sendInFlight: boolean
    doneCommitted: boolean
    messageCount: number
    liveSegmentCount: number
    streamingLen: number
    approval: boolean
  }>
  /** 读取某会话 buffer 消息摘要（内存优先） */
  peekSession: (conversationId: string) => {
    source: 'buffer' | 'none'
    loading: boolean
    messages: Array<{ role: string; content: string }>
    liveHead?: string
  } | null
}

declare global {
  interface Window {
    __sharkerDebug?: SharkerDevDebugApi
  }
}

/** 根组件：全局状态、IPC 流式、工作区/对话/设置路由 */
export default function App() {
  useEffect(() => {
    const customChrome = window.sharker?.platform !== 'darwin'
    document.documentElement.classList.toggle('window-rounded', customChrome)
    return () => document.documentElement.classList.remove('window-rounded')
  }, [])

  /** 全局状态与 ref 镜像，供 IPC 回调与节流刷新读取 */
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  /** 外观：仅浅色玻璃 / 深色金属两套固定材质；字号写入 --ui-font-scale */
  useEffect(() => {
    applyAppearanceDom(
      settings.uiTheme === 'dark' ? 'dark' : 'light',
      settings.uiFontScale ?? UI_FONT_SCALE_DEFAULT
    )
  }, [settings.uiTheme, settings.uiFontScale])
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [page, setPage] = useState<AppPage>('chat')
  const pageRef = useRef<AppPage>('chat')
  const settingsDraftRef = useRef<AppSettings>(DEFAULT_SETTINGS)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('models')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([])
  const conversationListRef = useRef<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  /** ⌘⌥R / `/rename` 无参数：侧栏进入行内改名 */
  const [renameRequestId, setRenameRequestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [liveSegments, setLiveSegments] = useState<TurnSegment[]>([])
  const [streaming, setStreaming] = useState('')
  const [turnThinking, setTurnThinking] = useState('')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [liveTurnMeta, setLiveTurnMeta] = useState<AssistantMeta | null>(null)
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)
  const [turnHadThinking, setTurnHadThinking] = useState(false)
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [approvalResponding, setApprovalResponding] = useState(false)
  const approvalBusyRef = useRef(false)
  const [pendingPlan, setPendingPlan] = useState<{ document: string; filePath?: string } | null>(
    null
  )
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([])
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('files')
  const [focusSubAgentId, setFocusSubAgentId] = useState<string | null>(null)
  const [prChipLabel, setPrChipLabel] = useState<string | null>(null)
  const [changesRevision, setChangesRevision] = useState(0)
  const changesFlushTimerRef = useRef<number | null>(null)
  const bumpChangesSoon = useCallback(() => {
    if (changesFlushTimerRef.current != null) return
    changesFlushTimerRef.current = window.setTimeout(() => {
      changesFlushTimerRef.current = null
      setChangesRevision((n) => n + 1)
    }, 400)
  }, [])
  const [threadMode, setThreadMode] = useState<ThreadMode>('local')
  const [planMode, setPlanMode] = useState(false)
  const planModeByConvRef = useRef(new Map<string, boolean>())
  const pendingPlanByConvRef = useRef(
    new Map<string, { document: string; filePath?: string }>()
  )
  const [threadWorktreePath, setThreadWorktreePath] = useState<string | undefined>()
  const [threadGoal, setThreadGoal] = useState<ThreadGoal | null>(null)
  const threadGoalRef = useRef<ThreadGoal | null>(null)
  const [worktreeBaseRef, setWorktreeBaseRef] = useState('')
  const [worktreeMissing, setWorktreeMissing] = useState(false)
  const [workspaceBranch, setWorkspaceBranch] = useState('')
  const [automationsCreateNonce, setAutomationsCreateNonce] = useState(0)
  const appUndoRef = useRef(createAppUndoStack())
  const appUndoSilentRef = useRef(false)
  const [pendingTerminalCommand, setPendingTerminalCommand] = useState<string | null>(null)
  const [terminalClearTick, setTerminalClearTick] = useState(0)
  const navStackRef = useRef<NavEntry[]>([{ page: 'chat' }])
  const navIndexRef = useRef(0)
  const navLockRef = useRef(false)
  const threadRuntimeRef = useRef<ThreadRuntime>({ mode: 'local' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sharker-sidebar-collapsed') === '1'
  )
  const [activityToggleNonce, setActivityToggleNonce] = useState(0)
  /** 侧栏收起后的悬停 peek；peek 时侧栏可见，顶栏不必再显示新对话 */
  const [sidebarPeeking, setSidebarPeeking] = useState(false)
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c
      localStorage.setItem('sharker-sidebar-collapsed', next ? '1' : '0')
      return next
    })
    // 展开时清 peek，避免收起态残留
    setSidebarPeeking(false)
  }, [])
  const [showHistoryPicker, setShowHistoryPicker] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [composerIntent, setComposerIntent] = useState<
    'mention' | 'skill' | 'find' | 'model' | 'dictate' | 'voice' | 'project' | null
  >(null)
  const [composerSeed, setComposerSeed] = useState<{ nonce: number; text: string } | null>(null)
  const composerSeedNonceRef = useRef(0)
  const popoutRoute = useMemo(
    () => parseThreadWindowHash(typeof window !== 'undefined' ? window.location.hash : ''),
    []
  )
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [queueHeld, setQueueHeld] = useState(false)
  const queueHeldByConvRef = useRef<Set<string>>(new Set())
  const [lastTurnPaths, setLastTurnPaths] = useState<string[]>([])
  const [queueUnread, setQueueUnread] = useState(0)
  const [queueRevision, setQueueRevision] = useState(0)
  const [suggestedCommit, setSuggestedCommit] = useState('')
  const lastTurnPathsByConvRef = useRef<Map<string, string[]>>(new Map())
  const turnChangedPathsRef = useRef<string[]>([])
  const threadWorktreePathRef = useRef<string | undefined>(undefined)
  const sendInFlightRef = useRef(false)
  /** 回合序号：finally 只清理自己这一轮，避免排队续跑被误清 loading */
  const turnGenRef = useRef(0)
  /** 按会话隔离的 follow-up 队列 */
  const sessionQueuesRef = useRef<SessionQueueMap>({})
  const queuedPromptsRef = useRef<QueuedPrompt[]>([])
  /** 后台会话 live 状态（切换离开后继续收流） */
  const sessionBuffersRef = useRef<Map<string, SessionLiveBuffer>>(new Map())
  /** 当前 IPC 回合归属的 conversationId */
  const streamOwnerRef = useRef<string | null>(null)
  /** conversationId → 当前活跃 turn 代数；用于丢弃 abort/插队后迟到的旧 done/chunk */
  const streamTurnGenByConvRef = useRef<Record<string, number>>({})
  /** conversationId → 已派发但尚未收到 turn_start 的 turn 代数；期间忽略旧 abort 的 done */
  const awaitingTurnStartByConvRef = useRef<Record<string, number>>({})
  const dispatchTurnRef = useRef<
    (text: string, attachments?: ChatAttachment[], conversationId?: string) => Promise<void>
  >(async () => {})
  const handleSlashActionRef = useRef<(cmd: SlashCommandMeta, args: string) => Promise<void>>(
    async () => {}
  )
  const handleSelectConversationRef = useRef<
    (workspaceId: string, conversationId: string) => Promise<void>
  >(async () => {})
  const applyDeeplinkRef = useRef<(url: string) => Promise<void>>(async () => {})
  /** 按会话的 done/stop 门闩 — 禁止全局 doneCommitted 误杀其他会话 */
  const doneCommittedMapRef = useRef<DoneCommittedMap>({})
  const doneCommittedRef = useRef(false)
  const streamingRef = useRef('')
  const turnThinkingRef = useRef('')
  const segmentsRef = useRef<TurnSegment[]>([])
  const streamRafRef = useRef<number | null>(null)
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStreamRenderAt = useRef(0)
  const thinkRafRef = useRef<number | null>(null)
  const SEGMENT_RENDER_MS = 16
  const settingsRef = useRef(settings)
  const messagesRef = useRef<ChatMessage[]>([])
  const activeConversationIdRef = useRef<string | null>(null)
  const turnStartedAtRef = useRef(0)
  const turnMetaRef = useRef<AssistantMeta>({ browsedFiles: [], activities: [] })
  const turnHadThinkingRef = useRef(false)
  const turnOutcomeRef = useRef<'success' | 'error' | 'aborted'>('success')
  const activeUserMessageIdRef = useRef<string | undefined>(undefined)

  const syncActiveQueueUi = useCallback((queues: SessionQueueMap, convId: string | null) => {
    sessionQueuesRef.current = queues
    const list = listQueuedForConversation(queues, convId)
    queuedPromptsRef.current = list
    setQueuedPrompts(list)
  }, [])

  const applyBufferToUi = useCallback((buf: SessionLiveBuffer) => {
    messagesRef.current = buf.messages
    setMessages(buf.messages)
    sendInFlightRef.current = buf.sendInFlight
    doneCommittedRef.current = buf.doneCommitted
    streamingRef.current = buf.streaming
    turnThinkingRef.current = buf.turnThinking
    segmentsRef.current = cloneSegments(buf.segments)
    setLiveSegments(cloneSegments(buf.segments))
    setStreaming(buf.streaming)
    setTurnThinking(buf.turnThinking)
    setLoading(buf.loading || buf.sendInFlight)
    setActiveTool(buf.activeTool)
    setApproval(buf.approval)
    setApprovalResponding(false)
    setTurnHadThinking(buf.turnHadThinking)
    turnHadThinkingRef.current = buf.turnHadThinking
    turnOutcomeRef.current = buf.turnOutcome
    activeUserMessageIdRef.current = buf.activeUserMessageId
    turnMetaRef.current = {
      browsedFiles: [...buf.turnMeta.browsedFiles],
      activities: [...buf.turnMeta.activities]
    }
    setLiveTurnMeta(
      buf.liveTurnMeta ?? {
        browsedFiles: [...buf.turnMeta.browsedFiles],
        activities: [...buf.turnMeta.activities]
      }
    )
    setTurnStartedAt(buf.turnStartedAt)
    if (buf.turnStartedAt) turnStartedAtRef.current = buf.turnStartedAt
    turnChangedPathsRef.current = [...(buf.changedRelPaths ?? [])]
    setLastTurnPaths(buf.lastTurnPaths ?? lastTurnPathsByConvRef.current.get(activeConversationIdRef.current ?? '') ?? [])
  }, [])

  const activeWorkspaceId = settings.activeWorkspaceId

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    const cwd = getActiveWorkspacePath(settings)
    if (!cwd || !window.sharker.getGitBranchInfo) {
      setWorkspaceBranch('')
      return
    }
    let cancelled = false
    void window.sharker
      .getGitBranchInfo(cwd)
      .then((info) => {
        if (!cancelled) setWorkspaceBranch(info.branch || '')
      })
      .catch(() => {
        if (!cancelled) setWorkspaceBranch('')
      })
    return () => {
      cancelled = true
    }
  }, [settings.activeWorkspaceId, settings.workspacePath])

  useEffect(() => {
    threadWorktreePathRef.current = threadWorktreePath
  }, [threadWorktreePath])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts
  }, [queuedPrompts])

  const approvalRef = useRef<ApprovalRequest | null>(null)
  useEffect(() => {
    approvalRef.current = approval
  }, [approval])

  /** 刷新指定工作区的侧栏对话列表 */
  const refreshConversationList = useCallback(async (workspaceId: string) => {
    try {
      const state = await window.sharker.listConversations(workspaceId)
      if (settingsRef.current.activeWorkspaceId === workspaceId) {
        setConversationList(state.conversations)
      }
      return state
    } catch (e) {
      console.error('刷新对话列表失败', e)
      return { conversations: [], activeConversationId: null }
    }
  }, [])

  /**
   * 乐观更新侧栏标题/消息数（后台完成或首条用户消息发送后立即可见，
   * 不必等 listConversations 往返）。
   */
  const patchConversationSummary = useCallback((conversationId: string, msgs: ChatMessage[]) => {
    if (!conversationId) return
    const title = deriveConversationTitle(msgs)
    const now = Date.now()
    setConversationList((list) => {
      let found = false
      const next = list.map((c) => {
        if (c.id !== conversationId) return c
        found = true
        return {
          ...c,
          title: c.customTitle?.trim() ? c.title : title,
          messageCount: msgs.length,
          updatedAt: now,
          preview: conversationPreview(msgs) || undefined
        }
      })
      return found ? next : list
    })
  }, [])

  /** 触发侧栏“进行中”标记重算（buffer 在 ref 里，需强制渲染） */
  const [sessionLiveVersion, setSessionLiveVersion] = useState(0)
  const bumpSessionLive = useCallback(() => {
    setSessionLiveVersion((v) => v + 1)
  }, [])

  // loading 边沿同步侧栏进行中点（极短回合也不会漏掉点亮/熄灭）
  useEffect(() => {
    bumpSessionLive()
  }, [loading, activeConversationId, bumpSessionLive])

  /** 加载工作区的活跃对话与消息 */
  const loadWorkspaceSession = useCallback(
    async (workspaceId: string) => {
      try {
        const state = await refreshConversationList(workspaceId)
        if (settingsRef.current.activeWorkspaceId !== workspaceId) return

        const convId = state.activeConversationId
        if (!convId) {
          setActiveConversationId(null)
          activeConversationIdRef.current = null
          setMessages([])
          messagesRef.current = []
          return
        }

        const conv = await window.sharker.loadConversation(workspaceId, convId)
        if (settingsRef.current.activeWorkspaceId !== workspaceId) return

        if (!conv) {
          setActiveConversationId(null)
          activeConversationIdRef.current = null
          setMessages([])
          messagesRef.current = []
          await window.sharker.setActiveConversation(workspaceId, null)
          return
        }

        setActiveConversationId(conv.id)
        activeConversationIdRef.current = conv.id
        setMessages(conv.messages)
        messagesRef.current = conv.messages
      } catch (e) {
        console.error('加载工作区会话失败', e)
      }
    },
    [refreshConversationList]
  )

  /** 将当前对话消息落盘并刷新列表 */
  const persistActiveConversation = useCallback(
    async (msgs: ChatMessage[], convId = activeConversationIdRef.current) => {
      const workspaceId = popoutRoute?.workspaceId || settingsRef.current.activeWorkspaceId
      if (!workspaceId || !convId) return
      const existing = await window.sharker.loadConversation(workspaceId, convId)
      if (!existing) return
      await window.sharker.saveConversation(workspaceId, {
        ...existing,
        messages: msgs,
        title: deriveConversationTitle(msgs)
      })
      await refreshConversationList(workspaceId)
    },
    [refreshConversationList]
  )

  /** 将 ref 中的回合元信息同步到 React state */
  const syncLiveTurnMeta = useCallback(() => {
    const m = turnMetaRef.current
    setLiveTurnMeta({
      browsedFiles: [...m.browsedFiles],
      activities: [...m.activities]
    })
  }, [])

  /** 清空本轮助手元信息 */
  const resetTurnMeta = useCallback(() => {
    turnMetaRef.current = { browsedFiles: [], activities: [] }
    turnChangedPathsRef.current = []
    setLiveTurnMeta(null)
    setTurnStartedAt(null)
  }, [])

  /** 发送前初始化回合计时与活动列表 */
  const beginTurnMeta = useCallback(() => {
    const now = Date.now()
    turnStartedAtRef.current = now
    turnHadThinkingRef.current = false
    turnOutcomeRef.current = 'success'
    activeUserMessageIdRef.current = undefined
    setApproval(null)
    setApprovalResponding(false)
    setTurnHadThinking(false)
    turnMetaRef.current = { browsedFiles: [], activities: [] }
    turnChangedPathsRef.current = []
    setTurnStartedAt(now)
    setLiveTurnMeta({ browsedFiles: [], activities: [] })
  }, [])

  /** 快照当前可见会话的 live 状态，供切走后再回来恢复 */
  const snapshotActiveSessionBuffer = useCallback(() => {
    const prevId = activeConversationIdRef.current
    if (!prevId) return null
    sessionBuffersRef.current.set(prevId, {
      messages: [...messagesRef.current],
      loading:
        sendInFlightRef.current ||
        segmentsRef.current.length > 0 ||
        Boolean(streamingRef.current.trim()),
      segments: cloneSegments(segmentsRef.current),
      streaming: streamingRef.current,
      turnThinking: turnThinkingRef.current,
      approval: approvalRef.current,
      liveTurnMeta: {
        browsedFiles: [...turnMetaRef.current.browsedFiles],
        activities: [...turnMetaRef.current.activities]
      },
      turnStartedAt: turnStartedAtRef.current || null,
      turnHadThinking: turnHadThinkingRef.current,
      activeTool: (() => {
        const active = findLastSegment(
          segmentsRef.current,
          (s) => s.kind === 'tool' && s.status === 'active'
        )
        return active?.toolName ?? null
      })(),
      sendInFlight: sendInFlightRef.current,
      doneCommitted: doneCommittedRef.current,
      turnOutcome: turnOutcomeRef.current,
      activeUserMessageId: activeUserMessageIdRef.current,
      turnMeta: {
        browsedFiles: [...turnMetaRef.current.browsedFiles],
        activities: [...turnMetaRef.current.activities]
      },
      changedRelPaths: [...turnChangedPathsRef.current],
      lastTurnPaths: lastTurnPathsByConvRef.current.get(prevId) ?? []
    })
    return prevId
  }, [])

  /** 取消节流中的直播刷帧，避免切会话后把空 segments 写回旧 buffer */
  const cancelScheduledStreamPaint = useCallback(() => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = null
    }
    if (streamFlushTimerRef.current != null) {
      clearTimeout(streamFlushTimerRef.current)
      streamFlushTimerRef.current = null
    }
    if (thinkRafRef.current != null) {
      cancelAnimationFrame(thinkRafRef.current)
      thinkRafRef.current = null
    }
  }, [])

  /**
   * 仅清空当前可见聊天 UI。
   * - 默认保留其他会话 buffer/队列（多会话并行）
   * - dropActiveBuffer：删除当前会话 buffer（工作区切换 / 删除对话等）
   */
  const clearChatUiState = useCallback((opts?: { dropActiveBuffer?: boolean }) => {
    cancelScheduledStreamPaint()
    sendInFlightRef.current = false
    doneCommittedRef.current = true
    streamingRef.current = ''
    turnThinkingRef.current = ''
    segmentsRef.current = []
    setLiveSegments([])
    setStreaming('')
    setTurnThinking('')
    setLoading(false)
    setActiveTool(null)
    setApproval(null)
    setApprovalResponding(false)
    const convId = activeConversationIdRef.current
    if (convId && opts?.dropActiveBuffer) {
      const nextQueues = { ...sessionQueuesRef.current }
      delete nextQueues[convId]
      syncActiveQueueUi(nextQueues, convId)
      sessionBuffersRef.current.delete(convId)
      if (streamOwnerRef.current === convId) streamOwnerRef.current = null
    } else if (!convId) {
      queuedPromptsRef.current = []
      setQueuedPrompts([])
      streamOwnerRef.current = null
    } else {
      // 切到空会话时只清可见队列视图，不丢弃原会话队列
      syncActiveQueueUi(sessionQueuesRef.current, null)
    }
    resetTurnMeta()
  }, [cancelScheduledStreamPaint, resetTurnMeta, syncActiveQueueUi])

  /** 节流将有序片段 ref 刷到 UI */
  const flushSegmentsToUI = useCallback(() => {
    const paint = () => {
      streamRafRef.current = null
      streamFlushTimerRef.current = null
      lastStreamRenderAt.current = performance.now()
      setLiveSegments(segmentsRef.current)
      // 兼容：从片段推导 streaming / thinking 供旧逻辑与最终正文预览
      const finalPreview = extractFinalContent(segmentsRef.current, { isStreaming: true })
      setStreaming((prev) => (prev === finalPreview ? prev : finalPreview))
      const thinkPreview = thinkingPreviewFromSegments(segmentsRef.current)
      setTurnThinking((prev) => (prev === thinkPreview ? prev : thinkPreview))
      const activeToolSeg = findLastSegment(
        segmentsRef.current,
        (s) => s.kind === 'tool' && s.status === 'active'
      )
      const nextTool = activeToolSeg?.toolName ?? null
      setActiveTool((prev) => (prev === nextTool ? prev : nextTool))
      // 当前可见会话也持续写 buffer，切换对话返回时不会丢 live 步骤
      const activeId = activeConversationIdRef.current
      const stillLive =
        sendInFlightRef.current ||
        segmentsRef.current.length > 0 ||
        Boolean(streamingRef.current.trim())
      if (activeId && stillLive) {
        let buf = sessionBuffersRef.current.get(activeId)
        if (!buf || !buf.doneCommitted) {
          if (!buf) {
            buf = {
              messages: [...messagesRef.current],
              loading: true,
              segments: [],
              streaming: '',
              turnThinking: '',
              approval: null,
              liveTurnMeta: null,
              turnStartedAt: turnStartedAtRef.current || Date.now(),
              turnHadThinking: turnHadThinkingRef.current,
              activeTool: null,
              sendInFlight: sendInFlightRef.current,
              doneCommitted: false,
              turnOutcome: turnOutcomeRef.current,
              activeUserMessageId: activeUserMessageIdRef.current,
              turnMeta: { browsedFiles: [], activities: [] }
            }
          }
          buf.messages = messagesRef.current
          buf.segments = segmentsRef.current
          buf.streaming = finalPreview
          buf.turnThinking = thinkingPreviewFromSegments(segmentsRef.current)
          buf.activeTool = activeToolSeg?.toolName ?? null
          buf.loading = true
          buf.sendInFlight = sendInFlightRef.current || buf.loading
          buf.approval = approvalRef.current
          buf.liveTurnMeta = {
            browsedFiles: [...turnMetaRef.current.browsedFiles],
            activities: [...turnMetaRef.current.activities]
          }
          buf.turnMeta = {
            browsedFiles: [...turnMetaRef.current.browsedFiles],
            activities: [...turnMetaRef.current.activities]
          }
          buf.turnStartedAt = turnStartedAtRef.current || buf.turnStartedAt
          buf.turnHadThinking = turnHadThinkingRef.current
          buf.turnOutcome = turnOutcomeRef.current
          buf.activeUserMessageId = activeUserMessageIdRef.current
          sessionBuffersRef.current.set(activeId, buf)
        }
      }
    }
    const schedulePaint = () => {
      if (streamRafRef.current != null) return
      streamRafRef.current = requestAnimationFrame(paint)
    }
    const elapsed = performance.now() - lastStreamRenderAt.current
    if (elapsed >= SEGMENT_RENDER_MS && streamFlushTimerRef.current == null) {
      schedulePaint()
      return
    }
    if (streamFlushTimerRef.current != null) return
    streamFlushTimerRef.current = setTimeout(() => {
      schedulePaint()
    }, Math.max(0, SEGMENT_RENDER_MS - elapsed))
  }, [])

  /** 并发创建对话时复用同一 Promise，避免连点/双触发造出多个空会话 */
  const creatingConversationRef = useRef<Promise<string> | null>(null)

  /** 无活跃对话时创建新对话（列表刷新不阻塞返回，避免卡死发送） */
  const ensureActiveConversation = useCallback(
    async (opts?: { preserveMessages?: boolean }): Promise<string | null> => {
      const workspaceId = settingsRef.current.activeWorkspaceId
      if (!workspaceId || !getActiveWorkspacePath(settingsRef.current)) return null
      if (activeConversationIdRef.current) return workspaceId

      if (!creatingConversationRef.current) {
        creatingConversationRef.current = (async () => {
          const conv = await window.sharker.createConversation(workspaceId)
          setActiveConversationId(conv.id)
          activeConversationIdRef.current = conv.id
          if (!opts?.preserveMessages) {
            setMessages([])
            messagesRef.current = []
          }
          // 侧栏列表刷新失败/变慢时绝不能挡住发消息
          void refreshConversationList(workspaceId).catch((e) =>
            console.warn('refreshConversationList failed', e)
          )
          return conv.id
        })().finally(() => {
          creatingConversationRef.current = null
        })
      }

      await creatingConversationRef.current
      return workspaceId
    },
    [refreshConversationList]
  )

  /**
   * 将助手回复写入 **指定 conversationId** 的 transcript 并 persist。
   * 禁止依赖「回调时刻的 active」——切换会话时否则会串写。
   */
  const commitAssistantReply = useCallback(
    (
      content: string,
      suffix = '',
      outcome = turnOutcomeRef.current,
      conversationId?: string | null
    ) => {
      const targetId = resolveCommitConversationId({
        explicitId: conversationId,
        streamOwnerId: streamOwnerRef.current,
        activeConversationId: activeConversationIdRef.current
      })

      const useActiveUi = shouldCommitToActiveUi(targetId, activeConversationIdRef.current)
      const sourceMessages = useActiveUi
        ? messagesRef.current
        : targetId
          ? (sessionBuffersRef.current.get(targetId)?.messages ?? [])
          : messagesRef.current

      const finalized = useActiveUi
        ? finalizeSegments(segmentsRef.current)
        : finalizeSegments(
            targetId ? (sessionBuffersRef.current.get(targetId)?.segments ?? []) : segmentsRef.current
          )
      if (useActiveUi) segmentsRef.current = finalized

      let text = (extractFinalContent(finalized) || content).trim()
      if (suffix) text = (text + suffix).trim()
      const startedAt = useActiveUi
        ? turnStartedAtRef.current
        : (sessionBuffersRef.current.get(targetId ?? '')?.turnStartedAt ?? Date.now())
      const durationSec = Math.max(0, Math.round((Date.now() - (startedAt || Date.now())) / 1000))
      const provider = settingsRef.current.providers.find(
        (p) => p.id === settingsRef.current.activeProviderId
      )
      const thinkingPreview = thinkingPreviewFromSegments(finalized)
      const hadThinking = finalized.some((s) => s.kind === 'thinking')
      const meta: AssistantMeta = {
        outcome,
        retryOfUserMessageId:
          outcome === 'error' ? activeUserMessageIdRef.current : undefined,
        browsedFiles: browsedFilesFromSegments(finalized),
        changedFiles: (() => {
          const paths = useActiveUi
            ? [...turnChangedPathsRef.current]
            : [...(sessionBuffersRef.current.get(targetId ?? '')?.changedRelPaths ?? [])]
          return paths.length ? paths : undefined
        })(),
        activities: activitiesFromSegments(finalized),
        segments: finalized,
        durationSec: durationSec > 0 ? durationSec : undefined,
        hadThinking,
        thinkingPreview: thinkingPreview ? thinkingPreview : undefined,
        model: provider?.model?.trim() || undefined
      }
      if (!text) {
        if (outcome === 'error') {
          text = '**错误**: 本轮失败，但未返回详细原因。请检查 设置 → 模型（API Key / SuperGrok 登录）后重试。'
        } else if (finalized.length > 0 || hadThinking) {
          text = '（本轮未生成文字回复，可展开上方过程查看详情）'
        } else {
          text = '（未收到模型回复。若刚改过代码或网络中断，请再发一次；持续失败请打开 设置 → 模型 测试连接。）'
        }
      }

      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: text,
        meta
      }
      const next = appendAssistantMessage(sourceMessages, assistant)

      if (targetId) {
        doneCommittedMapRef.current = markDoneCommitted(doneCommittedMapRef.current, targetId)
      }
      doneCommittedRef.current = true

      if (useActiveUi) {
        messagesRef.current = next
        setMessages(next)
        if (targetId) patchConversationSummary(targetId, next)
        bumpSessionLive()
        void persistActiveConversation(next, targetId ?? undefined)
        // 保留 live 状态到 loading 关闭同一帧处理，避免「消息未挂上、直播已空」的一帧闪断
        streamingRef.current = ''
        turnThinkingRef.current = ''
        // segments 先保留 finalized，等 done 收尾再清
        setStreaming('')
        setTurnThinking('')
        resetTurnMeta()
      } else if (targetId) {
        const buf = sessionBuffersRef.current.get(targetId)
        if (buf) {
          buf.messages = next
          patchConversationSummary(targetId, next)
          bumpSessionLive()
          buf.streaming = ''
          buf.turnThinking = ''
          buf.segments = []
          buf.loading = false
          buf.sendInFlight = false
          buf.doneCommitted = true
          buf.approval = null
          buf.activeTool = null
          sessionBuffersRef.current.set(targetId, buf)
        }
        void persistActiveConversation(next, targetId)
      }

      if (targetId) {
        const viewing = {
          conversationId: targetId,
          activeConversationId: activeConversationIdRef.current,
          page: pageRef.current
        }
        if (shouldMarkConversationUnread(viewing)) {
          setConversationList((list) =>
            list.map((c) => (c.id === targetId ? { ...c, unread: true } : c))
          )
          const ws =
            conversationListRef.current.find((c) => c.id === targetId)?.workspaceId ||
            settingsRef.current.activeWorkspaceId
          if (ws && window.sharker.patchConversationMeta) {
            void window.sharker.patchConversationMeta(ws, targetId, { unread: true })
          }
        }
        const focused =
          typeof document !== 'undefined' &&
          document.hasFocus() &&
          document.visibilityState === 'visible'
        if (
          shouldNotifyTurnComplete({
            ...viewing,
            windowFocused: focused,
            outcome,
            mode: settingsRef.current.turnNotifyMode
          }) &&
          window.sharker.notifyTurnComplete
        ) {
          const conv = conversationListRef.current.find((c) => c.id === targetId)
          void window.sharker.notifyTurnComplete({
            title: turnNotifyTitle(conv ?? {}),
            body: turnNotifyBody(text, meta.changedFiles?.length ?? 0),
            conversationId: targetId,
            workspaceId:
              conv?.workspaceId || settingsRef.current.activeWorkspaceId || ''
          })
        }
      }
    },
    [persistActiveConversation, resetTurnMeta]
  )

  const lastApprovalNotifyIdRef = useRef<string | null>(null)
  const notifyApprovalIfNeeded = useCallback((req: ApprovalRequest) => {
    if (!req.id || lastApprovalNotifyIdRef.current === req.id) return
    const focused =
      typeof document !== 'undefined' &&
      document.hasFocus() &&
      document.visibilityState === 'visible'
    const conversationId = req.conversationId || activeConversationIdRef.current
    if (
      !shouldNotifyApproval({
        conversationId,
        activeConversationId: activeConversationIdRef.current,
        page: pageRef.current,
        windowFocused: focused,
        enabled: settingsRef.current.approvalNotify
      }) ||
      !window.sharker.notifyTurnComplete
    ) {
      return
    }
    lastApprovalNotifyIdRef.current = req.id
    const conv = conversationListRef.current.find((c) => c.id === conversationId)
    void window.sharker.notifyTurnComplete({
      title: '需要批准',
      body: turnNotifyPreview(req.description || req.title || req.toolName),
      conversationId: conversationId || '',
      workspaceId: conv?.workspaceId || settingsRef.current.activeWorkspaceId || ''
    })
  }, [])

  useEffect(() => {
    conversationListRef.current = conversationList
  }, [conversationList])

  useEffect(() => {
    if (!window.sharker.setDockBadge) return
    void window.sharker.setDockBadge(unreadDockBadgeCount(conversationList))
  }, [conversationList])

  useEffect(() => {
    if (page !== 'chat' || !activeConversationId) return
    const ws = settingsRef.current.activeWorkspaceId
    const marked = conversationListRef.current.find((c) => c.id === activeConversationId)
    if (!marked?.unread || !ws || !window.sharker.patchConversationMeta) return
    setConversationList((list) =>
      list.map((c) => (c.id === activeConversationId ? { ...c, unread: false } : c))
    )
    void window.sharker.patchConversationMeta(ws, activeConversationId, { unread: false })
  }, [page, activeConversationId])

  useEffect(() => {
    if (!window.sharker.onNotifyTurnClick) return
    return window.sharker.onNotifyTurnClick((payload) => {
      if (!payload?.conversationId || !payload.workspaceId) return
      setPage('chat')
      void handleSelectConversationRef.current(payload.workspaceId, payload.conversationId)
    })
  }, [])

  useEffect(() => {
    if (!window.sharker.onDeeplink) return
    const run = (url: string) => {
      void applyDeeplinkRef.current(url)
    }
    void window.sharker.takePendingDeeplink?.().then((url) => {
      if (url) run(url)
    })
    return window.sharker.onDeeplink(run)
  }, [])

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    settingsDraftRef.current = settingsDraft
  }, [settingsDraft])

  useEffect(() => {
    const runtime = loadThreadRuntime(activeConversationId)
    setThreadMode(runtime.mode)
    setThreadWorktreePath(runtime.worktreePath)
    setWorktreeBaseRef(runtime.baseRef || '')
    threadRuntimeRef.current = runtime
    setWorktreeMissing(false)
    const goal = loadThreadGoal(activeConversationId)
    threadGoalRef.current = goal
    setThreadGoal(goal)
    setQueueHeld(Boolean(activeConversationId && queueHeldByConvRef.current.has(activeConversationId)))
  }, [activeConversationId])

  useEffect(() => {
    if (threadMode !== 'worktree' || !threadWorktreePath || !window.sharker.inspectWorktree) {
      setWorktreeMissing(false)
      return
    }
    let cancelled = false
    void window.sharker.inspectWorktree(threadWorktreePath).then((info) => {
      if (!cancelled) setWorktreeMissing(!info.exists)
    })
    return () => {
      cancelled = true
    }
  }, [threadMode, threadWorktreePath])

  useEffect(() => {
    const off = window.sharker?.onAutomationRun?.((job) => {
      void (async () => {
        const j = job as { id?: string; title?: string; prompt?: string }
        if (!j.prompt) return
        const wsId = settingsRef.current.activeWorkspaceId
        if (!wsId || !window.sharker.createConversation) {
          void dispatchTurnRef.current(`[自动化] ${j.prompt}`)
          return
        }
        const conv = await window.sharker.createConversation(wsId)
        const cwd = getActiveWorkspacePath(settingsRef.current)
        let workspacePath = cwd || undefined
        if (cwd && window.sharker.prepareWorktree) {
          saveThreadRuntime(conv.id, { mode: 'worktree' })
          const prepared = await window.sharker.prepareWorktree(cwd, conv.id, {
            keep: settingsRef.current.worktreeKeepCount
          })
          if (prepared.ok) {
            saveThreadRuntime(conv.id, { mode: 'worktree', worktreePath: prepared.path })
            workspacePath = prepared.path
          } else {
            saveThreadRuntime(conv.id, { mode: 'local' })
            console.warn('[automation] worktree fallback', prepared.error)
          }
        }
        if (window.sharker.listAutomationQueue && window.sharker.saveAutomationQueue) {
          const prev = await window.sharker.listAutomationQueue()
          const item = enqueueAutomationRun(
            { id: String(j.id || conv.id), title: String(j.title || '自动化'), prompt: j.prompt },
            conv.id,
            new Date(),
            {
              workspaceId: wsId,
              workspacePath
            }
          )
          await window.sharker.saveAutomationQueue([item, ...prev])
          setQueueUnread(unreadQueueCount([item, ...prev]))
        }
        void refreshConversationList(wsId)
        void dispatchTurnRef.current(`[自动化] ${j.title ? `${j.title}\n\n` : ''}${j.prompt}`, [], conv.id)
      })()
    })
    return () => off?.()
  }, [refreshConversationList])

  useEffect(() => {
    if (!window.sharker?.listAutomationQueue) return
    void window.sharker.listAutomationQueue().then((q) => setQueueUnread(unreadQueueCount(q)))
  }, [])

  /** 切换右侧 Codex 风格面板 */
  const handleToggleRightPanel = useCallback(() => {
    setRightPanelOpen((o) => !o)
  }, [])

  /** 保存设置并同步本地 state（切换工作区时合并字段） */
  const persistSettings = useCallback(async (next: AppSettings) => {
    try {
      const targetWorkspaceId = next.activeWorkspaceId
      await window.sharker.saveSettings(next)
      const updated = await window.sharker.getSettings()
      if (settingsRef.current.activeWorkspaceId !== targetWorkspaceId) {
        const merged: AppSettings = {
          ...settingsRef.current,
          workspaces: updated.workspaces,
          providers: updated.providers,
          activeProviderId: updated.activeProviderId,
          permissionMode: updated.permissionMode,
          networkMode: updated.networkMode,
          computerUseEnabled: updated.computerUseEnabled,
          browserUseEnabled: updated.browserUseEnabled,
          uiGlass: updated.uiGlass,
          uiTheme: updated.uiTheme,
          personality: updated.personality,
          worktreeKeepCount: updated.worktreeKeepCount,
          memoryInjection: updated.memoryInjection,
          memoryGeneration: updated.memoryGeneration,
          uiFontScale: updated.uiFontScale,
          keyboardShortcuts: updated.keyboardShortcuts,
          followUpBehavior: updated.followUpBehavior,
          requireModEnter: updated.requireModEnter,
          suggestedPrompts: updated.suggestedPrompts,
          reviewDelivery: updated.reviewDelivery,
          gitCommitPrompt: updated.gitCommitPrompt,
          gitPrPrompt: updated.gitPrPrompt,
          turnNotifyMode: updated.turnNotifyMode,
          preventSleepWhileRunning: updated.preventSleepWhileRunning,
          popoutAlwaysOnTop: updated.popoutAlwaysOnTop,
          approvalNotify: updated.approvalNotify
        }
        settingsRef.current = merged
        setSettings(merged)
        setSettingsDraft(merged)
        return merged
      }
      settingsRef.current = updated
      setSettings(updated)
      setSettingsDraft(updated)
      return updated
    } catch (e) {
      console.error('保存设置失败', e)
      throw e
    }
  }, [])

  const persistFontScale = useCallback(
    (nextScale: number) => {
      const uiFontScale = clampUiFontScale(nextScale)
      const merged = { ...settingsRef.current, uiFontScale }
      applyAppearanceDom(merged.uiTheme === 'dark' ? 'dark' : 'light', uiFontScale)
      settingsRef.current = merged
      setSettings(merged)
      setSettingsDraft(merged)
      void persistSettings(merged)
    },
    [persistSettings]
  )

  /** 离开设置页前落盘草稿 */
  const flushSettingsDraftIfNeeded = useCallback(async () => {
    if (pageRef.current !== 'settings') return
    const current = settingsRef.current
    const draft = settingsDraftRef.current
    const merged: AppSettings = {
      ...current,
      permissionMode: draft.permissionMode,
      networkMode: draft.networkMode,
      workspaceProfile: draft.workspaceProfile,
      providers: draft.providers,
      activeProviderId: draft.activeProviderId,
      computerUseEnabled: draft.computerUseEnabled,
      browserUseEnabled: draft.browserUseEnabled,
      uiGlass: draft.uiGlass,
      uiTheme: draft.uiTheme,
      personality: draft.personality,
      worktreeKeepCount: draft.worktreeKeepCount,
      memoryInjection: draft.memoryInjection,
      memoryGeneration: draft.memoryGeneration,
      uiFontScale: draft.uiFontScale,
      keyboardShortcuts: draft.keyboardShortcuts,
      followUpBehavior: draft.followUpBehavior,
      requireModEnter: draft.requireModEnter,
      suggestedPrompts: draft.suggestedPrompts,
      reviewDelivery: draft.reviewDelivery,
      gitCommitPrompt: draft.gitCommitPrompt,
      gitPrPrompt: draft.gitPrPrompt,
      turnNotifyMode: draft.turnNotifyMode,
      preventSleepWhileRunning: draft.preventSleepWhileRunning,
      popoutAlwaysOnTop: draft.popoutAlwaysOnTop,
      approvalNotify: draft.approvalNotify,
      workspaces: current.workspaces?.length ? current.workspaces : draft.workspaces,
      activeWorkspaceId: current.activeWorkspaceId || draft.activeWorkspaceId,
      workspacePath: current.workspacePath || draft.workspacePath
    }
    await persistSettings(merged)
  }, [persistSettings])

  useEffect(() => {
    if (!window.sharker?.getSettings) {
      console.error('preload 未就绪：window.sharker 不可用')
      return
    }
    window.sharker
      .getSettings()
      .then((s) => {
        setSettings(s)
        setSettingsDraft(s)
      })
      .catch((e) => console.error('加载设置失败', e))
  }, [])

  useEffect(() => {
    if (popoutRoute) return
    if (!settings.activeWorkspaceId) return
    void loadWorkspaceSession(settings.activeWorkspaceId)
  }, [settings.activeWorkspaceId, loadWorkspaceSession, popoutRoute])

  useEffect(() => {
    if (!activeConversationId || loading) return
    const timer = window.setTimeout(() => {
      void persistActiveConversation(messagesRef.current)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [messages, activeConversationId, loading, persistActiveConversation])

  /** 订阅主进程流式事件：思考、token、工具、压缩、完成（按 conversationId 隔离） */
  useEffect(() => {
    if (!window.sharker?.onStream) return

    const ensureBuffer = (convId: string): SessionLiveBuffer => {
      let buf = sessionBuffersRef.current.get(convId)
      if (!buf) {
        buf = {
          messages: [],
          loading: true,
          segments: [],
          streaming: '',
          turnThinking: '',
          approval: null,
          liveTurnMeta: null,
          turnStartedAt: Date.now(),
          turnHadThinking: false,
          activeTool: null,
          sendInFlight: true,
          doneCommitted: false,
          turnOutcome: 'success',
          turnMeta: { browsedFiles: [], activities: [] },
          changedRelPaths: [],
          lastTurnPaths: lastTurnPathsByConvRef.current.get(convId) ?? []
        }
        sessionBuffersRef.current.set(convId, buf)
      }
      return buf
    }

    const writeWorkspace = () =>
      threadWorktreePathRef.current || getActiveWorkspacePath(settingsRef.current) || ''

    const collectWrites = (
      dest: string[],
      toolName?: string,
      args?: Record<string, unknown>
    ) => {
      if (!toolName) return
      for (const p of extractChangedRelPaths(toolName, args, writeWorkspace())) {
        if (!dest.includes(p)) dest.push(p)
      }
    }

    const rememberLastTurn = (convId: string | null | undefined, paths: string[]) => {
      if (!convId) return
      lastTurnPathsByConvRef.current.set(convId, paths)
      if (activeConversationIdRef.current === convId) setLastTurnPaths(paths)
      if (!paths.length || !window.sharker.listAutomationQueue) return
      void window.sharker.listAutomationQueue().then((prev) => {
        const next = attachQueueChangedPaths(prev, convId, paths)
        if (next === prev) return
        void window.sharker.saveAutomationQueue?.(next)
      })
    }

    const applyChunkToBuffer = (buf: SessionLiveBuffer, chunk: import('../shared/types').StreamChunk) => {
      if (chunk.type === 'think' && chunk.content) {
        buf.turnHadThinking = true
        buf.turnThinking += chunk.content
      }
      if (chunk.type === 'error') buf.turnOutcome = 'error'
      if (chunk.type === 'token' && chunk.content) {
        buf.streaming += chunk.content
      }
      buf.segments = applyStreamChunk(buf.segments, chunk)
      if (chunk.type === 'tool_start' || chunk.type === 'tool_done') {
        buf.changedRelPaths ??= []
        collectWrites(buf.changedRelPaths, chunk.toolName, chunk.toolArgs)
      }
      if (chunk.type === 'tool_start' && chunk.toolName === 'agent_spawn') {
        setRightPanelTab('agents')
        setRightPanelOpen(true)
      }
      if (chunk.type === 'tool_done' && chunk.toolName) {
        if (
          stampSubAgentActivity(
            buf.turnMeta.activities,
            chunk.toolName,
            chunk.toolArgs,
            chunk.resultSummary,
            chunk.content
          )
        ) {
          buf.liveTurnMeta = {
            browsedFiles: [...buf.turnMeta.browsedFiles],
            activities: [...buf.turnMeta.activities]
          }
        }
      }
      if (chunk.type === 'tool_start' && chunk.toolName) {
        for (const p of extractBrowsedPaths(chunk.toolName, chunk.toolArgs)) {
          if (!buf.turnMeta.browsedFiles.includes(p)) buf.turnMeta.browsedFiles.push(p)
        }
        const label = formatToolActivity(chunk.toolName, chunk.toolArgs)
        const acts = buf.turnMeta.activities
        if (acts.length === 0 || acts[acts.length - 1].label !== label) {
          acts.push({ kind: 'tool', label })
        }
        buf.liveTurnMeta = {
          browsedFiles: [...buf.turnMeta.browsedFiles],
          activities: [...buf.turnMeta.activities]
        }
      }
      if (chunk.type === 'tool_done' || chunk.type === 'status' || chunk.type === 'tool_start') {
        const stillActive = findLastSegment(
          buf.segments,
          (s) => s.kind === 'tool' && s.status === 'active'
        )
        buf.activeTool = stillActive?.toolName ?? null
      }
      if (chunk.type === 'approval_needed' && chunk.approval) {
        buf.approval = chunk.approval
      }
      if (chunk.type === 'approval_resolved') {
        buf.approval = null
      }
      if (chunk.type === 'context_compress' && chunk.contextCompress) {
        const { messages: compressed } = chunk.contextCompress
        const last = buf.messages[buf.messages.length - 1]
        buf.messages =
          last?.role === 'user' ? [...compressed, last] : [...compressed]
      }
      buf.loading = true
      buf.sendInFlight = true
    }

    const offStream = window.sharker.onStream((chunk) => {
      const ownerId = chunk.conversationId ?? streamOwnerRef.current
      const activeId = activeConversationIdRef.current
      // 无归属的 chunk：仅当当前会话确实在飞且尚无 streamOwner 时才上屏（兼容旧单会话）
      // 否则丢弃/不污染当前可见 UI，避免 A 的无 id 事件在 B 上闪现
      const applyToUi = ownerId
        ? shouldApplyStreamToActive(ownerId, activeId)
        : Boolean(activeId && sendInFlightRef.current && !streamOwnerRef.current)

      if (chunk.type === 'harness_mode' && chunk.harnessPhase) {
        const on = chunk.harnessPhase === 'plan'
        const id = ownerId || (applyToUi ? activeId : null)
        if (id) planModeByConvRef.current.set(id, on)
        if (applyToUi) setPlanMode(on)
        return
      }

      // 后台会话：只写 buffer，绝不污染当前可见 transcript
      if (ownerId && !applyToUi) {
        const buf = ensureBuffer(ownerId)
        if (
          chunk.type === 'think' ||
          chunk.type === 'status' ||
          chunk.type === 'token' ||
          chunk.type === 'tool_start' ||
          chunk.type === 'tool_done' ||
          chunk.type === 'tool_preview' ||
          chunk.type === 'turn_start' ||
          chunk.type === 'context_compress' ||
          chunk.type === 'approval_needed' ||
          chunk.type === 'approval_resolved' ||
          chunk.type === 'turn_cancelled' ||
          chunk.type === 'error'
        ) {
          if (
            !shouldAcceptDoneEvent(doneCommittedMapRef.current, ownerId) &&
            (chunk.type === 'tool_start' ||
              chunk.type === 'tool_done' ||
              chunk.type === 'tool_preview' ||
              chunk.type === 'status' ||
              chunk.type === 'token' ||
              chunk.type === 'think')
          ) {
            return
          }
          applyChunkToBuffer(buf, chunk)
        }
        if (chunk.type === 'approval_needed' || chunk.type === 'approval_resolved') {
          bumpSessionLive()
        }
        if (chunk.type === 'turn_start' && ownerId) {
          // 后台会话只维护自身门闩，绝不抢当前可见会话的 streamOwner
          doneCommittedMapRef.current = clearDoneCommitted(doneCommittedMapRef.current, ownerId)
          buf.doneCommitted = false
          buf.loading = true
          buf.sendInFlight = true
        }
        if (chunk.type === 'turn_cancelled') {
          buf.turnOutcome = 'aborted'
        }
        if (chunk.type === 'done') {
          if (
            ownerId &&
            streamTurnGenByConvRef.current[ownerId] != null &&
            streamTurnGenByConvRef.current[ownerId]! < turnGenRef.current
          ) {
            return
          }
          if (ownerId && awaitingTurnStartByConvRef.current[ownerId] != null) {
            return
          }
          if (!shouldAcceptDoneEvent(doneCommittedMapRef.current, ownerId)) return
          if (buf.doneCommitted) return
          doneCommittedMapRef.current = markDoneCommitted(doneCommittedMapRef.current, ownerId)
          buf.doneCommitted = true
          buf.loading = false
          buf.sendInFlight = false
          buf.activeTool = null
          buf.approval = null
          buf.segments = finalizeSegments(buf.segments)
          const text = extractFinalContent(buf.segments) || buf.streaming
          const durationSec = Math.max(
            0,
            Math.round((Date.now() - (buf.turnStartedAt ?? Date.now())) / 1000)
          )
          const provider = settingsRef.current.providers.find(
            (p) => p.id === settingsRef.current.activeProviderId
          )
          const assistant: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: text.trim(),
            meta: {
              browsedFiles: [...buf.turnMeta.browsedFiles],
              activities: [...buf.turnMeta.activities],
              segments: buf.segments,
              durationSec: durationSec > 0 ? durationSec : undefined,
              model: provider?.model?.trim() || undefined,
              outcome: buf.turnOutcome
            }
          }
          buf.messages = appendAssistantMessage(buf.messages, assistant)
          buf.streaming = ''
          buf.lastTurnPaths = [...(buf.changedRelPaths ?? [])]
          buf.changedRelPaths = []
          rememberLastTurn(ownerId, buf.lastTurnPaths)
          patchConversationSummary(ownerId, buf.messages)
          bumpSessionLive()
          void persistActiveConversation(buf.messages, ownerId)
          if (streamOwnerRef.current === ownerId) streamOwnerRef.current = null
          const wsId = settingsRef.current.activeWorkspaceId
          if (wsId) void refreshConversationList(wsId)
          const held = Boolean(ownerId && queueHeldByConvRef.current.has(ownerId))
          const { next, queues } = nextFollowUpAfterTurn(sessionQueuesRef.current, ownerId, {
            held
          })
          sessionQueuesRef.current = queues
          if (activeConversationIdRef.current === ownerId) {
            syncActiveQueueUi(queues, ownerId)
          }
          if (next) {
            void dispatchTurnRef.current(next.text, next.attachments, ownerId)
          } else {
            sessionBuffersRef.current.set(ownerId, buf)
          }
        }
        return
      }

      if (
        chunk.type === 'think' ||
        chunk.type === 'status' ||
        chunk.type === 'token' ||
        chunk.type === 'tool_start' ||
        chunk.type === 'tool_done' ||
        chunk.type === 'tool_preview' ||
        chunk.type === 'turn_start' ||
        chunk.type === 'context_compress' ||
        chunk.type === 'approval_needed' ||
        chunk.type === 'approval_resolved' ||
        chunk.type === 'turn_cancelled' ||
        chunk.type === 'error'
      ) {
        // 插队后旧 turn 的迟到 chunk/done：若代数已落后则丢弃
        if (
          ownerId &&
          streamTurnGenByConvRef.current[ownerId] != null &&
          streamTurnGenByConvRef.current[ownerId]! < turnGenRef.current &&
          chunk.type !== 'turn_start'
        ) {
          return
        }
        // 本会话已 stop/commit 后，忽略迟到的工具进度，防止把 cancelled 又改回 done
        if (
          ownerId &&
          !shouldAcceptDoneEvent(doneCommittedMapRef.current, ownerId) &&
          (chunk.type === 'tool_start' ||
            chunk.type === 'tool_done' ||
            chunk.type === 'tool_preview' ||
            chunk.type === 'status' ||
            chunk.type === 'token' ||
            chunk.type === 'think')
        ) {
          return
        }
        if (chunk.type === 'think' && chunk.content) {
          turnThinkingRef.current += chunk.content
          if (!turnHadThinkingRef.current) {
            turnHadThinkingRef.current = true
            setTurnHadThinking(true)
          }
        }
        if (chunk.type === 'error') turnOutcomeRef.current = 'error'
        if (chunk.type === 'token' && chunk.content) {
          streamingRef.current += chunk.content
        }
        segmentsRef.current = applyStreamChunk(segmentsRef.current, chunk)
        // 同步 turnMeta 供侧栏/旧逻辑
        if (chunk.type === 'tool_done' || chunk.type === 'tool_start') {
          bumpChangesSoon()
          collectWrites(turnChangedPathsRef.current, chunk.toolName, chunk.toolArgs)
        }
        if (chunk.type === 'tool_start' && chunk.toolName) {
          for (const p of extractBrowsedPaths(chunk.toolName, chunk.toolArgs)) {
            if (!turnMetaRef.current.browsedFiles.includes(p)) {
              turnMetaRef.current.browsedFiles.push(p)
            }
          }
          const label = formatToolActivity(chunk.toolName, chunk.toolArgs)
          const acts = turnMetaRef.current.activities
          if (acts.length === 0 || acts[acts.length - 1].label !== label) {
            acts.push({ kind: 'tool', label })
          }
          syncLiveTurnMeta()
        }
        if (chunk.type === 'tool_done' && chunk.toolName) {
          if (
            stampSubAgentActivity(
              turnMetaRef.current.activities,
              chunk.toolName,
              chunk.toolArgs,
              chunk.resultSummary,
              chunk.content
            )
          ) {
            syncLiveTurnMeta()
          }
        }
        if (chunk.type === 'context_compress' && chunk.contextCompress) {
          const { messages: compressed, removedCount, beforeTokens, afterTokens } =
            chunk.contextCompress
          setMessages((msgs) => {
            const last = msgs[msgs.length - 1]
            const next =
              last?.role === 'user' ? [...compressed, last] : [...compressed]
            messagesRef.current = next
            void persistActiveConversation(next, ownerId ?? undefined)
            return next
          })
          turnMetaRef.current.activities.push({
            kind: 'compress',
            label: `compress · ${removedCount} 条 → ${beforeTokens}→${afterTokens} tokens`
          })
          syncLiveTurnMeta()
        }
        if (chunk.type === 'approval_needed' && chunk.approval) {
          // 仅当前会话展示审批条
          if (!chunk.approval.conversationId || chunk.approval.conversationId === activeId) {
            setApproval(chunk.approval)
            approvalRef.current = chunk.approval
          }
          notifyApprovalIfNeeded(chunk.approval)
        }
        if (chunk.type === 'approval_resolved') {
          setApproval(null)
          approvalRef.current = null
          const waitingId = ownerId || activeId
          if (waitingId) {
            const parked = sessionBuffersRef.current.get(waitingId)
            if (parked) parked.approval = null
          }
        }
        if (chunk.type === 'turn_start' && ownerId) {
          streamOwnerRef.current = ownerId
          if (ownerId && streamTurnGenByConvRef.current[ownerId] == null) {
            streamTurnGenByConvRef.current[ownerId] = turnGenRef.current
          }
          // 新 turn 已真正开始：允许后续 done 收尾
          if (ownerId) delete awaitingTurnStartByConvRef.current[ownerId]
          doneCommittedMapRef.current = clearDoneCommitted(doneCommittedMapRef.current, ownerId)
          doneCommittedRef.current = false
        }
        if (chunk.type === 'turn_cancelled') {
          turnOutcomeRef.current = 'aborted'
        }
        flushSegmentsToUI()
        return
      }
      if (chunk.type === 'plan_ready' && chunk.planDocument) {
        const plan = { document: chunk.planDocument, filePath: chunk.planFilePath }
        const id = ownerId || (applyToUi ? activeId : null)
        if (id) pendingPlanByConvRef.current.set(id, plan)
        if (applyToUi || !ownerId) setPendingPlan(plan)
        return
      }
      if (chunk.type === 'command' && chunk.command === 'clear') {
        if (!applyToUi && ownerId) return
        setMessages([])
        messagesRef.current = []
        void persistActiveConversation([])
      }
      if (chunk.type === 'command' && chunk.command === 'compact') {
        if (!applyToUi && ownerId) return
        void (async () => {
          const result = await window.sharker.compressContext(messagesRef.current)
          if (!result.compressed) return
          setMessages(result.messages)
          messagesRef.current = result.messages
          await persistActiveConversation(result.messages)
        })()
      }
      if (chunk.type === 'done') {
        const completedId = ownerId ?? activeConversationIdRef.current
        // 插队后旧 turn 的迟到 done：代数落后则直接丢弃，避免把新 turn loading 清掉
        if (
          completedId &&
          streamTurnGenByConvRef.current[completedId] != null &&
          streamTurnGenByConvRef.current[completedId]! < turnGenRef.current
        ) {
          return
        }
        // 新 turn 已派发但尚未 turn_start：此时 done 只可能来自刚 abort 的旧 turn
        if (completedId && awaitingTurnStartByConvRef.current[completedId] != null) {
          return
        }
        // 按会话门闩：A 的 stop 不得挡住 B 的 real done
        if (!shouldAcceptDoneEvent(doneCommittedMapRef.current, completedId)) return
        if (completedId) {
          doneCommittedMapRef.current = markDoneCommitted(doneCommittedMapRef.current, completedId)
        }
        const isActiveDone =
          !completedId || completedId === activeConversationIdRef.current
        if (!isActiveDone) {
          // 防御：owner 与当前可见会话不一致时，走 buffer 收尾，绝不清当前 UI
          const buf = ensureBuffer(completedId!)
          if (!buf.doneCommitted) {
            buf.doneCommitted = true
            buf.loading = false
            buf.sendInFlight = false
            buf.activeTool = null
            buf.approval = null
            buf.segments = finalizeSegments(buf.segments)
            const text = extractFinalContent(buf.segments) || buf.streaming
            const durationSec = Math.max(
              0,
              Math.round((Date.now() - (buf.turnStartedAt ?? Date.now())) / 1000)
            )
            const provider = settingsRef.current.providers.find(
              (p) => p.id === settingsRef.current.activeProviderId
            )
            const assistant: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: text.trim(),
              meta: {
                browsedFiles: [...buf.turnMeta.browsedFiles],
                activities: [...buf.turnMeta.activities],
                segments: buf.segments,
                durationSec: durationSec > 0 ? durationSec : undefined,
                model: provider?.model?.trim() || undefined,
                outcome: buf.turnOutcome
              }
            }
            buf.messages = appendAssistantMessage(buf.messages, assistant)
            buf.streaming = ''
            buf.lastTurnPaths = [...(buf.changedRelPaths ?? [])]
            buf.changedRelPaths = []
            rememberLastTurn(completedId, buf.lastTurnPaths)
            sessionBuffersRef.current.set(completedId!, buf)
            void persistActiveConversation(buf.messages, completedId)
          }
          if (streamOwnerRef.current === completedId) streamOwnerRef.current = null
          return
        }
        if (completedId === activeConversationIdRef.current) {
          doneCommittedRef.current = true
        }
        if (streamRafRef.current != null) {
          cancelAnimationFrame(streamRafRef.current)
          streamRafRef.current = null
        }
        if (streamFlushTimerRef.current != null) {
          clearTimeout(streamFlushTimerRef.current)
          streamFlushTimerRef.current = null
        }
        if (thinkRafRef.current != null) {
          cancelAnimationFrame(thinkRafRef.current)
          thinkRafRef.current = null
        }
        segmentsRef.current = finalizeSegments(segmentsRef.current)
        // 先把最终片段刷到直播区，再提交到消息列表；loading 由 commit 后统一关闭，避免空窗闪断
        setLiveSegments(cloneSegments(segmentsRef.current))
        setTurnThinking(thinkingPreviewFromSegments(segmentsRef.current))
        setStreaming(extractFinalContent(segmentsRef.current))
        setActiveTool(null)
        sendInFlightRef.current = false
        rememberLastTurn(completedId, [...turnChangedPathsRef.current])
        turnChangedPathsRef.current = []
        commitAssistantReply(streamingRef.current, '', turnOutcomeRef.current, completedId)
        segmentsRef.current = []
        setLiveSegments([])
        setLoading(false)
        bumpSessionLive()
        // 当前会话完成后再删 buffer；后台会话保留给切回恢复
        if (completedId && completedId === activeConversationIdRef.current) {
          sessionBuffersRef.current.delete(completedId)
        }
        if (streamOwnerRef.current === completedId) streamOwnerRef.current = null
        const wsId = settingsRef.current.activeWorkspaceId
        if (wsId) void refreshConversationList(wsId)
        if (completedId) {
          const held = queueHeldByConvRef.current.has(completedId)
          const { next, queues } = nextFollowUpAfterTurn(sessionQueuesRef.current, completedId, {
            held
          })
          syncActiveQueueUi(queues, activeConversationIdRef.current)
          if (next) {
            void dispatchTurnRef.current(next.text, next.attachments, next.conversationId)
          }
        }
      }
    })
    const offApproval = window.sharker.onApproval((req) => {
      const activeId = activeConversationIdRef.current
      if (req.conversationId && activeId && req.conversationId !== activeId) {
        const buf = sessionBuffersRef.current.get(req.conversationId)
        if (buf) buf.approval = req
        notifyApprovalIfNeeded(req)
        bumpSessionLive()
        return
      }
      setApproval(req)
      approvalRef.current = req
      notifyApprovalIfNeeded(req)
    })
    return () => {
      offStream()
      offApproval()
      if (streamRafRef.current != null) cancelAnimationFrame(streamRafRef.current)
      if (streamFlushTimerRef.current != null) clearTimeout(streamFlushTimerRef.current)
      if (thinkRafRef.current != null) cancelAnimationFrame(thinkRafRef.current)
    }
  }, [
    commitAssistantReply,
    flushSegmentsToUI,
    syncLiveTurnMeta,
    refreshConversationList,
    persistActiveConversation,
    syncActiveQueueUi,
    bumpChangesSoon,
    bumpSessionLive,
    notifyApprovalIfNeeded
  ])

  /** 带超时的 Promise，防止 IPC/数据库卡住导致「发了没反应」 */
  const withTimeout = useCallback(
    <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）。请重试；若反复出现请重启应用。`))
        }, ms)
        promise.then(
          (value) => {
            window.clearTimeout(timer)
            resolve(value)
          },
          (err) => {
            window.clearTimeout(timer)
            reject(err)
          }
        )
      })
    },
    []
  )

  const applyPlanUiForConversation = useCallback((conversationId: string) => {
    setPlanMode(planModeByConvRef.current.get(conversationId) === true)
    setPendingPlan(pendingPlanByConvRef.current.get(conversationId) ?? null)
    if (!window.sharker.getPlanMode) return
    void window.sharker.getPlanMode(conversationId).then((phase) => {
      const on = phase === 'plan'
      planModeByConvRef.current.set(conversationId, on)
      if (activeConversationIdRef.current === conversationId) setPlanMode(on)
    })
  }, [])

  const handlePlanModeChange = useCallback(async (enabled: boolean) => {
    const id = activeConversationIdRef.current
    if (!id || !window.sharker.setPlanMode) return
    const phase = await window.sharker.setPlanMode(id, enabled)
    const on = phase === 'plan'
    planModeByConvRef.current.set(id, on)
    if (activeConversationIdRef.current === id) setPlanMode(on)
  }, [])

  const handleThreadModeChange = useCallback(async (mode: ThreadMode) => {
    const prev = threadRuntimeRef.current
    if (mode === prev.mode) return
    const convId = activeConversationIdRef.current
    const localCwd = getActiveWorkspacePath(settingsRef.current)
    let worktreePath = prev.worktreePath

    const note = (text: string) => {
      const msg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: text
      }
      setMessages((msgs) => {
        const nextMsgs = [...msgs, msg]
        messagesRef.current = nextMsgs
        void persistActiveConversation(nextMsgs)
        return nextMsgs
      })
    }

    if (mode === 'worktree') {
      if (!worktreePath && localCwd && convId && window.sharker.prepareWorktree) {
        const prepared = await window.sharker.prepareWorktree(localCwd, convId, {
          baseRef: worktreeBaseRef || prev.baseRef,
          keep: settingsRef.current.worktreeKeepCount
        })
        if (!prepared.ok) {
          note(`**交接失败**：${prepared.error}`)
          return
        }
        worktreePath = prepared.path
      }
      if (localCwd && worktreePath && window.sharker.handoffThread) {
        const result = await window.sharker.handoffThread({
          direction: 'to_worktree',
          localCwd,
          worktreePath
        })
        if (!result.ok) {
          note(`**交接失败**：${result.error}`)
          return
        }
      }
    } else if (worktreePath && localCwd && window.sharker.handoffThread) {
      const result = await window.sharker.handoffThread({
        direction: 'to_local',
        localCwd,
        worktreePath
      })
      if (!result.ok) {
        note(`**交接失败**：${result.error}`)
        return
      }
    }

    const next = {
      mode,
      worktreePath,
      baseRef: worktreeBaseRef || prev.baseRef
    }
    threadRuntimeRef.current = next
    setThreadMode(mode)
    setThreadWorktreePath(worktreePath)
    if (convId) saveThreadRuntime(convId, next)
    note(mode === 'worktree' ? '已交接进隔离 worktree。' : '已交接到本地工作区。')
  }, [persistActiveConversation, worktreeBaseRef])

  const worktreeWarningRef = useRef<string | null>(null)

  const ensureWorktreeForTurn = useCallback(async (convId: string | null | undefined) => {
    const isActive = Boolean(convId && convId === activeConversationIdRef.current)
    const runtime = runtimeForConversation(convId, activeConversationIdRef.current, threadRuntimeRef.current)
    worktreeWarningRef.current = null
    if (runtime.mode !== 'worktree') return undefined
    if (runtime.worktreePath && window.sharker.inspectWorktree) {
      const info = await window.sharker.inspectWorktree(runtime.worktreePath)
      if (info.exists) return runtime.worktreePath
    } else if (runtime.worktreePath) {
      return runtime.worktreePath
    }
    const cwd = getActiveWorkspacePath(settingsRef.current)
    if (!cwd || !convId || !window.sharker?.prepareWorktree) return undefined
    const result = await window.sharker.prepareWorktree(cwd, convId, {
      baseRef: runtime.baseRef,
      keep: settingsRef.current.worktreeKeepCount
    })
    if (!result.ok) {
      worktreeWarningRef.current = result.error
      console.warn('[worktree]', result.error)
      return undefined
    }
    const next = {
      mode: 'worktree' as const,
      worktreePath: result.path,
      baseRef: runtime.baseRef
    }
    saveThreadRuntime(convId, next)
    if (isActive) {
      threadRuntimeRef.current = next
      setThreadWorktreePath(result.path)
    }
    if (isActive) setWorktreeMissing(false)
    return result.path
  }, [])

  const handleRestoreWorktree = useCallback(async () => {
    const convId = activeConversationIdRef.current
    const path = await ensureWorktreeForTurn(convId)
    if (path) setWorktreeMissing(false)
  }, [ensureWorktreeForTurn])

  /** 派发单条 turn：立刻展示用户消息，再触发 IPC（绑定 conversationId） */
  const dispatchTurn = useCallback(
    async (text: string, attachments: ChatAttachment[] = [], conversationId?: string) => {
      let convId = conversationId ?? activeConversationIdRef.current

      // 后台会话续跑：只更新该会话 buffer，不污染当前可见会话
      if (convId && convId !== activeConversationIdRef.current) {
        let buf = sessionBuffersRef.current.get(convId)
        if (!buf) {
          buf = {
            messages: [],
            loading: true,
            segments: [],
            streaming: '',
            turnThinking: '',
            approval: null,
            liveTurnMeta: null,
            turnStartedAt: Date.now(),
            turnHadThinking: false,
            activeTool: null,
            sendInFlight: true,
            doneCommitted: false,
            turnOutcome: 'success',
            turnMeta: { browsedFiles: [], activities: [] }
          }
        }
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          attachments: attachments.length ? attachments : undefined
        }
        const history = buf.messages
        buf.messages = [...history, userMsg]
        buf.loading = true
        buf.sendInFlight = true
        buf.doneCommitted = false
        patchConversationSummary(convId, buf.messages)
        bumpSessionLive()
        const seedAt = Date.now()
        buf.segments = [
          {
            id: `status-local-start-${seedAt}`,
            kind: 'status',
            content: '连接模型并准备任务…',
            status: 'active',
            startedAt: seedAt
          }
        ]
        buf.streaming = ''
        buf.turnThinking = ''
        buf.approval = null
        buf.turnStartedAt = seedAt
        buf.turnMeta = { browsedFiles: [], activities: [] }
        sessionBuffersRef.current.set(convId, buf)
        doneCommittedMapRef.current = clearDoneCommitted(doneCommittedMapRef.current, convId)
        try {
          const worktreePath = await ensureWorktreeForTurn(convId)
          await window.sharker.sendMessage(text, history, attachments, convId, {
            worktreePath,
            goal: goalTextForConversation(convId, activeConversationIdRef.current, threadGoalRef.current)
          })
          void persistActiveConversation(buf.messages, convId)
        } catch (e) {
          console.error('后台会话发送失败', e)
          buf.loading = false
          buf.sendInFlight = false
        }
        return
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        attachments: attachments.length ? attachments : undefined
      }
      activeUserMessageIdRef.current = userMsg.id
      const history = messagesRef.current
      const nextMessages = [...history, userMsg]

      // 先落屏：避免 createConversation / 鉴权等待时「输入消失却没反应」
      setMessages(nextMessages)
      messagesRef.current = nextMessages
      if (convId) patchConversationSummary(convId, nextMessages)
      bumpSessionLive()

      // 客户端不拦截：主进程有完整 Key/鉴权；设置回写时渲染侧 key 可能为空
      const myTurn = ++turnGenRef.current
      sendInFlightRef.current = true
      doneCommittedRef.current = false
      setLoading(true)
      bumpSessionLive()
      beginTurnMeta()
      activeUserMessageIdRef.current = userMsg.id
      streamingRef.current = ''
      turnThinkingRef.current = ''
      // 立刻放一个“准备中”片段：即便主进程还没回 turn_start，直播区也有呼吸与步骤
      const seedAt = Date.now()
      segmentsRef.current = [
        {
          id: `status-local-start-${seedAt}`,
          kind: 'status',
          content: '连接模型并准备任务…',
          status: 'active',
          startedAt: seedAt
        }
      ]
      setLiveSegments(cloneSegments(segmentsRef.current))
      setStreaming('')
      setTurnThinking('')

      try {
        if (!window.sharker?.sendMessage) {
          throw new Error('应用桥接未就绪（window.sharker 不可用），请完全退出后重新 npm run dev')
        }

        // 会话准备与发消息并行：DB/列表再慢也不能挡住模型调用
        const ensureP = withTimeout(
          ensureActiveConversation({ preserveMessages: true }),
          15_000,
          '准备对话'
        ).then((workspaceId) => {
          convId = activeConversationIdRef.current ?? convId
          if (workspaceId) void persistActiveConversation(nextMessages, convId ?? undefined)
          return workspaceId
        })

        // 确保有 conversationId 再发（新建会话时 ensure 会写入 active）
        await ensureP
        convId = activeConversationIdRef.current ?? convId
        // streamOwner 仅在主进程真正 turn_start 时设置，避免 B 排队时抢占 A 的归属
        if (convId) {
          doneCommittedMapRef.current = clearDoneCommitted(doneCommittedMapRef.current, convId)
          // 尽早标记归属：切换会话后、turn_start 到达前，chunk 也能落到正确 buffer
          streamOwnerRef.current = convId
          if (convId) {
            streamTurnGenByConvRef.current[convId] = myTurn
            // 在真正 turn_start 前，旧 turn 的 done 一律视为过期
            awaitingTurnStartByConvRef.current[convId] = myTurn
          }
          sessionBuffersRef.current.set(convId, {
            messages: nextMessages,
            loading: true,
            segments: cloneSegments(segmentsRef.current),
            streaming: '',
            turnThinking: '',
            approval: null,
            liveTurnMeta: null,
            turnStartedAt: turnStartedAtRef.current || Date.now(),
            turnHadThinking: false,
            activeTool: null,
            sendInFlight: true,
            doneCommitted: false,
            turnOutcome: 'success',
            activeUserMessageId: userMsg.id,
            turnMeta: { browsedFiles: [], activities: [] }
          })
        }

        const worktreePath = await ensureWorktreeForTurn(convId)
        if (worktreeWarningRef.current) {
          const warnAt = Date.now()
          segmentsRef.current = [
            {
              id: `status-worktree-fallback-${warnAt}`,
              kind: 'status',
              content: `隔离失败，已在本地工作区继续：${worktreeWarningRef.current}`,
              status: 'done',
              startedAt: warnAt,
              endedAt: warnAt
            },
            ...segmentsRef.current
          ]
          setLiveSegments(cloneSegments(segmentsRef.current))
        }
        await window.sharker.sendMessage(text, history, attachments, convId ?? undefined, {
          worktreePath,
          goal: goalTextForConversation(convId, activeConversationIdRef.current, threadGoalRef.current)
        })
      } catch (e) {
        console.error('发送失败', e)
        if (turnGenRef.current === myTurn) {
          doneCommittedRef.current = true
          const msg = e instanceof Error ? e.message : String(e)
          turnOutcomeRef.current = 'error'
          commitAssistantReply(streamingRef.current, `\n\n**错误**: ${msg}`, 'error')
          segmentsRef.current = []
          setLiveSegments([])
          setStreaming('')
          setLoading(false)
        }
      } finally {
        // sendMessage 在 turn 结束后才 resolve；仅清理本轮。
        // 若 done 事件尚未提交（极少数竞态），保留 loading，让 onStream(done) 收尾，避免直播区突然消失。
        // 若用户已切到其他会话，只维护原会话 buffer，绝不污染当前可见 UI。
        if (turnGenRef.current === myTurn) {
          const stillActive = !convId || activeConversationIdRef.current === convId
          if (stillActive) {
            sendInFlightRef.current = false
            setActiveTool(null)
            if (doneCommittedRef.current) {
              segmentsRef.current = []
              setLiveSegments([])
              setLoading(false)
            }
          } else if (convId) {
            const buf = sessionBuffersRef.current.get(convId)
            if (buf) {
              buf.sendInFlight = false
              if (buf.doneCommitted) {
                buf.loading = false
                buf.activeTool = null
              }
              sessionBuffersRef.current.set(convId, buf)
            }
          }
        }
      }
    },
    [
      beginTurnMeta,
      commitAssistantReply,
      ensureActiveConversation,
      ensureWorktreeForTurn,
      persistActiveConversation,
      withTimeout
    ]
  )

  useEffect(() => {
    dispatchTurnRef.current = dispatchTurn
  }, [dispatchTurn])

  /** 切换右侧面板 Tab（斜杠命令 /files 等） */
  const handleTogglePanel = useCallback((tab: RightPanelTab) => {
    setRightPanelTab(tab)
    setRightPanelOpen(true)
    setPage('chat')
  }, [])

  const handleOpenSubAgent = useCallback((id: string | null) => {
    setFocusSubAgentId(id)
    setRightPanelTab('agents')
    setRightPanelOpen(true)
    setPage('chat')
  }, [])

  const reviewCwd =
    threadMode === 'worktree' && threadWorktreePath
      ? threadWorktreePath
      : (getActiveWorkspacePath(settings) ?? '')

  useEffect(() => {
    if (!reviewCwd || !window.sharker.getPullRequestContext) {
      setPrChipLabel(null)
      return
    }
    let cancelled = false
    void window.sharker
      .getPullRequestContext(reviewCwd)
      .then((result) => {
        if (cancelled) return
        setPrChipLabel(result.ok ? prToolbarLabel(result.context.number) : null)
      })
      .catch(() => {
        if (!cancelled) setPrChipLabel(null)
      })
    return () => {
      cancelled = true
    }
  }, [reviewCwd, changesRevision])

  const handleWorktreeBaseRefChange = useCallback((ref: string) => {
    setWorktreeBaseRef(ref)
    const convId = activeConversationIdRef.current
    const next = { ...threadRuntimeRef.current, baseRef: ref }
    threadRuntimeRef.current = next
    if (convId) saveThreadRuntime(convId, next)
  }, [])

  const handleOpenPullRequest = useCallback(() => {
    setRightPanelTab('changes')
    setRightPanelOpen(true)
    setPage('chat')
  }, [])

  const handleOpenChangedFiles = useCallback((paths: string[]) => {
    if (popoutRoute) return
    const id = activeConversationIdRef.current
    if (id && paths.length) {
      lastTurnPathsByConvRef.current.set(id, paths)
      setLastTurnPaths(paths)
    }
    setRightPanelTab('changes')
    setRightPanelOpen(true)
    setPage('chat')
  }, [popoutRoute])

  const handleOpenWorktree = useCallback(() => {
    const dest = threadWorktreePath || threadRuntimeRef.current.worktreePath
    if (!dest || !window.sharker.openPath) return
    void window.sharker.openPath(dest)
  }, [threadWorktreePath])

  const handleCreateBranchHere = useCallback(async () => {
    const dest = threadWorktreePath || threadRuntimeRef.current.worktreePath
    if (!dest || !window.sharker.createGitBranch) return
    const raw = window.prompt('在此隔离 worktree 创建分支', '')
    if (raw == null) return
    const result = await window.sharker.createGitBranch(dest, raw)
    if (!result.ok) {
      window.alert(result.error)
      return
    }
    setRightPanelTab('changes')
    setRightPanelOpen(true)
    setPage('chat')
    setChangesRevision((n) => n + 1)
  }, [threadWorktreePath])

  /** Codex 快捷键：同一 Tab 再按一次则收起 */
  const handleShortcutPanel = useCallback((tab: RightPanelTab) => {
    setPage('chat')
    const open = rightPanelOpen
    const current = rightPanelTab
    if (open && current === tab) {
      setRightPanelOpen(false)
      return
    }
    setRightPanelTab(tab)
    setRightPanelOpen(true)
  }, [rightPanelOpen, rightPanelTab])

  /** 接待用户输入：空闲直接派发；忙时排队或插队 */
  const handlePromptSubmit = useCallback(
    async (
      text: string,
      mode: PromptSubmitMode = 'send',
      attachments: ChatAttachment[] = []
    ) => {
      try {
        await flushSettingsDraftIfNeeded()
      } catch (e) {
        console.error('flush settings failed', e)
      }
      if (!getActiveWorkspacePath(settingsRef.current)) {
        const trimmedEarly = text.trim()
        if (!trimmedEarly) return
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: trimmedEarly,
          attachments: attachments.length ? attachments : undefined
        }
        const errReply: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            '**提示**：请先在侧栏或 **设置 → 工作区** 中添加并选择一个工作区文件夹，然后再发送消息。'
        }
        const withErr = [...messagesRef.current, userMsg, errReply]
        setMessages(withErr)
        messagesRef.current = withErr
        return
      }

      const trimmed = text.trim()
      if (!trimmed) return

      // 斜杠命令 UI/拦截暂关（后续再恢复）

      const convId = activeConversationIdRef.current
      const busy = loading || sendInFlightRef.current
      if (busy) {
        // 无会话 id 时无法安全归属队列：插队中止后直接发
        if (!convId) {
          if (mode === 'jump') {
            try {
              await window.sharker.abortChat()
            } catch (e) {
              console.error('abort failed', e)
            }
            sendInFlightRef.current = false
            setLoading(false)
            await dispatchTurn(trimmed, attachments)
          }
          return
        }
        const item = createQueuedPrompt(
          convId,
          trimmed,
          attachments.length ? attachments : undefined
        )
        if (mode === 'jump') {
          // 插队：中止当前可见 turn 后立刻派发本条（不再依赖 done 回调出队）
          // 1) 先作废当前 turn 代数，避免旧 finally/seed 干扰
          turnGenRef.current += 1
          // 2) 本地收口 live（调试 seed 无后端 turn 时也必须能停）
          if (sendInFlightRef.current || loading) {
            doneCommittedMapRef.current = markDoneCommitted(doneCommittedMapRef.current, convId)
            doneCommittedRef.current = true
            turnOutcomeRef.current = 'aborted'
            segmentsRef.current = applyStreamChunk(segmentsRef.current, {
              type: 'turn_cancelled',
              conversationId: convId,
              timestamp: Date.now()
            })
            segmentsRef.current = finalizeSegments(segmentsRef.current)
            commitAssistantReply(
              streamingRef.current,
              '\n\n_(已停止)_',
              'aborted',
              convId
            )
          }
          segmentsRef.current = []
          setLiveSegments([])
          setStreaming('')
          streamingRef.current = ''
          setTurnThinking('')
          turnThinkingRef.current = ''
          setActiveTool(null)
          setApproval(null)
          approvalRef.current = null
          sendInFlightRef.current = false
          setLoading(false)
          if (streamOwnerRef.current === convId) streamOwnerRef.current = null
          // 3) 清掉该会话排队，插队消息直接执行
          if (sessionQueuesRef.current[convId]) {
            const cleared = { ...sessionQueuesRef.current }
            delete cleared[convId]
            syncActiveQueueUi(cleared, convId)
          }
          try {
            await window.sharker.abortChat(convId)
          } catch (e) {
            console.error('abort failed', e)
          }
          // 4) 打开新 turn 门闩并立即派发
          doneCommittedMapRef.current = clearDoneCommitted(doneCommittedMapRef.current, convId)
          doneCommittedRef.current = false
          // 抬代数：后续旧 abort/done 一律视为过期
          const jumpGen = ++turnGenRef.current
          streamTurnGenByConvRef.current[convId] = jumpGen
          awaitingTurnStartByConvRef.current[convId] = jumpGen
          void dispatchTurn(trimmed, attachments, convId)
          return
        }
        const queues = enqueueForConversation(sessionQueuesRef.current, convId, item, 'append')
        syncActiveQueueUi(queues, convId)
        return
      }

      await dispatchTurn(trimmed, attachments, convId ?? undefined)
    },
    [commitAssistantReply, dispatchTurn, flushSettingsDraftIfNeeded, loading, syncActiveQueueUi]
  )

  /** 暂停 / 恢复当前会话的排队自动出队 */
  const handleQueueHeldChange = useCallback(
    (held: boolean) => {
      const convId = activeConversationIdRef.current
      if (!convId) return
      if (held) queueHeldByConvRef.current.add(convId)
      else queueHeldByConvRef.current.delete(convId)
      setQueueHeld(held)
      if (held || sendInFlightRef.current) return
      const { next, queues } = nextFollowUpAfterTurn(sessionQueuesRef.current, convId)
      syncActiveQueueUi(queues, convId)
      if (next) void dispatchTurnRef.current(next.text, next.attachments, convId)
    },
    [syncActiveQueueUi]
  )

  /** 取消排队中的消息（仅当前会话） */
  const handleCancelQueued = useCallback(
    (id: string) => {
      const convId = activeConversationIdRef.current
      if (!convId) return
      const queues = cancelQueuedPrompt(sessionQueuesRef.current, convId, id)
      syncActiveQueueUi(queues, convId)
    },
    [syncActiveQueueUi]
  )

  const handleEditQueued = useCallback(
    (id: string, text: string) => {
      const convId = activeConversationIdRef.current
      if (!convId) return
      const queues = updateQueuedPromptText(sessionQueuesRef.current, convId, id, text)
      syncActiveQueueUi(queues, convId)
    },
    [syncActiveQueueUi]
  )

  const handleMoveQueued = useCallback(
    (id: string, direction: -1 | 1) => {
      const convId = activeConversationIdRef.current
      if (!convId) return
      const queues = moveQueuedPrompt(sessionQueuesRef.current, convId, id, direction)
      syncActiveQueueUi(queues, convId)
    },
    [syncActiveQueueUi]
  )

  const handleSendQueued = useCallback(
    (id: string) => {
      const convId = activeConversationIdRef.current
      if (!convId) return
      const { item, queues } = takeQueuedPrompt(sessionQueuesRef.current, convId, id)
      syncActiveQueueUi(queues, convId)
      if (!item?.text.trim()) return
      const busy = loading || sendInFlightRef.current
      void handlePromptSubmit(item.text, busy ? 'jump' : 'send', item.attachments)
    },
    [handlePromptSubmit, loading, syncActiveQueueUi]
  )

  /** Replay a user turn without duplicating its bubble; optional edited text. */
  const handleRetry = useCallback(
    async (userMessageId: string, contentOverride?: string) => {
      const current = messagesRef.current
      const index = current.findIndex((message) => message.id === userMessageId && message.role === 'user')
      const original = current[index]
      if (index < 0 || !original) return
      // 重试前清掉当前可见 live/错误态，避免旧过程与新 turn 叠在一起
      if (sendInFlightRef.current || loading) {
        try {
          await window.sharker.abortChat(activeConversationIdRef.current ?? undefined)
        } catch {
          /* ignore */
        }
      }
      // 重试：立刻清错误/旧过程，并先 seed 直播头，避免“点了重试却像停住”
      // 抬高 turn 代数，避免上一轮 finally 把新直播 loading 清掉
      turnGenRef.current += 1
      sendInFlightRef.current = true
      doneCommittedRef.current = false
      if (activeConversationIdRef.current) {
        doneCommittedMapRef.current = clearDoneCommitted(
          doneCommittedMapRef.current,
          activeConversationIdRef.current
        )
      }
      setApproval(null)
      approvalRef.current = null
      setActiveTool(null)
      setStreaming('')
      streamingRef.current = ''
      setTurnThinking('')
      turnThinkingRef.current = ''
      const seedAt = Date.now()
      segmentsRef.current = [
        {
          id: `status-retry-start-${seedAt}`,
          kind: 'status',
          content: '连接模型并准备任务…',
          status: 'active',
          startedAt: seedAt
        }
      ]
      setLiveSegments(cloneSegments(segmentsRef.current))
      setLoading(true)
      setTurnStartedAt(seedAt)
      turnStartedAtRef.current = seedAt
      const history = current.slice(0, index)
      setMessages(history)
      messagesRef.current = history
      await persistActiveConversation(history)
      await dispatchTurn(contentOverride ?? original.content, original.attachments ?? [])
    },
    [dispatchTurn, loading, persistActiveConversation]
  )

  /** 用户点击 Build：进入 build 阶段并按计划派发 */
  const handleBuildPlan = useCallback(async () => {
    if (!pendingPlan) return
    const doc = pendingPlan.document
    const id = activeConversationIdRef.current
    if (id) pendingPlanByConvRef.current.delete(id)
    setPendingPlan(null)
    await handlePromptSubmit(
      `__SHARKER_BUILD__\n请严格按照以下计划逐步实施（可使用全部工具）：\n\n${doc}`
    )
  }, [pendingPlan, handlePromptSubmit])

  /**
   * 用户点击停止：只取消 **当前可见且 busy** 的会话。
   * 不全局 abort 其他会话的 activeSlot；不给其他会话写「已停止」。
   */
  const handleAbort = useCallback(async () => {
    const activeId = activeConversationIdRef.current
    const busy = sendInFlightRef.current || loading
    const action = resolveStopAction({
      activeConversationId: activeId,
      activeIsBusy: busy
    })
    if (!action.abortConversationId) return

    // 先关门闩 + 同步把未完成工具标 cancelled，再 abort：
    // 避免 abort 等待期间 tool_done 抢先把命令标成 done，摘要误显示“运行 1 个命令”
    doneCommittedMapRef.current = markDoneCommitted(
      doneCommittedMapRef.current,
      action.abortConversationId
    )
    if (action.commitStopToConversationId === activeConversationIdRef.current) {
      doneCommittedRef.current = true
      turnOutcomeRef.current = 'aborted'
      segmentsRef.current = applyStreamChunk(segmentsRef.current, {
        type: 'turn_cancelled',
        conversationId: action.abortConversationId ?? undefined,
        timestamp: Date.now()
      })
      segmentsRef.current = finalizeSegments(segmentsRef.current)
      setLiveSegments(cloneSegments(segmentsRef.current))
    } else if (action.commitStopToConversationId) {
      const buf = sessionBuffersRef.current.get(action.commitStopToConversationId)
      if (buf) {
        buf.turnOutcome = 'aborted'
        buf.segments = applyStreamChunk(buf.segments, {
          type: 'turn_cancelled',
          conversationId: action.commitStopToConversationId,
          timestamp: Date.now()
        })
        buf.segments = finalizeSegments(buf.segments)
        sessionBuffersRef.current.set(action.commitStopToConversationId, buf)
      }
    }
    await window.sharker.abortChat(action.abortConversationId)

    if (action.commitStopToConversationId === activeConversationIdRef.current) {
      sendInFlightRef.current = false
      doneCommittedRef.current = true
      setActiveTool(null)
      setApproval(null)
      setApprovalResponding(false)
      setTurnThinking(turnThinkingRef.current)
      turnOutcomeRef.current = 'aborted'
      // 再次收口，防止 abort 回调间隙又写入 active 工具
      segmentsRef.current = applyStreamChunk(segmentsRef.current, {
        type: 'turn_cancelled',
        conversationId: action.abortConversationId ?? undefined,
        timestamp: Date.now()
      })
      segmentsRef.current = finalizeSegments(segmentsRef.current)
      commitAssistantReply(
        streamingRef.current,
        '\n\n_(已停止)_',
        'aborted',
        action.commitStopToConversationId
      )
      segmentsRef.current = []
      setLiveSegments([])
      setStreaming('')
      setLoading(false)
      if (streamOwnerRef.current === action.abortConversationId) {
        streamOwnerRef.current = null
      }
    } else if (action.commitStopToConversationId) {
      // 缓冲会话上的 stop（一般不应发生：Stop 只对 active）
      const buf = sessionBuffersRef.current.get(action.commitStopToConversationId)
      if (buf) {
        buf.segments = applyStreamChunk(buf.segments, {
          type: 'turn_cancelled',
          conversationId: action.commitStopToConversationId,
          timestamp: Date.now()
        })
        buf.segments = finalizeSegments(buf.segments)
        buf.turnOutcome = 'aborted'
        sessionBuffersRef.current.set(action.commitStopToConversationId, buf)
      }
      commitAssistantReply('', '\n\n_(已停止)_', 'aborted', action.commitStopToConversationId)
    }
  }, [commitAssistantReply, loading])

  /**
   * 设置页保存回调。
   * 只合并「设置字段」，保留当前会话正在使用的 activeWorkspace / workspaces，
   * 避免外观/模型 debounce 回写把刚切换的项目冲回「对话」。
   */
  const handleSaveSettings = async (next: AppSettings) => {
    const current = settingsRef.current
    const merged: AppSettings = {
      ...current,
      // 设置页可改字段
      permissionMode: next.permissionMode,
      networkMode: next.networkMode,
      workspaceProfile: next.workspaceProfile,
      providers: next.providers,
      activeProviderId: next.activeProviderId,
      computerUseEnabled: next.computerUseEnabled,
      browserUseEnabled: next.browserUseEnabled,
      uiGlass: next.uiGlass,
      uiTheme: next.uiTheme,
      personality: next.personality,
      worktreeKeepCount: next.worktreeKeepCount,
      memoryInjection: next.memoryInjection,
      memoryGeneration: next.memoryGeneration,
      uiFontScale: next.uiFontScale,
      keyboardShortcuts: next.keyboardShortcuts,
      followUpBehavior: next.followUpBehavior,
      requireModEnter: next.requireModEnter,
      suggestedPrompts: next.suggestedPrompts,
      reviewDelivery: next.reviewDelivery,
      gitCommitPrompt: next.gitCommitPrompt,
      gitPrPrompt: next.gitPrPrompt,
      turnNotifyMode: next.turnNotifyMode,
      preventSleepWhileRunning: next.preventSleepWhileRunning,
      popoutAlwaysOnTop: next.popoutAlwaysOnTop,
      approvalNotify: next.approvalNotify,
      // 工作区选择以当前 live 状态为准（侧栏切换优先）
      workspaces: current.workspaces?.length ? current.workspaces : next.workspaces,
      activeWorkspaceId: current.activeWorkspaceId || next.activeWorkspaceId,
      workspacePath: current.workspacePath || next.workspacePath
    }
    await persistSettings(merged)
  }

  /** 工作区与对话：切换、新建、删除、置顶 */
  const handleSelectWorkspace = useCallback(
    async (id: string) => {
      await flushSettingsDraftIfNeeded()
      if (sendInFlightRef.current || loading) {
        await window.sharker.abortChat()
        clearChatUiState({ dropActiveBuffer: true })
      }

      const prevId = settingsRef.current.activeWorkspaceId
      if (prevId === id) {
        setPage('chat')
        void loadWorkspaceSession(id)
        return
      }

      const next = withActiveWorkspace(settingsRef.current, id)
      settingsRef.current = next
      setSettings(next)
      setSettingsDraft(next)
      setPage('chat')
      setConversationList([])
      setActiveConversationId(null)
      activeConversationIdRef.current = null
      setMessages([])
      messagesRef.current = []

      try {
        await window.sharker.saveSettings(next)
        if (settingsRef.current.activeWorkspaceId !== id) return
        let updated = await window.sharker.getSettings()
        // 防御：设置页 debounce 可能夹带旧 activeWorkspace 回写，把刚选的项目冲掉
        if (updated.activeWorkspaceId !== id) {
          const repaired = withActiveWorkspace(updated, id)
          await window.sharker.saveSettings(repaired)
          updated = await window.sharker.getSettings()
          if (updated.activeWorkspaceId !== id) {
            updated = repaired
          }
        }
        if (settingsRef.current.activeWorkspaceId !== id) return
        settingsRef.current = updated
        setSettings(updated)
        setSettingsDraft(updated)
      } catch (e) {
        console.error('切换工作区失败', e)
      }
    },
    [clearChatUiState, flushSettingsDraftIfNeeded, loadWorkspaceSession]
  )

  /** 侧栏切换对话：不 abort 原会话，队列与流按 conversationId 隔离 */
  const handleSelectConversation = async (workspaceId: string, conversationId: string) => {
    await flushSettingsDraftIfNeeded()
    const prevId = activeConversationIdRef.current
    if (prevId && prevId !== conversationId) {
      snapshotActiveSessionBuffer()
      cancelScheduledStreamPaint()
    }

    setActiveConversationId(conversationId)
    activeConversationIdRef.current = conversationId
    setLastTurnPaths(lastTurnPathsByConvRef.current.get(conversationId) ?? [])
    applyPlanUiForConversation(conversationId)
    setPage('chat')
    syncActiveQueueUi(sessionQueuesRef.current, conversationId)

    if (settingsRef.current.activeWorkspaceId !== workspaceId) {
      const next = withActiveWorkspace(settingsRef.current, workspaceId)
      settingsRef.current = next
      setSettings(next)
      if (!popoutRoute) await persistSettings(next)
    }
    // 弹出窗只看指定线程，不改主窗记住的活跃对话
    const setActiveP = popoutRoute
      ? Promise.resolve()
      : window.sharker.setActiveConversation(workspaceId, conversationId)

    const buf = sessionBuffersRef.current.get(conversationId)
    if (buf) {
      const live =
        buf.loading ||
        buf.sendInFlight ||
        (buf.segments.length > 0 && !buf.doneCommitted)
      if (live) {
        applyBufferToUi(buf)
        // 恢复进行中会话时，保持流归属，便于后续 done/status 正确落到当前 UI
        if ((buf.loading || buf.sendInFlight) && !buf.doneCommitted) {
          streamOwnerRef.current = conversationId
          doneCommittedRef.current = false
        }
        await setActiveP
        return
      }
      // 后台已完成但落盘可能尚未完成：优先用内存 buffer，避免切回空白
      if (buf.messages.length > 0) {
        messagesRef.current = buf.messages
        setMessages(buf.messages)
        sendInFlightRef.current = false
        doneCommittedRef.current = true
        streamingRef.current = ''
        turnThinkingRef.current = ''
        segmentsRef.current = []
        setLiveSegments([])
        setStreaming('')
        setTurnThinking('')
        setLoading(false)
        setActiveTool(null)
        setApproval(null)
        setApprovalResponding(false)
        resetTurnMeta()
        // 已提交的缓冲可以释放，防止无限堆积
        sessionBuffersRef.current.delete(conversationId)
        await setActiveP
        return
      }
    }

    // 先加载目标会话，再一次性替换 UI，避免“清空 → 等待”造成的空白闪帧
    const conv = await window.sharker.loadConversation(workspaceId, conversationId)
    await setActiveP
    if (activeConversationIdRef.current !== conversationId) return
    const loaded = conv?.messages ?? []
    sendInFlightRef.current = false
    doneCommittedRef.current = true
    streamingRef.current = ''
    turnThinkingRef.current = ''
    segmentsRef.current = []
    setLiveSegments([])
    setStreaming('')
    setTurnThinking('')
    setLoading(false)
    setActiveTool(null)
    setApproval(null)
    setApprovalResponding(false)
    resetTurnMeta()
    messagesRef.current = loaded
    setMessages(loaded)
    const summary = conversationListRef.current.find((c) => c.id === conversationId)
    if ((conv?.unread || summary?.unread) && window.sharker.patchConversationMeta) {
      setConversationList((list) =>
        list.map((c) => (c.id === conversationId ? { ...c, unread: false } : c))
      )
      void window.sharker.patchConversationMeta(workspaceId, conversationId, { unread: false })
    }
  }
  handleSelectConversationRef.current = handleSelectConversation

  useEffect(() => {
    if (!popoutRoute || !settings.workspaces.length) return
    void handleSelectConversation(popoutRoute.workspaceId, popoutRoute.conversationId)
    // 只在弹出窗首次带上工作区列表时加载指定线程
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popoutRoute, settings.workspaces.length])

  useEffect(() => {
    if (!popoutRoute || !window.sharker.getWindowAlwaysOnTop) return
    void window.sharker.getWindowAlwaysOnTop().then((on) => setAlwaysOnTop(Boolean(on)))
  }, [popoutRoute])

  const handleToggleAlwaysOnTop = useCallback(() => {
    if (!window.sharker.setWindowAlwaysOnTop) return
    void window.sharker.setWindowAlwaysOnTop(!alwaysOnTop).then((on) => setAlwaysOnTop(Boolean(on)))
  }, [alwaysOnTop])

  /** 删除对话并选中相邻条目（仅设置 → 已归档 使用） */
  const handleDeleteConversation = async (workspaceId: string, conversationId: string) => {
    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
      clearChatUiState({ dropActiveBuffer: true })
    }

    const wasActive = activeConversationIdRef.current === conversationId
    const deletedIndex = conversationList.findIndex((c) => c.id === conversationId)
    await window.sharker.deleteConversation(workspaceId, conversationId)
    const state = await refreshConversationList(workspaceId)

    if (!wasActive) return

    const pick =
      deletedIndex >= 0
        ? state.conversations[Math.min(deletedIndex, state.conversations.length - 1)]
        : state.conversations[state.conversations.length - 1]
    const next = pick
    if (next) {
      const conv = await window.sharker.loadConversation(workspaceId, next.id)
      await window.sharker.setActiveConversation(workspaceId, next.id)
      setActiveConversationId(next.id)
      const loaded = conv?.messages ?? []
      messagesRef.current = loaded
      setMessages(loaded)
    } else {
      await window.sharker.setActiveConversation(workspaceId, null)
      setActiveConversationId(null)
      messagesRef.current = []
      setMessages([])
    }
  }

  /** 归档对话（主侧栏）：移出列表，当前对话则切换相邻 */
  const handleArchiveConversation = async (workspaceId: string, conversationId: string) => {
    if (typeof window.sharker.archiveConversation !== 'function') {
      console.error('archiveConversation 不可用：请完全重启应用以加载 preload')
      window.alert('归档功能需要重启应用后生效，请关闭并重新打开 Sharker。')
      return
    }

    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
      clearChatUiState({ dropActiveBuffer: true })
    }

    const wasActive = activeConversationIdRef.current === conversationId
    const archivedIndex = conversationList.findIndex((c) => c.id === conversationId)

    // 先从 UI 移除，避免接口慢时感觉「没反应」
    setConversationList((prev) => prev.filter((c) => c.id !== conversationId))

    try {
      await window.sharker.archiveConversation(workspaceId, conversationId, true)
      if (!appUndoSilentRef.current) {
        appUndoRef.current.push({ kind: 'archive', workspaceId, conversationId })
      }
      const cwd = settingsRef.current.workspaces.find((w) => w.id === workspaceId)?.path
      if (cwd && window.sharker.removeManagedWorktree) {
        const cleaned = await window.sharker.removeManagedWorktree(cwd, conversationId)
        if (cleaned.ok && cleaned.removed) {
          const runtime = loadThreadRuntime(conversationId)
          saveThreadRuntime(conversationId, { ...runtime, worktreePath: undefined })
        }
      }
    } catch (e) {
      console.error('归档失败', e)
      window.alert(e instanceof Error ? e.message : '归档失败')
      await refreshConversationList(workspaceId)
      return
    }

    const state = await refreshConversationList(workspaceId)

    if (!wasActive) return

    const pick =
      archivedIndex >= 0
        ? state.conversations[Math.min(archivedIndex, state.conversations.length - 1)]
        : state.conversations[state.conversations.length - 1]
    if (pick) {
      const conv = await window.sharker.loadConversation(workspaceId, pick.id)
      await window.sharker.setActiveConversation(workspaceId, pick.id)
      setActiveConversationId(pick.id)
      const loaded = conv?.messages ?? []
      messagesRef.current = loaded
      setMessages(loaded)
    } else {
      await window.sharker.setActiveConversation(workspaceId, null)
      setActiveConversationId(null)
      messagesRef.current = []
      setMessages([])
    }
  }

  /** 在工作区创建新对话（不中止其他会话的进行中 turn） */
  const handleNewConversation = async (workspaceId: string) => {
    // 先快照当前会话 live 状态，再切到空白会话；绝不全局 abort 后台回合
    snapshotActiveSessionBuffer()
    clearChatUiState()
    // 始终以调用方传入的 workspaceId 为准（避免 ref 在并发设置回写中被冲回「对话」）
    const pinned = withActiveWorkspace(settingsRef.current, workspaceId)
    settingsRef.current = pinned
    setSettings(pinned)
    setSettingsDraft(pinned)
    if (settingsRef.current.activeWorkspaceId !== workspaceId) {
      await persistSettings(pinned)
    } else {
      // 即使已是目标工作区，也落盘一次，盖掉可能在路上的旧草稿
      try {
        await window.sharker.saveSettings(pinned)
      } catch (e) {
        console.warn('pin workspace before new conversation failed', e)
      }
    }
    const conv = await window.sharker.createConversation(workspaceId)
    // create 后再次确认 active workspace 未被夹带回写
    if (settingsRef.current.activeWorkspaceId !== workspaceId) {
      const again = withActiveWorkspace(settingsRef.current, workspaceId)
      settingsRef.current = again
      setSettings(again)
      setSettingsDraft(again)
      void window.sharker.saveSettings(again)
    }
    // 乐观写入侧栏：创建后立即高亮新对话，避免 list 往返期间选中滞后
    const optimistic: ConversationSummary = {
      id: conv.id,
      workspaceId: conv.workspaceId,
      title: conv.title || DEFAULT_CONVERSATION_TITLE,
      customTitle: conv.customTitle,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messages?.length ?? 0,
      status: conv.status ?? 'active'
    }
    setConversationList((list) => {
      if (list.some((c) => c.id === conv.id)) return list
      return sortConversationsByCreatedAt([...list, optimistic])
    })
    setActiveConversationId(conv.id)
    activeConversationIdRef.current = conv.id
    messagesRef.current = []
    setMessages([])
    // 不要清空其他会话的 streamOwner：后台 turn 仍依赖它做无 conversationId 的回落
    if (streamOwnerRef.current === conv.id) {
      streamOwnerRef.current = null
    }
    setPage('chat')
    // 后台刷新真实列表；失败时保留乐观项
    void refreshConversationList(workspaceId).catch((e) =>
      console.warn('refreshConversationList after new conversation failed', e)
    )
    return conv.id
  }

  /** 文件夹选择器添加工作区 */
  const handleAddWorkspace = async () => {
    const folder = await window.sharker.pickWorkspaceFolder()
    if (!folder) return

    const current = settingsRef.current
    const normalized = folder.replace(/\/$/, '')
    const existing = current.workspaces.find((w) => w.path.replace(/\/$/, '') === normalized)
    if (existing) {
      await handleSelectWorkspace(existing.id)
      return
    }

    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
      clearChatUiState({ dropActiveBuffer: true })
    }

    const name = normalized.split(/[/\\]/).pop() || '目录'
    const newItem = {
      id: crypto.randomUUID(),
      path: folder,
      label: name
    }
    const next = withActiveWorkspace(
      { ...current, workspaces: [...current.workspaces, newItem] },
      newItem.id
    )

    settingsRef.current = next
    setSettings(next)
    setSettingsDraft(next)
    setPage('chat')
    setConversationList([])
    setActiveConversationId(null)
    activeConversationIdRef.current = null
    setMessages([])
    messagesRef.current = []

    try {
      await window.sharker.saveSettings(next)
      if (settingsRef.current.activeWorkspaceId !== newItem.id) return
      const updated = await window.sharker.getSettings()
      if (settingsRef.current.activeWorkspaceId !== newItem.id) return
      settingsRef.current = updated
      setSettings(updated)
      setSettingsDraft(updated)
      void loadWorkspaceSession(newItem.id)
    } catch (e) {
      console.error('添加工作区失败', e)
    }
  }

  /** 深链 `path=`：命中已有工作区或把绝对目录加进来 */
  const ensureWorkspaceByPath = async (absPath: string): Promise<string | null> => {
    const normalized = absPath.replace(/[\\/]+$/, '')
    if (!normalized) return null
    const existing = matchWorkspaceByPath(settingsRef.current.workspaces, normalized)
    if (existing) return existing.id
    if (!window.sharker.pathIsDirectory || !(await window.sharker.pathIsDirectory(normalized))) {
      return null
    }
    const name = normalized.split(/[/\\]/).pop() || '目录'
    const newItem = { id: crypto.randomUUID(), path: normalized, label: name }
    const next = withActiveWorkspace(
      { ...settingsRef.current, workspaces: [...settingsRef.current.workspaces, newItem] },
      newItem.id
    )
    settingsRef.current = next
    setSettings(next)
    setSettingsDraft(next)
    try {
      await window.sharker.saveSettings(next)
    } catch (e) {
      console.warn('deeplink add workspace failed', e)
      return null
    }
    return newItem.id
  }

  const seedComposer = (text: string) => {
    const nonce = composerSeedNonceRef.current + 1
    composerSeedNonceRef.current = nonce
    setComposerSeed({ nonce, text })
  }

  const applyDeeplink = async (raw: string) => {
    const action = parseDeeplink(raw)
    if (action.type === 'noop') return
    if (action.type === 'settings') {
      void handleNavigate('settings', action.tab)
      return
    }
    if (action.type === 'automations') {
      setPage('automations')
      if (action.create) setAutomationsCreateNonce((n) => n + 1)
      return
    }
    if (action.type === 'skills') {
      setPage('chat')
      setComposerIntent('skill')
      return
    }
    if (action.type === 'open_thread') {
      const listed = conversationListRef.current.find((c) => c.id === action.conversationId)
      if (listed) {
        setPage('chat')
        await handleSelectConversation(listed.workspaceId, listed.id)
        return
      }
      for (const ws of settingsRef.current.workspaces) {
        try {
          const state = await window.sharker.listConversations(ws.id)
          if (state.conversations.some((c) => c.id === action.conversationId)) {
            setPage('chat')
            await handleSelectConversation(ws.id, action.conversationId)
            return
          }
        } catch {
          /* try next workspace */
        }
      }
      return
    }

    let workspaceId = settingsRef.current.activeWorkspaceId
    if (action.path) {
      workspaceId = (await ensureWorkspaceByPath(action.path)) || workspaceId
    } else if (action.originUrl && window.sharker.getGitBranchInfo) {
      const remotes: Array<{ id: string; remoteUrl: string }> = []
      for (const ws of settingsRef.current.workspaces) {
        if (!ws.path) continue
        try {
          const info = await window.sharker.getGitBranchInfo(ws.path)
          if (info.remoteUrl) remotes.push({ id: ws.id, remoteUrl: info.remoteUrl })
        } catch {
          /* skip */
        }
      }
      workspaceId = matchWorkspaceByOrigin(remotes, action.originUrl) || workspaceId
    }
    if (workspaceId) {
      await handleNewConversation(workspaceId)
    } else {
      setPage('chat')
    }
    if (action.prompt) seedComposer(action.prompt)
  }
  applyDeeplinkRef.current = applyDeeplink

  /** 项目菜单：创建永久 worktree 并加为独立项目 */
  const handleCreatePermanentWorktree = useCallback(async (workspaceId: string) => {
    const source = settingsRef.current.workspaces.find((w) => w.id === workspaceId)
    if (!source?.path || !window.sharker.createPermanentWorktree) return
    const raw = window.prompt('永久 worktree 名称', '')
    if (raw == null) return
    const result = await window.sharker.createPermanentWorktree(source.path, raw)
    if (!result.ok) {
      window.alert(result.error)
      return
    }
    const current = settingsRef.current
    const existing = current.workspaces.find((w) => w.path === result.path)
    if (existing) {
      await handleSelectWorkspace(existing.id)
      return
    }
    const newItem = {
      id: crypto.randomUUID(),
      path: result.path,
      label: `${source.label} · ${raw.trim() || result.branch}`
    }
    const next = withActiveWorkspace(
      { ...current, workspaces: [...current.workspaces, newItem] },
      newItem.id
    )
    settingsRef.current = next
    setSettings(next)
    setSettingsDraft(next)
    setPage('chat')
    try {
      await window.sharker.saveSettings(next)
      void loadWorkspaceSession(newItem.id)
    } catch (e) {
      console.error('添加永久 worktree 失败', e)
    }
  }, [handleSelectWorkspace])
  const handleDeleteWorkspace = async (id: string) => {
    const current = settingsRef.current
    const item = current.workspaces.find((w) => w.id === id)
    if (!item) return

    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
      clearChatUiState({ dropActiveBuffer: true })
    }

    const workspaces = current.workspaces.filter((w) => w.id !== id)
    const wasActive = current.activeWorkspaceId === id
    const activeId = wasActive
      ? pickActiveWorkspaceId(workspaces, '')
      : current.activeWorkspaceId
    const next = withActiveWorkspace(
      { ...current, workspaces: sortWorkspaces(workspaces) },
      activeId
    )

    settingsRef.current = next
    setSettings(next)
    setSettingsDraft(next)

    if (wasActive) {
      setPage('chat')
      setConversationList([])
      setActiveConversationId(null)
      activeConversationIdRef.current = null
      setMessages([])
      messagesRef.current = []
    }

    try {
      await window.sharker.saveSettings(next)
      if (settingsRef.current.activeWorkspaceId !== activeId) return
      const updated = await window.sharker.getSettings()
      if (settingsRef.current.activeWorkspaceId !== activeId) return
      settingsRef.current = updated
      setSettings(updated)
      setSettingsDraft(updated)
      if (wasActive && activeId) void loadWorkspaceSession(activeId)
    } catch (e) {
      console.error('删除工作区失败', e)
    }
  }

  /** 切换对话使用的接入与型号 */
  const handleSelectProvider = useCallback(async (id: string, model?: string) => {
    const current = settingsRef.current
    const providers = current.providers.map((p) => {
      if (p.id !== id) return p
      const nextModel = (model ?? p.model).trim()
      if (!nextModel || nextModel === p.model) return p
      const nextP = { ...p, model: nextModel }
      const opts = resolveThinkingOptions(nextP)
      return {
        ...nextP,
        thinkingLevel: opts.length === 0 ? '' : defaultThinkingLevel(nextP)
      }
    })
    await persistSettings({ ...current, activeProviderId: id, providers })
  }, [persistSettings])

  /** 对话区切换思考水平（写入对应 provider） */
  const handleThinkingLevelChange = useCallback(async (providerId: string, level: string) => {
    const next = {
      ...settingsRef.current,
      providers: settingsRef.current.providers.map((p) =>
        p.id === providerId ? { ...p, thinkingLevel: level } : p
      )
    }
    settingsRef.current = next
    setSettings(next)
    setSettingsDraft(next)
    await persistSettings(next)
  }, [persistSettings])

  /** 切换工作区置顶 */
  const handleTogglePinWorkspace = async (id: string) => {
    const current = settingsRef.current
    const workspaces = current.workspaces.map((w) =>
      w.id === id ? { ...w, pinned: !w.pinned } : w
    )
    const next = { ...current, workspaces: sortWorkspaces(workspaces) }
    settingsRef.current = next
    setSettings(next)
    setSettingsDraft(next)
    await persistSettings(next)
  }

  /** 重命名项目（仅改侧栏显示名，不改磁盘路径） */
  const handleRenameWorkspace = async (id: string, label: string) => {
    const name = label.trim()
    if (!name) return
    const current = settingsRef.current
    const workspaces = current.workspaces.map((w) =>
      w.id === id ? { ...w, label: name } : w
    )
    const next = { ...current, workspaces: sortWorkspaces(workspaces) }
    settingsRef.current = next
    setSettings(next)
    setSettingsDraft(next)
    await persistSettings(next)
  }

  /** 聊天 ↔ 设置页导航 */
  const handleNavigate = async (targetPage: AppPage, tab?: SettingsTab) => {
    if (page === 'settings' && targetPage !== 'settings') {
      // 用受保护合并，避免草稿里的旧 activeWorkspaceId 覆盖侧栏当前项目
      await handleSaveSettings(settingsDraftRef.current)
    }
    if (targetPage === 'settings') {
      // 进入设置时以 live settings 为草稿底，避免陈旧 draft
      setSettingsDraft(settingsRef.current)
      setSettingsTab(tab ?? 'models')
    }
    setPage(targetPage)
  }

  useEffect(() => {
    if (navLockRef.current) return
    const next = pushNav(navStackRef.current, navIndexRef.current, {
      page,
      conversationId: page === 'chat' ? activeConversationId : undefined,
      settingsTab: page === 'settings' ? settingsTab : undefined
    })
    navStackRef.current = next.stack
    navIndexRef.current = next.index
  }, [page, activeConversationId, settingsTab])

  const applyNavEntry = useCallback(
    async (entry: NavEntry) => {
      navLockRef.current = true
      try {
        if (entry.page === 'settings') {
          await handleNavigate('settings', (entry.settingsTab as SettingsTab) || 'models')
        } else if (entry.page === 'automations') {
          await handleNavigate('automations')
        } else {
          await handleNavigate('chat')
          const ws = settingsRef.current.activeWorkspaceId
          const id = entry.conversationId ?? null
          if (ws && id && id !== activeConversationIdRef.current) {
            await handleSelectConversation(ws, id)
          }
        }
      } finally {
        window.setTimeout(() => {
          navLockRef.current = false
        }, 0)
      }
    },
    [handleNavigate, handleSelectConversation]
  )

  const handleNavStep = useCallback(
    (direction: 'back' | 'forward') => {
      const stepped =
        direction === 'back'
          ? navBack(navStackRef.current, navIndexRef.current)
          : navForward(navStackRef.current, navIndexRef.current)
      if (!stepped.entry) return
      navStackRef.current = stepped.stack
      navIndexRef.current = stepped.index
      void applyNavEntry(stepped.entry)
    },
    [applyNavEntry]
  )

  const handleClearTerminal = useCallback(() => {
    setPage('chat')
    setRightPanelTab('terminal')
    setRightPanelOpen(true)
    setTerminalClearTick((n) => n + 1)
  }, [])

  const handleOpenBrowserTab = useCallback(() => {
    setPage('chat')
    setRightPanelTab('browser')
    setRightPanelOpen(true)
  }, [])

  const handleClearUnread = useCallback(async () => {
    if (window.sharker.listAutomationQueue && window.sharker.saveAutomationQueue) {
      const prev = await window.sharker.listAutomationQueue()
      const next = markAllQueueRead(prev)
      await window.sharker.saveAutomationQueue(next)
      setQueueUnread(unreadQueueCount(next))
      setQueueRevision((n) => n + 1)
    }
    const ws = settingsRef.current.activeWorkspaceId
    if (ws && window.sharker.clearConversationUnread) {
      await window.sharker.clearConversationUnread(ws)
      setConversationList((list) => list.map((c) => (c.unread ? { ...c, unread: false } : c)))
    }
  }, [])

  const handleNextAttention = useCallback(() => {
    const liveIds: string[] = []
    const seen = new Set<string>()
    const waitingIds = new Set<string>()
    for (const c of conversationListRef.current) {
      const buf = sessionBuffersRef.current.get(c.id)
      if (buf?.loading || buf?.sendInFlight) {
        liveIds.push(c.id)
        seen.add(c.id)
      }
      if (buf?.approval) waitingIds.add(c.id)
    }
    for (const [id, buf] of sessionBuffersRef.current.entries()) {
      if (buf.approval) waitingIds.add(id)
      if (seen.has(id)) continue
      if (buf.loading || buf.sendInFlight) liveIds.push(id)
    }
    const pending = approvalRef.current
    if (pending) {
      const waitingId = pending.conversationId || activeConversationIdRef.current
      if (waitingId) waitingIds.add(waitingId)
    }
    const attentionIds = collectAttentionConversationIds({
      conversations: conversationListRef.current,
      liveIds,
      waitingIds
    })
    const nextId = nextLiveConversationId(attentionIds, activeConversationIdRef.current)
    const wsId = settingsRef.current.activeWorkspaceId
    if (wsId && nextId) {
      setPage('chat')
      void handleSelectConversation(wsId, nextId)
    }
  }, [handleSelectConversation])

  /** 执行轨道内审批响应：once / session / deny → 主进程真实授权路径 */
  const handleApproval = async (decision: ApprovalDecision) => {
    if (!approval || approvalResponding || approvalBusyRef.current) return
    approvalBusyRef.current = true
    setApprovalResponding(true)
    try {
      // DEV 注入的审批没有主进程 pending，直接收起 UI 以便验收按钮链路
      if (import.meta.env.DEV && String(approval.id).startsWith('debug-approval-')) {
        setApproval(null)
        approvalRef.current = null
        // 保持直播呼吸：拒绝后回到规划态，允许后清审批等待
        if (decision === 'deny') {
          const now = Date.now()
          const segs: TurnSegment[] = [
            {
              id: `debug-status-denied-${now}`,
              kind: 'status',
              content: '已拒绝该操作，继续规划下一步…',
              status: 'active',
              startedAt: now
            }
          ]
          segmentsRef.current = segs
          setLiveSegments(cloneSegments(segs))
          setLoading(true)
        } else {
          const now = Date.now()
          const segs: TurnSegment[] = [
            {
              id: `debug-status-allowed-${now}`,
              kind: 'status',
              content: '已授权，继续执行…',
              status: 'active',
              startedAt: now
            }
          ]
          segmentsRef.current = segs
          setLiveSegments(cloneSegments(segs))
          setLoading(true)
        }
        return
      }
      await window.sharker.respondApproval(approval.id, decision)
      setApproval(null)
      approvalRef.current = null
      const waitingId = approval.conversationId || activeConversationIdRef.current
      if (waitingId) {
        const buf = sessionBuffersRef.current.get(waitingId)
        if (buf) buf.approval = null
      }
    } finally {
      approvalBusyRef.current = false
      setApprovalResponding(false)
    }
  }

  const appendLocalNote = useCallback(
    (content: string) => {
      const note = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content
      }
      setMessages((msgs) => {
        const nextMsgs = [...msgs, note]
        messagesRef.current = nextMsgs
        void persistActiveConversation(nextMsgs)
        return nextMsgs
      })
    },
    [persistActiveConversation]
  )

  const handleRenameConversation = useCallback(
    async (workspaceId: string, conversationId: string, raw: string) => {
      if (!window.sharker.patchConversationMeta) return
      const title = applyCustomTitle(raw)
      const before = conversationListRef.current.find((c) => c.id === conversationId)?.customTitle
      const next = await window.sharker.patchConversationMeta(workspaceId, conversationId, {
        customTitle: title ?? null
      })
      if (!next) return
      if (!appUndoSilentRef.current && before !== title) {
        appUndoRef.current.push({
          kind: 'rename',
          workspaceId,
          conversationId,
          before,
          after: title
        })
      }
      setConversationList((list) =>
        sortConversationsByCreatedAt(list.map((c) => (c.id === conversationId ? { ...c, ...next } : c)))
      )
    },
    []
  )

  const handleTogglePinConversation = useCallback(async (workspaceId: string, conversationId: string) => {
    if (!window.sharker.patchConversationMeta) return false
    const current = conversationListRef.current.find((c) => c.id === conversationId)
    const pinned = !current?.pinned
    const next = await window.sharker.patchConversationMeta(workspaceId, conversationId, { pinned })
    if (!next) return pinned
    if (!appUndoSilentRef.current) {
      appUndoRef.current.push({
        kind: 'pin',
        workspaceId,
        conversationId,
        afterPinned: Boolean(next.pinned)
      })
    }
    setConversationList((list) =>
      sortConversationsByCreatedAt(list.map((c) => (c.id === conversationId ? { ...c, ...next } : c)))
    )
    return pinned
  }, [])

  const handleMarkUnread = useCallback(async () => {
    const ws = settingsRef.current.activeWorkspaceId
    const id = activeConversationIdRef.current
    if (!ws || !id || !window.sharker.patchConversationMeta) return
    const next = await window.sharker.patchConversationMeta(ws, id, { unread: true })
    if (!next) return
    if (!appUndoSilentRef.current) {
      appUndoRef.current.push({ kind: 'unread', workspaceId: ws, conversationId: id })
    }
    setConversationList((list) => list.map((c) => (c.id === id ? { ...c, ...next } : c)))
  }, [])

  const applyAppUndoRecord = useCallback(
    async (record: AppUndoRecord, direction: 'undo' | 'redo') => {
      appUndoSilentRef.current = true
      try {
        if (record.kind === 'archive') {
          if (direction === 'undo') {
            if (typeof window.sharker.archiveConversation !== 'function') return
            await window.sharker.archiveConversation(record.workspaceId, record.conversationId, false)
            await refreshConversationList(record.workspaceId)
            await handleSelectConversation(record.workspaceId, record.conversationId)
            return
          }
          await handleArchiveConversation(record.workspaceId, record.conversationId)
          return
        }
        if (record.kind === 'pin') {
          const pinned = direction === 'undo' ? !record.afterPinned : record.afterPinned
          if (!window.sharker.patchConversationMeta) return
          const next = await window.sharker.patchConversationMeta(
            record.workspaceId,
            record.conversationId,
            { pinned }
          )
          if (next) {
            setConversationList((list) =>
              sortConversationsByCreatedAt(
                list.map((c) => (c.id === record.conversationId ? { ...c, ...next } : c))
              )
            )
          }
          return
        }
        if (record.kind === 'rename') {
          const title = direction === 'undo' ? record.before : record.after
          await handleRenameConversation(record.workspaceId, record.conversationId, title ?? '')
          return
        }
        if (!window.sharker.patchConversationMeta) return
        const unread = direction !== 'undo'
        const next = await window.sharker.patchConversationMeta(
          record.workspaceId,
          record.conversationId,
          { unread }
        )
        if (next) {
          setConversationList((list) =>
            list.map((c) => (c.id === record.conversationId ? { ...c, ...next } : c))
          )
        }
      } finally {
        appUndoSilentRef.current = false
      }
    },
    [handleRenameConversation, handleSelectConversation, refreshConversationList]
  )

  const performAppUndo = useCallback(async () => {
    const record = appUndoRef.current.popUndo()
    if (!record) return
    await applyAppUndoRecord(record, 'undo')
  }, [applyAppUndoRecord])

  const performAppRedo = useCallback(async () => {
    const record = appUndoRef.current.popRedo()
    if (!record) return
    await applyAppUndoRecord(record, 'redo')
  }, [applyAppUndoRecord])

  const handleNativeOrAppUndo = useCallback(
    (kind: 'undo' | 'redo') => {
      if (isNativeUndoTarget(document.activeElement)) {
        execNativeUndoRedo(kind)
        return
      }
      void (kind === 'undo' ? performAppUndo() : performAppRedo())
    },
    [performAppRedo, performAppUndo]
  )

  const handleStandaloneConversation = useCallback(async () => {
    const ws = settingsRef.current.activeWorkspaceId
    if (!ws || !window.sharker.createConversation) return
    const created = await window.sharker.createConversation(ws, { activate: false })
    const optimistic: ConversationSummary = {
      id: created.id,
      workspaceId: created.workspaceId,
      title: created.title || DEFAULT_CONVERSATION_TITLE,
      customTitle: created.customTitle,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      messageCount: created.messages?.length ?? 0,
      status: created.status ?? 'active'
    }
    setConversationList((list) => {
      if (list.some((c) => c.id === created.id)) return list
      return sortConversationsByCreatedAt([...list, optimistic])
    })
    if (window.sharker.openThreadWindow) {
      await window.sharker.openThreadWindow(
        ws,
        created.id,
        created.title || DEFAULT_CONVERSATION_TITLE
      )
    }
    void refreshConversationList(ws)
  }, [refreshConversationList])

  const copyPlainText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return Boolean(text)
    } catch {
      return false
    }
  }, [])

  /** UI 斜杠命令（不经过模型） */
  const handleSlashAction = useCallback(
    async (cmd: SlashCommandMeta, args: string) => {
      switch (cmd.action) {
        case 'new_conversation': {
          const ws = settingsRef.current.activeWorkspaceId
          if (ws) await handleNewConversation(ws)
          break
        }
        case 'new_global_conversation': {
          await handleNewConversation(GLOBAL_WORKSPACE_ID)
          break
        }
        case 'show_history':
          setShowHistoryPicker(true)
          break
        case 'fork_conversation': {
          const ws = settingsRef.current.activeWorkspaceId
          if (!ws || !window.sharker.createConversation || !window.sharker.saveConversation) break
          const sourceId = activeConversationIdRef.current
          const created = await window.sharker.createConversation(ws)
          const forked = buildForkedConversation(created, {
            title:
              conversationList.find((c) => c.id === sourceId)?.title || DEFAULT_CONVERSATION_TITLE,
            messages: messagesRef.current
          })
          await window.sharker.saveConversation(ws, forked)
          saveThreadRuntime(forked.id, {
            mode: threadRuntimeRef.current.mode,
            baseRef: threadRuntimeRef.current.baseRef
          })
          const sourceGoal = sourceId ? loadThreadGoal(sourceId) : threadGoalRef.current
          if (sourceGoal) saveThreadGoal(forked.id, sourceGoal)
          await handleSelectConversation(ws, forked.id)
          break
        }
        case 'side_conversation': {
          const ws = settingsRef.current.activeWorkspaceId
          if (!ws || !window.sharker.createConversation) break
          const created = await window.sharker.createConversation(ws, { activate: false })
          saveThreadRuntime(created.id, {
            mode: threadRuntimeRef.current.mode,
            baseRef: threadRuntimeRef.current.baseRef
          })
          const sourceId = activeConversationIdRef.current
          const sourceGoal = sourceId ? loadThreadGoal(sourceId) : threadGoalRef.current
          if (sourceGoal) saveThreadGoal(created.id, sourceGoal)
          const optimistic: ConversationSummary = {
            id: created.id,
            workspaceId: created.workspaceId,
            title: created.title || DEFAULT_CONVERSATION_TITLE,
            customTitle: created.customTitle,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
            messageCount: created.messages?.length ?? 0,
            status: created.status ?? 'active'
          }
          setConversationList((list) => {
            if (list.some((c) => c.id === created.id)) return list
            return sortConversationsByCreatedAt([...list, optimistic])
          })
          if (window.sharker.openThreadWindow) {
            await window.sharker.openThreadWindow(
              ws,
              created.id,
              created.title || DEFAULT_CONVERSATION_TITLE
            )
          }
          void refreshConversationList(ws)
          break
        }
        case 'archive_thread': {
          const ws = settingsRef.current.activeWorkspaceId
          const id = activeConversationIdRef.current
          if (ws && id) await handleArchiveConversation(ws, id)
          break
        }
        case 'rename_conversation': {
          const ws = settingsRef.current.activeWorkspaceId
          const id = activeConversationIdRef.current
          const parsed = parseRenameArgs(args)
          if (!ws || !id) {
            appendLocalNote('没有当前对话，无法重命名。')
            break
          }
          if (parsed.kind === 'prompt') {
            setPage('chat')
            setRenameRequestId(id)
            break
          }
          await handleRenameConversation(ws, id, parsed.title)
          appendLocalNote(formatRenameNote(applyCustomTitle(parsed.title)))
          break
        }
        case 'pin_conversation': {
          const ws = settingsRef.current.activeWorkspaceId
          const id = activeConversationIdRef.current
          if (!ws || !id) {
            appendLocalNote('没有当前对话，无法置顶。')
            break
          }
          const pinned = await handleTogglePinConversation(ws, id)
          appendLocalNote(formatPinNote(pinned))
          break
        }
        case 'mark_unread': {
          await handleMarkUnread()
          appendLocalNote(formatUnreadNote())
          break
        }
        case 'standalone_conversation': {
          await handleStandaloneConversation()
          break
        }
        case 'show_usage': {
          const scope = parseUsageScope(args)
          const days = window.sharker.getTokenUsage
            ? await window.sharker.getTokenUsage(usageHistoryDays(scope))
            : []
          appendLocalNote(formatUsageReport(days, scope))
          break
        }
        case 'copy_cwd': {
          const cwd =
            (threadMode === 'worktree' ? threadWorktreePath : undefined) ||
            getActiveWorkspacePath(settingsRef.current) ||
            ''
          const ok = await copyPlainText(cwd)
          appendLocalNote(ok && cwd ? `已复制工作目录：\n\n\`${cwd}\`` : '没有可复制的工作目录。')
          break
        }
        case 'copy_session_id': {
          const id = activeConversationIdRef.current || ''
          const ok = await copyPlainText(id)
          appendLocalNote(ok && id ? `已复制会话 ID：\n\n\`${id}\`` : '没有当前会话。')
          break
        }
        case 'copy_deep_link': {
          const id = activeConversationIdRef.current || ''
          const href = formatThreadDeeplink(id)
          const ok = await copyPlainText(href)
          appendLocalNote(ok && href ? `已复制对话深链：\n\n\`${href}\`` : '没有当前会话。')
          break
        }
        case 'open_project_picker': {
          setPage('chat')
          setShowHistoryPicker(false)
          setComposerIntent('project')
          break
        }
        case 'undo_app':
          handleNativeOrAppUndo('undo')
          break
        case 'redo_app':
          handleNativeOrAppUndo('redo')
          break
        case 'copy_conversation_path': {
          const runtime = runtimeForConversation(
            activeConversationIdRef.current,
            activeConversationIdRef.current,
            threadRuntimeRef.current
          )
          const path = resolveConversationPath({
            worktreePath: runtime.worktreePath || threadWorktreePath,
            workspacePath: getActiveWorkspacePath(settingsRef.current)
          })
          const ok = await copyPlainText(path)
          appendLocalNote(ok && path ? `已复制对话路径：\n\n\`${path}\`` : '没有可复制的对话路径。')
          break
        }
        case 'init_agents': {
          const cwd = getActiveWorkspacePath(settingsRef.current) || ''
          if (!cwd || !window.sharker.initAgentsMd) {
            const note = {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: '没有工作区，无法创建 AGENTS.md。'
            }
            setMessages((msgs) => {
              const nextMsgs = [...msgs, note]
              messagesRef.current = nextMsgs
              void persistActiveConversation(nextMsgs)
              return nextMsgs
            })
            break
          }
          const result = await window.sharker.initAgentsMd(cwd)
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: result.ok
              ? result.created
                ? `已在仓库根创建 \`AGENTS.md\`：\n\n\`${result.path}\`\n\n下一轮对话会自动注入这些项目说明。`
                : `已有项目说明文件，未覆盖：\n\n\`${result.path}\``
              : `无法初始化 AGENTS.md：${result.error}`
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'set_permissions': {
          const token = args.trim().toLowerCase().split(/\s+/)[0] || ''
          const current = settingsRef.current.permissionMode
          if (token !== 'sandbox' && token !== 'full') {
            const note = {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: `当前权限：${current === 'full' ? '完整（整机）' : '沙箱（仅工作区）'}。用法：\`/permissions sandbox|full\``
            }
            setMessages((msgs) => {
              const nextMsgs = [...msgs, note]
              messagesRef.current = nextMsgs
              void persistActiveConversation(nextMsgs)
              return nextMsgs
            })
            break
          }
          const merged = { ...settingsRef.current, permissionMode: token as 'sandbox' | 'full' }
          await persistSettings(merged)
          setSettings(merged)
          setSettingsDraft(merged)
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: `权限已切换为${token === 'full' ? '完整（整机）' : '沙箱（仅工作区）'}。`
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'show_memories': {
          const parsed = parseMemoryCommand(args)
          let settingsNow = settingsRef.current
          if (parsed.kind === 'set') {
            const merged = {
              ...settingsNow,
              memoryInjection: parsed.injection ?? settingsNow.memoryInjection !== false,
              memoryGeneration: parsed.generation ?? settingsNow.memoryGeneration !== false
            }
            await persistSettings(merged)
            setSettings(merged)
            setSettingsDraft(merged)
            settingsNow = merged
          }
          const items = window.sharker.listMemories
            ? await window.sharker.listMemories(settingsNow.activeWorkspaceId)
            : []
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: formatMemoryStatus({
              injection: settingsNow.memoryInjection !== false,
              generation: settingsNow.memoryGeneration !== false,
              items
            })
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'show_status': {
          const settingsNow = settingsRef.current
          const provider = settingsNow.providers.find((p) => p.id === settingsNow.activeProviderId)
          const model = provider?.model || settingsNow.activeProviderId
          const cwd =
            (threadMode === 'worktree' ? threadWorktreePath : undefined) ||
            getActiveWorkspacePath(settingsNow) ||
            ''
          let branch = ''
          if (cwd && window.sharker.getGitBranchInfo) {
            try {
              const info = await window.sharker.getGitBranchInfo(cwd)
              branch = info.branch
            } catch {
              /* optional */
            }
          }
          const usage = estimateContextUsage(messagesRef.current, streamingRef.current, '')
          const { limit } = resolveContextLimit(model, provider?.contextWindow)
          let usageTodayTokens = 0
          let usageTodayTurns = 0
          if (window.sharker.getTokenUsage) {
            try {
              const days = await window.sharker.getTokenUsage(usageHistoryDays('daily'))
              const today = days[days.length - 1]
              usageTodayTokens = today?.tokens ?? 0
              usageTodayTurns = today?.turns ?? 0
            } catch {
              /* optional */
            }
          }
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: formatThreadStatus({
              conversationId: activeConversationIdRef.current || undefined,
              modelLabel: provider ? `${provider.name} / ${model}` : model,
              permissionMode: settingsNow.permissionMode,
              networkMode: settingsNow.networkMode ?? 'open',
              threadMode,
              workspacePath: getActiveWorkspacePath(settingsNow) || '',
              worktreePath: threadWorktreePath,
              branch,
              goal: threadGoalRef.current?.text,
              contextUsed: usage.total,
              contextLimit: limit,
              usageTodayTokens,
              usageTodayTurns
            })
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'show_diff':
          setPage('chat')
          setRightPanelTab('changes')
          setRightPanelOpen(true)
          break
        case 'set_goal': {
          const convId = activeConversationIdRef.current
          const next = applyGoalCommand(threadGoalRef.current, parseGoalCommand(args))
          threadGoalRef.current = next.goal
          setThreadGoal(next.goal)
          if (convId) saveThreadGoal(convId, next.goal)
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: next.note
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'open_worktree':
          handleOpenWorktree()
          break
        case 'create_branch_here':
          void handleCreateBranchHere()
          break
        case 'set_thread_local':
          await handleThreadModeChange('local')
          break
        case 'set_thread_worktree':
          await handleThreadModeChange('worktree')
          break
        case 'show_mcp': {
          const cwd = getActiveWorkspacePath(settingsRef.current) || ''
          const verbose = /^\s*verbose\b/i.test(args)
          const servers: McpStatusServer[] = window.sharker.listMcpStatus
            ? await window.sharker.listMcpStatus(cwd, verbose)
            : []
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: formatMcpStatus(servers, verbose)
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'show_feedback': {
          const settingsNow = settingsRef.current
          const provider = settingsNow.providers.find((p) => p.id === settingsNow.activeProviderId)
          const model = provider?.model || settingsNow.activeProviderId
          const cwd =
            (threadMode === 'worktree' ? threadWorktreePath : undefined) ||
            getActiveWorkspacePath(settingsNow) ||
            ''
          let branch = ''
          if (cwd && window.sharker.getGitBranchInfo) {
            try {
              const info = await window.sharker.getGitBranchInfo(cwd)
              branch = info.branch
            } catch {
              /* optional */
            }
          }
          const usage = estimateContextUsage(messagesRef.current, streamingRef.current, '')
          const { limit } = resolveContextLimit(model, provider?.contextWindow)
          const mcpCount = window.sharker.listMcpStatus
            ? (await window.sharker.listMcpStatus(getActiveWorkspacePath(settingsNow) || '')).length
            : 0
          const text = formatFeedbackBundle({
            modelLabel: provider ? `${provider.name} / ${model}` : model,
            permissionMode: settingsNow.permissionMode,
            networkMode: settingsNow.networkMode ?? 'open',
            threadMode,
            workspacePath: getActiveWorkspacePath(settingsNow) || '',
            worktreePath: threadWorktreePath,
            branch,
            goal: threadGoalRef.current?.text,
            contextUsed: usage.total,
            contextLimit: limit,
            conversationId: activeConversationIdRef.current ?? undefined,
            mcpServerCount: mcpCount,
            appVersion: '0.1.0'
          })
          try {
            await navigator.clipboard.writeText(text)
          } catch {
            /* ignore */
          }
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: `${text}\n\n已尝试复制到剪贴板。`
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'resume_conversation':
          setPage('chat')
          setShowHistoryPicker(true)
          break
        case 'compact_context': {
          if (!window.sharker.compressContext) {
            appendLocalNote('当前环境不能压缩上下文。')
            break
          }
          const result = await window.sharker.compressContext(messagesRef.current)
          if (!result.compressed) {
            appendLocalNote('上下文还不需要压缩。')
            break
          }
          setMessages(result.messages)
          messagesRef.current = result.messages
          await persistActiveConversation(result.messages)
          appendLocalNote(
            `已压缩 ${result.removedCount} 条 · ${result.beforeTokens}→${result.afterTokens} tokens`
          )
          break
        }
        case 'pick_model': {
          const q = args.trim().toLowerCase()
          if (!q) {
            setPage('chat')
            setComposerIntent('model')
            break
          }
          const providers = settingsRef.current.providers
          const byName = providers.find(
            (p) => p.id === q || p.name.toLowerCase().includes(q)
          )
          if (byName) {
            await handleSelectProvider(byName.id, byName.model)
            appendLocalNote(`已切换到 ${byName.name} · ${byName.model || '默认模型'}`)
            break
          }
          let switched = false
          for (const p of providers) {
            const hit = knownModelsForProvider(p.id, p.model).find((id) =>
              id.toLowerCase().includes(q)
            )
            if (hit) {
              await handleSelectProvider(p.id, hit)
              appendLocalNote(`已切换到 ${p.name} · ${hit}`)
              switched = true
              break
            }
          }
          if (!switched) appendLocalNote(`没有匹配的模型：${args.trim()}`)
          break
        }
        case 'git_branch':
          await dispatchTurnRef.current('请用 git 工具查看当前分支与工作区状态，并简要汇报。')
          break
        case 'toggle_terminal':
          handleTogglePanel('terminal')
          break
        case 'toggle_files':
          handleTogglePanel('files')
          break
        case 'toggle_changes':
          handleTogglePanel('changes')
          break
        case 'review_working_tree': {
          const review = parseReviewRequest(args, {
            delivery: settingsRef.current.reviewDelivery
          })
          handleTogglePanel('changes')
          const prompt =
            review.scope === 'branch' ? REVIEW_BRANCH_PROMPT : REVIEW_WORKING_TREE_PROMPT
          const wsId = settingsRef.current.activeWorkspaceId
          if (review.detached && wsId && window.sharker.createConversation) {
            const conv = await window.sharker.createConversation(wsId)
            saveThreadRuntime(conv.id, threadRuntimeRef.current)
            await handleSelectConversation(wsId, conv.id)
            await dispatchTurnRef.current(prompt, [], conv.id)
            break
          }
          await dispatchTurnRef.current(prompt)
          break
        }
        case 'set_personality': {
          const current = parsePersonality(settingsRef.current.personality)
          const next = parsePersonalityArg(args) ?? nextPersonality(current)
          const merged = { ...settingsRef.current, personality: next }
          await persistSettings(merged)
          setSettings(merged)
          setSettingsDraft(merged)
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: personalitySwitchNote(next)
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'approve_denied': {
          const convId = activeConversationIdRef.current
          const result = window.sharker.approveDeniedRetry
            ? await window.sharker.approveDeniedRetry(convId)
            : { ok: false, denial: null }
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: formatApproveRetry(result)
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          if (result.ok) {
            const lastUser = [...messagesRef.current]
              .reverse()
              .find((m) => m.role === 'user' && m.content.trim())
            if (lastUser && !sendInFlightRef.current) {
              void dispatchTurnRef.current(lastUser.content, lastUser.attachments, convId ?? undefined)
            }
          }
          break
        }
        case 'mention_file':
          setPage('chat')
          setComposerIntent('mention')
          break
        case 'mention_skill':
          setPage('chat')
          setComposerIntent('skill')
          break
        case 'toggle_browser':
          handleTogglePanel('browser')
          break
        case 'toggle_agents':
          handleTogglePanel('agents')
          break
        case 'toggle_activity':
          setPage('chat')
          localStorage.setItem('sharker-sidebar-collapsed', '0')
          setSidebarCollapsed(false)
          setActivityToggleNonce((n) => n + 1)
          break
        case 'open_automations':
          setPage('automations')
          break
        case 'open_settings':
          void handleNavigate('settings', 'models')
          break
        case 'open_shortcuts':
          void handleNavigate('settings', 'shortcuts')
          break
        case 'open_appearance':
          void handleNavigate('settings', 'appearance')
          break
        case 'show_debug_config':
          appendLocalNote(formatDebugConfig(settingsRef.current))
          break
        case 'delete_conversation': {
          const ws = settingsRef.current.activeWorkspaceId
          const id = activeConversationIdRef.current
          if (ws && id) await handleDeleteConversation(ws, id)
          else appendLocalNote('没有当前对话，无法删除。')
          break
        }
        case 'copy_last_output': {
          const text = lastCompletedAssistantText(messagesRef.current)
          if (text) {
            try {
              await navigator.clipboard.writeText(text)
            } catch {
              /* ignore */
            }
          }
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: text ? '已复制上一条助手回复。' : '还没有可复制的助手回复。'
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'set_reasoning': {
          const settingsNow = settingsRef.current
          const provider = settingsNow.providers.find((p) => p.id === settingsNow.activeProviderId)
          const options = provider ? resolveThinkingOptions(provider) : []
          const current =
            provider?.thinkingLevel || (provider ? defaultThinkingLevel(provider) : '')
          const parsed = parseReasoningArgs(args, options)
          if (parsed.kind === 'set' && provider) {
            await handleThinkingLevelChange(provider.id, parsed.id)
          }
          const after = settingsRef.current.providers.find(
            (p) => p.id === settingsRef.current.activeProviderId
          )
          appendLocalNote(
            formatReasoningStatus({
              supported: options.length > 0,
              current: after?.thinkingLevel || current,
              options,
              unknown: parsed.kind === 'unknown' ? parsed.raw : undefined
            })
          )
          break
        }
        case 'set_fast': {
          const cmd = parseFastCommand(args)
          const settingsNow = settingsRef.current
          const provider = settingsNow.providers.find((p) => p.id === settingsNow.activeProviderId)
          const options = provider ? resolveThinkingOptions(provider) : []
          const currentLevel =
            provider?.thinkingLevel || (provider ? defaultThinkingLevel(provider) : '')
          if (cmd !== 'status' && provider && options.length) {
            const nextLevel = pickFastThinkingLevel(
              options,
              cmd === 'on',
              defaultThinkingLevel(provider)
            )
            if (nextLevel) await handleThinkingLevelChange(provider.id, nextLevel)
          }
          const after = settingsRef.current.providers.find(
            (p) => p.id === settingsRef.current.activeProviderId
          )
          const level = after?.thinkingLevel || currentLevel
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: formatFastStatus({
              supported: options.length > 0,
              level,
              fast: isFastThinkingLevel(level)
            })
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'show_skills': {
          if (!args.trim()) {
            setPage('chat')
            setComposerIntent('skill')
            break
          }
          const cwd = getActiveWorkspacePath(settingsRef.current) || ''
          const items = window.sharker.listSkills ? await window.sharker.listSkills(cwd) : []
          const note = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: formatSkillsStatus(items, args)
          }
          setMessages((msgs) => {
            const nextMsgs = [...msgs, note]
            messagesRef.current = nextMsgs
            void persistActiveConversation(nextMsgs)
            return nextMsgs
          })
          break
        }
        case 'stop_terminals': {
          await handleAbort()
          if (window.sharker.killAllTerminals) {
            try {
              await window.sharker.killAllTerminals()
            } catch {
              /* optional */
            }
          }
          break
        }
        case 'run_shell': {
          const cmd = args.trim()
          handleTogglePanel('terminal')
          if (cmd) setPendingTerminalCommand(cmd)
          break
        }
      }
    },
    [
      appendLocalNote,
      conversationList,
      copyPlainText,
      handleCreateBranchHere,
      handleDeleteConversation,
      handleNavigate,
      handleNativeOrAppUndo,
      handleMarkUnread,
      handleOpenWorktree,
      handleRenameConversation,
      handleStandaloneConversation,
      handleThreadModeChange,
      handleTogglePinConversation,
      handleSelectConversation,
      handleTogglePanel,
      persistActiveConversation,
      persistSettings,
      threadMode,
      threadWorktreePath
    ]
  )

  useEffect(() => {
    handleSlashActionRef.current = handleSlashAction
  }, [handleSlashAction])

  /** 命令面板：复用斜杠 / 快捷键同一套动作 */
  const handlePaletteCommand = useCallback(
    (cmd: PaletteCommand) => {
      if (cmd.action === 'toggle_sidebar') {
        toggleSidebar()
        return
      }
      if (cmd.action === 'open_folder') {
        void handleAddWorkspace()
        return
      }
      if (cmd.action === 'mention_file') {
        setPage('chat')
        setComposerIntent('mention')
        return
      }
      if (cmd.action === 'mention_skill') {
        setPage('chat')
        setComposerIntent('skill')
        return
      }
      if (cmd.action === 'find_in_thread') {
        setPage('chat')
        setComposerIntent('find')
        return
      }
      if (cmd.action === 'shortcut_help') {
        void handleNavigate('settings', 'shortcuts')
        return
      }
      if (cmd.action === 'pick_model') {
        setPage('chat')
        setComposerIntent('model')
        return
      }
      if (cmd.action === 'show_history') {
        setPage('chat')
        setShowHistoryPicker(true)
        return
      }
      if (cmd.action === 'open_project_picker') {
        setPage('chat')
        setShowHistoryPicker(false)
        setComposerIntent('project')
        return
      }
      if (cmd.action === 'undo_app' || cmd.action === 'redo_app') {
        handleNativeOrAppUndo(cmd.action === 'undo_app' ? 'undo' : 'redo')
        return
      }
      if (cmd.action === 'start_dictation') {
        setPage('chat')
        setComposerIntent('dictate')
        return
      }
      if (cmd.action === 'start_voice_chat') {
        setPage('chat')
        setComposerIntent('voice')
        return
      }
      if (cmd.action === 'popout_thread') {
        const ws = settingsRef.current.activeWorkspaceId
        const id = activeConversationIdRef.current
        if (ws && id) void window.sharker.openThreadWindow?.(ws, id)
        return
      }
      if (cmd.action === 'nav_back') {
        handleNavStep('back')
        return
      }
      if (cmd.action === 'nav_forward') {
        handleNavStep('forward')
        return
      }
      if (cmd.action === 'font_larger') {
        persistFontScale(stepUiFontScale(settingsRef.current.uiFontScale ?? UI_FONT_SCALE_DEFAULT, 1))
        return
      }
      if (cmd.action === 'font_smaller') {
        persistFontScale(stepUiFontScale(settingsRef.current.uiFontScale ?? UI_FONT_SCALE_DEFAULT, -1))
        return
      }
      if (cmd.action === 'font_reset') {
        persistFontScale(UI_FONT_SCALE_DEFAULT)
        return
      }
      if (cmd.action === 'clear_terminal') {
        handleClearTerminal()
        return
      }
      if (cmd.action === 'clear_unread') {
        void handleClearUnread()
        return
      }
      if (cmd.action === 'archive_thread') {
        const ws = settingsRef.current.activeWorkspaceId
        const id = activeConversationIdRef.current
        if (ws && id) void handleArchiveConversation(ws, id)
        return
      }
      if (cmd.action === 'open_browser') {
        handleOpenBrowserTab()
        return
      }
      if (cmd.action === 'next_attention') {
        handleNextAttention()
        return
      }
      if (cmd.action === 'toggle_activity') {
        setPage('chat')
        localStorage.setItem('sharker-sidebar-collapsed', '0')
        setSidebarCollapsed(false)
        setActivityToggleNonce((n) => n + 1)
        return
      }
      if (cmd.action === 'rename_conversation') {
        const id = activeConversationIdRef.current
        if (id) {
          setPage('chat')
          setRenameRequestId(id)
        }
        return
      }
      if (cmd.action === 'standalone_conversation') {
        void handleStandaloneConversation()
        return
      }
      void handleSlashActionRef.current(
        {
          name: cmd.id,
          description: cmd.title,
          scope: 'ui',
          action: cmd.action,
          category: 'other'
        },
        ''
      )
    },
    [
      handleAddWorkspace,
      handleClearTerminal,
      handleClearUnread,
      handleNavStep,
      handleNextAttention,
      handleOpenBrowserTab,
      handleStandaloneConversation,
      persistFontScale,
      toggleSidebar
    ]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const approvalChoice = resolveApprovalHotkey({
        approvalOpen: pageRef.current === 'chat' && Boolean(approvalRef.current),
        responding: approvalBusyRef.current,
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey
      })
      if (approvalChoice) {
        const t = e.target
        if (
          t instanceof HTMLElement &&
          (t.closest('.chat-find, .command-palette, .slash-menu, .history-picker') ||
            t instanceof HTMLInputElement)
        ) {
          /* 查找 / 命令面板里不抢 Enter */
        } else {
          e.preventDefault()
          void handleApproval(approvalChoice)
          return
        }
      }
      if (
        !e.isComposing &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'w' || e.key === 'W') &&
        rightPanelOpen
      ) {
        e.preventDefault()
        setRightPanelOpen(false)
        return
      }
      if (
        !e.isComposing &&
        e.key === 'Escape' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const t = e.target
        if (
          t instanceof HTMLElement &&
          t.closest(
            'input, textarea, [contenteditable=true], .slash-menu, .history-picker, .command-palette, .chat-find'
          )
        ) {
          return
        }
        if (sendInFlightRef.current || loading) {
          e.preventDefault()
          void handleAbort()
          return
        }
      }
      const action = matchWorkbenchShortcut(
        {
          key: e.key,
          code: e.code,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          isComposing: e.isComposing
        },
        settingsRef.current.keyboardShortcuts
      )
      if (!action) return
      if (action === 'undo_app' || action === 'redo_app') {
        if (isNativeUndoTarget(e.target)) return
        e.preventDefault()
        void (action === 'undo_app' ? performAppUndo() : performAppRedo())
        return
      }
      if (action === 'copy_cwd') {
        const t = e.target
        if (t instanceof HTMLElement && t.closest('.embedded-browser')) return
      }
      if (action === 'prev_thread' || action === 'next_thread') {
        const t = e.target
        // 对标 Codex：浏览器聚焦时 ⌃Tab 留给标签/网页，不切对话
        if (t instanceof HTMLElement && t.closest('.embedded-browser')) return
      }
      e.preventDefault()
      if (action === 'toggle_sidebar') {
        toggleSidebar()
        return
      }
      if (action === 'toggle_review') {
        handleShortcutPanel('changes')
        return
      }
      if (action === 'toggle_terminal') {
        handleShortcutPanel('terminal')
        return
      }
      if (action === 'toggle_files') {
        handleShortcutPanel('files')
        return
      }
      if (action === 'toggle_browser') {
        handleShortcutPanel('browser')
        return
      }
      if (action === 'toggle_agents') {
        handleShortcutPanel('agents')
        return
      }
      if (action === 'toggle_activity') {
        setPage('chat')
        localStorage.setItem('sharker-sidebar-collapsed', '0')
        setSidebarCollapsed(false)
        setActivityToggleNonce((n) => n + 1)
        return
      }
      if (action === 'pick_model') {
        setPage('chat')
        setComposerIntent('model')
        return
      }
      if (action === 'search_chats') {
        setPage('chat')
        setShowHistoryPicker(true)
        return
      }
      if (action === 'open_project_picker') {
        setPage('chat')
        setShowHistoryPicker(false)
        setComposerIntent('project')
        return
      }
      if (action === 'shortcut_help') {
        void handleNavigate('settings', 'shortcuts')
        return
      }
      if (action === 'copy_last_output') {
        const text = lastCompletedAssistantText(messagesRef.current)
        if (text) {
          try {
            void navigator.clipboard.writeText(text)
          } catch {
            /* ignore */
          }
        }
        return
      }
      if (action === 'thinking_lower' || action === 'thinking_higher') {
        const settingsNow = settingsRef.current
        const provider = settingsNow.providers.find((p) => p.id === settingsNow.activeProviderId)
        if (!provider) return
        const options = resolveThinkingOptions(provider)
        const current = provider.thinkingLevel || defaultThinkingLevel(provider)
        const next = stepThinkingLevel(
          options,
          current,
          action === 'thinking_higher' ? 1 : -1
        )
        if (next && next !== current) void handleThinkingLevelChange(provider.id, next)
        return
      }
      if (action === 'select_recent') {
        const n = Number(e.key)
        const recent = [...conversationListRef.current].sort((a, b) => b.updatedAt - a.updatedAt)
        const nextId = recent[n - 1]?.id
        const wsId = settingsRef.current.activeWorkspaceId
        if (wsId && nextId) {
          setPage('chat')
          void handleSelectConversation(wsId, nextId)
        }
        return
      }
      if (action === 'select_chat') {
        const n = Number(e.key)
        const nextId = conversationListRef.current[n - 1]?.id
        const wsId = settingsRef.current.activeWorkspaceId
        if (wsId && nextId) {
          setPage('chat')
          void handleSelectConversation(wsId, nextId)
        }
        return
      }
      if (action === 'new_conversation') {
        const wsId = settingsRef.current.activeWorkspaceId
        if (wsId) void handleNewConversation(wsId)
        else void handleAddWorkspace()
        setPage('chat')
        return
      }
      if (action === 'open_settings') {
        void handleNavigate('settings', 'models')
        return
      }
      if (action === 'open_folder') {
        void handleAddWorkspace()
        return
      }
      if (action === 'prev_thread' || action === 'next_thread') {
        const wsId = settingsRef.current.activeWorkspaceId
        const nextId = adjacentConversationId(
          conversationListRef.current.map((c) => c.id),
          activeConversationIdRef.current,
          action === 'next_thread' ? 1 : -1
        )
        if (wsId && nextId) {
          setPage('chat')
          void handleSelectConversation(wsId, nextId)
        }
        return
      }
      if (action === 'command_palette') {
        // 对标 Codex：终端聚焦时 ⌘K / Ctrl+K 清屏，⌘⇧P 仍开命令面板
        if (
          isTerminalClearChord({
            key: e.key,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            isComposing: e.isComposing
          }) &&
          isEmbeddedTerminalTarget(e.target)
        ) {
          handleClearTerminal()
          return
        }
        setCommandPaletteOpen((open) => !open)
        return
      }
      if (action === 'nav_back') {
        handleNavStep('back')
        return
      }
      if (action === 'nav_forward') {
        handleNavStep('forward')
        return
      }
      if (action === 'font_larger') {
        persistFontScale(stepUiFontScale(settingsRef.current.uiFontScale ?? UI_FONT_SCALE_DEFAULT, 1))
        return
      }
      if (action === 'font_smaller') {
        persistFontScale(stepUiFontScale(settingsRef.current.uiFontScale ?? UI_FONT_SCALE_DEFAULT, -1))
        return
      }
      if (action === 'font_reset') {
        persistFontScale(UI_FONT_SCALE_DEFAULT)
        return
      }
      if (action === 'clear_terminal') {
        handleClearTerminal()
        return
      }
      if (action === 'clear_unread') {
        void handleClearUnread()
        return
      }
      if (action === 'archive_thread') {
        const ws = settingsRef.current.activeWorkspaceId
        const id = activeConversationIdRef.current
        if (ws && id) void handleArchiveConversation(ws, id)
        return
      }
      if (action === 'side_conversation') {
        void handleSlashActionRef.current(
          {
            name: 'side',
            description: '旁路新线程',
            scope: 'ui',
            action: 'side_conversation',
            category: 'session'
          },
          ''
        )
        return
      }
      if (action === 'search_files') {
        setPage('chat')
        setComposerIntent('mention')
        return
      }
      if (action === 'open_browser') {
        handleOpenBrowserTab()
        return
      }
      if (action === 'next_attention') {
        handleNextAttention()
        return
      }
      if (action === 'rename_conversation') {
        const id = activeConversationIdRef.current
        if (id) {
          setPage('chat')
          setRenameRequestId(id)
        }
        return
      }
      if (action === 'pin_conversation') {
        void handleSlashActionRef.current(
          {
            name: 'pin',
            description: '置顶',
            scope: 'ui',
            action: 'pin_conversation',
            category: 'session'
          },
          ''
        )
        return
      }
      if (action === 'mark_unread') {
        void handleSlashActionRef.current(
          {
            name: 'unread',
            description: '标为未读',
            scope: 'ui',
            action: 'mark_unread',
            category: 'session'
          },
          ''
        )
        return
      }
      if (action === 'standalone_conversation') {
        void handleStandaloneConversation()
        return
      }
      if (action === 'copy_cwd') {
        const t = document.activeElement
        if (t instanceof HTMLElement && t.closest('.embedded-browser')) return
        void handleSlashActionRef.current(
          {
            name: 'cwd',
            description: '复制工作目录',
            scope: 'ui',
            action: 'copy_cwd',
            category: 'workspace'
          },
          ''
        )
        return
      }
      if (action === 'copy_session_id') {
        void handleSlashActionRef.current(
          {
            name: 'session',
            description: '复制会话 ID',
            scope: 'ui',
            action: 'copy_session_id',
            category: 'session'
          },
          ''
        )
        return
      }
      if (action === 'copy_deep_link') {
        void handleSlashActionRef.current(
          {
            name: 'deeplink',
            description: '复制对话深链',
            scope: 'ui',
            action: 'copy_deep_link',
            category: 'session'
          },
          ''
        )
        return
      }
      if (action === 'copy_conversation_path') {
        void handleSlashActionRef.current(
          {
            name: 'path',
            description: '复制对话路径',
            scope: 'ui',
            action: 'copy_conversation_path',
            category: 'workspace'
          },
          ''
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleAbort, handleAddWorkspace, handleApproval, handleArchiveConversation, handleClearTerminal, handleClearUnread, handleNavigate, handleNavStep, handleNewConversation, handleNextAttention, handleOpenBrowserTab, handleSelectConversation, handleShortcutPanel, handleStandaloneConversation, handleThinkingLevelChange, loading, performAppRedo, performAppUndo, persistFontScale, rightPanelOpen, toggleSidebar])

  useEffect(() => {
    if (!window.sharker.onMenuAction) return
    return window.sharker.onMenuAction((action) => {
      if (action === 'new_conversation') {
        const wsId = settingsRef.current.activeWorkspaceId
        if (wsId) void handleNewConversation(wsId)
        else void handleAddWorkspace()
        setPage('chat')
        return
      }
      if (action === 'standalone_conversation') {
        void handleStandaloneConversation()
        return
      }
      if (action === 'open_folder') {
        void handleAddWorkspace()
        return
      }
      if (action === 'open_settings') {
        void handleNavigate('settings', 'models')
        return
      }
      if (action === 'toggle_sidebar') {
        toggleSidebar()
        return
      }
      if (action === 'toggle_review') {
        handleShortcutPanel('changes')
        return
      }
      if (action === 'toggle_terminal') {
        handleShortcutPanel('terminal')
        return
      }
      if (action === 'toggle_files') {
        handleShortcutPanel('files')
        return
      }
      if (action === 'shortcut_help') {
        void handleNavigate('settings', 'shortcuts')
        return
      }
      if (action === 'command_palette') {
        setCommandPaletteOpen((open) => !open)
        return
      }
      if (action === 'undo_app' || action === 'redo_app') {
        handleNativeOrAppUndo(action === 'undo_app' ? 'undo' : 'redo')
      }
    })
  }, [
    handleAddWorkspace,
    handleNativeOrAppUndo,
    handleNavigate,
    handleNewConversation,
    handleShortcutPanel,
    handleStandaloneConversation,
    toggleSidebar
  ])

  useEffect(() => {
    const onMouseNav = (e: MouseEvent) => {
      const dir = mouseNavDirection(e.button)
      if (!dir) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('.embedded-browser')) return
      e.preventDefault()
      handleNavStep(dir)
    }
    window.addEventListener('mouseup', onMouseNav)
    window.addEventListener('auxclick', onMouseNav)
    return () => {
      window.removeEventListener('mouseup', onMouseNav)
      window.removeEventListener('auxclick', onMouseNav)
    }
  }, [handleNavStep])

  /** 仅 DEV：注入真实 React 状态，验证审批/错误/直播头，不走 mock DOM */
  useEffect(() => {
    if (!import.meta.env.DEV) return

    const api: SharkerDevDebugApi = {
      injectApproval: (partial = {}) => {
        const req: ApprovalRequest = {
          id: partial.id ?? `debug-approval-${Date.now()}`,
          title: partial.title ?? '删除工作区外文件',
          description:
            partial.description ?? '该操作可能不可恢复，请确认是否允许继续执行。',
          toolName: partial.toolName ?? 'run_command',
          args: partial.args ?? { command: 'rm -rf /tmp/sharker-debug-demo' },
          conversationId: partial.conversationId ?? activeConversationIdRef.current ?? undefined
        }
        setApproval(req)
        approvalRef.current = req
        setApprovalResponding(false)
        setLoading(true)
        const now = Date.now()
        const segs: TurnSegment[] = [
          {
            id: `debug-status-wait-${now}`,
            kind: 'status',
            content: '等待确认 · 高危操作',
            status: 'active',
            startedAt: now
          }
        ]
        segmentsRef.current = segs
        setLiveSegments(cloneSegments(segs))
        setTurnStartedAt((prev) => prev ?? now)
        turnStartedAtRef.current = turnStartedAtRef.current || now
        return req
      },
      clearApproval: () => {
        setApproval(null)
        approvalRef.current = null
        setApprovalResponding(false)
      },
      injectError: (message) => {
        const raw =
          typeof message === 'string'
            ? message
            : message && typeof message === 'object' && 'message' in message
              ? String((message as { message?: unknown }).message ?? '')
              : ''
        const rawText = raw.trim()
        const errText = rawText
          ? (/^\*\*错误\*\*/.test(rawText) ? rawText : `**错误**: ${rawText}`)
          : '**错误**: 开发调试注入的失败态。请检查模型配置后重试。'
        // 注入错误态前必须关掉直播层，否则 live assistant 会盖住错误卡片
        sendInFlightRef.current = false
        doneCommittedRef.current = true
        segmentsRef.current = []
        setLiveSegments([])
        setStreaming('')
        streamingRef.current = ''
        setTurnThinking('')
        turnThinkingRef.current = ''
        setActiveTool(null)
        setApproval(null)
        approvalRef.current = null
        setLoading(false)
        let base = messagesRef.current
        let lastUser = [...base].reverse().find((m) => m.role === 'user')
        if (!lastUser) {
          lastUser = {
            id: crypto.randomUUID(),
            role: 'user',
            content: '（调试）触发一次失败重试路径'
          }
          base = [...base, lastUser]
        }
        const assistant: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: errText,
          meta: {
            outcome: 'error',
            retryOfUserMessageId: lastUser.id,
            browsedFiles: [],
            activities: [{ kind: 'tool', label: '读取文件 · package.json' }],
            durationSec: 1,
            segments: [
              {
                id: `debug-err-tool-${Date.now()}`,
                kind: 'tool',
                toolName: 'read_file',
                toolTitle: '读取文件',
                toolDetail: 'package.json',
                content: '读取文件 · package.json',
                status: 'error',
                errorMessage: '开发调试注入失败',
                startedAt: Date.now() - 1500,
                endedAt: Date.now()
              }
            ]
          }
        }
        const next = appendAssistantMessage(base, assistant)
        messagesRef.current = next
        setMessages(next)
        setPage('chat')
        pageRef.current = 'chat'
        setLoading(false)
        sendInFlightRef.current = false
        setApproval(null)
        approvalRef.current = null
        segmentsRef.current = []
        setLiveSegments([])
        setStreaming('')
        streamingRef.current = ''
        setTurnThinking('')
        turnThinkingRef.current = ''
        setActiveTool(null)
        setTurnStartedAt(null)
        turnStartedAtRef.current = 0
        return assistant
      },
      injectAborted: (message) => {
        const raw =
          typeof message === 'string'
            ? message
            : message && typeof message === 'object' && 'message' in message
              ? String((message as { message?: unknown }).message ?? '')
              : ''
        const content =
          `${raw.trim() || '已保留停止前生成的内容'}\n\n_(已停止)_`
        // 注入停止态前关掉直播层，避免 live 行盖住中止卡片
        sendInFlightRef.current = false
        doneCommittedRef.current = true
        segmentsRef.current = []
        setLiveSegments([])
        setStreaming('')
        streamingRef.current = ''
        setTurnThinking('')
        turnThinkingRef.current = ''
        setActiveTool(null)
        setApproval(null)
        approvalRef.current = null
        setLoading(false)
        let base = messagesRef.current
        let lastUser = [...base].reverse().find((m) => m.role === 'user')
        if (!lastUser) {
          lastUser = {
            id: crypto.randomUUID(),
            role: 'user',
            content: '（调试）触发一次停止路径'
          }
          base = [...base, lastUser]
        }
        const assistant: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          meta: {
            outcome: 'aborted',
            browsedFiles: [],
            activities: [],
            durationSec: 1,
            segments: [
              {
                id: `debug-tool-${Date.now()}`,
                kind: 'tool',
                toolName: 'read_file',
                toolTitle: '读取文件',
                toolDetail: 'package.json',
                content: '读取文件 · package.json',
                status: 'cancelled',
                startedAt: Date.now() - 2000,
                endedAt: Date.now()
              }
            ]
          }
        }
        const next = appendAssistantMessage(base, assistant)
        messagesRef.current = next
        setMessages(next)
        setLoading(false)
        sendInFlightRef.current = false
        setApproval(null)
        approvalRef.current = null
        segmentsRef.current = []
        setLiveSegments([])
        setStreaming('')
        streamingRef.current = ''
        setTurnThinking('')
        turnThinkingRef.current = ''
        setActiveTool(null)
        setTurnStartedAt(null)
        turnStartedAtRef.current = 0
        return assistant
      },
      seedLiveProcess: (mode = 'preparing') => {
        const now = Date.now()
        // 每次 seed 彻底清掉上一次调试/真实回合残留，保证 live 序列可复现、不串步
        setApproval(null)
        approvalRef.current = null
        streamingRef.current = ''
        setStreaming('')
        setTurnThinking('')
        turnThinkingRef.current = ''
        segmentsRef.current = []
        setLiveSegments([])
        setActiveTool(null)
        let segs: TurnSegment[] = []
        if (mode === 'preparing') {
          segs = [
            {
              id: `debug-status-prep-${now}`,
              kind: 'status',
              content: '连接模型并准备任务…',
              status: 'active',
              startedAt: now
            }
          ]
        } else if (mode === 'tool') {
          segs = [
            {
              id: `debug-tool-read-${now}`,
              kind: 'tool',
              toolName: 'read_file',
              toolTitle: '读取文件',
              toolDetail: 'package.json',
              toolArgs: { path: 'package.json' },
              content: '读取文件 · package.json',
              status: 'active',
              startedAt: now - 900
            }
          ]
        } else if (mode === 'chain') {
          segs = [
            {
              id: `debug-tool-read-${now}`,
              kind: 'tool',
              toolName: 'read_file',
              toolTitle: '读取文件',
              toolDetail: 'package.json',
              toolArgs: { path: 'package.json' },
              content: '读取文件 · package.json',
              status: 'done',
              startedAt: now - 5200,
              endedAt: now - 3600,
              resultSummary: '已读取 package.json'
            },
            {
              id: `debug-tool-list-${now}`,
              kind: 'tool',
              toolName: 'list_dir',
              toolTitle: '列出目录',
              toolDetail: 'src',
              toolArgs: { path: 'src' },
              content: '列出目录 · src',
              status: 'active',
              startedAt: now - 800
            }
          ]
        } else if (mode === 'planning') {
          segs = [
            {
              id: `debug-tool-done-${now}`,
              kind: 'tool',
              toolName: 'read_file',
              toolTitle: '读取文件',
              toolDetail: 'package.json',
              toolArgs: { path: 'package.json' },
              content: '读取文件 · package.json',
              status: 'done',
              startedAt: now - 3200,
              endedAt: now - 400,
              resultSummary: '已读取 package.json'
            }
          ]
        } else if (mode === 'answer') {
          segs = [
            {
              id: `debug-tool-done-${now}`,
              kind: 'tool',
              toolName: 'list_dir',
              toolTitle: '列出目录',
              toolDetail: 'src',
              toolArgs: { path: 'src' },
              content: '列出目录 · src',
              status: 'done',
              startedAt: now - 5000,
              endedAt: now - 1200,
              resultSummary: '已列出 src'
            },
            {
              id: `debug-final-${now}`,
              kind: 'text',
              role: 'final',
              content: '正在整理结果…',
              status: 'active',
              startedAt: now - 200
            }
          ]
          streamingRef.current = '正在整理结果…'
          setStreaming('正在整理结果…')
        } else {
          segs = [
            {
              id: `debug-status-wait-${now}`,
              kind: 'status',
              content: '等待确认 · 高危操作',
              status: 'active',
              startedAt: now
            }
          ]
          const req: ApprovalRequest = {
            id: `debug-approval-${now}`,
            title: '删除工作区外文件',
            description: '该操作可能不可恢复，请确认是否允许继续执行。',
            toolName: 'run_command',
            args: { command: 'rm -rf /tmp/sharker-debug-demo' },
            conversationId: activeConversationIdRef.current ?? undefined
          }
          setApproval(req)
          approvalRef.current = req
        }
        segmentsRef.current = segs
        setLiveSegments(cloneSegments(segs))
        setLoading(true)
        sendInFlightRef.current = true
        // 调试直播视为进行中回合：允许切会话后恢复，且 Stop/done 门闩可工作
        doneCommittedRef.current = false
        if (activeConversationIdRef.current) {
          doneCommittedMapRef.current = clearDoneCommitted(
            doneCommittedMapRef.current,
            activeConversationIdRef.current
          )
        }
        // 强制刷新计时起点，避免沿用上一条回合的 elapsed 造成“卡住感”
        setTurnStartedAt(now - 3000)
        turnStartedAtRef.current = now - 3000
        setActiveTool(
          mode === 'tool'
            ? 'read_file'
            : mode === 'chain'
              ? 'list_dir'
              : mode === 'planning'
                ? null
                : null
        )
        // 立刻写入当前会话 buffer，切到其它会话时侧栏 live 点与恢复才可靠
        if (activeConversationIdRef.current) {
          snapshotActiveSessionBuffer()
          bumpSessionLive()
        }
        return segs
      },
      clearLiveProcess: () => {
        segmentsRef.current = []
        setLiveSegments([])
        setStreaming('')
        streamingRef.current = ''
        setTurnThinking('')
        turnThinkingRef.current = ''
        setLoading(false)
        sendInFlightRef.current = false
        setActiveTool(null)
        setApproval(null)
        approvalRef.current = null
        setTurnStartedAt(null)
        turnStartedAtRef.current = 0
      },
      playLiveSequence: async () => {
        const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
        const heads: string[] = []
        const readHead = () => {
          const el = document.querySelector(
            '.turn-flow--streaming, .turn-flow[data-live="true"]'
          ) as HTMLElement | null
          const fromDom =
            el?.getAttribute('data-head-label') ||
            el?.querySelector('[data-live-label]')?.getAttribute('data-live-label') ||
            el?.querySelector('.turn-flow-live-label')?.textContent?.trim()
          if (fromDom) return fromDom
          const active = [...segmentsRef.current].reverse().find((s) => s.status === 'active')
          return (
            active?.toolTitle ||
            active?.content ||
            active?.toolName ||
            (streamingRef.current ? '生成回答中' : '处理中')
          )
        }
        const paint = (
          segs: TurnSegment[],
          opts?: { streaming?: string; activeTool?: string | null }
        ) => {
          setApproval(null)
          approvalRef.current = null
          segmentsRef.current = segs
          setLiveSegments(cloneSegments(segs))
          setLoading(true)
          sendInFlightRef.current = true
          const streaming = opts?.streaming ?? ''
          streamingRef.current = streaming
          setStreaming(streaming)
          setActiveTool(opts?.activeTool ?? null)
          const now = Date.now()
          setTurnStartedAt((prev) => prev ?? now - 1200)
          turnStartedAtRef.current = turnStartedAtRef.current || now - 1200
        }

        const t0 = Date.now()
        // 同一回合内逐步推进，验收粘滞头/呼吸不中断（非整包 reseed）
        paint([
          {
            id: `live-prep-${t0}`,
            kind: 'status',
            content: '连接模型并准备任务…',
            status: 'active',
            startedAt: t0
          }
        ])
        await wait(380)
        heads.push(readHead())

        paint(
          [
            {
              id: `live-prep-${t0}`,
              kind: 'status',
              content: '连接模型并准备任务…',
              status: 'done',
              startedAt: t0,
              endedAt: t0 + 200
            },
            {
              id: `live-read-${t0}`,
              kind: 'tool',
              toolName: 'read_file',
              toolTitle: '读取文件',
              toolDetail: 'package.json',
              toolArgs: { path: 'package.json' },
              content: '读取文件 · package.json',
              status: 'active',
              startedAt: t0 + 220
            }
          ],
          { activeTool: 'read_file' }
        )
        await wait(420)
        heads.push(readHead())

        paint(
          [
            {
              id: `live-read-${t0}`,
              kind: 'tool',
              toolName: 'read_file',
              toolTitle: '读取文件',
              toolDetail: 'package.json',
              toolArgs: { path: 'package.json' },
              content: '读取文件 · package.json',
              status: 'done',
              startedAt: t0 + 220,
              endedAt: t0 + 700,
              resultSummary: '已读取 package.json'
            },
            {
              id: `live-list-${t0}`,
              kind: 'tool',
              toolName: 'list_dir',
              toolTitle: '列出目录',
              toolDetail: 'src',
              toolArgs: { path: 'src' },
              content: '列出目录 · src',
              status: 'active',
              startedAt: t0 + 740
            }
          ],
          { activeTool: 'list_dir' }
        )
        await wait(420)
        heads.push(readHead())

        paint([
          {
            id: `live-read-${t0}`,
            kind: 'tool',
            toolName: 'read_file',
            toolTitle: '读取文件',
            toolDetail: 'package.json',
            toolArgs: { path: 'package.json' },
            content: '读取文件 · package.json',
            status: 'done',
            startedAt: t0 + 220,
            endedAt: t0 + 700,
            resultSummary: '已读取 package.json'
          },
          {
            id: `live-list-${t0}`,
            kind: 'tool',
            toolName: 'list_dir',
            toolTitle: '列出目录',
            toolDetail: 'src',
            toolArgs: { path: 'src' },
            content: '列出目录 · src',
            status: 'done',
            startedAt: t0 + 740,
            endedAt: t0 + 1100,
            resultSummary: '已列出 src'
          }
        ])
        await wait(420)
        heads.push(readHead())

        paint(
          [
            {
              id: `live-read-${t0}`,
              kind: 'tool',
              toolName: 'read_file',
              toolTitle: '读取文件',
              toolDetail: 'package.json',
              toolArgs: { path: 'package.json' },
              content: '读取文件 · package.json',
              status: 'done',
              startedAt: t0 + 220,
              endedAt: t0 + 700,
              resultSummary: '已读取 package.json'
            },
            {
              id: `live-list-${t0}`,
              kind: 'tool',
              toolName: 'list_dir',
              toolTitle: '列出目录',
              toolDetail: 'src',
              toolArgs: { path: 'src' },
              content: '列出目录 · src',
              status: 'done',
              startedAt: t0 + 740,
              endedAt: t0 + 1100,
              resultSummary: '已列出 src'
            },
            {
              id: `live-final-${t0}`,
              kind: 'text',
              role: 'final',
              content: '正在整理结果…',
              status: 'active',
              startedAt: t0 + 1200
            }
          ],
          { streaming: '正在整理结果…' }
        )
        await wait(380)
        heads.push(readHead())
        return heads
      },
      /** 调试：清空当前会话消息与 live，便于无历史干扰地验直播过程 */
      resetChatVisual: () => {
        messagesRef.current = []
        setMessages([])
        segmentsRef.current = []
        setLiveSegments([])
        setStreaming('')
        streamingRef.current = ''
        setTurnThinking('')
        turnThinkingRef.current = ''
        setLoading(false)
        sendInFlightRef.current = false
        setActiveTool(null)
        setApproval(null)
        approvalRef.current = null
        setTurnStartedAt(null)
        turnStartedAtRef.current = 0
        const cid = activeConversationIdRef.current
        if (cid) {
          const buf = sessionBuffersRef.current.get(cid)
          if (buf) {
            buf.messages = []
            buf.segments = []
            buf.streaming = ''
            buf.loading = false
            buf.sendInFlight = false
            buf.approval = null
          }
        }
      },
      navigateTo: (targetPage, tab) => {
        if (targetPage === 'settings') {
          setSettingsDraft(settingsRef.current)
          setSettingsTab(tab ?? 'models')
        }
        setPage(targetPage)
        pageRef.current = targetPage
      },
      setSidebarCollapsed: (collapsed: boolean) => {
        setSidebarCollapsed(Boolean(collapsed))
        localStorage.setItem('sharker-sidebar-collapsed', collapsed ? '1' : '0')
        setSidebarPeeking(false)
      },
      openHistoryPicker: () => {
        setPage('chat')
        pageRef.current = 'chat'
        setShowHistoryPicker(true)
      },
      selectConversation: async (conversationId: string) => {
        const id = String(conversationId || '').trim()
        if (!id) return false
        const workspaceId = settingsRef.current.activeWorkspaceId
        if (!workspaceId) return false
        // 直接走与侧栏相同的切换逻辑（含 buffer 恢复）
        await (async () => {
          const prevId = activeConversationIdRef.current
          if (prevId && prevId !== id) {
            snapshotActiveSessionBuffer()
            cancelScheduledStreamPaint()
          }
          setActiveConversationId(id)
          activeConversationIdRef.current = id
          applyPlanUiForConversation(id)
          setPage('chat')
          pageRef.current = 'chat'
          syncActiveQueueUi(sessionQueuesRef.current, id)
          void window.sharker.setActiveConversation(workspaceId, id)
          const buf = sessionBuffersRef.current.get(id)
          if (buf) {
            const live =
              buf.loading ||
              buf.sendInFlight ||
              (buf.segments.length > 0 && !buf.doneCommitted)
            if (live) {
              applyBufferToUi(buf)
              if ((buf.loading || buf.sendInFlight) && !buf.doneCommitted) {
                streamOwnerRef.current = id
                doneCommittedRef.current = false
              }
              return
            }
            if (buf.messages.length > 0) {
              messagesRef.current = buf.messages
              setMessages(buf.messages)
              sendInFlightRef.current = false
              doneCommittedRef.current = true
              streamingRef.current = ''
              turnThinkingRef.current = ''
              segmentsRef.current = []
              setLiveSegments([])
              setStreaming('')
              setTurnThinking('')
              setLoading(false)
              setActiveTool(null)
              setApproval(null)
              setApprovalResponding(false)
              resetTurnMeta()
              sessionBuffersRef.current.delete(id)
              return
            }
          }
          const conv = await window.sharker.loadConversation(workspaceId, id)
          if (activeConversationIdRef.current !== id) return
          const loaded = conv?.messages ?? []
          sendInFlightRef.current = false
          doneCommittedRef.current = true
          streamingRef.current = ''
          turnThinkingRef.current = ''
          segmentsRef.current = []
          setLiveSegments([])
          setStreaming('')
          setTurnThinking('')
          setLoading(false)
          setActiveTool(null)
          setApproval(null)
          setApprovalResponding(false)
          resetTurnMeta()
          messagesRef.current = loaded
          setMessages(loaded)
        })()
        return activeConversationIdRef.current === id
      },
      openRightPanel: (tab) => {
        if (tab) setRightPanelTab(tab)
        setRightPanelOpen(true)
        setPage('chat')
        pageRef.current = 'chat'
      },
      closeRightPanel: () => {
        setRightPanelOpen(false)
      },
      listSessionBuffers: () => {
        return [...sessionBuffersRef.current.entries()].map(([id, buf]) => ({
          id,
          loading: buf.loading,
          sendInFlight: buf.sendInFlight,
          doneCommitted: buf.doneCommitted,
          messageCount: buf.messages.length,
          liveSegmentCount: buf.segments.length,
          streamingLen: buf.streaming.length,
          approval: Boolean(buf.approval)
        }))
      },
      peekSession: (conversationId) => {
        const buf = sessionBuffersRef.current.get(conversationId)
        if (!buf) return null
        const active = [...buf.segments].reverse().find((s) => s.status === 'active')
        return {
          source: 'buffer' as const,
          loading: buf.loading || buf.sendInFlight,
          messages: buf.messages.map((m) => ({
            role: m.role,
            content: (m.content || '').slice(0, 160)
          })),
          liveHead: active?.content || active?.toolTitle || active?.toolName
        }
      },
      getSnapshot: () => ({
        page: pageRef.current,
        loading: sendInFlightRef.current,
        approval: approvalRef.current,
        liveSegmentCount: segmentsRef.current.length,
        messageCount: messagesRef.current.length,
        messageRoles: messagesRef.current.map((m) => m.role),
        activeConversationId: activeConversationIdRef.current,
        hasLiveSegments: segmentsRef.current.length > 0,
        streamingLen: streamingRef.current.length,
        streamOwner: streamOwnerRef.current,
        bufferCount: sessionBuffersRef.current.size,
        bufferIds: [...sessionBuffersRef.current.keys()]
      })
    }

    window.__sharkerDebug = api
    return () => {
      if (window.__sharkerDebug === api) delete window.__sharkerDebug
    }
  }, [bumpSessionLive, snapshotActiveSessionBuffer])

  const reviewFindings = useMemo(() => {
    const last = lastCompletedAssistantText(messages)
    return last ? parseReviewFindings(last) : []
  }, [messages])

  const handleQueueTriage = useCallback(
    async (item: AutomationQueueItem, action: QueueTriageAction) => {
      const cwd =
        item.workspacePath ||
        (threadMode === 'worktree' && threadWorktreePath
          ? threadWorktreePath
          : getActiveWorkspacePath(settingsRef.current) || '')
      const wsId = item.workspaceId || settingsRef.current.activeWorkspaceId
      const paths = resolveQueueTriagePaths(
        item,
        item.conversationId
          ? lastTurnPathsByConvRef.current.get(item.conversationId) ?? []
          : []
      )
      if (action === 'reject' && cwd && paths.length && window.sharker.applyGitReviewAction) {
        const result = await window.sharker.applyGitReviewAction(cwd, 'revert', paths)
        if (!result.ok) console.warn('[queue] reject revert failed', result.error)
      }
      if (action === 'approve' && cwd && paths.length && window.sharker.applyGitReviewAction) {
        const result = await window.sharker.applyGitReviewAction(cwd, 'stage', paths)
        if (!result.ok) console.warn('[queue] approve stage failed', result.error)
        else if (window.sharker.commitGitChanges) {
          const committed = await window.sharker.commitGitChanges(
            cwd,
            item.title.trim() || '自动化'
          )
          if (!committed.ok) console.warn('[queue] approve commit failed', committed.error)
          else {
            const pushed = await pushAfterApproveCommit({
              committed: true,
              push: window.sharker.pushGitBranch
                ? () => window.sharker.pushGitBranch(cwd)
                : undefined
            })
            if (pushed === 'push_failed') {
              console.warn('[queue] approve push failed（可稍后在审查面板重试）')
            }
            const opened = await createPrAfterApprovePush({
              pushed,
              hasExistingPr: window.sharker.getPullRequestContext
                ? async () => {
                    const pr = await window.sharker.getPullRequestContext(cwd)
                    return pr.ok
                  }
                : undefined,
              createPr: window.sharker.createGitPullRequest
                ? () =>
                    window.sharker.createGitPullRequest(cwd, {
                      title: item.title.trim() || '自动化'
                    })
                : undefined
            })
            if (opened === 'create_failed') {
              console.warn('[queue] approve create PR failed（可稍后在审查面板重试）')
            }
          }
        }
      }
      if (action === 'approve') {
        setSuggestedCommit(item.title.trim() || '自动化')
      }
      if (wsId && item.conversationId) {
        setPage('chat')
        await handleSelectConversation(wsId, item.conversationId)
        if (action !== 'reject') {
          setRightPanelTab('changes')
          setRightPanelOpen(true)
        }
      }
      if (window.sharker.listAutomationQueue) {
        setQueueUnread(unreadQueueCount(await window.sharker.listAutomationQueue()))
      }
    },
    [handleSelectConversation, threadMode, threadWorktreePath]
  )

  const handleComposerSlash = useCallback((cmd: SlashCommandMeta, args: string) => {
    void handleSlashActionRef.current(cmd, args)
  }, [])

  const suggestedPromptItems = useMemo(() => {
    const recent = conversationList.find((c) => c.id !== activeConversationId)
    return buildSuggestedPrompts({
      enabled: settings.suggestedPrompts !== false,
      hasWorkspace: Boolean(getActiveWorkspacePath(settings)),
      hasGoal: Boolean(threadGoal?.text?.trim()),
      recent: recent
        ? { id: recent.id, title: recent.customTitle || recent.title || '' }
        : null
    })
  }, [
    activeConversationId,
    conversationList,
    settings,
    threadGoal?.text
  ])

  const handleSuggestedPrompt = useCallback(
    (item: { kind: 'slash' | 'resume'; payload: string }) => {
      if (item.kind === 'resume') {
        const ws = settingsRef.current.activeWorkspaceId
        if (ws) void handleSelectConversation(ws, item.payload)
        return
      }
      if (item.payload === 'goal') {
        composerSeedNonceRef.current += 1
        setComposerSeed({ nonce: composerSeedNonceRef.current, text: '/goal ' })
        return
      }
      const cmd = SLASH_COMMANDS.find((c) => c.name === item.payload)
      if (cmd) void handleSlashActionRef.current(cmd, '')
    },
    [handleSelectConversation]
  )

  const handleCloseHistoryPicker = useCallback(() => {
    setShowHistoryPicker(false)
  }, [])

  const conversationTitles = useMemo(
    () =>
      conversationList.map((c) => {
        const runtime = loadThreadRuntime(c.id)
        const gitBranch = resolveConversationGitBranch({
          gitBranch: c.gitBranch,
          baseRef: runtime.baseRef,
          workspaceBranch
        })
        return {
          id: c.id,
          title: c.title,
          customTitle: c.customTitle,
          preview: c.preview,
          gitBranch: gitBranch || undefined
        }
      }),
    [conversationList, workspaceBranch]
  )

  const handlePickConversation = useCallback((id: string) => {
    const ws = settingsRef.current.activeWorkspaceId
    if (ws) void handleSelectConversationRef.current(ws, id)
    setShowHistoryPicker(false)
  }, [])

  const handleGoalCommand = useCallback((command: GoalCommand) => {
    const convId = activeConversationIdRef.current
    const next = applyGoalCommand(threadGoalRef.current, command)
    threadGoalRef.current = next.goal
    setThreadGoal(next.goal)
    if (convId) saveThreadGoal(convId, next.goal)
  }, [])

  const handleComposerIntentHandled = useCallback(() => {
    setComposerIntent(null)
  }, [])

  const handleRestoreWorktreeClick = useCallback(() => {
    void handleRestoreWorktree()
  }, [handleRestoreWorktree])

  const handleRetryMessage = useCallback(
    (userMessageId: string) => {
      void handleRetry(userMessageId)
    },
    [handleRetry]
  )

  const handleEditUserMessage = useCallback(
    (userMessageId: string, text: string) => {
      void handleRetry(userMessageId, text)
    },
    [handleRetry]
  )

  const fileSearchRoot = useMemo(() => {
    if (threadMode === 'worktree' && threadWorktreePath) return threadWorktreePath
    return getActiveWorkspacePath(settings) ?? ''
  }, [threadMode, threadWorktreePath, settings])

  const liveConversationIds = (() => {
    void sessionLiveVersion
    const ids = new Set<string>()
    for (const [id, buf] of sessionBuffersRef.current.entries()) {
      if (buf.loading || buf.sendInFlight) ids.add(id)
    }
    if (loading && activeConversationId) ids.add(activeConversationId)
    return ids
  })()

  const waitingConversationIds = (() => {
    void sessionLiveVersion
    const ids = new Set<string>()
    for (const [id, buf] of sessionBuffersRef.current.entries()) {
      if (buf.approval) ids.add(id)
    }
    if (approval) {
      const id = approval.conversationId || activeConversationId
      if (id) ids.add(id)
    }
    return ids
  })()

  return (
    <div className={`app-shell${popoutRoute ? ' app-shell--popout' : ''}`}>
      {/* Codex 风格全屏布局：侧栏通顶 + 主区自带顶栏，无整条 TitleBar */}
      <div className={`app${popoutRoute ? ' app--popout' : ''}`}>
        {popoutRoute ? null : (
        <Sidebar
          page={page}
          queueUnread={queueUnread}
          settingsTab={settingsTab}
          settings={settings}
          conversations={conversationList}
          activeConversationId={activeConversationId}
          liveConversationIds={liveConversationIds}
          waitingConversationIds={waitingConversationIds}
          activityToggleNonce={activityToggleNonce}
          onSelectWorkspace={handleSelectWorkspace}
          onSelectConversation={handleSelectConversation}
          onAddWorkspace={handleAddWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onTogglePinWorkspace={handleTogglePinWorkspace}
          onRenameWorkspace={(id, label) => void handleRenameWorkspace(id, label)}
          onCreatePermanentWorktree={(id) => void handleCreatePermanentWorktree(id)}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onArchiveConversation={(ws, id) => void handleArchiveConversation(ws, id)}
          onRenameConversation={(ws, id, title) => void handleRenameConversation(ws, id, title)}
          onTogglePinConversation={(ws, id) => void handleTogglePinConversation(ws, id)}
          renameRequestId={renameRequestId}
          onRenameRequestHandled={() => setRenameRequestId(null)}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onPeekChange={setSidebarPeeking}
        />
        )}
        <main className="main">
          {page === 'chat' ? (
            <div key="chat" className="main-pane view-enter main-pane--chat">
            <ChatToolbar
              rightPanelOpen={rightPanelOpen}
              sidebarCollapsed={sidebarCollapsed}
              popout={Boolean(popoutRoute)}
              alwaysOnTop={alwaysOnTop}
              onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
              prLabel={prChipLabel}
              onOpenPullRequest={handleOpenPullRequest}
              worktreePath={threadMode === 'worktree' ? threadWorktreePath : undefined}
              onOpenWorktree={handleOpenWorktree}
              onCreateBranchHere={() => void handleCreateBranchHere()}
              onPopOut={() => {
                const ws = settingsRef.current.activeWorkspaceId
                const id = activeConversationIdRef.current
                if (ws && id) {
                  void window.sharker.openThreadWindow?.(
                    ws,
                    id,
                    conversationListRef.current.find((c) => c.id === id)?.title
                  )
                }
              }}
              onToggleSidebar={toggleSidebar}
              onToggleRightPanel={handleToggleRightPanel}
              onNewConversation={() => {
                const wsId = settingsRef.current.activeWorkspaceId
                if (wsId) void handleNewConversation(wsId)
                else void handleAddWorkspace()
              }}
            />
            {pendingPlan && (
              <PlanBuildBar
                planDocument={pendingPlan.document}
                onBuild={() => void handleBuildPlan()}
                onDismiss={() => {
                  const id = activeConversationIdRef.current
                  if (id) pendingPlanByConvRef.current.delete(id)
                  setPendingPlan(null)
                }}
              />
            )}
            <ChatView
              sessionKey={activeConversationId}
              workspaces={settings.workspaces}
              activeWorkspaceId={settings.activeWorkspaceId}
              onSelectWorkspace={handleSelectWorkspace}
              providers={settings.providers}
              activeProviderId={settings.activeProviderId}
              onSelectProvider={handleSelectProvider}
              onThinkingLevelChange={handleThinkingLevelChange}
              messages={messages}
              liveSegments={liveSegments}
              streaming={streaming}
              turnThinking={turnThinking}
              loading={loading}
              activeTool={activeTool}
              liveTurnMeta={liveTurnMeta}
              turnStartedAt={turnStartedAt}
              turnHadThinking={turnHadThinking}
              queuedPrompts={queuedPrompts}
              onSend={handlePromptSubmit}
              onCancelQueued={handleCancelQueued}
              onEditQueued={handleEditQueued}
              onMoveQueued={handleMoveQueued}
              onSendQueued={handleSendQueued}
              followUpBehavior={settings.followUpBehavior === 'steer' ? 'steer' : 'queue'}
              requireModEnter={settings.requireModEnter === true}
              suggestedPrompts={suggestedPromptItems}
              onSuggestedPrompt={handleSuggestedPrompt}
              onAbort={handleAbort}
              onSlashAction={handleComposerSlash}
              showHistoryPicker={showHistoryPicker}
              onCloseHistoryPicker={handleCloseHistoryPicker}
              conversationTitles={conversationTitles}
              onPickConversation={handlePickConversation}
              threadMode={threadMode}
              threadGoal={threadGoal}
              onGoalCommand={handleGoalCommand}
              onThreadModeChange={handleThreadModeChange}
              planMode={planMode}
              onPlanModeChange={handlePlanModeChange}
              worktreeBaseRef={worktreeBaseRef}
              onWorktreeBaseRefChange={handleWorktreeBaseRefChange}
              fileSearchRoot={fileSearchRoot}
              composerIntent={composerIntent}
              onComposerIntentHandled={handleComposerIntentHandled}
              queueHeld={queueHeld}
              onQueueHeldChange={handleQueueHeldChange}
              worktreeMissing={worktreeMissing}
              onRestoreWorktree={handleRestoreWorktreeClick}
              onRetry={handleRetryMessage}
              onEditUserMessage={handleEditUserMessage}
              composerSeed={composerSeed}
              approval={approval}
              approvalResponding={approvalResponding}
              onApproval={handleApproval}
              onOpenSubAgent={handleOpenSubAgent}
              onOpenChangedFiles={popoutRoute ? undefined : handleOpenChangedFiles}
            />
            </div>
          ) : page === 'automations' ? (
            <div key="automations" className="main-pane view-enter main-pane--page">
              <div className="main-drag-strip" aria-hidden />
              <AutomationsPage
                queueRevision={queueRevision}
                openCreateNonce={automationsCreateNonce}
                onBack={() => setPage('chat')}
                onOpenConversation={(conversationId) => {
                  const wsId = settingsRef.current.activeWorkspaceId
                  if (!wsId) return
                  setPage('chat')
                  void handleSelectConversation(wsId, conversationId)
                }}
                onTriage={(item, action) => {
                  void handleQueueTriage(item, action)
                }}
              />
            </div>
          ) : (
            <div key="settings" className="main-pane view-enter main-pane--page">
              <div className="main-drag-strip" aria-hidden />
            <SettingsPage
              tab={settingsTab}
              draft={settingsDraft}
              setDraft={setSettingsDraft}
              onSave={handleSaveSettings}
              onNavigateTab={(tab) => void handleNavigate('settings', tab)}
            />
            </div>
          )}
        </main>
        {popoutRoute ? null : (
        <RightPanel
          open={rightPanelOpen && page === 'chat'}
          tab={rightPanelTab}
          workspacePath={
            threadMode === 'worktree' && threadWorktreePath
              ? threadWorktreePath
              : (getActiveWorkspacePath(settings) ?? '')
          }
          isHome={false}
          onTabChange={setRightPanelTab}
          onClose={() => setRightPanelOpen(false)}
          changesRevision={changesRevision}
          lastTurnPaths={lastTurnPaths}
          agentFindings={reviewFindings}
          suggestedCommit={suggestedCommit}
          conversationId={activeConversationId}
          focusSubAgentId={focusSubAgentId}
          pendingTerminalCommand={pendingTerminalCommand}
          onPendingTerminalCommandSent={() => setPendingTerminalCommand(null)}
          terminalClearTick={terminalClearTick}
          onSendReviewComments={(prompt) => {
            setPage('chat')
            void dispatchTurnRef.current(prompt)
          }}
        />
        )}
        <ShortcutsHelp open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onRun={(cmd) => {
            void handlePaletteCommand(cmd)
          }}
        />
      </div>
    </div>
  )
}
