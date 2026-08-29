/**
 * 右侧可展开面板：文件树 / 终端 / 内置浏览器；拖拽调宽按窗口比例记忆（对标 Codex）。
 */
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Expand, Minimize2, X } from 'lucide-react'
import { FileTree } from './panel/FileTree'
import { ThreadTerminalBank } from './panel/EmbeddedTerminal'
import { EmbeddedBrowser } from './panel/EmbeddedBrowser'
import { ChangesPanel } from './panel/ChangesPanel'
import { AgentsPanel } from './panel/AgentsPanel'
import './RightPanel.css'
import { RIGHT_PANEL_LAYOUT, WORKBENCH_BREAKPOINT } from '../constants/layout'
import {
  panelWidthFromRatio,
  panelWidthToRatio,
  parseStoredPanelWidth,
  serializePanelWidthRatio
} from '../../shared/panel-width'

export type RightPanelTab = 'files' | 'changes' | 'terminal' | 'browser' | 'agents'

const EMPTY_EXTRA_ROOTS: string[] = []

const PANEL_WIDTH_KEY = 'sharker-right-panel-width'
const PANEL_DEFAULT_WIDTH = RIGHT_PANEL_LAYOUT.default
const PANEL_MIN_WIDTH = RIGHT_PANEL_LAYOUT.min
const PANEL_MAX_WIDTH = RIGHT_PANEL_LAYOUT.max

interface Props {
  open: boolean
  tab: RightPanelTab
  workspacePath: string
  isHome?: boolean
  onTabChange: (tab: RightPanelTab) => void
  onClose?: () => void
  /** 工具写盘后递增，审查列表与打开的文件树立刻刷新 */
  changesRevision?: number
  /** 审查行内评论 → 写入输入框跟进草稿，不自动开一轮 */
  onSendReviewComments?: (prompt: string) => void
  /** 上一轮助手写过的相对路径 */
  lastTurnPaths?: string[]
  reviewFocus?: {
    mode: 'uncommitted' | 'last_turn' | 'branch' | 'commit'
    sha?: string
    token: number
  } | null
  /** `/review` 行内发现 */
  agentFindings?: import('../../shared/review-comment').ReviewLineComment[]
  /** 审查队列「接受」预填的提交说明 */
  suggestedCommit?: string
  /** 当前对话：子 Agent 只挂在父线程下 */
  conversationId?: string | null
  /** 主线程点开的子 Agent */
  focusSubAgentId?: string | null
  /** Composer `!` 待写入终端的命令 */
  pendingTerminalCommand?: string | null
  onPendingTerminalCommandSent?: () => void
  /** Ctrl+L：递增后清屏 */
  terminalClearTick?: number
  /** Settings → Git 分支名前缀，审查面板创建分支占位提示 */
  gitBranchPrefix?: string
  /** 对话文件引用要打开的预览 */
  filePreview?: { path: string; line?: number; token: number } | null
  /** 项目附加文件夹（对标 Codex Edit project secondary folders） */
  extraRoots?: string[]
  /** 终端 / 文件预览划选 → 旁路提问（对标 Codex Ask in side chat） */
  onAskInSideChat?: (prompt: string) => void
  /** 终端 / 文件预览划选 → composer Selection 芯片 */
  onInsertComposer?: (
    text: string,
    source?: import('../../shared/side-chat-quote').SideChatSource,
    comment?: string
  ) => void
}

