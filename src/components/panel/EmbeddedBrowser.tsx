/**
 * 内置浏览器（Electron webview）：URL 栏 + 缩放控制。
 */
import { useEffect, useRef, useState } from 'react'
import './EmbeddedBrowser.css'

interface Props {
  initialUrl?: string
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1

/** webview 浏览器面板 */
export function EmbeddedBrowser({ initialUrl = 'https://www.google.com' }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [input, setInput] = useState(initialUrl)
  const [zoom, setZoom] = useState(1)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const applyZoom = (factor: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(factor * 100) / 100))
    setZoom(next)
    try {
      webviewRef.current?.setZoomFactor(next)
    } catch {
      /* webview not ready */
    }
  }

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    const onNav = () => {
      try {
        const u = wv.getURL()
        if (u) setInput(u)
      } catch {
        /* loading */
      }
    }
    const onDomReady = () => {
      try {
        wv.setZoomFactor(zoom)
      } catch {
        /* ignore */
      }
    }
    wv.addEventListener('did-navigate', onNav)
    wv.addEventListener('did-navigate-in-page', onNav)
    wv.addEventListener('dom-ready', onDomReady)
    return () => {
      wv.removeEventListener('did-navigate', onNav)
      wv.removeEventListener('did-navigate-in-page', onNav)
      wv.removeEventListener('dom-ready', onDomReady)
    }
  }, [zoom])

  const navigate = () => {
    let next = input.trim()
    if (!next) return
    if (!/^https?:\/\//i.test(next)) next = `https://${next}`
    setUrl(next)
    webviewRef.current?.loadURL(next)
  }

  return (
    <div className="embedded-browser">
      <div className="embedded-browser-bar">
        <input
          className="embedded-browser-url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate()
          }}
          placeholder="输入 URL"
        />
        <button type="button" className="embedded-browser-go" onClick={navigate}>
          前往
        </button>
      </div>
      <div className="embedded-browser-zoom">
        <button type="button" className="embedded-browser-zoom-btn" onClick={() => applyZoom(zoom - ZOOM_STEP)} aria-label="缩小">
          −
        </button>
        <span className="embedded-browser-zoom-label">{Math.round(zoom * 100)}%</span>
        <button type="button" className="embedded-browser-zoom-btn" onClick={() => applyZoom(zoom + ZOOM_STEP)} aria-label="放大">
          +
        </button>
        <button type="button" className="embedded-browser-zoom-reset" onClick={() => applyZoom(1)}>
          重置
        </button>
      </div>
      {/* @ts-expect-error webview is Electron-only */}
      <webview
        ref={webviewRef as never}
        className="embedded-browser-view"
        src={url}
        allowpopups="true"
      />
    </div>
  )
}
