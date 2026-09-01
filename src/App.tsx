/**
 * Sharker 主界面：Maka 灰底白浮板壳（elevated + panel-detail）+ ChatView / Composer。
 * @see src/ARCH.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AppShell as AstryxAppShell } from '@astryxdesign/core/AppShell'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { LayerProvider } from '@astryxdesign/core/Layer'
import { Theme } from '@astryxdesign/core/theme'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { SessionSummary } from '@maka/core/session'
import {
  AstryxLocaleProvider,
  ChatSurfaceLayout,
  ChatView,
  Composer,
  LocaleProvider,
  SessionListPanel,
  SessionRailProvider,
  TitlebarSessionIdentity,
  ToastProvider,
  deriveTitlebarProjectName,
  type LiveTurnProjection,
  type NavSelection
} from '@maka/ui'
import { PanelLeftClose, PanelLeftOpen } from '@maka/ui/icons'
import { makaTheme } from './maka-core/apps/desktop/src/renderer/astryx-theme/maka'
import { useAstryxThemeMode } from './maka-core/apps/desktop/src/renderer/astryx-theme-mode'
import { useShellLiveTurn } from './maka-core/apps/desktop/src/renderer/use-shell-live-turn'
import { deriveLiveTurnSnapshot } from './maka-core/apps/desktop/src/renderer/live-turn-snapshot'
import type { ConversationSummary } from '../shared/conversation'
import { DEFAULT_SETTINGS, type AppSettings, type ChatMessage } from '../shared/types'
import { GLOBAL_WORKSPACE_ID, getActiveWorkspace } from '../shared/workspace'
import { UI_FONT_SCALE_DEFAULT } from '../shared/ui-font-scale'
import { applyAppearanceDom } from './components/settings/AppearanceSettings'
import { SettingsPage } from './pages/SettingsPage'
import { SkillsPage } from './pages/SkillsPage'
import { AutomationsPage } from './pages/AutomationsPage'
import type { SettingsTab } from './types/navigation'
import {
  applySharkerChunk,
  toMakaPermission,
  toSessionSummary,
  toStoredMessages
} from './lib/maka-bridge'
import './styles/maka-shell.css'

type ShellPage = 'chat' | 'settings' | 'skills' | 'automations'

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'models', label: '模型' },
  { id: 'permissions', label: '权限' },
  { id: 'general', label: '通用' },
  { id: 'appearance', label: '外观' },
  { id: 'mcp', label: 'MCP' },
  { id: 'personalization', label: '个性化' },
  { id: 'notifications', label: '通知' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'browser', label: '浏览器' },
  { id: 'usage', label: '用量' },
  { id: 'archived', label: '已归档' }
]

/** 根：Astryx Theme + Maka 壳 */
export default function App() {
  const astryxMode = useAstryxThemeMode()
  return (
    <Theme theme={makaTheme} mode={astryxMode}>
      <LocaleProvider locale="zh">
        <AstryxLocaleProvider>
          <ToastProvider>
            <LayerProvider>
              <SharkerShell />
            </LayerProvider>
          </ToastProvider>
        </AstryxLocaleProvider>
      </LocaleProvider>
    </Theme>
  )
}

