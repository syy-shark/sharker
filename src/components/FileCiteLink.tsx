/**
 * 对话中的可点文件引用：默认打开右侧预览；设置 file_opener 后走官方 URI。
 * 右键：打开预览 / 在访达中显示 / 复制路径（对标 Codex file citation Open menu / #13123）。
 * 不接自定义 Open with，不订直播 token。
 * @see src/components/ARCH.md
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fileCitationMenuItems } from '../../shared/file-citation'
import { clampReviewMenuPosition } from '../../shared/review-file-click'
import {
  dispatchCopyWorkspaceFilePath,
  dispatchOpenWorkspaceFile,
  dispatchRevealWorkspaceFile
} from '../lib/open-workspace-file'
import './FileCiteLink.css'

/** 文件引用按钮 */
export function FileCiteLink({
  path,
  line,
  column,
  children
}: {
  path: string
  line?: number
  column?: number
  children: ReactNode
}) {
  const label = line ? `${path}:${line}` : path
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menu) return
    const onDoc = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[data-file-cite-menu]')) return
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

  return (
    <>
      <button
        type="button"
        className="file-cite-link"
        title={`${label} · 右键打开菜单`}
        onClick={() => dispatchOpenWorkspaceFile({ path, line, column })}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const next = clampReviewMenuPosition(
            event.clientX,
            event.clientY,
            { width: 176, height: 108 },
            { width: window.innerWidth, height: window.innerHeight }
          )
          setMenu({ x: next.x, y: next.y })
        }}
      >
        {children}
      </button>
      {menu && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="file-cite-menu glass-popover popover-enter"
              role="menu"
              data-file-cite-menu
              style={{ top: menu.y, left: menu.x }}
            >
              {fileCitationMenuItems(window.sharker?.platform).map((item) => (
                <button
                  key={item.action}
                  type="button"
                  role="menuitem"
                  className="file-cite-menu-item"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (item.action === 'open') {
                      dispatchOpenWorkspaceFile({ path, line, column })
                    } else if (item.action === 'reveal') {
                      dispatchRevealWorkspaceFile(path)
                    } else {
                      dispatchCopyWorkspaceFilePath(path)
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
}
