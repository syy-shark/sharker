/**
 * 集成终端（xterm.js + node-pty IPC）。
 * 按线程保留会话，线程内可开多个标签（对标 Codex terminal tabs per thread）。
 * 浅色主题强制水滴玻璃浅底（非黑屏）；无红绿灯。
 * @see ./ARCH.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { formatSideChatPrompt, normalizeTranscriptSelection } from '../../../shared/side-chat-quote'
import {
  addTerminalTab,
  closeTerminalTab,
  ensureTerminalTabs,
  MAX_TERMINAL_TABS,
  rememberThreadTerminalPanes,
  threadTerminalKey
} from '../../../shared/terminal-tabs'
import { isTerminalClearChord } from '../../../shared/workbench-shortcuts'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './EmbeddedTerminal.css'

interface Props {
  workspacePath: string
  conversationId?: string | null
  /** 当前线程的终端是否可见（切走对话或右侧 Tab 时仍挂着，避免杀 PTY） */
  hostActive?: boolean
  /** Composer `!cmd`：PTY 就绪后写入并回车 */
  pendingCommand?: string | null
  onPendingCommandSent?: () => void
  /** 递增则清屏（对标 Codex Ctrl+L） */
  clearTick?: number
  /** 划选终端输出后旁路提问（对标 Codex Ask in side chat） */
  onAskInSideChat?: (prompt: string) => void
}

/**
 * 浅色：背景必须 transparent（#00000000），禁止 #fff / 浅灰实色，
 * 否则会像廉价白卡片，与 vibrancy 主区割裂。
 */
const THEME_GLASS_LIGHT: ITheme = {
  /* 必须带 alpha 的 hex；字符串 transparent 在 xterm 里常会退化成白底 */
  background: '#00000000',
  foreground: '#2c2c2e',
  cursor: '#007aff',
  cursorAccent: '#00000000',
  selectionBackground: 'rgba(0, 122, 255, 0.16)', // accent
  selectionForeground: '#1d1d1f',
  black: '#1d1d1f',
  red: '#c41e3a',
  green: '#1f7a34',
  yellow: '#9a5b00',
  blue: '#0066cc',
  magenta: '#7d3f9e',
  cyan: '#0a6b73',
  white: '#6e6e73',
  brightBlack: '#8e8e93',
  brightRed: '#ff3b30',
  brightGreen: '#248a3d',
  brightYellow: '#c77c00',
  brightBlue: '#007aff',
  brightMagenta: '#af52de',
  brightCyan: '#32a5b0',
  brightWhite: '#1d1d1f'
}

/** 深色：同样透明底，字用浅色 */
const THEME_METAL_DARK: ITheme = {
  background: '#00000000',
  foreground: '#e8eaed',
  cursor: '#6ea8ff',
  cursorAccent: '#00000000',
  selectionBackground: 'rgba(110, 168, 255, 0.28)',
  selectionForeground: '#ffffff',
  black: '#2a3038',
  red: '#ff6b6b',
  green: '#69db7c',
  yellow: '#ffd43b',
  blue: '#74c0fc',
  magenta: '#da77f2',
  cyan: '#66d9e8',
  white: '#e8eaed',
  brightBlack: '#5c6370',
  brightRed: '#ff8787',
  brightGreen: '#8ce99a',
  brightYellow: '#ffe066',
  brightBlue: '#91d5ff',
  brightMagenta: '#e599f7',
  brightCyan: '#99e9f2',
  brightWhite: '#ffffff'
}

function isDarkUi(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark')
}