/** Maka 双栏壳 + Sharker IPC */
function SharkerShell() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('models')
  const [page, setPage] = useState<ShellPage>('chat')
  const [navSelection, setNavSelection] = useState<NavSelection>({ section: 'sessions' })
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [liveTurn, setLiveTurn] = useState<LiveTurnProjection | undefined>()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [viewMode, setViewMode] = useState<'conversation' | 'project'>('conversation')
  const liveTurnRef = useRef<LiveTurnProjection | undefined>(undefined)
  const turnIdRef = useRef<string>('')
  const stepIdRef = useRef<string>('')
  const activeIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const sendingRef = useRef(false)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const workspace = getActiveWorkspace(settings)
  const workspaceId = workspace?.id || GLOBAL_WORKSPACE_ID
  const activeProvider = settings.providers.find((p) => p.id === settings.activeProviderId)

  useEffect(() => {
    applyAppearanceDom(
      settings.uiTheme === 'dark' ? 'dark' : 'light',
      settings.uiFontScale ?? UI_FONT_SCALE_DEFAULT,
      settings.codeFont,
      settings.codeFontScale,
      settings.reduceMotion === true
    )
    document.documentElement.dataset.os = window.sharker?.platform === 'darwin' ? 'darwin' : 'other'
  }, [
    settings.uiTheme,
    settings.uiFontScale,
    settings.codeFont,
    settings.codeFontScale,
    settings.reduceMotion
  ])

  const refreshConversations = useCallback(async (selectId?: string | null) => {
    if (!window.sharker) return
    const state = await window.sharker.listConversations(workspaceId)
    setConversations(state.conversations)
    const nextId = selectId !== undefined ? selectId : state.activeConversationId
    setActiveId(nextId)
    if (nextId) {
      const conv = await window.sharker.loadConversation(workspaceId, nextId, { slim: true })
      setMessages(conv?.messages ?? [])
    } else {
      setMessages([])
    }
  }, [workspaceId])

  useEffect(() => {
    if (!window.sharker) return
    void window.sharker.getSettings().then((loaded) => {
      setSettings(loaded)
      setSettingsDraft(loaded)
    })
  }, [])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  useEffect(() => {
    if (!window.sharker?.onStream) return
    return window.sharker.onStream((chunk) => {
      const owner = chunk.conversationId
      if (owner && activeIdRef.current && owner !== activeIdRef.current) return
      if (chunk.type === 'turn_start' || !turnIdRef.current) {
        turnIdRef.current = `turn:${owner ?? activeIdRef.current ?? Date.now()}`
        stepIdRef.current = `step:${turnIdRef.current}`
      }
      const next = applySharkerChunk(liveTurnRef.current, chunk, turnIdRef.current, stepIdRef.current)
      liveTurnRef.current = next
      setLiveTurn(next)
      if (chunk.type === 'done' || chunk.type === 'error' || chunk.type === 'turn_cancelled') {
        sendingRef.current = false
        void refreshConversations(activeIdRef.current)
      }
    })
  }, [refreshConversations])

  const openSession = useCallback(async (sessionId: string) => {
    setPage('chat')
    setNavSelection({ section: 'sessions' })
    setActiveId(sessionId)
    liveTurnRef.current = undefined
    setLiveTurn(undefined)
    turnIdRef.current = ''
    if (!window.sharker) return
    await window.sharker.setActiveConversation(workspaceId, sessionId)
    const conv = await window.sharker.loadConversation(workspaceId, sessionId, { slim: true })
    setMessages(conv?.messages ?? [])
  }, [workspaceId])

  const createSession = useCallback(async () => {
    if (!window.sharker) return
    const conv = await window.sharker.createConversation(workspaceId)
    liveTurnRef.current = undefined
    setLiveTurn(undefined)
    turnIdRef.current = ''
    setMessages([])
    setActiveId(conv.id)
    setPage('chat')
    setNavSelection({ section: 'sessions' })
    await refreshConversations(conv.id)
  }, [refreshConversations, workspaceId])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !window.sharker) return false
    sendingRef.current = true
    let conversationId = activeIdRef.current
    if (!conversationId) {
      const conv = await window.sharker.createConversation(workspaceId)
      conversationId = conv.id
      setActiveId(conv.id)
      await window.sharker.setActiveConversation(workspaceId, conv.id)
    }
    const history = messagesRef.current
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: Date.now()
    }
    setMessages([...history, userMsg])
    turnIdRef.current = `turn:${conversationId}`
    stepIdRef.current = `step:${turnIdRef.current}`
    const armed = applySharkerChunk(undefined, { type: 'turn_start' }, turnIdRef.current, stepIdRef.current)
    liveTurnRef.current = armed
    setLiveTurn(armed)
    await window.sharker.sendMessage(trimmed, [...history, userMsg], undefined, conversationId)
    return true
  }, [workspaceId])

  const stop = useCallback(async () => {
    await window.sharker?.abortChat(activeIdRef.current ?? undefined)
  }, [])

  const saveSettings = useCallback(async (next: AppSettings) => {
    if (!window.sharker) return
    await window.sharker.saveSettings(next)
    setSettings(next)
    setSettingsDraft(next)
  }, [])

  /** 标题栏重命名当前会话 */
  const renameSession = useCallback(async (sessionId: string, name: string) => {
    if (!window.sharker) return
    await window.sharker.patchConversationMeta(workspaceId, sessionId, { customTitle: name })
    await refreshConversations(sessionId)
  }, [refreshConversations, workspaceId])

  const liveSnapshot = useMemo(() => deriveLiveTurnSnapshot(liveTurn), [liveTurn])
  const sessions = useMemo(() => {
    const runningId = liveSnapshot.phase ? activeId : null
    return conversations.map((conv) =>
      toSessionSummary(conv, {
        model: activeProvider?.model ?? '',
        providerId: settings.activeProviderId,
        permissionMode: settings.permissionMode,
        running: conv.id === runningId
      })
    )
  }, [
    activeId,
    activeProvider?.model,
    conversations,
    liveSnapshot.phase,
    settings.activeProviderId,
    settings.permissionMode
  ])
  const activeSession = sessions.find((item) => item.id === activeId)
  const shellLive = useShellLiveTurn({
    liveTurn: liveSnapshot,
    activeSession
  })
  const stored = useMemo(() => toStoredMessages(messages), [messages])
  const streamingIds = useMemo(() => {
    if (!activeId || !shellLive.turnActive) return new Set<string>()
    return new Set([activeId])
  }, [activeId, shellLive.turnActive])

  const railData = useMemo(
    () => ({
      sessions,
      activeId: activeId ?? undefined,
      streamingSessionIds: streamingIds,
      groupVariant: viewMode,
      onSelectSession: (id: string) => {
        void openSession(id)
      }
    }),
    [activeId, openSession, sessions, streamingIds, viewMode]
  )

  const railChrome = useMemo(
    () => ({
      collapsed: sidebarCollapsed,
      onCollapsedChange: setSidebarCollapsed,
      width: sidebarWidth,
      onWidthChange: setSidebarWidth,
      minWidth: 220,
      maxWidth: 360,
      viewMode,
      onViewModeChange: setViewMode,
      selection: navSelection,
      onSelect: (next: NavSelection) => {
        setNavSelection(next)
        if (next.section === 'extensions' && next.module === 'skills') setPage('skills')
        else if (next.section === 'extensions') {
          setPage('settings')
          setSettingsTab('mcp')
        } else if (next.section === 'automations') setPage('automations')
        else setPage('chat')
      },
      onNew: () => {
        void createSession()
      },
      onOpenSettings: () => {
        setPage('settings')
        setSettingsTab('models')
      }
    }),
    [createSession, navSelection, sidebarCollapsed, sidebarWidth, viewMode]
  )

  const workspacePath = workspace?.path ?? settings.workspacePath ?? ''
  const titlebarProjectName = deriveTitlebarProjectName({
    projectName: workspace?.label,
    projectPath: workspacePath
  })
  const homeSurfaceActive = page === 'chat' && messages.length === 0 && !liveSnapshot.phase
  const frameStyle = sidebarCollapsed
    ? undefined
    : ({ '--maka-sidenav-width': `${sidebarWidth}px` } as CSSProperties)

  return (
    <div
      className="appFrame sharker-shell agents-layout-root"
      data-agents-page
      data-sidebar-state={sidebarCollapsed ? 'collapsed' : 'expanded'}
      style={frameStyle}
    >
      <header className="maka-window-titlebar">
        <div className="maka-shell-topbar-rail" role="group" aria-label="窗口操作">
          <Tooltip content={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}>
            <IconButton
              label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              icon={<Icon icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose} size="sm" color="secondary" />}
              variant="ghost"
              size="md"
              className="maka-titlebar-action"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-expanded={!sidebarCollapsed}
            />
          </Tooltip>
        </div>
        {page === 'chat' && activeSession && !homeSurfaceActive ? (
          <TitlebarSessionIdentity
            key={activeSession.id}
            sessionName={activeSession.name}
            onRenameSession={(name) => {
              void renameSession(activeSession.id, name)
            }}
            project={titlebarProjectName ? { name: titlebarProjectName } : undefined}
          />
        ) : null}
      </header>
      <SessionRailProvider data={railData} chrome={railChrome}>
        <AstryxAppShell
          className="app maka-shell-astryx agents-layout-body"
          variant="elevated"
          height="fill"
          contentPadding={0}
          mobileNav={{ breakpoint: 'none', hasToggle: false }}
          sideNav={<SessionListPanel />}
        >
          <div className="maka-panel maka-panel-detail">
            <div className="maka-detail-with-artifacts">
              <div className="mainColumn" data-home-surface={homeSurfaceActive ? 'true' : undefined}>
              {page === 'settings' ? (
                <div className="sharker-settings-host">
                  <nav className="sharker-settings-tabs" aria-label="设置">
                    {SETTINGS_TABS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === settingsTab ? 'is-active' : undefined}
                        onClick={() => setSettingsTab(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>
                  <SettingsPage
                    tab={settingsTab}
                    draft={settingsDraft}
                    setDraft={setSettingsDraft}
                    onSave={saveSettings}
                    onNavigateTab={setSettingsTab}
                    workspacePath={workspacePath}
                  />
                </div>
              ) : null}
              {page === 'skills' ? (
                <SkillsPage
                  workspaces={settings.workspaces}
                  onBack={() => {
                    setPage('chat')
                    setNavSelection({ section: 'sessions' })
                  }}
                  onUseSkill={(name) => {
                    setPage('chat')
                    setNavSelection({ section: 'sessions' })
                    void send(`$${name}`)
                  }}
                />
              ) : null}
              {page === 'automations' ? (
                <AutomationsPage
                  onBack={() => {
                    setPage('chat')
                    setNavSelection({ section: 'sessions' })
                  }}
                  onOpenConversation={(id) => {
                    void openSession(id)
                  }}
                  conversations={conversations}
                  activeConversationId={activeId}
                  providers={settings.providers}
                  activeProviderId={settings.activeProviderId}
                  workspaces={settings.workspaces}
                  activeWorkspaceId={settings.activeWorkspaceId}
                />
              ) : null}
              <ChatSurfaceLayout
                scrollOwner="host"
                density="balanced"
                hidden={page !== 'chat'}
                composer={
                  <Composer
                    streaming={shellLive.turnActive}
                    processing={shellLive.showProcessingIndicator}
                    continuing={shellLive.showContinuingIndicator}
                    onSend={(text) => send(text)}
                    onStop={() => {
                      void stop()
                    }}
                    draftKey={activeId ?? 'new'}
                    permissionMode={toMakaPermission(settings.permissionMode)}
                    activeSession={activeSession as SessionSummary | undefined}
                  />
                }
              >
                <ChatView
                  messages={stored}
                  liveTurn={liveTurn}
                  runningStatus={shellLive.showRunningStatus}
                  activeSession={activeSession}
                  activeModel={activeProvider?.model}
                  activeModelLabel={activeProvider?.name ?? activeProvider?.model}
                  scrollBehavior="auto"
                  onNew={() => {
                    void createSession()
                  }}
                  onPromptSuggestion={(prompt) => {
                    void send(prompt)
                  }}
                />
              </ChatSurfaceLayout>
              </div>
            </div>
          </div>
        </AstryxAppShell>
      </SessionRailProvider>
    </div>
  )
}
