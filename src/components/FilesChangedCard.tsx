/**
 * 对话「已改 N 个文件」卡：标题打开审查，展开列短标签、种类与 +/-，右键打开 / 访达 / 复制路径。
 * 不订直播 token，只吃路径列表与已合计的 +/-（对标 Codex Files changed / #20700 / #21426）。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatChangedFilesLabel } from '../../shared/turn-notify'
import {
  filesChangedDisplayLabel,
  filesChangedDisplayPaths,
  filesChangedFileMenuItems,
  filesChangedHeaderTargetFromElement,
  filesChangedKindLabel,
  filesChangedStatsForPath,
  formatFilesChangedLineStats,
  type FilesChangedLineStats
} from '../../shared/files-changed-card'
import { clampReviewMenuPosition } from '../../shared/review-file-click'
import {
  dispatchCopyWorkspaceFilePath,
  dispatchOpenWorkspaceFile,
  dispatchRevealWorkspaceFile
} from '../lib/open-workspace-file'
import './FilesChangedCard.css'

interface Props {
  files: readonly string[]
  live?: boolean
  added?: number
  removed?: number
  fileStats?: Readonly<Record<string, FilesChangedLineStats>>
  onOpenReview?: (paths: string[]) => void
}

function FilesChangedStatsMarks({
  added,
  removed,
  reserve
}: {
  added: number
  removed: number
  reserve?: boolean
}) {
  const label = formatFilesChangedLineStats(added, removed)
  if (!label && !reserve) return null
  return (
    <span
      className="files-changed-card__stats"
      title={label || undefined}
      aria-hidden={!label}
    >
      <span
        className={`files-changed-card__stat files-changed-card__stat--add${
          added ? '' : ' is-empty'
        }`}
      >
        +{added}
      </span>
      <span
        className={`files-changed-card__stat files-changed-card__stat--del${
          removed ? '' : ' is-empty'
        }`}
      >
        −{removed}
      </span>
    </span>
  )
}

/** 本轮写盘摘要卡 */
export const FilesChangedCard = memo(function FilesChangedCard({
  files,
  live = false,
  added = 0,
  removed = 0,
  fileStats,
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
  const totalsLabel = formatFilesChangedLineStats(added, removed)
  const chipTitle = totalsLabel ? `${label} ${totalsLabel}` : label

  return (
    <div className="files-changed-card">
      <div className="assistant-changed-row">
        {onOpenReview ? (
          <button
            type="button"
            className={`assistant-meta-chip${live ? ' assistant-meta-chip--live' : ''}`}
            title={chipTitle}
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
            <FilesChangedStatsMarks added={added} removed={removed} reserve={live} />
          </button>
        ) : (
          <span className="assistant-meta-chip assistant-meta-chip--static" title={chipTitle}>
            <span>已改</span>
            <span className="assistant-meta-chip-value">{paths.length} 个文件</span>
            <FilesChangedStatsMarks added={added} removed={removed} reserve={live} />
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
            {paths.map((path) => {
              const stats = filesChangedStatsForPath(path, fileStats)
              const statsLabel = stats
                ? formatFilesChangedLineStats(stats.added, stats.removed)
                : ''
              return (
              <li key={path}>
                <button
                  type="button"
                  className="files-changed-card__file"
                  data-files-changed-file
                  title={statsLabel ? `${path} · ${statsLabel} · 打开` : `${path} · 打开`}
                  aria-label={path}
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
                      { width: 176, height: 108 },
                      { width: window.innerWidth, height: window.innerHeight }
                    )
                    setMenu({ path, x: next.x, y: next.y })
                  }}
                >
                  <span className="files-changed-card__file-name">
                    {filesChangedDisplayLabel(path, paths)}
                  </span>
                  {filesChangedKindLabel(path) ? (
                    <span className="files-changed-card__file-kind">
                      {filesChangedKindLabel(path)}
                    </span>
                  ) : null}
                  {stats && statsLabel ? (
                    <FilesChangedStatsMarks added={stats.added} removed={stats.removed} />
                  ) : null}
                </button>
              </li>
              )
            })}
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
                else if (item.action === 'reveal') dispatchRevealWorkspaceFile(menu.path)
                else dispatchCopyWorkspaceFilePath(menu.path)
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
