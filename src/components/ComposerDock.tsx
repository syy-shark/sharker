/**
 * 输入区独立树：直播 token 不重绘 composer（对标 Codex 流式时输入框保持跟手）。
 * 划选进 Selection 芯片，不灌 textarea；发送收成官方 `# Selected text:`（对标 Codex selected-text previews）。
 * 输入框下方有沙箱 / 完整权限芯片（对标 Codex permissions control beneath the composer）。
 * 模型旁有思考档位条、Fast 芯片，以及可选上下文用量环（对标 Codex composer gauge / `/fast` / Show context window usage）。
 * @see src/components/ARCH.md
 */
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { ArrowUp, FileText, Folder, Mic, Quote } from 'lucide-react'
import type {
  ChatAttachment,
  ChatMessage,
  PermissionMode,
  ProviderConfig,
  WorkspaceItem
} from '../../shared/types'
import {
  PERMISSION_MODES,
  permissionModeChipLabel,
  permissionModeChipTitle
} from '../../shared/permission-mode'
import {
  interruptTurnChordLabel,
  shouldInterruptTurn,
  type KeymapOverrides
} from '../../shared/keymap'
import { filterWorkspaces, sortWorkspaces } from '../../shared/workspace'
import type { PromptSubmitMode } from '../types/chat'
import { ModelPicker } from './ModelPicker'
import { ReasoningGauge } from './ReasoningGauge'
import {
  defaultThinkingLevel,
  resolveThinkingOptions
} from '../../shared/thinking-levels'
import { isFastThinkingLevel, nextFastThinkingLevel } from '../../shared/fast-mode'
import {
  BANG_SLASH_COMMAND,
  composerSlashLine,
  SLASH_COMMANDS,
  slashItemsWithSkills,
  type SlashCommandMeta
} from '../../shared/slash-commands'
import { parseBangCommand } from '../../shared/bang-command'
import { insertAtMention, parseAtMention } from '../../shared/at-mention'
import { chatMentionToken, filterChatMentions } from '../../shared/chat-mention'
import {
  collectBoundSkills,
  filterSkillMentions,
  insertSkillFromAtMention,
  insertSkillMention,
  parseSkillMention,
  removeBoundSkill,
  type SkillListItem
} from '../../shared/skill-mention'
import {
  clearComposerDraft,
  composerDraftKey,
  loadComposerDraft,
  saveComposerDraft
} from '../../shared/composer-draft'
import {
  formatComposerInsert,
  mergeComposerInsert
} from '../../shared/side-chat-quote'
import {
  formatSelectedTextSubmit,
  normalizeSelectedTextDraft,
  selectedTextChipLabel,
  selectedTextTitle,
  type SelectedTextPreview
} from '../../shared/selected-text-preview'
import {
  collectUserPrompts,
  filterPromptHistory,
  lastUserPrompt,
  rememberSubmittedComposerPrompt,
  resolveApprovalHotkey,
  resolveComposerSubmit,
  restorePreviousComposerPrompt,
  isPlanModeToggleKey,
  shouldEditLastUserOnEscape,
  shouldQueueComposerSlash,
  formatBusyFollowUpPlaceholder,
  SEND_LABEL,
  STEER_LABEL,
  STOP_LABEL,
  type ComposerEnterBehavior,
  type FollowUpBehavior
} from '../../shared/composer-submit'
import {
  classifyPastedAttachment,
  composerEmptyAttachmentPrompt,
  decideClipboardPaste,
  hasAttachableNonImageFiles,
  materializeComposerInput,
  pastedTextAttachmentName,
  utf8ToBase64
} from '../../shared/composer-paste'
import {
  filterGitBranchRefs,
  gitBranchPickerLabel,
  gitBranchPickerRows,
  type GitBranchRef
} from '../../shared/git-branch-list'
import {
  appendDictationTranscript,
  isDictationShortcut,
  isVoiceChatShortcut,
  textForSpeech
} from '../../shared/composer-dictation'
import {
  chatSearchMatchHint,
  filterChatList,
  type ChatSearchItem
} from '../../shared/conversation'
import type { ThreadMode } from '../lib/thread-runtime'
import { type GoalCommand, type ThreadGoal } from '../../shared/thread-goal'
import {
  HAND_OFF_LABEL,
  LOCAL_LABEL,
  SEARCH_CHATS_LABEL,
  START_DICTATION_LABEL,
  START_VOICE_CHAT_LABEL,
  WORKTREE_LABEL
} from '../../shared/reveal-in-folder'
import { GoalProgressRow } from './GoalProgressRow'
import { ContextUsageDonut } from './ContextUsageDonut'
import './ChatView.css'

