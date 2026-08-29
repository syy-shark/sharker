/**
 * 对话 http(s) / file:// HTML 链接：点进内置浏览器，⌘/Ctrl+点进系统浏览器，右键选打开目标或复制。
 * 对标 Codex clicking a URL / #41122。不订直播 token，不发明默认打开设置。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { chatLinkMenuItems, resolveChatLinkOpen } from '../../shared/chat-link'
import { clampReviewMenuPosition } from '../../shared/review-file-click'
import { dispatchOpenBrowserUrl } from '../lib/browser-history-store'
import './ChatLink.css'

const MENU_SIZE = { width: 200, height: 108 }

/** 对话 / 直播正文里的 http(s) 链接 */
export const ChatLink = memo(function ChatLink({
  href,
  title,
  children
}: {
  href: string
  title?: string
  children: ReactNode
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menu) return
    const onDoc = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[data-chat-link-menu]')) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const open = (target: 'in-app' | 'system') => {
    if (target === 'in-app') dispatchOpenBrowserUrl(href)
    else void window.sharker?.openExternal?.(href)
  }

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="chat-link"
        title={title?.trim() || '⌘/Ctrl+点击在系统浏览器打开 · 右键打开菜单'}
        onClick={(event) => {
          event.preventDefault()
          const target = resolveChatLinkOpen(href, event)
          if (target === 'in-app' || target === 'system') open(target)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const next = clampReviewMenuPosition(
            event.clientX,
            event.clientY,
            MENU_SIZE,
            { width: window.innerWidth, height: window.innerHeight }
          )
          setMenu({ x: next.x, y: next.y })
        }}
      >
        {children}
      </a>
      {menu && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="chat-link-menu glass-popover popover-enter"
              role="menu"
              data-chat-link-menu
              style={{ top: menu.y, left: menu.x }}
            >
              {chatLinkMenuItems().map((item) => (
                <button
                  key={item.action}
                  type="button"
                  role="menuitem"
                  className="chat-link-menu-item"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (item.action === 'copy') {
                      if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(href)
                    } else {
                      open(item.action)
                    }
                    setMenu(null)
                  }}
                >
                  {item.title}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
})
