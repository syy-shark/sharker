/**
 * 输入区工作区切换选择器
 * @see src/README.md
 */
import { useEffect, useRef } from 'react'
import type { WorkspaceItem } from '../../shared/types'
import { sortWorkspaces } from '../../shared/workspace'
import { usePopoverAnimation } from '../hooks/usePopoverAnimation'
import './WorkspacePicker.css'

/** WorkspacePicker Props：工作区列表与切换回调 */
interface Props {
  workspaces: WorkspaceItem[]
  activeWorkspaceId: string
  onSelect: (id: string) => void
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11l8-6 8 6v9H4v-9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h6l2 2h8v10H4V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={up ? 'chevron-up' : ''}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 输入区工作区切换下拉 */
export function WorkspacePicker({ workspaces, activeWorkspaceId, onSelect }: Props) {
  const pop = usePopoverAnimation()
  const rootRef = useRef<HTMLDivElement>(null)

  const sorted = sortWorkspaces(workspaces ?? [])
  const active = sorted.find((w) => w.id === activeWorkspaceId) ?? sorted[0]

  useEffect(() => {
    if (!pop.open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) pop.hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pop.hide()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pop.open, pop.hide])

  const pick = (id: string) => {
    onSelect(id)
    pop.hide()
  }

  if (!active) return null

  return (
    <div
      className={`workspace-picker ${pop.expanded ? 'workspace-picker--open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`workspace-picker-trigger ${pop.open ? 'open' : ''}`}
        onClick={pop.toggle}
        aria-expanded={pop.open}
        aria-haspopup="listbox"
        title={active.path}
      >
        <span className="workspace-picker-trigger-icon">
          {active.isHome ? <HomeIcon /> : <FolderIcon />}
        </span>
        <span className="workspace-picker-trigger-label">{active.label}</span>
        <ChevronIcon up={pop.open} />
      </button>

      {pop.mounted && (
        <div
          className={`workspace-picker-menu ${pop.surfaceClass}`}
          role="listbox"
        >
          {sorted.map((w) => {
            const isActive = w.id === activeWorkspaceId
            return (
              <button
                key={w.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`workspace-picker-item ${isActive ? 'active' : ''}`}
                title={w.path}
                onClick={() => pick(w.id)}
              >
                <span className="workspace-picker-item-icon">
                  {w.isHome ? <HomeIcon /> : <FolderIcon />}
                </span>
                <span className="workspace-picker-item-label">{w.label}</span>
                {w.pinned && <span className="workspace-picker-pin">置顶</span>}
                {isActive && <span className="workspace-picker-check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