type MentionOption = { kind: 'file' | 'chat' | 'skill'; name: string; value: string; detail: string }
type SpeechRecResult = { isFinal: boolean; 0?: { transcript?: string } }
type SpeechRec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: { resultIndex: number; results: ArrayLike<SpeechRecResult> }) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function speechRecognitionCtor(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

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

export type ComposerDockHandle = { focus: () => void }

export type ComposerDockIntent =
  | 'mention'
  | 'skill'
  | 'model'
  | 'dictate'
  | 'voice'
  | 'project'
  | null

/** 深链覆盖、审查跟进或划选芯片；nonce 变化才写入，不跟直播 token 重绘 */
export type ComposerSeed = {
  nonce: number
  text: string
  mode?: 'replace' | 'append'
  /** 官方 selected-text previews：进芯片，不灌 textarea */
  selections?: SelectedTextPreview[]
}

export interface ComposerDockProps {
  sessionKey?: string | null
  workspaces: WorkspaceItem[]
  activeWorkspaceId: string
  providers: ProviderConfig[]
  activeProviderId: string
  onSelectProvider: (providerId: string, model: string) => void
  onThinkingLevelChange?: (providerId: string, level: string) => void
  messages: ChatMessage[]
  loading: boolean
  queuedCount: number
  onSend: (text: string, mode?: PromptSubmitMode, attachments?: ChatAttachment[]) => void
  onAbort: () => void
  onSlashAction?: (cmd: SlashCommandMeta, args: string) => void
  showHistoryPicker?: boolean
  onCloseHistoryPicker?: () => void
  conversationTitles?: ChatSearchItem[]
  onPickConversation?: (id: string) => void
  onSelectWorkspace?: (id: string) => void
  threadMode?: ThreadMode
  threadGoal?: ThreadGoal | null
  onGoalCommand?: (command: GoalCommand) => void
  goalEditTick?: number
  onThreadModeChange?: (mode: ThreadMode) => void
  worktreeBaseRef?: string
  onWorktreeBaseRefChange?: (ref: string) => void
  fileSearchRoot?: string
  /** 项目附加文件夹（对标 Codex secondary folders），只进 @ 搜索不改 Skill 根 */
  fileSearchExtraRoots?: string[]
  composerIntent?: ComposerDockIntent
  onComposerIntentHandled?: () => void
  queueHeld?: boolean
  onQueueHeldChange?: (held: boolean) => void
  speechHint?: string
  onSubmitted?: (mode: PromptSubmitMode) => void
  /** 深链 `prompt=`：只在 nonce 变化时写入，不跟直播 token 重绘 */
  composerSeed?: ComposerSeed | null
  /** 空输入 Esc+Esc：就地回编上一条用户气泡并分叉 */
  onEditLastUser?: () => void
  followUpBehavior?: FollowUpBehavior
  composerEnterBehavior?: ComposerEnterBehavior
  /** 审批打开时 Enter 允许 / Esc 拒绝（对标 Codex），不跟直播 token 变 */
  approvalOpen?: boolean
  approvalResponding?: boolean
  onApprovalHotkey?: (decision: 'once' | 'deny') => void
  /** Ask User 打开时禁用输入框（对标 Codex Answer the questions to continue） */
  userInputOpen?: boolean
  /** 计划模式芯片（对标 Codex /plan）；不跟直播 token 变 */
  planMode?: boolean
  onPlanModeChange?: (enabled: boolean) => void
  /** 输入框下方权限控件（对标 Codex permissions control beneath the composer） */
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  /** 停止当前回合和弦（默认 Esc，设置可改绑；IME 不触发） */
  keyboardShortcuts?: KeymapOverrides
  /** 输入框旁上下文用量环（对标 Codex Show context window usage；官方默认关） */
  showContextWindowUsage?: boolean
}

export const ComposerDock = memo(
  forwardRef<ComposerDockHandle, ComposerDockProps>(function ComposerDock(
    {
      sessionKey = null,
      workspaces,
      activeWorkspaceId,
      providers,
      activeProviderId,
      onSelectProvider,
      onThinkingLevelChange,
      messages,
      loading,
      queuedCount,
      onSend,
      onAbort,
      onSlashAction,
      showHistoryPicker,
      onCloseHistoryPicker,
      conversationTitles,
      onPickConversation,
      onSelectWorkspace,
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
      speechHint = '',
      onSubmitted,
      composerSeed = null,
      onEditLastUser,
      followUpBehavior = 'queue',
      composerEnterBehavior = 'enter',
      approvalOpen = false,
      approvalResponding = false,
      onApprovalHotkey,
      userInputOpen = false,
      planMode = false,
      onPlanModeChange,
      permissionMode = 'sandbox',
      onPermissionModeChange,
      keyboardShortcuts,
      showContextWindowUsage = false
    },
    ref
  ) {
    const interruptLabel = interruptTurnChordLabel(keyboardShortcuts)
    const [input, setInput] = useState(
      () => loadComposerDraft(composerDraftKey(sessionKey, activeWorkspaceId)).text
    )
    const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>(
      () => loadComposerDraft(composerDraftKey(sessionKey, activeWorkspaceId)).attachments
    )
    const [selectedTexts, setSelectedTexts] = useState<SelectedTextPreview[]>(
      () => loadComposerDraft(composerDraftKey(sessionKey, activeWorkspaceId)).selectedTexts ?? []
    )
    const [attachmentError, setAttachmentError] = useState('')
    const [pastePreviewId, setPastePreviewId] = useState<string | null>(null)
    const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null)
    const [composerFocus, setComposerFocus] = useState<'none' | 'pointer' | 'keyboard'>('none')
    const [historyActiveIndex, setHistoryActiveIndex] = useState(0)
    const historyActiveIndexRef = useRef(0)
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
    const [historyQuery, setHistoryQuery] = useState('')
    const [promptSearchOpen, setPromptSearchOpen] = useState(false)
    const [promptSearchQuery, setPromptSearchQuery] = useState('')
    const [promptSearchIndex, setPromptSearchIndex] = useState(0)
    const promptSearchIndexRef = useRef(0)
    const lastEscAtRef = useRef(0)
    const [dictating, setDictating] = useState(false)
    const [dictateInterim, setDictateInterim] = useState('')
    const [dictateError, setDictateError] = useState('')
    const [voiceChat, setVoiceChat] = useState(false)
    const [worktreeBranches, setWorktreeBranches] = useState<GitBranchRef[]>([])
    const [worktreeBranchOpen, setWorktreeBranchOpen] = useState(false)
    const [worktreeBranchQuery, setWorktreeBranchQuery] = useState('')
    const [worktreeBranchIndex, setWorktreeBranchIndex] = useState(0)
    const worktreeBranchIndexRef = useRef(0)
    const worktreeBranchSearchRef = useRef<HTMLInputElement>(null)
    const voiceChatRef = useRef(false)
    const inputRef = useRef(input)
    const attachmentsRef = useRef<ChatAttachment[]>(pendingAttachments)
    const selectedTextsRef = useRef<SelectedTextPreview[]>(selectedTexts)
    const loadingRef = useRef(false)
    const submitVoiceRef = useRef<(text: string) => void>(() => {})
    const wasLoadingRef = useRef(false)
    const historySearchRef = useRef<HTMLInputElement>(null)
    const projectSearchRef = useRef<HTMLInputElement>(null)
    const [projectPickerOpen, setProjectPickerOpen] = useState(false)
    const [projectQuery, setProjectQuery] = useState('')
    const [projectActiveIndex, setProjectActiveIndex] = useState(0)
    const projectActiveIndexRef = useRef(0)
    const recognitionRef = useRef<SpeechRec | null>(null)
    const toggleDictationRef = useRef<() => void>(() => {})
    const toggleVoiceChatRef = useRef<() => void>(() => {})
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const composerFocusOriginRef = useRef<'pointer' | 'keyboard'>('pointer')

    const historyHits = useMemo(
      () => filterChatList(conversationTitles ?? [], historyQuery),
      [conversationTitles, historyQuery]
    )
    const projectHits = useMemo(
      () => filterWorkspaces(sortWorkspaces(workspaces ?? []), projectQuery),
      [workspaces, projectQuery]
    )
    const worktreeBranchRows = useMemo(
      () => gitBranchPickerRows(filterGitBranchRefs(worktreeBranches, worktreeBranchQuery)),
      [worktreeBranches, worktreeBranchQuery]
    )
    const showProjectPicker = projectPickerOpen && !showHistoryPicker
    const showWorktreeBranchPicker =
      worktreeBranchOpen && threadMode === 'worktree' && !showHistoryPicker && !showProjectPicker

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus()
    }))

    useEffect(() => {
      historyActiveIndexRef.current = historyActiveIndex
    }, [historyActiveIndex])
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
        setHistoryQuery('')
        setProjectPickerOpen(false)
        setWorktreeBranchOpen(false)
        requestAnimationFrame(() => historySearchRef.current?.focus())
        return
      }
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
    }, [showHistoryPicker])

    useEffect(
      () => () => {
        if (historyCloseTimerRef.current) {
          clearTimeout(historyCloseTimerRef.current)
          historyCloseTimerRef.current = null
        }
      },
      []
    )

    useEffect(() => {
      if (!showHistoryPicker) return
      setHistoryActiveIndex(0)
      historyActiveIndexRef.current = 0
      const total = historyHits.length
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
          const item = historyHits[historyActiveIndexRef.current]
          if (!item) return
          e.preventDefault()
          onPickConversation?.(item.id)
          onCloseHistoryPicker?.()
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [showHistoryPicker, historyHits, onCloseHistoryPicker, onPickConversation])

    useEffect(() => {
      projectActiveIndexRef.current = projectActiveIndex
    }, [projectActiveIndex])

    useEffect(() => {
      if (!showProjectPicker) return
      setProjectActiveIndex(0)
      projectActiveIndexRef.current = 0
      const total = projectHits.length
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          setProjectPickerOpen(false)
          requestAnimationFrame(() => textareaRef.current?.focus())
          return
        }
        if (!total) return
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setProjectActiveIndex((i) => {
            const n = (i + 1) % total
            projectActiveIndexRef.current = n
            return n
          })
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setProjectActiveIndex((i) => {
            const n = (i - 1 + total) % total
            projectActiveIndexRef.current = n
            return n
          })
          return
        }
        if (e.key === 'Enter') {
          const item = projectHits[projectActiveIndexRef.current]
          if (!item) return
          e.preventDefault()
          onSelectWorkspace?.(item.id)
          setProjectPickerOpen(false)
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [showProjectPicker, projectHits, onSelectWorkspace])

    useEffect(() => {
      worktreeBranchIndexRef.current = worktreeBranchIndex
    }, [worktreeBranchIndex])

    useEffect(() => {
      if (!showWorktreeBranchPicker) return
      setWorktreeBranchIndex(0)
      worktreeBranchIndexRef.current = 0
      requestAnimationFrame(() => worktreeBranchSearchRef.current?.focus())
      const total = worktreeBranchRows.length
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          setWorktreeBranchOpen(false)
          requestAnimationFrame(() => textareaRef.current?.focus())
          return
        }
        if (!total) return
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setWorktreeBranchIndex((i) => {
            const n = (i + 1) % total
            worktreeBranchIndexRef.current = n
            return n
          })
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setWorktreeBranchIndex((i) => {
            const n = (i - 1 + total) % total
            worktreeBranchIndexRef.current = n
            return n
          })
          return
        }
        if (e.key === 'Enter') {
          const item = worktreeBranchRows[worktreeBranchIndexRef.current]
          if (!item) return
          e.preventDefault()
          onWorktreeBaseRefChange?.(item.ref)
          setWorktreeBranchOpen(false)
          requestAnimationFrame(() => textareaRef.current?.focus())
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [showWorktreeBranchPicker, worktreeBranchRows, onWorktreeBaseRefChange])

    const canSend = Boolean(
      input.trim() || pendingAttachments.length > 0 || selectedTexts.length > 0
    )
    const activeWorkspace =
      sortWorkspaces(workspaces ?? []).find((w) => w.id === activeWorkspaceId) ??
      sortWorkspaces(workspaces ?? [])[0]
    const slashQuery =
      !showHistoryPicker &&
      !showProjectPicker &&
      !slashDismissed &&
      input.startsWith('/') &&
      !input.includes('\n') &&
      !/\s/.test(input.slice(1))
        ? input.slice(1)
        : null
    const slashItems = slashQuery != null ? slashItemsWithSkills(slashQuery, skillCatalog) : []
    const showSlashMenu = slashItems.length > 0
    const promptHits = useMemo(
      () =>
        filterPromptHistory(
          collectUserPrompts(messages),
          promptSearchQuery || (promptSearchOpen ? input : '')
        ),
      [input, messages, promptSearchOpen, promptSearchQuery]
    )
    const showPromptSearch = promptSearchOpen && promptHits.length > 0
    const mentionQuery =
      !showHistoryPicker && !showProjectPicker && !showSlashMenu && !mentionDismissed
        ? parseAtMention(input, cursor)
        : null
    const chatMentionHits = useMemo(() => {
      if (!mentionQuery) return []
      return filterChatMentions(conversationTitles ?? [], mentionQuery.query, sessionKey).map((c) => ({
        kind: 'chat' as const,
        name: c.title || '对话',
        value: chatMentionToken(c.id),
        detail: '对话'
      }))
    }, [conversationTitles, mentionQuery, sessionKey])
    const fileMentionHits = useMemo(
      () =>
        mentionHits.map((hit) => ({
          kind: 'file' as const,
          name: hit.name,
          value: hit.relativePath,
          detail: hit.relativePath
        })),
      [mentionHits]
    )
    const skillMentionHits = useMemo(() => {
      if (!mentionQuery) return []
      return filterSkillMentions(skillCatalog, mentionQuery.query)
        .slice(0, 8)
        .map((skill) => ({
          kind: 'skill' as const,
          name: skill.name,
          value: skill.name,
          detail: skill.description || 'Skill'
        }))
    }, [mentionQuery, skillCatalog])
    const mentionOptions: MentionOption[] = useMemo(
      () => [...chatMentionHits, ...skillMentionHits, ...fileMentionHits],
      [chatMentionHits, skillMentionHits, fileMentionHits]
    )
    const boundSkills = useMemo(() => collectBoundSkills(input, skillCatalog), [input, skillCatalog])
    const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0]
    const thinkingOpts = useMemo(
      () => (activeProvider ? resolveThinkingOptions(activeProvider) : []),
      [activeProvider]
    )
    const thinkingValue =
      activeProvider && thinkingOpts.length
        ? activeProvider.thinkingLevel && thinkingOpts.some((o) => o.id === activeProvider.thinkingLevel)
          ? activeProvider.thinkingLevel
          : defaultThinkingLevel(activeProvider)
        : ''
    const showMentionMenu = Boolean(mentionQuery && mentionOptions.length)
    const skillQuery =
      !showHistoryPicker &&
      !showProjectPicker &&
      !showSlashMenu &&
      !showMentionMenu &&
      !skillDismissed
        ? parseSkillMention(input, cursor)
        : null
    const skillHits = skillQuery ? filterSkillMentions(skillCatalog, skillQuery.query) : []
    const showSkillMenu = Boolean(skillQuery && skillHits.length > 0)

    const syncTextareaHeight = () => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }

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
          .searchWorkspaceFiles(fileSearchRoot, mentionQuery.query, fileSearchExtraRoots)
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
    }, [fileSearchRoot, fileSearchExtraRoots, mentionQuery?.query, mentionQuery?.start])
    useEffect(() => {
      skillActiveIndexRef.current = skillActiveIndex
    }, [skillActiveIndex])
    useEffect(() => {
      setSkillActiveIndex(0)
      skillActiveIndexRef.current = 0
    }, [skillQuery?.query, skillQuery?.start])
    useEffect(() => {
      if (!window.sharker?.listSkills) return
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
    }, [fileSearchRoot])

    const applyComposerText = (next: { text: string; cursor: number }) => {
      setInput(next.text)
      setCursor(next.cursor)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(next.cursor, next.cursor)
        syncTextareaHeight()
      })
    }

    const pickMention = (hit: MentionOption) => {
      const next =
        hit.kind === 'skill'
          ? insertSkillFromAtMention(input, cursor, hit.value)
          : insertAtMention(input, cursor, hit.value)
      setMentionDismissed(false)
      applyComposerText(next)
    }
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
      if (composerIntent === 'dictate') {
        toggleDictationRef.current()
        onComposerIntentHandled?.()
        return
      }
      if (composerIntent === 'voice') {
        toggleVoiceChatRef.current()
        onComposerIntentHandled?.()
        return
      }
      if (composerIntent === 'model') {
        setModelOpenSignal((n) => n + 1)
        onComposerIntentHandled?.()
        return
      }
      if (composerIntent === 'project') {
        setWorktreeBranchOpen(false)
        setProjectPickerOpen(true)
        setProjectQuery('')
        setProjectActiveIndex(0)
        projectActiveIndexRef.current = 0
        onComposerIntentHandled?.()
        requestAnimationFrame(() => projectSearchRef.current?.focus())
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

    useEffect(() => {
      if (composerSeed?.selections?.length) {
        setSelectedTexts((cur) =>
          normalizeSelectedTextDraft([...cur, ...composerSeed.selections!])
        )
      }
      if (!composerSeed?.text) {
        if (composerSeed?.selections?.length) {
          requestAnimationFrame(() => textareaRef.current?.focus())
        }
        return
      }
      setInput((cur) =>
        composerSeed.mode === 'append' ? mergeComposerInsert(cur, composerSeed.text) : composerSeed.text
      )
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        const end = el.value.length
        setCursor(end)
        el.setSelectionRange(end, end)
        syncTextareaHeight()
      })
    }, [composerSeed])

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.isComposing) return
        if (
          isDictationShortcut({
            key: e.key,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            isComposing: e.isComposing
          })
        ) {
          e.preventDefault()
          toggleDictationRef.current()
          return
        }
        if (
          isVoiceChatShortcut({
            key: e.key,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            isComposing: e.isComposing
          })
        ) {
          e.preventDefault()
          toggleVoiceChatRef.current()
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
      if (cmd.action === 'insert_skill') {
        const next = insertSkillMention('/', 1, cmd.name)
        setInput(next.text)
        setCursor(next.cursor)
        setSlashDismissed(true)
        setSkillDismissed(true)
        requestAnimationFrame(() => {
          const el = textareaRef.current
          if (!el) return
          el.focus()
          el.setSelectionRange(next.cursor, next.cursor)
          syncTextareaHeight()
        })
        return
      }
      if (cmd.scope === 'ui' && onSlashAction) {
        if (loading && shouldQueueComposerSlash('queue')) {
          const line = composerSlashLine(input, cmd.name)
          setInput('')
          setPendingAttachments([])
          setSelectedTexts([])
          setSelectedPreviewId(null)
          setAttachmentError('')
          setSlashDismissed(true)
          onSubmitted?.('queue')
          onSend(line, 'queue', [])
          requestAnimationFrame(() => {
            syncTextareaHeight()
            textareaRef.current?.focus()
          })
          return
        }
        setInput('')
        setPendingAttachments([])
        setSelectedTexts([])
        setSelectedPreviewId(null)
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

    const pickPromptHistory = (text: string) => {
      setInput(text)
      setCursor(text.length)
      setPromptSearchOpen(false)
      setPromptSearchQuery('')
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(text.length, text.length)
        syncTextareaHeight()
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

    const stopDictation = useCallback(() => {
      const rec = recognitionRef.current
      recognitionRef.current = null
      try {
        rec?.stop()
      } catch {
        /* already stopped */
      }
      setDictating(false)
      setDictateInterim('')
    }, [])

    const startDictation = useCallback(() => {
      const Ctor = speechRecognitionCtor()
      if (!Ctor) {
        setDictateError('当前环境不支持听写')
        return
      }
      setDictateError('')
      const rec = new Ctor()
      rec.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-CN'
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (ev) => {
        let interim = ''
        let finals = ''
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const row = ev.results[i]
          const t = row?.[0]?.transcript || ''
          if (row?.isFinal) finals += t
          else interim += t
        }
        if (finals) {
          const next = appendDictationTranscript(inputRef.current, finals)
          setInput(next)
          inputRef.current = next
          requestAnimationFrame(() => syncTextareaHeight())
          if (voiceChatRef.current && next.trim()) submitVoiceRef.current(next.trim())
        }
        setDictateInterim(interim)
      }
      rec.onerror = (ev) => {
        if (ev.error === 'aborted' || ev.error === 'no-speech') return
        setDictateError(ev.error === 'not-allowed' ? '需要麦克风权限才能听写' : '听写失败')
        setDictating(false)
        setDictateInterim('')
        recognitionRef.current = null
      }
      rec.onend = () => {
        if (recognitionRef.current !== rec) return
        recognitionRef.current = null
        setDictating(false)
        setDictateInterim('')
      }
      recognitionRef.current = rec
      try {
        rec.start()
        setDictating(true)
        requestAnimationFrame(() => textareaRef.current?.focus())
      } catch {
        recognitionRef.current = null
        setDictateError('无法开始听写')
      }
    }, [])

    const toggleDictation = useCallback(() => {
      if (recognitionRef.current) stopDictation()
      else startDictation()
    }, [startDictation, stopDictation])
    toggleDictationRef.current = toggleDictation

    const toggleVoiceChat = useCallback(() => {
      const next = !voiceChatRef.current
      voiceChatRef.current = next
      setVoiceChat(next)
      if (next) {
        if (!recognitionRef.current) startDictation()
      } else {
        stopDictation()
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
      }
    }, [startDictation, stopDictation])
    toggleVoiceChatRef.current = toggleVoiceChat

    useEffect(() => {
      inputRef.current = input
    }, [input])
    useEffect(() => {
      attachmentsRef.current = pendingAttachments
    }, [pendingAttachments])
    useEffect(() => {
      selectedTextsRef.current = selectedTexts
    }, [selectedTexts])
    useEffect(() => {
      loadingRef.current = loading
    }, [loading])

    const draftKey = composerDraftKey(sessionKey, activeWorkspaceId)
    const draftKeyRef = useRef(draftKey)
    useEffect(() => {
      const prev = draftKeyRef.current
      if (prev === draftKey) return
      saveComposerDraft(prev, {
        text: inputRef.current,
        attachments: attachmentsRef.current,
        selectedTexts: selectedTextsRef.current
      })
      draftKeyRef.current = draftKey
      const next = loadComposerDraft(draftKey)
      setInput(next.text)
      inputRef.current = next.text
      setPendingAttachments(next.attachments)
      attachmentsRef.current = next.attachments
      const nextSelections = next.selectedTexts ?? []
      setSelectedTexts(nextSelections)
      selectedTextsRef.current = nextSelections
      setPastePreviewId(null)
      setSelectedPreviewId(null)
      setAttachmentError('')
    }, [draftKey])
    useEffect(
      () => () => {
        saveComposerDraft(draftKeyRef.current, {
          text: inputRef.current,
          attachments: attachmentsRef.current,
          selectedTexts: selectedTextsRef.current
        })
      },
      []
    )

    useEffect(() => {
      if (threadMode !== 'worktree' || !fileSearchRoot || !window.sharker.listGitBranches) {
        setWorktreeBranches([])
        return
      }
      let cancelled = false
      void window.sharker
        .listGitBranches(fileSearchRoot)
        .then((result) => {
          if (!cancelled) {
            setWorktreeBranches(
              result.isRepo
                ? result.items?.length
                  ? result.items
                  : result.branches.map((ref) => ({ ref, short: ref, source: 'local' as const }))
                : []
            )
          }
        })
        .catch(() => {
          if (!cancelled) setWorktreeBranches([])
        })
      return () => {
        cancelled = true
      }
    }, [threadMode, fileSearchRoot])

    useEffect(() => {
      if (threadMode !== 'worktree') setWorktreeBranchOpen(false)
    }, [threadMode])

    useEffect(() => {
      if (wasLoadingRef.current && !loading && voiceChatRef.current) {
        const spoken = textForSpeech(speechHint)
        if (spoken && typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel()
          const utter = new SpeechSynthesisUtterance(spoken)
          utter.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-CN'
          window.speechSynthesis.speak(utter)
        }
      }
      wasLoadingRef.current = loading
    }, [loading, speechHint])

    useEffect(
      () => () => {
        try {
          recognitionRef.current?.stop()
        } catch {
          /* ignore */
        }
        recognitionRef.current = null
      },
      []
    )

    useEffect(() => {
      syncTextareaHeight()
    }, [input])
    useEffect(() => {
      textareaRef.current?.focus()
    }, [sessionKey])
    useEffect(() => {
      if (!loading) requestAnimationFrame(() => textareaRef.current?.focus())
    }, [loading])

    const addPastedFiles = async (files: File[]) => {
      if (!files.length) return
      setAttachmentError('')
      const errors: string[] = []
      const saved: ChatAttachment[] = []
      for (const file of files) {
        const classified = classifyPastedAttachment(file.name || '', file.type || '')
        if (classified.kind === 'reject') {
          errors.push(`${file.name || '未命名文件'}：${classified.reason}`)
          continue
        }
        try {
          if (classified.kind === 'image') {
            saved.push(
              await window.sharker.saveAttachment({
                name: file.name || `clipboard-image.${classified.ext}`,
                mimeType: classified.mimeType,
                dataUrl: await readFileAsDataUrl(file)
              })
            )
            continue
          }
          const body = await file.text()
          const name = file.name || `attachment.${classified.ext}`
          const next = await window.sharker.saveAttachment({
            name,
            mimeType: classified.mimeType,
            dataUrl: `data:${classified.mimeType};base64,${utf8ToBase64(body)}`
          })
          saved.push({ ...next, kind: 'text', text: body, name })
        } catch (e) {
          errors.push(
            `${file.name || '未命名文件'}：${e instanceof Error ? e.message : String(e)}`
          )
        }
      }
      if (saved.length) setPendingAttachments((prev) => [...prev, ...saved])
      if (errors.length) setAttachmentError(errors.join(' '))
    }

    const addPastedText = async (text: string) => {
      const body = text
      if (!body.trim()) return
      setAttachmentError('')
      try {
        const name = pastedTextAttachmentName(
          pendingAttachments.filter((a) => a.kind === 'text').length
        )
        const saved = await window.sharker.saveAttachment({
          name,
          mimeType: 'text/plain',
          dataUrl: `data:text/plain;base64,${utf8ToBase64(body)}`
        })
        setPendingAttachments((prev) => [...prev, { ...saved, kind: 'text', text: body }])
        setPastePreviewId(saved.id)
      } catch (e) {
        setAttachmentError(e instanceof Error ? e.message : String(e))
      }
    }

    const revertPastedText = (id: string) => {
      const att = pendingAttachments.find((a) => a.id === id && a.kind === 'text')
      if (!att?.text) return
      setPendingAttachments((prev) => prev.filter((x) => x.id !== id))
      setPastePreviewId((cur) => (cur === id ? null : cur))
      setInput((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${att.text}` : att.text!))
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        const pos = el.value.length
        el.setSelectionRange(pos, pos)
        syncTextareaHeight()
      })
    }

    const submit = (mode: PromptSubmitMode = loading ? 'queue' : 'send') => {
      if (userInputOpen) return
      const resolved = materializeComposerInput(input, pendingAttachments)
      const t = resolved.text.trim()
      const attachments = resolved.attachments
      if (!t && attachments.length === 0 && selectedTexts.length === 0) return
      if (!shouldQueueComposerSlash(mode) && t.startsWith('/') && attachments.length === 0) {
        const body = t.slice(1).trim()
        const space = body.search(/\s/)
        const name = (space >= 0 ? body.slice(0, space) : body).toLowerCase()
        const args = space >= 0 ? body.slice(space + 1).trim() : ''
        const cmd = SLASH_COMMANDS.find((c) => c.name === name && c.scope === 'ui')
        if (cmd && onSlashAction) {
          clearComposerDraft(draftKey)
          setInput('')
          setPendingAttachments([])
          setSelectedTexts([])
          setPastePreviewId(null)
          setSelectedPreviewId(null)
          setAttachmentError('')
          onSlashAction(cmd, args)
          requestAnimationFrame(() => {
            syncTextareaHeight()
            textareaRef.current?.focus()
          })
          return
        }
      }
      const bang = attachments.length === 0 ? parseBangCommand(t) : null
      if (!shouldQueueComposerSlash(mode) && bang && onSlashAction) {
        clearComposerDraft(draftKey)
        setInput('')
        setPendingAttachments([])
        setSelectedTexts([])
        setPastePreviewId(null)
        setSelectedPreviewId(null)
        setAttachmentError('')
        onSlashAction(BANG_SLASH_COMMAND, bang)
        requestAnimationFrame(() => {
          syncTextareaHeight()
          textareaRef.current?.focus()
        })
        return
      }
      const ask = t || composerEmptyAttachmentPrompt(attachments)
      const sent = formatSelectedTextSubmit(selectedTexts, ask)
      rememberSubmittedComposerPrompt(sent)
      clearComposerDraft(draftKey)
      setInput('')
      setPendingAttachments([])
      setSelectedTexts([])
      setPastePreviewId(null)
      setSelectedPreviewId(null)
      setAttachmentError('')
      onSubmitted?.(mode)
      onSend(sent, mode, attachments)
      requestAnimationFrame(() => {
        syncTextareaHeight()
        textareaRef.current?.focus()
      })
    }

    submitVoiceRef.current = (text) => {
      const t = text.trim()
      if (!t && selectedTextsRef.current.length === 0) return
      const sent = formatSelectedTextSubmit(selectedTextsRef.current, t)
      if (!sent) return
      rememberSubmittedComposerPrompt(sent)
      clearComposerDraft(draftKey)
      setInput('')
      inputRef.current = ''
      setPendingAttachments([])
      setSelectedTexts([])
      selectedTextsRef.current = []
      setSelectedPreviewId(null)
      setAttachmentError('')
      const voiceMode = loadingRef.current ? 'queue' : 'send'
      onSubmitted?.(voiceMode)
      onSend(sent, voiceMode)
      requestAnimationFrame(() => {
        syncTextareaHeight()
        textareaRef.current?.focus()
      })
    }

    return (
      <>
      {threadGoal && onGoalCommand ? (
        <GoalProgressRow goal={threadGoal} onCommand={onGoalCommand} editTick={goalEditTick} />
      ) : null}
      <div
        className={`composer-box composer-box--focus-${composerFocus}`}
        onFocusCapture={() => setComposerFocus(composerFocusOriginRef.current)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setComposerFocus('none')
          }
        }}
      >
        {showMentionMenu ? (
          <div className="composer-popover-slot">
            <div
              className="slash-menu popover-enter"
              role="listbox"
              aria-label="引用文件、对话或 Skill"
              aria-activedescendant={
                mentionOptions[mentionActiveIndex] ? `mention-option-${mentionActiveIndex}` : undefined
              }
            >
              <ul className="slash-menu-list">
                {mentionOptions.map((hit, index) => (
                  <li key={`${hit.kind}-${hit.value}`} role="presentation">
                    <button
                      type="button"
                      id={`mention-option-${index}`}
                      role="option"
                      aria-selected={index === mentionActiveIndex}
                      className={`slash-menu-item${index === mentionActiveIndex ? ' slash-menu-item--active' : ''}`}
                      onMouseEnter={() => {
                        setMentionActiveIndex(index)
                        mentionActiveIndexRef.current = index
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickMention(hit)
                      }}
                    >
                      <span className="slash-menu-name">
                        {hit.kind === 'skill' ? `$${hit.name}` : `@${hit.name}`}
                      </span>
                      <span className="slash-menu-desc">{hit.detail}</span>
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
                skillHits[skillActiveIndex] ? `skill-option-${skillHits[skillActiveIndex].name}` : undefined
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
                slashItems[slashActiveIndex] ? `slash-option-${slashItems[slashActiveIndex].name}` : undefined
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
                      <span className="slash-menu-name">
                        {cmd.action === 'insert_skill' ? `$${cmd.name}` : `/${cmd.name}`}
                      </span>
                      <span className="slash-menu-desc">{cmd.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        {showProjectPicker ? (
          <div className="composer-popover-slot">
            <div
              className="slash-menu history-picker popover-enter"
              role="listbox"
              aria-label="打开项目"
              aria-activedescendant={
                projectHits[projectActiveIndex]
                  ? `project-option-${projectHits[projectActiveIndex].id}`
                  : undefined
              }
            >
              <input
                ref={projectSearchRef}
                className="history-picker-search"
                value={projectQuery}
                placeholder="搜索项目名称或路径…"
                aria-label="搜索项目"
                onChange={(e) => {
                  setProjectQuery(e.target.value)
                  setProjectActiveIndex(0)
                  projectActiveIndexRef.current = 0
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') e.preventDefault()
                }}
              />
              <ul className="slash-menu-list">
                {projectHits.length ? (
                  projectHits.map((w, index) => (
                    <li key={w.id} role="presentation">
                      <button
                        type="button"
                        id={`project-option-${w.id}`}
                        role="option"
                        aria-selected={index === projectActiveIndex}
                        className={`slash-menu-item${index === projectActiveIndex ? ' slash-menu-item--active' : ''}`}
                        onMouseEnter={() => {
                          setProjectActiveIndex(index)
                          projectActiveIndexRef.current = index
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onSelectWorkspace?.(w.id)
                          setProjectPickerOpen(false)
                        }}
                      >
                        <span className="history-picker-hit">
                          <span className="slash-menu-desc">{w.label || w.path || '未命名项目'}</span>
                          {w.path && w.label ? (
                            <span className="history-picker-hint">{w.path}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="slash-menu-empty">没有匹配的项目</li>
                )}
              </ul>
            </div>
          </div>
        ) : null}
        {showWorktreeBranchPicker ? (
          <div className="composer-popover-slot">
            <div
              className="slash-menu history-picker popover-enter"
              role="listbox"
              aria-label="隔离 worktree 起点分支"
              aria-activedescendant={
                worktreeBranchRows[worktreeBranchIndex]
                  ? `worktree-branch-${worktreeBranchRows[worktreeBranchIndex].ref || 'HEAD'}`
                  : undefined
              }
            >
              <input
                ref={worktreeBranchSearchRef}
                className="history-picker-search"
                value={worktreeBranchQuery}
                placeholder="搜索本地或远程分支…"
                aria-label="搜索起点分支"
                onChange={(e) => {
                  setWorktreeBranchQuery(e.target.value)
                  setWorktreeBranchIndex(0)
                  worktreeBranchIndexRef.current = 0
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') e.preventDefault()
                }}
              />
              <ul className="slash-menu-list">
                {worktreeBranchRows.length ? (
                  worktreeBranchRows.map((row, index) => (
                    <li key={row.ref || 'HEAD'} role="presentation">
                      <button
                        type="button"
                        id={`worktree-branch-${row.ref || 'HEAD'}`}
                        role="option"
                        aria-selected={index === worktreeBranchIndex}
                        className={`slash-menu-item${index === worktreeBranchIndex ? ' slash-menu-item--active' : ''}`}
                        onMouseEnter={() => {
                          setWorktreeBranchIndex(index)
                          worktreeBranchIndexRef.current = index
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onWorktreeBaseRefChange?.(row.ref)
                          setWorktreeBranchOpen(false)
                          requestAnimationFrame(() => textareaRef.current?.focus())
                        }}
                      >
                        <span className="history-picker-hit">
                          <span className="slash-menu-name">{row.label}</span>
                          {row.source === 'remote' ? (
                            <span className="history-picker-hint">远程</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="slash-menu-empty">没有匹配的分支</li>
                )}
              </ul>
            </div>
          </div>
        ) : null}
        {historyMounted ? (
          <div className="composer-popover-slot">
            <div
              className={`slash-menu history-picker ${historyExiting ? 'popover-exit' : 'popover-enter'}`.trim()}
              role="listbox"
              aria-label={SEARCH_CHATS_LABEL}
              aria-activedescendant={
                historyHits[historyActiveIndex]
                  ? `history-option-${historyHits[historyActiveIndex].id}`
                  : undefined
              }
            >
              <input
                ref={historySearchRef}
                className="history-picker-search"
                value={historyQuery}
                placeholder="搜索标题、正文或分支…"
                aria-label={SEARCH_CHATS_LABEL}
                onChange={(e) => {
                  setHistoryQuery(e.target.value)
                  setHistoryActiveIndex(0)
                  historyActiveIndexRef.current = 0
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') e.preventDefault()
                }}
              />
              <ul className="slash-menu-list">
                {historyHits.length ? (
                  historyHits.map((c, index) => (
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
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onPickConversation?.(c.id)
                          onCloseHistoryPicker?.()
                        }}
                      >
                        <span className="history-picker-hit">
                          <span className="slash-menu-desc">{c.title || '未命名对话'}</span>
                          {(() => {
                            const hint = chatSearchMatchHint(c, historyQuery)
                            return hint ? (
                              <span className="history-picker-hint">{hint}</span>
                            ) : null
                          })()}
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="slash-menu-empty">没有匹配的对话</li>
                )}
              </ul>
            </div>
          </div>
        ) : null}
        {showPromptSearch ? (
          <div className="composer-popover-slot">
            <div
              className="slash-menu popover-enter"
              role="listbox"
              aria-label="提示历史"
              aria-activedescendant={
                promptHits[promptSearchIndex] ? `prompt-option-${promptSearchIndex}` : undefined
              }
            >
              <ul className="slash-menu-list">
                {promptHits.map((text, index) => (
                  <li key={`${index}-${text.slice(0, 24)}`} role="presentation">
                    <button
                      type="button"
                      id={`prompt-option-${index}`}
                      role="option"
                      aria-selected={index === promptSearchIndex}
                      className={`slash-menu-item${index === promptSearchIndex ? ' slash-menu-item--active' : ''}`}
                      onMouseEnter={() => {
                        setPromptSearchIndex(index)
                        promptSearchIndexRef.current = index
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickPromptHistory(text)
                      }}
                    >
                      <span className="slash-menu-desc">{text}</span>
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
            const composing =
              e.nativeEvent.isComposing ||
              e.key === 'Process' ||
              (e.nativeEvent as KeyboardEvent).keyCode === 229
            if (
              !composing &&
              (e.metaKey || e.ctrlKey) &&
              !e.altKey &&
              !e.shiftKey &&
              e.key.toLowerCase() === 'r'
            ) {
              e.preventDefault()
              if (promptSearchOpen) {
                setPromptSearchIndex((i) => {
                  const n = promptHits.length ? (i + 1) % promptHits.length : 0
                  promptSearchIndexRef.current = n
                  return n
                })
                return
              }
              setPromptSearchOpen(true)
              setPromptSearchQuery('')
              setPromptSearchIndex(0)
              promptSearchIndexRef.current = 0
              return
            }
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
              if (
                (e.key === 'Enter' && !e.shiftKey) ||
                (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey)
              ) {
                e.preventDefault()
                const hit = skillHits[skillActiveIndexRef.current]
                if (hit) pickSkill(hit.name)
                return
              }
            }
            if (showMentionMenu && mentionOptions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMentionActiveIndex((i) => {
                  const n = (i + 1) % mentionOptions.length
                  mentionActiveIndexRef.current = n
                  return n
                })
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMentionActiveIndex((i) => {
                  const n = (i - 1 + mentionOptions.length) % mentionOptions.length
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
              if (
                (e.key === 'Enter' && !e.shiftKey) ||
                (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey)
              ) {
                e.preventDefault()
                const hit = mentionOptions[mentionActiveIndexRef.current]
                if (hit) pickMention(hit)
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
              if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault()
                const cmd = slashItems[slashActiveIndexRef.current]
                if (cmd) pickSlashCommand(cmd)
                return
              }
            }
            if (showPromptSearch) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setPromptSearchIndex((i) => {
                  const n = (i + 1) % promptHits.length
                  promptSearchIndexRef.current = n
                  return n
                })
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setPromptSearchIndex((i) => {
                  const n = (i - 1 + promptHits.length) % promptHits.length
                  promptSearchIndexRef.current = n
                  return n
                })
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setPromptSearchOpen(false)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const hit = promptHits[promptSearchIndexRef.current]
                if (hit) pickPromptHistory(hit)
                return
              }
            }
            const menuOpen =
              showMentionMenu ||
              showSkillMenu ||
              showSlashMenu ||
              historyMounted ||
              showPromptSearch
            if (
              onPlanModeChange &&
              isPlanModeToggleKey({
                key: e.key,
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
                altKey: e.altKey,
                menuOpen
              })
            ) {
              e.preventDefault()
              onPlanModeChange(!planMode)
              return
            }
            const approvalChoice = resolveApprovalHotkey({
              approvalOpen,
              responding: approvalResponding,
              key: e.key,
              shiftKey: e.shiftKey,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey,
              altKey: e.altKey,
              menuOpen
            })
            if (approvalChoice && onApprovalHotkey) {
              e.preventDefault()
              void onApprovalHotkey(approvalChoice)
              return
            }
            if (
              loading &&
              !menuOpen &&
              shouldInterruptTurn(
                {
                  key: e.key,
                  code: e.code,
                  metaKey: e.metaKey,
                  ctrlKey: e.ctrlKey,
                  altKey: e.altKey,
                  shiftKey: e.shiftKey,
                  isComposing: composing,
                  keyCode: (e.nativeEvent as KeyboardEvent).keyCode
                },
                keyboardShortcuts
              )
            ) {
              e.preventDefault()
              onAbort()
              return
            }
            if (e.key === 'Escape' && !menuOpen && !loading) {
              const now = Date.now()
              if (
                shouldEditLastUserOnEscape({
                  input,
                  loading,
                  menuOpen,
                  prevEscAt: lastEscAtRef.current,
                  now
                })
              ) {
                e.preventDefault()
                lastEscAtRef.current = 0
                if (onEditLastUser) {
                  onEditLastUser()
                  return
                }
                const prev = lastUserPrompt(messages)
                if (prev) pickPromptHistory(prev)
                return
              }
              lastEscAtRef.current = now
            }
            if (e.key === 'ArrowUp' && !menuOpen) {
              const prev = restorePreviousComposerPrompt({ input, messages })
              if (prev) {
                e.preventDefault()
                setInput(prev)
                setCursor(prev.length)
                requestAnimationFrame(() => {
                  const el = textareaRef.current
                  if (!el) return
                  el.focus()
                  el.setSelectionRange(prev.length, prev.length)
                  syncTextareaHeight()
                })
                return
              }
            }
            if (userInputOpen) {
              if (e.key === 'Enter' && !e.shiftKey) e.preventDefault()
              return
            }
            const mode = resolveComposerSubmit({
              key: e.key,
              shiftKey: e.shiftKey,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey,
              altKey: e.altKey,
              loading,
              menuOpen,
              followUpBehavior,
              enterBehavior: composerEnterBehavior,
              multiline: input.includes('\n')
            })
            if (mode) {
              e.preventDefault()
              submit(mode)
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files)
            const decision = decideClipboardPaste({
              getData: (type) => e.clipboardData.getData(type),
              hasImageFiles: files.some((f) => f.type.startsWith('image/')),
              hasNonImageFiles: hasAttachableNonImageFiles(files),
              forcePlainText: e.shiftKey
            })
            if (decision.action === 'insert_text') return
            if (decision.action === 'attach_text') {
              e.preventDefault()
              void addPastedText(decision.text)
              return
            }
            if (decision.action === 'attach_files' || decision.action === 'attach_images') {
              e.preventDefault()
              void addPastedFiles(files)
            }
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files)
            if (
              files.some((f) => f.type.startsWith('image/')) ||
              hasAttachableNonImageFiles(files)
            ) {
              e.preventDefault()
              void addPastedFiles(files)
            }
          }}
          onDragOver={(e) => {
            const items = Array.from(e.dataTransfer.items)
            if (
              items.some((i) => i.kind === 'file') ||
              items.some((i) => i.type.startsWith('image/'))
            ) {
              e.preventDefault()
            }
          }}
          disabled={userInputOpen}
          placeholder={
            userInputOpen
              ? '请先回答问题后再继续。'
              : dictating
                ? '正在听写… Ctrl⇧D 结束'
                : loading
                  ? formatBusyFollowUpPlaceholder({ followUpBehavior, interruptLabel })
                  : composerEnterBehavior === 'cmdAlways' ||
                      (composerEnterBehavior === 'cmdIfMultiline' && input.includes('\n'))
                    ? '⌘Enter 发送，Enter 换行。/ 命令，! shell，@ 文件/对话/Skill，$ Skill…'
                    : composerEnterBehavior === 'cmdIfMultiline'
                      ? 'Enter 发送，多行后需 ⌘Enter。/ 命令，! shell，@ 文件/对话/Skill，$ Skill…'
                      : '输入消息，/ 命令，! shell，@ 文件/对话/Skill，$ Skill，Ctrl+R 历史，Esc Esc 回编…'
          }
          rows={1}
        />
        {boundSkills.length > 0 ? (
          <div className="composer-skill-chips" aria-label="将使用的 Skill">
            {boundSkills.map((skill) => (
              <button
                key={skill.name}
                type="button"
                className="composer-skill-chip glass-pill"
                title={skill.description || skill.name}
                onClick={() => {
                  const next = removeBoundSkill(input, skill.name)
                  setInput(next)
                  inputRef.current = next
                  requestAnimationFrame(() => {
                    const el = textareaRef.current
                    if (!el) return
                    el.focus()
                    el.setSelectionRange(next.length, next.length)
                    syncTextareaHeight()
                  })
                }}
              >
                <span className="composer-skill-chip-name">${skill.name}</span>
                {skill.description ? (
                  <span className="composer-skill-chip-desc">{skill.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {pendingAttachments.length > 0 || selectedTexts.length > 0 || attachmentError ? (
          <div className="composer-attachments">
            {selectedTexts.map((sel, index) => (
              <div key={sel.id} className="composer-attachment composer-attachment--text composer-attachment--selection">
                <Quote size={16} strokeWidth={2} aria-hidden />
                <button
                  type="button"
                  className="composer-attachment-name"
                  title={`${selectedTextTitle(index)} · 预览划选`}
                  onClick={() =>
                    setSelectedPreviewId((cur) => (cur === sel.id ? null : sel.id))
                  }
                >
                  {selectedTextChipLabel(sel.text) || selectedTextTitle(index)}
                </button>
                <button
                  type="button"
                  className="composer-attachment-revert"
                  onClick={() => {
                    const insert = formatComposerInsert(sel.text, sel.source)
                    setInput((cur) => mergeComposerInsert(cur, insert))
                    setSelectedTexts((prev) => prev.filter((item) => item.id !== sel.id))
                    setSelectedPreviewId((cur) => (cur === sel.id ? null : cur))
                    requestAnimationFrame(() => {
                      const el = textareaRef.current
                      if (!el) return
                      el.focus()
                      const end = el.value.length
                      setCursor(end)
                      el.setSelectionRange(end, end)
                      syncTextareaHeight()
                    })
                  }}
                >
                  插入正文
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTexts((prev) => prev.filter((item) => item.id !== sel.id))
                    setSelectedPreviewId((cur) => (cur === sel.id ? null : cur))
                  }}
                  aria-label={`移除 ${selectedTextTitle(index)}`}
                >
                  ×
                </button>
              </div>
            ))}
            {selectedPreviewId
              ? (() => {
                  const preview = selectedTexts.find((item) => item.id === selectedPreviewId)
                  return preview?.text ? (
                    <>
                      <pre className="composer-paste-preview" tabIndex={0}>
                        {preview.text}
                      </pre>
                      <input
                        type="text"
                        className="composer-selection-comment"
                        value={preview.comment ?? ''}
                        placeholder="给这段划选加备注（可选）"
                        aria-label="划选备注"
                        onChange={(event) => {
                          const comment = event.target.value
                          setSelectedTexts((prev) =>
                            prev.map((item) =>
                              item.id === preview.id ? { ...item, comment } : item
                            )
                          )
                        }}
                      />
                    </>
                  ) : null
                })()
              : null}
            {pendingAttachments.map((a) => (
              <div
                key={a.id}
                className={`composer-attachment${a.kind === 'text' ? ' composer-attachment--text' : ''}`}
              >
                {a.kind === 'text' ? (
                  <FileText size={16} strokeWidth={2} aria-hidden />
                ) : (
                  <AttachmentImage attachment={a} />
                )}
                <button
                  type="button"
                  className="composer-attachment-name"
                  title={a.kind === 'text' ? '预览附件' : a.name}
                  onClick={() =>
                    a.kind === 'text'
                      ? setPastePreviewId((cur) => (cur === a.id ? null : a.id))
                      : undefined
                  }
                >
                  {a.name}
                </button>
                {a.kind === 'text' ? (
                  <button
                    type="button"
                    className="composer-attachment-revert"
                    onClick={() => revertPastedText(a.id)}
                  >
                    插入正文
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))
                    setPastePreviewId((cur) => (cur === a.id ? null : cur))
                  }}
                  aria-label={`移除 ${a.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            {pastePreviewId
              ? (() => {
                  const preview = pendingAttachments.find((a) => a.id === pastePreviewId)
                  return preview?.text ? (
                    <pre className="composer-paste-preview" tabIndex={0}>
                      {preview.text}
                    </pre>
                  ) : null
                })()
              : null}
            {attachmentError ? <span className="composer-attachment-error">{attachmentError}</span> : null}
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
            {onPermissionModeChange ? (
              <div className="composer-thread-mode" role="group" aria-label="权限">
                {PERMISSION_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`composer-thread-chip${permissionMode === mode ? ' is-active' : ''}`}
                    aria-pressed={permissionMode === mode}
                    onClick={() => onPermissionModeChange(mode)}
                    title={permissionModeChipTitle(mode)}
                  >
                    {permissionModeChipLabel(mode)}
                  </button>
                ))}
              </div>
            ) : null}
            {onPlanModeChange ? (
              <button
                type="button"
                className={`composer-thread-chip${planMode ? ' is-active' : ''}`}
                aria-pressed={planMode}
                onClick={() => onPlanModeChange(!planMode)}
                title={
                  planMode
                    ? '退出计划模式（Shift+Tab）'
                    : '进入计划模式（Shift+Tab，只读调研，不改文件）'
                }
              >
                计划
              </button>
            ) : null}
            {onThreadModeChange ? (
              <div className="composer-thread-mode" role="group" aria-label="线程模式">
                <button
                  type="button"
                  className={`composer-thread-chip${threadMode === 'local' ? ' is-active' : ''}`}
                  aria-pressed={threadMode === 'local'}
                  onClick={() => onThreadModeChange('local')}
                  title={HAND_OFF_LABEL}
                >
                  {LOCAL_LABEL}
                </button>
                <button
                  type="button"
                  className={`composer-thread-chip${threadMode === 'worktree' ? ' is-active' : ''}`}
                  aria-pressed={threadMode === 'worktree'}
                  onClick={() => onThreadModeChange('worktree')}
                  title={HAND_OFF_LABEL}
                >
                  {WORKTREE_LABEL}
                </button>
              </div>
            ) : null}
            {onThreadModeChange && threadMode === 'worktree' ? (
              <div className="composer-worktree-base">
                <span className="composer-worktree-base-label">起点</span>
                <button
                  type="button"
                  className={`composer-worktree-base-select${showWorktreeBranchPicker ? ' is-open' : ''}`}
                  aria-label="隔离 worktree 起点分支"
                  aria-expanded={showWorktreeBranchPicker}
                  aria-haspopup="listbox"
                  title="搜索本地或远程分支（对标 Codex local branch search）"
                  onClick={() => {
                    setProjectPickerOpen(false)
                    onCloseHistoryPicker?.()
                    setWorktreeBranchQuery('')
                    setWorktreeBranchIndex(0)
                    worktreeBranchIndexRef.current = 0
                    setWorktreeBranchOpen((open) => !open)
                  }}
                >
                  {gitBranchPickerLabel(worktreeBaseRef, worktreeBranches)}
                </button>
              </div>
            ) : null}
            {dictating && dictateInterim ? (
              <span className="composer-dictate-interim">{dictateInterim}</span>
            ) : null}
            {dictateError ? <span className="composer-dictate-error">{dictateError}</span> : null}
          </div>
          <div className="composer-footer-right">
            <button
              type="button"
              className={`composer-mic${dictating && !voiceChat ? ' is-active' : ''}`}
              onClick={() => toggleDictation()}
              title={dictating && !voiceChat ? '停止听写（Ctrl⇧D）' : `${START_DICTATION_LABEL} (Ctrl⇧D)`}
              aria-label={dictating && !voiceChat ? '停止听写' : START_DICTATION_LABEL}
              aria-pressed={dictating && !voiceChat}
            >
              <Mic size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={`composer-jump${voiceChat ? ' is-active' : ''}`}
              onClick={() => toggleVoiceChat()}
              title={voiceChat ? '结束语音对话（Ctrl⇧V）' : `${START_VOICE_CHAT_LABEL} (Ctrl⇧V)`}
              aria-pressed={voiceChat}
            >
              {voiceChat ? '语音中' : '语音'}
            </button>
            <ModelPicker
              providers={providers}
              activeProviderId={activeProviderId}
              onSelect={onSelectProvider}
              onThinkingLevelChange={onThinkingLevelChange}
              openSignal={modelOpenSignal}
            />
            {showContextWindowUsage ? (
              <ContextUsageDonut
                messages={messages}
                draft={input}
                providers={providers}
                activeProviderId={activeProviderId}
              />
            ) : null}
            {thinkingOpts.length > 1 && onThinkingLevelChange && activeProvider ? (
              <ReasoningGauge
                options={thinkingOpts}
                value={thinkingValue}
                onChange={(level) => onThinkingLevelChange(activeProvider.id, level)}
              />
            ) : null}
            {thinkingOpts.length > 0 && onThinkingLevelChange && activeProvider ? (
              <button
                type="button"
                className={`composer-jump${isFastThinkingLevel(thinkingValue) ? ' is-active' : ''}`}
                aria-pressed={isFastThinkingLevel(thinkingValue)}
                onClick={() => {
                  const next = nextFastThinkingLevel(
                    thinkingOpts,
                    thinkingValue,
                    defaultThinkingLevel(activeProvider)
                  )
                  if (next) onThinkingLevelChange(activeProvider.id, next)
                }}
                title={
                  isFastThinkingLevel(thinkingValue)
                    ? '关闭 Fast（回到默认思考档）'
                    : '开启 Fast（最低思考档，对标 Codex /fast）'
                }
              >
                Fast
              </button>
            ) : null}
            {onQueueHeldChange && (loading || queuedCount > 0 || queueHeld) ? (
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
                title="Steer: add to the current turn without stopping the live stream (Enter)"
                aria-label="Steer into the current turn"
              >
                {STEER_LABEL}
              </button>
            ) : null}
            <span className="composer-send-slot" data-mode={loading ? 'stop' : 'send'}>
              <button
                type="button"
                className={`composer-send composer-send--stop ${loading ? 'composer-send--visible' : ''}`}
                onClick={onAbort}
                title={STOP_LABEL}
                aria-label={STOP_LABEL}
                aria-hidden={!loading}
                tabIndex={loading ? 0 : -1}
              >
                <span className="composer-send-stop" />
              </button>
              <button
                type="button"
                className={`composer-send composer-send--submit ${canSend ? 'composer-send--active' : ''} ${!loading ? 'composer-send--visible' : ''}`}
                onClick={() => submit('send')}
                disabled={!canSend || loading || userInputOpen}
                title={SEND_LABEL}
                aria-label={SEND_LABEL}
                aria-hidden={loading}
                tabIndex={loading ? -1 : 0}
              >
                <ArrowUp size={16} aria-hidden />
              </button>
            </span>
          </div>
        </div>
      </div>
      </>
    )
  })
)

ComposerDock.displayName = 'ComposerDock'
