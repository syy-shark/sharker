/**
 * `/review` 范围选择：官方 Choose Review against a base branch or Review uncommitted changes。
 * 选定前不派发审查回合，避免空 `/review` 撞直播。
 * @see src/components/ARCH.md
 */
import { useEffect, useState } from 'react'
import { FILE_CLOSE_LABEL, REVIEW_LABEL } from '../../shared/reveal-in-folder'
import {
  REVIEW_A_COMMIT_DESCRIPTION,
  REVIEW_A_COMMIT_LABEL,
  REVIEW_AGAINST_A_BASE_BRANCH_DESCRIPTION,
  REVIEW_AGAINST_A_BASE_BRANCH_LABEL,
  REVIEW_SCOPE_INTRO,
  REVIEW_UNCOMMITTED_CHANGES_DESCRIPTION,
  REVIEW_UNCOMMITTED_CHANGES_LABEL
} from '../../shared/review-prompt'
import './ReviewScopeDialog.css'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (scope: 'uncommitted' | 'branch' | 'commit', commit?: string) => void
}

/** 官方 /review 先选范围再开审；指定提交可填 sha，空则 HEAD */
export function ReviewScopeDialog({ open, onClose, onPick }: Props) {
  const [sha, setSha] = useState('')

  useEffect(() => {
    if (!open) return
    setSha('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="review-scope-root" role="presentation">
      <button
        type="button"
        className="review-scope-backdrop"
        aria-label={FILE_CLOSE_LABEL}
        onClick={onClose}
      />
      <div
        className="review-scope-dialog glass-popover popover-enter"
        role="dialog"
        aria-labelledby="review-scope-title"
      >
        <div className="review-scope-head">
          <h2 id="review-scope-title">{REVIEW_LABEL}</h2>
          <p>{REVIEW_SCOPE_INTRO}</p>
        </div>
        <div className="review-scope-choices">
          <button type="button" onClick={() => onPick('uncommitted')}>
            <strong>{REVIEW_UNCOMMITTED_CHANGES_LABEL}</strong>
            <span>{REVIEW_UNCOMMITTED_CHANGES_DESCRIPTION}</span>
          </button>
          <button type="button" onClick={() => onPick('branch')}>
            <strong>{REVIEW_AGAINST_A_BASE_BRANCH_LABEL}</strong>
            <span>{REVIEW_AGAINST_A_BASE_BRANCH_DESCRIPTION}</span>
          </button>
          <button type="button" onClick={() => onPick('commit', sha.trim() || undefined)}>
            <strong>{REVIEW_A_COMMIT_LABEL}</strong>
            <span>{REVIEW_A_COMMIT_DESCRIPTION}</span>
          </button>
        </div>
        <label className="review-scope-sha">
          提交 sha（可选）
          <input
            value={sha}
            onChange={(event) => setSha(event.target.value)}
            placeholder="HEAD 或 7–40 位 hex"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <div className="review-scope-actions">
          <button type="button" onClick={onClose}>
            {FILE_CLOSE_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
