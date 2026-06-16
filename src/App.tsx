/**
 * 应用根组件：全局状态、发送/流式、设置与工作区/对话切换
 * @see src/README.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationSummary } from '../shared/conversation'
import { deriveConversationTitle } from '../shared/conversation'
import type { AppSettings, ApprovalRequest, AssistantMeta, ChatMessage, TurnSegment } from '../shared/types'
import {
  activitiesFromSkills,
  extractBrowsedPaths,
  formatToolActivity
} from '../shared/turn-meta'
import {
  activitiesFromSegments,
  applyStreamChunk,
  browsedFilesFromSegments,
  cloneSegments,
  extractFinalContent,
  finalizeSegments,
  thinkingPreviewFromSegments
} from '../shared/turn-segments'
import { DEFAULT_SETTINGS } from '../shared/types'
import { validateActiveProvider } from '../shared/provider-validate'
import {
  getActiveWorkspacePath,
  HOME_WORKSPACE_ID,
  sortWorkspaces,
  withActiveWorkspace
} from '../shared/workspace'
import { ChatView } from './components/ChatView'
import { ApprovalModal } from './components/ApprovalModal'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { SettingsPage } from './pages/SettingsPage'
import type { QueuedPrompt, PromptSubmitMode } from './types/chat'
import type { AppPage, SettingsTab } from './types/navigation'
import './App.css'

/** 根组件：全局状态、IPC 流式、工作区/对话/设置路由 */
export default function App() {
  useEffect(() => {
    const customChrome = window.sharker.platform !== 'darwin'
    document.documentElement.classList.toggle('window-rounded', customChrome)
    return () => document.documentElement.classList.remove('window-rounded')
  }, [])

  /** 全局状态与 ref 镜像，供 IPC 回调与节流刷新读取 */
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [page, setPage] = useState<AppPage>('chat')
  const pageRef = useRef<AppPage>('chat')
  const settingsDraftRef = useRef<AppSettings>(DEFAULT_SETTINGS)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('models')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [liveSegments, setLiveSegments] = useState<TurnSegment[]>([])
  const [streaming, setStreaming] = useState('')
  const [turnThinking, setTurnThinking] = useState('')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [liveTurnMeta, setLiveTurnMeta] = useState<AssistantMeta | null>(null)
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)
  const [turnHadThinking, setTurnHadThinking] = useState(false)
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([])
  const sendInFlightRef = useRef(false)
  const queuedPromptsRef = useRef<QueuedPrompt[]>([])
  const dispatchTurnRef = useRef<(text: string) => Promise<void>>(async () => {})
  const doneCommittedRef = useRef(false)
  const streamingRef = useRef('')
  const turnThinkingRef = useRef('')
  const segmentsRef = useRef<TurnSegment[]>([])
  const streamRafRef = useRef<number | null>(null)
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStreamRenderAt = useRef(0)
  const thinkRafRef = useRef<number | null>(null)
  const SEGMENT_RENDER_MS = 64
  const settingsRef = useRef(settings)
  const messagesRef = useRef<ChatMessage[]>([])
  const activeConversationIdRef = useRef<string | null>(null)
  const turnStartedAtRef = useRef(0)
  const turnMetaRef = useRef<AssistantMeta>({ browsedFiles: [], activities: [] })
  const turnHadThinkingRef = useRef(false)

  const activeWorkspaceId = settings.activeWorkspaceId

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts
  }, [queuedPrompts])

  /** 刷新指定工作区的侧栏对话列表 */
  const refreshConversationList = useCallback(async (workspaceId: string) => {
    const state = await window.sharker.listConversations(workspaceId)
    if (settingsRef.current.activeWorkspaceId === workspaceId) {
      setConversationList(state.conversations)
    }
    return state
  }, [])

  /** 加载工作区的活跃对话与消息 */
  const loadWorkspaceSession = useCallback(
    async (workspaceId: string) => {
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
    },
    [refreshConversationList]
  )

  /** 将当前对话消息落盘并刷新列表 */
  const persistActiveConversation = useCallback(
    async (msgs: ChatMessage[], convId = activeConversationIdRef.current) => {
      const workspaceId = settingsRef.current.activeWorkspaceId
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
    setLiveTurnMeta(null)
    setTurnStartedAt(null)
  }, [])

  /** 发送前初始化回合计时与活动列表 */
  const beginTurnMeta = useCallback(() => {
    const now = Date.now()
    turnStartedAtRef.current = now
    turnHadThinkingRef.current = false
    setTurnHadThinking(false)
    turnMetaRef.current = { browsedFiles: [], activities: [] }
    setTurnStartedAt(now)
    setLiveTurnMeta({ browsedFiles: [], activities: [] })
  }, [])

  /** 中止或切换时重置聊天 UI 状态 */
  const clearChatUiState = useCallback(() => {
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
    setQueuedPrompts([])
    queuedPromptsRef.current = []
    resetTurnMeta()
  }, [resetTurnMeta])

  /** 节流将有序片段 ref 刷到 UI */
  const flushSegmentsToUI = useCallback(() => {
    const paint = () => {
      streamRafRef.current = null
      streamFlushTimerRef.current = null
      lastStreamRenderAt.current = performance.now()
      setLiveSegments(cloneSegments(segmentsRef.current))
      // 兼容：从片段推导 streaming / thinking 供旧逻辑与最终正文预览
      const finalPreview = extractFinalContent(segmentsRef.current, { isStreaming: true })
      setTurnThinking(thinkingPreviewFromSegments(segmentsRef.current))
      const activeToolSeg = [...segmentsRef.current]
        .reverse()
        .find((s) => s.kind === 'tool' && s.status === 'active')
      setActiveTool(activeToolSeg?.toolName ?? null)
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

  /** 无活跃对话时创建新对话 */
  const ensureActiveConversation = useCallback(
    async (opts?: { preserveMessages?: boolean }): Promise<string | null> => {
      const workspaceId = settingsRef.current.activeWorkspaceId
      if (!workspaceId || !getActiveWorkspacePath(settingsRef.current)) return null
      if (!activeConversationIdRef.current) {
        const conv = await window.sharker.createConversation(workspaceId)
        setActiveConversationId(conv.id)
        activeConversationIdRef.current = conv.id
        if (!opts?.preserveMessages) {
          setMessages([])
          messagesRef.current = []
        }
        await refreshConversationList(workspaceId)
      }
      return workspaceId
    },
    [refreshConversationList]
  )

  /** 流式结束后将助手回复写入消息列表 */
  const commitAssistantReply = useCallback(
    (content: string, suffix = '') => {
      const finalized = finalizeSegments(segmentsRef.current)
      segmentsRef.current = finalized
      let text = (extractFinalContent(finalized) || content).trim()
      if (suffix) text = (text + suffix).trim()
      const durationSec = Math.max(
        0,
        Math.round((Date.now() - turnStartedAtRef.current) / 1000)
      )
      const provider = settingsRef.current.providers.find(
        (p) => p.id === settingsRef.current.activeProviderId
      )
      const thinkingPreview = thinkingPreviewFromSegments(finalized)
      const hadThinking = finalized.some((s) => s.kind === 'thinking')
      const meta: AssistantMeta = {
        browsedFiles: browsedFilesFromSegments(finalized),
        activities: activitiesFromSegments(finalized),
        segments: finalized,
        durationSec: durationSec > 0 ? durationSec : undefined,
        hadThinking,
        thinkingPreview: thinkingPreview ? thinkingPreview : undefined,
        model: provider?.model?.trim() || undefined
      }
      if (!text) {
        if (finalized.length > 0 || hadThinking) {
          text = '（本轮未生成文字回复，可展开上方过程查看详情）'
        } else {
          streamingRef.current = ''
          segmentsRef.current = []
          setLiveSegments([])
          setStreaming('')
          resetTurnMeta()
          return
        }
      }
      setMessages((msgs) => {
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && last.content === text) return msgs
        const next = [
          ...msgs,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: text,
            meta
          }
        ]
        void persistActiveConversation(next)
        return next
      })
      streamingRef.current = ''
      turnThinkingRef.current = ''
      segmentsRef.current = []
      setLiveSegments([])
      setStreaming('')
      setTurnThinking('')
      resetTurnMeta()
    },
    [persistActiveConversation, resetTurnMeta]
  )

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    settingsDraftRef.current = settingsDraft
  }, [settingsDraft])

  /** 保存设置并同步本地 state（切换工作区时合并字段） */
  const persistSettings = useCallback(async (next: AppSettings) => {
    const targetWorkspaceId = next.activeWorkspaceId
    await window.sharker.saveSettings(next)
    const updated = await window.sharker.getSettings()
    if (settingsRef.current.activeWorkspaceId !== targetWorkspaceId) {
      const merged: AppSettings = {
        ...settingsRef.current,
        workspaces: updated.workspaces,
        providers: updated.providers,
        activeProviderId: updated.activeProviderId,
        skillRepoUrls: updated.skillRepoUrls,
        permissionMode: updated.permissionMode
      }
      settingsRef.current = merged
      setSettings(merged)
      setSettingsDraft(merged)
      return updated
    }
    settingsRef.current = updated
    setSettings(updated)
    setSettingsDraft(updated)
    return updated
  }, [])

  /** 离开设置页前落盘草稿 */
  const flushSettingsDraftIfNeeded = useCallback(async () => {
    if (pageRef.current !== 'settings') return
    await persistSettings(settingsDraftRef.current)
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
    if (!settings.activeWorkspaceId) return
    void loadWorkspaceSession(settings.activeWorkspaceId)
  }, [settings.activeWorkspaceId, loadWorkspaceSession])

  useEffect(() => {
    if (!activeConversationId || loading) return
    const timer = window.setTimeout(() => {
      void persistActiveConversation(messagesRef.current)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [messages, activeConversationId, loading, persistActiveConversation])

  /** 订阅主进程流式事件：思考、token、工具、压缩、完成 */
  useEffect(() => {
    const offStream = window.sharker.onStream((chunk) => {
      if (
        chunk.type === 'think' ||
        chunk.type === 'token' ||
        chunk.type === 'tool_start' ||
        chunk.type === 'tool_done' ||
        chunk.type === 'turn_start' ||
        chunk.type === 'context_compress' ||
        chunk.type === 'error'
      ) {
        if (chunk.type === 'think' && chunk.content) {
          turnHadThinkingRef.current = true
          setTurnHadThinking(true)
          turnThinkingRef.current += chunk.content
        }
        if (chunk.type === 'token' && chunk.content) {
          streamingRef.current += chunk.content
        }
        segmentsRef.current = applyStreamChunk(segmentsRef.current, chunk)
        // 同步 turnMeta 供侧栏/旧逻辑
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
        if (chunk.type === 'turn_start' && chunk.skillNames?.length) {
          const skillActs = activitiesFromSkills(chunk.skillNames)
          turnMetaRef.current.activities = [
            ...skillActs,
            ...turnMetaRef.current.activities.filter((a) => a.kind !== 'skill')
          ]
          syncLiveTurnMeta()
        }
        if (chunk.type === 'context_compress' && chunk.contextCompress) {
          const { messages: compressed, removedCount, beforeTokens, afterTokens } =
            chunk.contextCompress
          setMessages((msgs) => {
            const last = msgs[msgs.length - 1]
            const next =
              last?.role === 'user' ? [...compressed, last] : [...compressed]
            void persistActiveConversation(next)
            return next
          })
          turnMetaRef.current.activities.push({
            kind: 'compress',
            label: `compress · ${removedCount} 条 → ${beforeTokens}→${afterTokens} tokens`
          })
          syncLiveTurnMeta()
        }
        flushSegmentsToUI()
        return
      }
      if (chunk.type === 'approval_needed' && chunk.approval) {
        setApproval(chunk.approval)
      }
      if (chunk.type === 'command' && chunk.command === 'clear') {
        setMessages([])
        messagesRef.current = []
        void persistActiveConversation([])
      }
      if (chunk.type === 'done') {
        if (doneCommittedRef.current) return
        doneCommittedRef.current = true
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
        setLiveSegments(cloneSegments(segmentsRef.current))
        setLoading(false)
        setActiveTool(null)
        sendInFlightRef.current = false
        setTurnThinking(thinkingPreviewFromSegments(segmentsRef.current))
        setStreaming(extractFinalContent(segmentsRef.current))
        commitAssistantReply(streamingRef.current)
        const wsId = settingsRef.current.activeWorkspaceId
        if (wsId) void refreshConversationList(wsId)
        const queue = queuedPromptsRef.current
        if (queue.length > 0) {
          const [next, ...rest] = queue
          setQueuedPrompts(rest)
          queuedPromptsRef.current = rest
          void dispatchTurnRef.current(next.text)
        }
      }
    })
    const offApproval = window.sharker.onApproval((req) => setApproval(req))
    return () => {
      offStream()
      offApproval()
      if (streamRafRef.current != null) cancelAnimationFrame(streamRafRef.current)
      if (streamFlushTimerRef.current != null) clearTimeout(streamFlushTimerRef.current)
      if (thinkRafRef.current != null) cancelAnimationFrame(thinkRafRef.current)
    }
  }, [commitAssistantReply, flushSegmentsToUI, syncLiveTurnMeta, refreshConversationList, persistActiveConversation])

  /** 派发单条 turn：写入用户消息并触发 IPC */
  const dispatchTurn = useCallback(
    async (text: string) => {
      const current = settingsRef.current
      const providerErr = validateActiveProvider(current)

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text
      }
      const history = messagesRef.current
      const nextMessages = [...history, userMsg]

      if (providerErr) {
        const workspaceId = await ensureActiveConversation({ preserveMessages: true })
        const errReply: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `**错误**: ${providerErr}`
        }
        const withErr = [...nextMessages, errReply]
        setMessages(withErr)
        messagesRef.current = withErr
        if (workspaceId) void persistActiveConversation(withErr)
        return
      }

      sendInFlightRef.current = true
      doneCommittedRef.current = false
      setLoading(true)
      beginTurnMeta()
      streamingRef.current = ''
      turnThinkingRef.current = ''
      segmentsRef.current = []
      setLiveSegments([])
      setStreaming('')
      setTurnThinking('')

      try {
        const workspaceId = await ensureActiveConversation({ preserveMessages: true })
        if (!workspaceId) {
          throw new Error('无法创建或加载当前对话')
        }
        setMessages(nextMessages)
        messagesRef.current = nextMessages
        void persistActiveConversation(nextMessages)
        await window.sharker.sendMessage(text, history)
      } catch (e) {
        console.error('发送失败', e)
        doneCommittedRef.current = true
        sendInFlightRef.current = false
        setLoading(false)
        setActiveTool(null)
        const msg = e instanceof Error ? e.message : String(e)
        commitAssistantReply(streamingRef.current, `\n\n**错误**: ${msg}`)
      }
    },
    [beginTurnMeta, commitAssistantReply, ensureActiveConversation, persistActiveConversation]
  )

  useEffect(() => {
    dispatchTurnRef.current = dispatchTurn
  }, [dispatchTurn])

  /** 接待用户输入：空闲直接派发；忙时排队或插队 */
  const handlePromptSubmit = useCallback(
    async (text: string, mode: PromptSubmitMode = 'send') => {
      await flushSettingsDraftIfNeeded()
      if (!getActiveWorkspacePath(settingsRef.current)) {
        console.error('未选择工作区，无法发送')
        return
      }

      const trimmed = text.trim()
      if (!trimmed) return

      const busy = loading || sendInFlightRef.current
      if (busy) {
        const item: QueuedPrompt = { id: crypto.randomUUID(), text: trimmed }
        if (mode === 'jump') {
          setQueuedPrompts((prev) => {
            const next = [item, ...prev]
            queuedPromptsRef.current = next
            return next
          })
          await window.sharker.abortChat()
          return
        }
        setQueuedPrompts((prev) => {
          const next = [...prev, item]
          queuedPromptsRef.current = next
          return next
        })
        return
      }

      await dispatchTurn(trimmed)
    },
    [dispatchTurn, flushSettingsDraftIfNeeded, loading]
  )

  /** 取消排队中的消息 */
  const handleCancelQueued = useCallback((id: string) => {
    setQueuedPrompts((prev) => {
      const next = prev.filter((q) => q.id !== id)
      queuedPromptsRef.current = next
      return next
    })
  }, [])

  /** 用户点击停止：中止 IPC 并提交已流式内容 */
  const handleAbort = useCallback(async () => {
    await window.sharker.abortChat()
    sendInFlightRef.current = false
    doneCommittedRef.current = true
    setLoading(false)
    setActiveTool(null)
    setTurnThinking(turnThinkingRef.current)
    commitAssistantReply(streamingRef.current, '\n\n_(已停止)_')
  }, [commitAssistantReply])

  /** 设置页保存回调 */
  const handleSaveSettings = async (next: AppSettings) => {
    await persistSettings(next)
  }

  /** 工作区与对话：切换、新建、删除、置顶 */
  const handleSelectWorkspace = useCallback(
    async (id: string) => {
      await flushSettingsDraftIfNeeded()
      if (sendInFlightRef.current || loading) {
        await window.sharker.abortChat()
        clearChatUiState()
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
        const updated = await window.sharker.getSettings()
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

  /** 侧栏切换对话 */
  const handleSelectConversation = async (workspaceId: string, conversationId: string) => {
    setActiveConversationId(conversationId)
    activeConversationIdRef.current = conversationId
    setPage('chat')

    await flushSettingsDraftIfNeeded()
    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
      clearChatUiState()
    }
    if (settingsRef.current.activeWorkspaceId !== workspaceId) {
      await persistSettings(withActiveWorkspace(settingsRef.current, workspaceId))
    }
    const conv = await window.sharker.loadConversation(workspaceId, conversationId)
    await window.sharker.setActiveConversation(workspaceId, conversationId)
    const loaded = conv?.messages ?? []
    messagesRef.current = loaded
    setMessages(loaded)
  }

  /** 删除对话并选中相邻条目 */
  const handleDeleteConversation = async (workspaceId: string, conversationId: string) => {
    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
      clearChatUiState()
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

  /** 在工作区创建新对话 */
  const handleNewConversation = async (workspaceId: string) => {
    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
    }
    clearChatUiState()
    if (settingsRef.current.activeWorkspaceId !== workspaceId) {
      await persistSettings(withActiveWorkspace(settingsRef.current, workspaceId))
    }
    const conv = await window.sharker.createConversation(workspaceId)
    setActiveConversationId(conv.id)
    setMessages([])
    await refreshConversationList(workspaceId)
    setPage('chat')
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
      clearChatUiState()
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

  /** 删除非 Home 工作区 */
  const handleDeleteWorkspace = async (id: string) => {
    const current = settingsRef.current
    const item = current.workspaces.find((w) => w.id === id)
    if (!item || item.isHome) return

    if (sendInFlightRef.current || loading) {
      await window.sharker.abortChat()
      clearChatUiState()
    }

    const workspaces = current.workspaces.filter((w) => w.id !== id)
    const wasActive = current.activeWorkspaceId === id
    const activeId = wasActive ? HOME_WORKSPACE_ID : current.activeWorkspaceId
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
      if (wasActive) void loadWorkspaceSession(activeId)
    } catch (e) {
      console.error('删除工作区失败', e)
    }
  }

  /** 切换对话使用的模型 */
  const handleSelectProvider = async (id: string) => {
    await persistSettings({ ...settings, activeProviderId: id })
  }

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

  /** 聊天 ↔ 设置页导航 */
  const handleNavigate = async (targetPage: AppPage, tab?: SettingsTab) => {
    if (page === 'settings' && targetPage === 'chat') {
      await persistSettings(settingsDraft)
    }
    if (targetPage === 'settings') {
      setSettingsDraft(settings)
      setSettingsTab(tab ?? 'models')
    }
    setPage(targetPage)
  }

  /** 审批弹窗用户响应 */
  const handleApproval = async (approved: boolean) => {
    if (!approval) return
    await window.sharker.respondApproval(approval.id, approved)
    setApproval(null)
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app">
        <Sidebar
          page={page}
          settingsTab={settingsTab}
          settings={settings}
          conversations={conversationList}
          activeConversationId={activeConversationId}
          onSelectWorkspace={handleSelectWorkspace}
          onSelectConversation={handleSelectConversation}
          onAddWorkspace={handleAddWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onTogglePinWorkspace={handleTogglePinWorkspace}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onNavigate={handleNavigate}
        />
        <main className="main">
          {page === 'chat' ? (
            <div key="chat" className="main-pane view-enter">
            <ChatView
              workspaces={settings.workspaces}
              activeWorkspaceId={settings.activeWorkspaceId}
              onSelectWorkspace={handleSelectWorkspace}
              providers={settings.providers}
              activeProviderId={settings.activeProviderId}
              onSelectProvider={handleSelectProvider}
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
              onAbort={handleAbort}
            />
            </div>
          ) : (
            <div key="settings" className="main-pane view-enter">
            <SettingsPage
              tab={settingsTab}
              draft={settingsDraft}
              setDraft={setSettingsDraft}
              onSave={handleSaveSettings}
            />
            </div>
          )}
        </main>
        {approval && (
          <ApprovalModal request={approval} onRespond={handleApproval} />
        )}
      </div>
    </div>
  )
}
