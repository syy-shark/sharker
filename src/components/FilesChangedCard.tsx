/**
 * 对话「已改 N 个文件」卡：标题打开审查，展开列路径，右键在访达中显示。
 * 不订直播 token，只吃本轮路径列表（对标 Codex Files changed card / #38695）。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatChangedFilesLabel } from '../../shared/turn-notify'
import {
  filesChangedDisplayPaths,
  filesChangedFileMenuItems,
  filesChangedHeaderTargetFromElement
} from '../../shared/files-changed-card'
import { clampReviewMenuPosition } from '../../shared/review-file-click'
import {
  dispatchOpenWorkspaceFile,
  dispatchRevealWorkspaceFile
} from '../lib/open-workspace-file'
import './FilesChangedCard.css'

interface Props {
  files: readonly string[]
  live?: boolean
  onOpenReview?: (paths: string[]) => void
}

/** 本轮写盘摘要卡 */
export const FilesChangedCard = memo(function FilesChangedCard({
  files,
  live = false,
  onOpenReview
}: Props) {
  const paths = filesChangedDisplayPaths(files)
  const [expanded, setExpanded] = useState(false)
  const [menu, setMenu] = useState<{
    path: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    if (!menu) return
    const onDoc = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[data-files-changed-menu]')) return
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

  if (paths.length === 0) return null
  const label = formatChangedFilesLabel(paths.length)

  return (
    <div className="files-changed-card">
      <div className="assistant-changed-row">
        {onOpenReview ? (
          <button
            type="button"
            className={`assistant-meta-chip${live ? ' assistant-meta-chip--live' : ''}`}
            title="打开本轮审查"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (filesChangedHeaderTargetFromElement(event.target) === 'toggle') {
                setExpanded((open) => !open)
                return
              }
              onOpenReview(paths)
            }}
          >
            <span>已改</span>
            <span className="assistant-meta-chip-value">{paths.length} 个文件</span>
          </button>
        ) : (
          <span className="assistant-meta-chip assistant-meta-chip--static" title={label}>
            <span>已改</span>
            <span className="assistant-meta-chip-value">{paths.length} 个文件</span>
          </span>
        )}
        <button
          type="button"
          className="files-changed-card__toggle"
          data-files-changed-toggle
          aria-expanded={expanded}
          aria-label={expanded ? '收起文件列表' : '展开文件列表'}
          title={expanded ? '收起文件列表' : '展开文件列表'}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setExpanded((open) => !open)
          }}
        >
          <ChevronDown
            size={12}
            className={`assistant-meta-chevron${expanded ? ' assistant-meta-chevron--open' : ''}`}
            aria-hidden
          />
        </button>
      </div>
      <div
        className={`files-changed-card__collapse${expanded ? ' files-changed-card__collapse--open' : ''}`}
        aria-hidden={!expanded}
        inert={expanded ? undefined : true}
      >
        <div className="files-changed-card__collapse-inner">
          <ul className="files-changed-card__list">
            {paths.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className="files-changed-card__file"
                  data-files-changed-file
                  title={`${path} · 打开`}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    dispatchOpenWorkspaceFile({ path })
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const next = clampReviewMenuPosition(
                      event.clientX,
                      event.clientY,
                      { width: 176, height: 76 },
                      { width: window.innerWidth, height: window.innerHeight }
                    )
                    setMenu({ path, x: next.x, y: next.y })
                  }}
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {menu ? (
        <div
          className="files-changed-card__menu glass-popover popover-enter"
          role="menu"
          data-files-changed-menu
          style={{ top: menu.y, left: menu.x }}
        >
          {filesChangedFileMenuItems(window.sharker?.platform).map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className="files-changed-card__menu-item"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (item.action === 'open') dispatchOpenWorkspaceFile({ path: menu.path })
                else dispatchRevealWorkspaceFile(menu.path)
                setMenu(null)
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
})
