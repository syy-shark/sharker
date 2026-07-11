/**
 * 自定义窗口标题栏与最小化/最大化/关闭控件
 * @see src/README.md
 */
import { useState } from 'react'
import { Maximize2, Minus, X } from 'lucide-react'
import logoUrl from '../assets/logo-shark.png'
import './TitleBar.css'

const LOGO_FALLBACK = './logo-shark.png'

/** 自定义窗口标题栏（Linux/Win）与窗口控件 */
export function TitleBar() {
  const [src, setSrc] = useState(logoUrl)

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo-wrap">
          <img
            className="titlebar-logo"
            src={src}
            alt=""
            draggable={false}
            onError={() => {
              if (src !== LOGO_FALLBACK) setSrc(LOGO_FALLBACK)
            }}
          />
        </div>
        <span className="titlebar-brand">Sharker</span>
        <div className="titlebar-drag" />
      </div>
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          aria-label="最小化"
          onClick={() => window.sharker.windowMinimize()}
        >
          <Minus size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          aria-label="最大化"
          onClick={() => window.sharker.windowMaximize()}
        >
          <Maximize2 size={13} aria-hidden />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          aria-label="关闭"
          onClick={() => window.sharker.windowClose()}
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </header>
  )
}