function codeFontScale(): number {
  if (typeof document === 'undefined') return 1
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--code-font-scale').trim()
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function resolveTermTheme(): ITheme {
  const base = isDarkUi() ? THEME_METAL_DARK : THEME_GLASS_LIGHT
  return {
    ...base,
    cursor: cssVar('--accent', base.cursor || '#007aff'),
    foreground: cssVar('--text', base.foreground || '#1d1d1f'),
    selectionBackground: cssVar('--accent-soft', base.selectionBackground || 'rgba(0,122,255,0.16)'),
    selectionForeground: cssVar('--text', base.selectionForeground || base.foreground || '#1d1d1f'),
    brightBlue: cssVar('--accent', base.brightBlue || '#007aff')
  }
}

function safeFit(fit: FitAddon, term: Terminal): void {
  try {
    fit.fit()
  } catch {
    /* host 尚未布局 */
  }
  if (term.cols < 2 || term.rows < 2) {
    try {
      term.resize(80, 24)
    } catch {
      /* ignore */
    }
  }
}

function TerminalSession({
  workspacePath,
  conversationId,
  title,
  visible,
  pendingCommand = null,
  onPendingCommandSent,
  clearTick = 0,
  onAskInSideChat,
  themeTick
}: {
  workspacePath: string
  conversationId?: string | null
  title: string
  visible: boolean
  pendingCommand?: string | null
  onPendingCommandSent?: () => void
  clearTick?: number
  onAskInSideChat?: (prompt: string) => void
  themeTick: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const appliedClearRef = useRef(0)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [sideAsk, setSideAsk] = useState<{ text: string; top: number; left: number } | null>(null)
  const onAskRef = useRef(onAskInSideChat)
  onAskRef.current = onAskInSideChat

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    if (!window.sharker?.createTerminal) {
      setError('终端 API 不可用（请重启应用以加载 preload）')
      return
    }

    setError('')
    setReady(false)
    host.replaceChildren()

    const theme = resolveTermTheme()
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: Math.round(13 * codeFontScale()),
      lineHeight: 1.35,
      fontFamily:
        getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() ||
        'ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Monaco, monospace',
      theme,
      allowTransparency: true,
      scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    term.options.theme = theme
    termRef.current = term
    fitRef.current = fit

    const syncSideAsk = () => {
      if (!onAskRef.current) {
        setSideAsk(null)
        return
      }
      const text = normalizeTranscriptSelection(term.getSelection())
      if (!text) {
        setSideAsk(null)
        return
      }
      const box = host.getBoundingClientRect()
      const mark = host.querySelector('.xterm-selection')
      const rect = mark?.getBoundingClientRect()
      const top =
        rect && rect.height > 0 ? Math.min(rect.bottom + 8, box.bottom - 36) : box.bottom - 40
      const left =
        rect && rect.width > 0
          ? Math.min(Math.max(rect.left + rect.width / 2, box.left + 16), box.right - 16)
          : box.left + box.width / 2
      setSideAsk((prev) =>
        prev && prev.text === text && prev.top === top && prev.left === left ? prev : { text, top, left }
      )
    }
    const selectionSub = term.onSelectionChange(syncSideAsk)
    const scrollSub = term.onScroll(syncSideAsk)

    let disposed = false
    let sessionId: string | null = null
    const earlyChunks: Array<{ id: string; data: string }> = []

    const writeIfMine = (id: string, data: string) => {
      if (disposed) return
      if (!sessionId) {
        earlyChunks.push({ id, data })
        return
      }
      if (id === sessionId) term.write(data)
    }

    const flushEarly = (id: string) => {
      for (const chunk of earlyChunks) {
        if (chunk.id === id) term.write(chunk.data)
      }
      earlyChunks.length = 0
    }

    const offData = window.sharker.onTerminalData?.((payload) => {
      writeIfMine(payload.id, payload.data)
    })
    const offExit = window.sharker.onTerminalExit?.((payload) => {
      if (sessionId && payload.id !== sessionId) return
      term.writeln('\r\n\x1b[90m[进程已退出]\x1b[0m')
    })

    const syncSize = (id: string) => {
      safeFit(fit, term)
      void window.sharker.resizeTerminal(id, term.cols, term.rows)
    }

    safeFit(fit, term)
    const fitTimers = [50, 150, 400].map((ms) =>
      window.setTimeout(() => {
        if (disposed) return
        safeFit(fit, term)
        if (sessionId) syncSize(sessionId)
      }, ms)
    )

    void window.sharker
      .createTerminal(workspacePath || '', conversationId || '', title)
      .then(({ id }) => {
        if (disposed) {
          void window.sharker.killTerminal(id)
          return
        }
        sessionId = id
        sessionIdRef.current = id
        setReady(true)
        flushEarly(id)
        term.onData((data) => {
          void window.sharker.writeTerminal(id, data)
        })
        syncSize(id)
        term.options.theme = resolveTermTheme()
        window.setTimeout(() => {
          if (disposed || !sessionId) return
          syncSize(sessionId)
          term.options.theme = resolveTermTheme()
        }, 200)
      })
      .catch((e: unknown) => {
        if (disposed) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(`无法启动终端：${msg}`)
        term.writeln(`\x1b[31m无法启动终端：${msg}\x1b[0m`)
        term.writeln('\x1b[90m请确认已安装 shell，或运行 npm run fix:pty 后重启。\x1b[0m')
      })

    const ro = new ResizeObserver(() => {
      if (disposed) return
      safeFit(fit, term)
      if (sessionId) {
        void window.sharker.resizeTerminal(sessionId, term.cols, term.rows)
      }
    })
    ro.observe(host)

    return () => {
      disposed = true
      for (const t of fitTimers) window.clearTimeout(t)
      selectionSub.dispose()
      scrollSub.dispose()
      setSideAsk(null)
      offData?.()
      offExit?.()
      ro.disconnect()
      if (sessionId) void window.sharker.killTerminal(sessionId)
      sessionIdRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [workspacePath, themeTick, title])

  useEffect(() => {
    const id = sessionIdRef.current
    const thread = conversationId?.trim()
    if (!id || !thread || !window.sharker.bindTerminalThread) return
    void window.sharker.bindTerminalThread(id, thread)
  }, [conversationId, ready])

  useEffect(() => {
    const id = sessionIdRef.current
    if (!visible || !ready || !id || !window.sharker.activateTerminal) return
    void window.sharker.activateTerminal(id)
  }, [visible, ready])

  useEffect(() => {
    if (!visible) {
      setSideAsk(null)
      return
    }
    const term = termRef.current
    const fit = fitRef.current
    const id = sessionIdRef.current
    if (!term || !fit) return
    const t = window.requestAnimationFrame(() => {
      safeFit(fit, term)
      if (id) void window.sharker.resizeTerminal(id, term.cols, term.rows)
    })
    return () => window.cancelAnimationFrame(t)
  }, [visible])

  useEffect(() => {
    if (!clearTick || clearTick === appliedClearRef.current || !ready) return
    const term = termRef.current
    const id = sessionIdRef.current
    if (!term) return
    appliedClearRef.current = clearTick
    term.clear()
    if (id && window.sharker.writeTerminal) {
      void window.sharker.writeTerminal(id, '\x0c')
    }
  }, [clearTick, ready])

  useEffect(() => {
    const clearNow = () => {
      const term = termRef.current
      const id = sessionIdRef.current
      if (!term) return
      term.clear()
      if (id && window.sharker.writeTerminal) {
        void window.sharker.writeTerminal(id, '\x0c')
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (
        !isTerminalClearChord({
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          isComposing: e.isComposing
        })
      ) {
        return
      }
      const shell = shellRef.current
      const t = e.target
      if (!shell || !(t instanceof Node) || !shell.contains(t)) return
      e.preventDefault()
      e.stopPropagation()
      clearNow()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (!visible || !ready || !pendingCommand || !sessionIdRef.current || !window.sharker.writeTerminal) {
      return
    }
    const payload = pendingCommand.endsWith('\n') ? pendingCommand : `${pendingCommand}\n`
    void window.sharker.writeTerminal(sessionIdRef.current, payload)
    onPendingCommandSent?.()
  }, [visible, ready, pendingCommand, onPendingCommandSent])

  return (
    <div className="embedded-terminal-session" ref={shellRef}>
      {error ? <div className="embedded-terminal-error">{error}</div> : null}
      <div
        className="embedded-terminal"
        ref={hostRef}
        data-term-theme={isDarkUi() ? 'dark' : 'light'}
      />
      {visible && sideAsk && onAskInSideChat ? (
        <button
          type="button"
          className="embedded-terminal-side-ask glass-pill"
          style={{ top: sideAsk.top, left: sideAsk.left }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onAskInSideChat(formatSideChatPrompt(sideAsk.text, '', 'terminal'))
            setSideAsk(null)
            termRef.current?.clearSelection()
          }}
        >
          旁路提问
        </button>
      ) : null}
    </div>
  )
}

/** 一个线程里的终端标签 */
export function EmbeddedTerminal({
  workspacePath,
  conversationId = null,
  hostActive = true,
  pendingCommand = null,
  onPendingCommandSent,
  clearTick = 0,
  onAskInSideChat
}: Props) {
  const [tabs, setTabs] = useState(() => ensureTerminalTabs())
  const [activeId, setActiveId] = useState('t1')
  const [tabClears, setTabClears] = useState<Record<string, number>>({})
  const seenGlobalClear = useRef(clearTick)
  const [themeTick, setThemeTick] = useState(0)
  const uiDark = useMemo(() => isDarkUi(), [themeTick])

  const bumpActiveClear = () => {
    setTabClears((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 1 }))
  }

  useEffect(() => {
    if (!clearTick || clearTick === seenGlobalClear.current) return
    seenGlobalClear.current = clearTick
    bumpActiveClear()
  }, [clearTick, activeId])

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setThemeTick((n) => n + 1)
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => obs.disconnect()
  }, [])

  const cwdLabel = workspacePath?.trim()
    ? workspacePath.replace(/^\/Users\/[^/]+/, '~')
    : '终端'

  return (
    <div className={`embedded-terminal-shell ${uiDark ? 'is-dark' : 'is-light'}`}>
      <div className="embedded-terminal-chrome">
        <div className="embedded-terminal-tabs" role="tablist" aria-label="终端标签">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              className={`embedded-terminal-tab ${tab.id === activeId ? 'is-active' : ''}`}
              onClick={() => setActiveId(tab.id)}
            >
              <span>{tab.title}</span>
              {tabs.length > 1 ? (
                <span
                  className="embedded-terminal-tab-close"
                  role="button"
                  tabIndex={0}
                  aria-label={`关闭 ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    const next = closeTerminalTab(tabs, tab.id, activeId)
                    setTabs(next.tabs)
                    setActiveId(next.activeId)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    const next = closeTerminalTab(tabs, tab.id, activeId)
                    setTabs(next.tabs)
                    setActiveId(next.activeId)
                  }}
                >
                  <X size={10} aria-hidden />
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className="embedded-terminal-tab-add"
            aria-label="新建终端标签"
            title="新建终端标签"
            disabled={tabs.length >= MAX_TERMINAL_TABS}
            onClick={() => {
              const next = addTerminalTab(tabs)
              setTabs(next.tabs)
              setActiveId(next.activeId)
            }}
          >
            <Plus size={12} aria-hidden />
          </button>
        </div>
        <span className="embedded-terminal-title" title={workspacePath}>
          {cwdLabel}
        </span>
        <button
          type="button"
          className="embedded-terminal-clear"
          aria-label="清终端"
          title="清终端 · Ctrl+L / ⌘K"
          onClick={bumpActiveClear}
        >
          清屏
        </button>
      </div>
      <div className="embedded-terminal-panes">
        {tabs.map((tab) => {
          const selected = tab.id === activeId
          return (
            <div
              key={tab.id}
              className={`embedded-terminal-pane${selected ? ' is-active' : ''}`}
              hidden={!selected}
            >
              <TerminalSession
                workspacePath={workspacePath}
                conversationId={conversationId}
                title={tab.title}
                visible={hostActive && selected}
                pendingCommand={selected ? pendingCommand : null}
                onPendingCommandSent={onPendingCommandSent}
                clearTick={tabClears[tab.id] ?? 0}
                onAskInSideChat={onAskInSideChat}
                themeTick={themeTick}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 切对话不杀旧线程的 PTY；最多记住最近几条线程 */
export function ThreadTerminalBank({
  conversationId = null,
  workspacePath,
  hostActive = true,
  pendingCommand = null,
  onPendingCommandSent,
  clearTick = 0,
  onAskInSideChat
}: Props) {
  const key = threadTerminalKey(conversationId, workspacePath)
  const [panes, setPanes] = useState(() => rememberThreadTerminalPanes([], key, workspacePath))
  const cwdRef = useRef(new Map<string, string>([[key, workspacePath]]))

  useEffect(() => {
    cwdRef.current.set(key, workspacePath)
    setPanes((prev) => rememberThreadTerminalPanes(prev, key, workspacePath))
  }, [key, workspacePath])

  return (
    <div className="thread-terminal-bank">
      {panes.map((pane) => (
        <div
          key={pane.reactKey}
          className={`thread-terminal-pane${pane.convKey === key ? ' is-active' : ''}`}
          hidden={pane.convKey !== key}
        >
          <EmbeddedTerminal
            workspacePath={cwdRef.current.get(pane.convKey) || workspacePath}
            conversationId={pane.convKey}
            hostActive={hostActive && pane.convKey === key}
            pendingCommand={pane.convKey === key ? pendingCommand : null}
            onPendingCommandSent={onPendingCommandSent}
            clearTick={clearTick}
            onAskInSideChat={onAskInSideChat}
          />
        </div>
      ))}
    </div>
  )
}
