/**
 * 自定义窗口标题栏与最小化/最大化/关闭控件
 * @see src/README.md
 */
import { useState } from 'react'
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
        <div className="titlebar-drag" />
      </div>
      <span className="titlebar-title">
        Shar<span className="titlebar-title-accent">K</span>er
      </span>
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          aria-label="最小化"
          onClick={() => window.sharker.windowMinimize()}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-btn"
          aria-label="最大化"
          onClick={() => window.sharker.windowMaximize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          aria-label="关闭"
          onClick={() => window.sharker.windowClose()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M1 1 L9 9 M9 1 L1 9"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  )
}
