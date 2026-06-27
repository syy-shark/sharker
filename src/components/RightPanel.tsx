/**
 * 右侧可展开面板：文件树 / 终端 / 内置浏览器；支持拖拽调宽与全屏。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FileTree } from './panel/FileTree'
import { EmbeddedTerminal } from './panel/EmbeddedTerminal'
import { EmbeddedBrowser } from './panel/EmbeddedBrowser'
import './RightPanel.css'

export type RightPanelTab = 'files' | 'terminal' | 'browser'

const PANEL_WIDTH_KEY = 'sharker-right-panel-width'
const PANEL_DEFAULT_WIDTH = 400
const PANEL_MIN_WIDTH = 280
const PANEL_MAX_WIDTH = 820

interface Props {
  open: boolean
  tab: RightPanelTab
  workspacePath: string
  isHome?: boolean
  onTabChange: (tab: RightPanelTab) => void
  onClose?: () => void
}

/** Codex 风格右侧面板 */
export function RightPanel({
  open,
  tab,
  workspacePath,
  isHome = false,
  onTabChange,
  onClose
}: Props) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY)
    const n = saved ? Number(saved) : PANEL_DEFAULT_WIDTH
    return Number.isFinite(n)
      ? Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, n))
      : PANEL_DEFAULT_WIDTH
  })
  const [fullscreen, setFullscreen] = useState(false)
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef({ startX: 0, startWidth: width })

  useEffect(() => {
    if (!resizing) return
    document.body.classList.add('right-panel-resizing')

    const onMove = (e: MouseEvent) => {
      const delta = dragRef.current.startX - e.clientX
      const next = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(PANEL_MIN_WIDTH, dragRef.current.startWidth + delta)
      )
      setWidth(next)
    }

    const onUp = () => {
      setResizing(false)
      document.body.classList.remove('right-panel-resizing')
      setWidth((w) => {
        localStorage.setItem(PANEL_WIDTH_KEY, String(w))
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

  const panelWidth = open && !fullscreen ? width : undefined

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
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        returnToMain()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, returnToMain])

  return (
    <aside
      className={`right-panel ${open ? 'right-panel--open' : ''} ${fullscreen ? 'right-panel--fullscreen' : ''} ${resizing ? 'right-panel--resizing' : ''}`}
      style={panelWidth != null ? { width: panelWidth } : undefined}
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
              ['terminal', '终端'],
              ['browser', '浏览器']
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
          {open && !fullscreen ? (
            <button
              type="button"
              className="right-panel-return-btn"
              onClick={returnToMain}
            >
              返回主界面
            </button>
          ) : null}
          <button
            type="button"
            className="right-panel-icon-btn"
            aria-label={fullscreen ? '退出全屏' : '全屏'}
            title={fullscreen ? '退出全屏' : '全屏'}
            onClick={() => (fullscreen ? exitFullscreen() : setFullscreen(true))}
          >
            {fullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 4H4v5M20 15v5h-5M15 4h5v5M4 15v5h5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
      <div className="right-panel-body">
        {tab === 'files' && <FileTree workspacePath={workspacePath} isHome={isHome} />}
        {tab === 'terminal' && <EmbeddedTerminal workspacePath={workspacePath} />}
        {tab === 'browser' && <EmbeddedBrowser />}
      </div>
    </aside>
  )
}
