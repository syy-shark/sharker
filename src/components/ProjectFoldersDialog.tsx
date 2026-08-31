/**
 * 编辑项目文件夹：对标 Codex desktop Edit project。
 * @see src/components/ARCH.md
 */
import { useEffect } from 'react'
import {
  ADD_FOLDER_LABEL,
  PROJECTS_NEED_NO_FOLDER_HINT,
  EDIT_PROJECT_INTRO,
  EDIT_PROJECT_LABEL,
  FILE_CLOSE_LABEL,
  MAKE_PRIMARY_LABEL,
  PRIMARY_FOLDER_LABEL,
  SECONDARY_FOLDERS_LABEL
} from '../../shared/reveal-in-folder'
import type { WorkspaceItem } from '../../shared/types'
import './ProjectFoldersDialog.css'

interface Props {
  workspace: WorkspaceItem | null
  onClose: () => void
  onChangePrimary: (workspaceId: string) => void
  onAddExtra: (workspaceId: string) => void
  onRemoveExtra: (workspaceId: string, folder: string) => void
  onPromoteExtra: (workspaceId: string, folder: string) => void
}

/** 主文件夹 + 附加文件夹。Git / AGENTS.md / Skill 仍走主路径。 */
export function ProjectFoldersDialog({
  workspace,
  onClose,
  onChangePrimary,
  onAddExtra,
  onRemoveExtra,
  onPromoteExtra
}: Props) {
  useEffect(() => {
    if (!workspace) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [workspace, onClose])

  if (!workspace) return null

  return (
    <div className="project-folders-root" role="presentation">
      <button type="button" className="project-folders-backdrop" aria-label={FILE_CLOSE_LABEL} onClick={onClose} />
      <div
        className="project-folders-dialog glass-popover popover-enter"
        role="dialog"
        aria-labelledby="project-folders-title"
      >
        <div className="project-folders-head">
          <h2 id="project-folders-title">{EDIT_PROJECT_LABEL}</h2>
          <p>{EDIT_PROJECT_INTRO}</p>
        </div>
        <div className="project-folders-block">
          <span className="project-folders-label">{PRIMARY_FOLDER_LABEL}</span>
          <div className="project-folders-row">
            <code title={workspace.path}>{workspace.path}</code>
            {workspace.isHome ? null : (
              <button type="button" onClick={() => onChangePrimary(workspace.id)}>
                更改
              </button>
            )}
          </div>
        </div>
        <div className="project-folders-block">
          <span className="project-folders-label">{SECONDARY_FOLDERS_LABEL}</span>
          {(workspace.extraPaths ?? []).length === 0 ? (
            <p className="project-folders-empty">{PROJECTS_NEED_NO_FOLDER_HINT}</p>
          ) : (
            <ul>
              {(workspace.extraPaths ?? []).map((folder) => (
                <li key={folder} className="project-folders-row">
                  <code title={folder}>{folder}</code>
                  {workspace.isHome ? null : (
                    <button type="button" onClick={() => onPromoteExtra(workspace.id, folder)}>
                      {MAKE_PRIMARY_LABEL}
                    </button>
                  )}
                  <button type="button" onClick={() => onRemoveExtra(workspace.id, folder)}>
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="project-folders-add" onClick={() => onAddExtra(workspace.id)}>
            {ADD_FOLDER_LABEL}
          </button>
        </div>
        <div className="project-folders-actions">
          <button type="button" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