/** Codex 风格右侧面板 */
export const RightPanel = memo(function RightPanel({
  open,
  tab,
  workspacePath,
  isHome = false,
  onTabChange,
  onClose,
  changesRevision = 0,
  onSendReviewComments,
  lastTurnPaths = [],
  reviewFocus = null,
  agentFindings = [],
  suggestedCommit = '',
  conversationId = null,
  focusSubAgentId = null,
  pendingTerminalCommand = null,
  onPendingTerminalCommandSent,
  terminalClearTick = 0,
  gitBranchPrefix = '',
  filePreview = null,
  extraRoots = EMPTY_EXTRA_ROOTS,
  onAskInSideChat,
  onInsertComposer
}: Props) {
  const viewportWidth = () => (typeof window === 'undefined' ? 1440 : window.innerWidth || 1440)
  const [width, setWidth] = useState(() =>
    parseStoredPanelWidth(
      typeof localStorage === 'undefined' ? null : localStorage.getItem(PANEL_WIDTH_KEY),
      viewportWidth(),
      PANEL_MIN_WIDTH,
      PANEL_MAX_WIDTH,
      PANEL_DEFAULT_WIDTH
    )
  )
  const ratioRef = useRef(panelWidthToRatio(width, viewportWidth()))
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, serializePanelWidthRatio(width, viewportWidth()))
    } catch {
      /* quota / private mode */
    }
  }, [])
  const [fullscreen, setFullscreen] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [compact, setCompact] = useState(() => window.innerWidth < WORKBENCH_BREAKPOINT)
  /** 窄屏遮罩：关闭时先播 exit 再卸载，避免瞬隐 */
  const [backdropMounted, setBackdropMounted] = useState(false)
  const [backdropExiting, setBackdropExiting] = useState(false)
  /** 开过终端后保持挂载，切 Tab / 对话不杀 PTY */
  const [terminalTouched, setTerminalTouched] = useState(false)
  const backdropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef({ startX: 0, startWidth: width })
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!resizing) return
    document.body.classList.add('right-panel-resizing')

    const onMove = (e: MouseEvent) => {
      const delta = dragRef.current.startX - e.clientX
      const next = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(PANEL_MIN_WIDTH, dragRef.current.startWidth + delta)
      )
      ratioRef.current = panelWidthToRatio(next, viewportWidth())
      setWidth(next)
    }

    const onUp = () => {
      setResizing(false)
      document.body.classList.remove('right-panel-resizing')
      setWidth((w) => {
        const ratio = panelWidthToRatio(w, viewportWidth())
        ratioRef.current = ratio
        localStorage.setItem(PANEL_WIDTH_KEY, serializePanelWidthRatio(w, viewportWidth()))
        return w
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('right-panel-resizing')
    }
  }, [resizing])

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      if (!open || fullscreen) return
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startWidth: width }
      setResizing(true)
    },
    [open, fullscreen, width]
  )

  const exitFullscreen = useCallback(() => {
    setFullscreen(false)
  }, [])

  /** 退出全屏并关闭面板，回到主聊天界面 */
  const returnToMain = useCallback(() => {
    setFullscreen(false)
    onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!open) setFullscreen(false)
  }, [open])

  useEffect(() => {
    if (tab === 'terminal') setTerminalTouched(true)
  }, [tab])

  /** 全屏时给 body 打标：隐藏下层侧栏/主区，杜绝文字透出叠字 */
  useEffect(() => {
    if (!fullscreen) {
      document.body.classList.remove('right-panel-fullscreen')
      return
    }
    document.body.classList.add('right-panel-fullscreen')
    return () => {
      document.body.classList.remove('right-panel-fullscreen')
    }
  }, [fullscreen])

  /** 展开/收起时标记 animating：CSS 关掉 blur，过渡结束后再开 */
  useEffect(() => {
    if (fullscreen || resizing) {
      setAnimating(false)
      return
    }
    setAnimating(true)
    const el = panelRef.current
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      setAnimating(false)
    }
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return
      if (e.propertyName !== 'transform' && e.propertyName !== 'margin-right') return
      settle()
    }
    el?.addEventListener('transitionend', onEnd)
    // 兜底：避免 transitionend 丢失时一直无 blur
    const t = window.setTimeout(settle, 360)
    return () => {
      el?.removeEventListener('transitionend', onEnd)
      window.clearTimeout(t)
    }
  }, [open, fullscreen, resizing])

  useEffect(() => {
    // matchMedia 比裸 resize 更稳：CDP/Emulation 改 viewport 时也能同步 compact
    const mql = window.matchMedia(`(max-width: ${WORKBENCH_BREAKPOINT - 1}px)`)
    const syncCompact = () => setCompact(mql.matches)
    syncCompact()
    const onChange = () => syncCompact()
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange)
    else mql.addListener(onChange)
    const syncWidth = () => {
      if (document.body.classList.contains('right-panel-resizing')) return
      setWidth(
        panelWidthFromRatio(ratioRef.current, viewportWidth(), PANEL_MIN_WIDTH, PANEL_MAX_WIDTH)
      )
    }
    window.addEventListener('resize', syncCompact)
    window.addEventListener('resize', syncWidth)
    window.visualViewport?.addEventListener('resize', syncCompact)
    window.visualViewport?.addEventListener('resize', syncWidth)
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange)
      else mql.removeListener(onChange)
      window.removeEventListener('resize', syncCompact)
      window.removeEventListener('resize', syncWidth)
      window.visualViewport?.removeEventListener('resize', syncCompact)
      window.visualViewport?.removeEventListener('resize', syncWidth)
    }
  }, [])

  // 打开面板时强制同步一次，避免“已打开时改宽度”漏遮罩
  useEffect(() => {
    if (!open) return
    setCompact(window.matchMedia(`(max-width: ${WORKBENCH_BREAKPOINT - 1}px)`).matches)
  }, [open])

  useEffect(() => {
    const shouldShow = compact && open && !fullscreen
    if (shouldShow) {
      if (backdropTimerRef.current) {
        clearTimeout(backdropTimerRef.current)
        backdropTimerRef.current = null
      }
      setBackdropExiting(false)
      setBackdropMounted(true)
      return
    }
    // 已在退出中或未挂载：勿重开计时，避免 StrictMode/重渲染打断 exit
    if (!backdropMounted || backdropExiting) return
    setBackdropExiting(true)
    backdropTimerRef.current = setTimeout(() => {
      setBackdropMounted(false)
      setBackdropExiting(false)
      backdropTimerRef.current = null
    }, 280)
  }, [compact, open, fullscreen, backdropMounted, backdropExiting])

  useEffect(() => {
    return () => {
      if (backdropTimerRef.current) {
        clearTimeout(backdropTimerRef.current)
        backdropTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!fullscreen && !(compact && open)) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        returnToMain()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compact, fullscreen, open, returnToMain])

  const panel = (
    <aside
      ref={panelRef}
      className={[
        'right-panel',
        open ? 'right-panel--open' : '',
        compact ? 'right-panel--compact' : '',
        fullscreen ? 'right-panel--fullscreen' : '',
        resizing ? 'right-panel--resizing' : '',
        animating && !fullscreen ? 'right-panel--animating' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        fullscreen || compact
          ? undefined
          : ({
              ['--right-panel-w' as string]: `${width}px`,
              width,
              minWidth: width,
              maxWidth: width
            } as CSSProperties)
      }
      aria-label="工作区面板"
      aria-hidden={!open}
    >
      {open && fullscreen ? (
        <div className="right-panel-return-bar">
          <button
            type="button"
            className="right-panel-return-btn right-panel-return-btn--overlay"
            onClick={returnToMain}
          >
            返回主界面
          </button>
        </div>
      ) : null}
      {!fullscreen && open ? (
        <div
          className="right-panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整面板宽度"
          title="拖动调整宽度"
          onMouseDown={startResize}
        />
      ) : null}
      <div className="right-panel-head">
        <div className="right-panel-tabs" role="tablist">
          {(
            [
              ['files', '文件'],
              ['changes', '变更'],
              ['terminal', '终端'],
              ['browser', '浏览器'],
              ['agents', '活动']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`right-panel-tab ${tab === id ? 'active' : ''}`}
              onClick={() => onTabChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="right-panel-head-actions">
          <button
            type="button"
            className="right-panel-icon-btn"
            aria-label={fullscreen ? '退出全屏' : '全屏'}
            title={fullscreen ? '退出全屏' : '全屏'}
            onClick={() => (fullscreen ? exitFullscreen() : setFullscreen(true))}
          >
            {fullscreen ? <Minimize2 size={16} aria-hidden /> : <Expand size={16} aria-hidden />}
          </button>
          <button
            type="button"
            className="right-panel-icon-btn"
            aria-label="关闭工作区面板"
            title="关闭"
            onClick={returnToMain}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
      <div
        className={`right-panel-body${tab === 'terminal' ? ' right-panel-body--terminal' : ''}${
          tab !== 'terminal' ? ' view-enter' : ''
        }`}
      >
        {tab === 'files' && (
          <FileTree
            workspacePath={workspacePath}
            isHome={isHome}
            previewRequest={filePreview}
            extraRoots={extraRoots}
            onAskInSideChat={onAskInSideChat}
            onInsertComposer={onInsertComposer}
            revision={changesRevision}
          />
        )}
        {tab === 'changes' && (
          <ChangesPanel
            workspacePath={workspacePath}
            revision={changesRevision}
            lastTurnPaths={lastTurnPaths}
            reviewFocus={reviewFocus}
            agentFindings={agentFindings}
            suggestedCommit={suggestedCommit}
            onSendComments={onSendReviewComments}
            gitBranchPrefix={gitBranchPrefix}
            extraRoots={extraRoots}
          />
        )}
        {tab === 'browser' && <EmbeddedBrowser onInsertComposer={onInsertComposer} />}
        {tab === 'agents' && (
          <AgentsPanel conversationId={conversationId} focusId={focusSubAgentId} />
        )}
        {terminalTouched ? (
          <div
            className={`right-panel-terminal-host${tab === 'terminal' ? ' is-active' : ''}`}
            hidden={tab !== 'terminal'}
          >
            <ThreadTerminalBank
              conversationId={conversationId}
              workspacePath={workspacePath}
              hostActive={open && tab === 'terminal'}
              pendingCommand={pendingTerminalCommand}
              onPendingCommandSent={onPendingTerminalCommandSent}
              clearTick={terminalClearTick}
              onAskInSideChat={onAskInSideChat}
              onInsertComposer={onInsertComposer}
            />
          </div>
        ) : null}
      </div>
    </aside>
  )

  return (
    <>
      {backdropMounted ? (
        <button
          type="button"
          className={`right-panel-backdrop${backdropExiting ? ' right-panel-backdrop--exit' : ''}`}
          aria-label="关闭工作区面板"
          onClick={returnToMain}
          tabIndex={backdropExiting ? -1 : 0}
        />
      ) : null}
      {panel}
    </>
  )
})
