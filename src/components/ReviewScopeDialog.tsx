/**
 * `/review` 范围选择：对标 Codex 桌面「未提交 / 相对基线」。
 * 选定前不派发审查回合，避免空 `/review` 撞直播。
 * @see src/components/ARCH.md
 */
import { useEffect, useState } from 'react'
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
        aria-label="关闭审查范围"
        onClick={onClose}
      />
      <div
        className="review-scope-dialog glass-popover popover-enter"
        role="dialog"
        aria-labelledby="review-scope-title"
      >
        <div className="review-scope-head">
          <h2 id="review-scope-title">选择审查范围</h2>
          <p>
            对标 Codex <code>/review</code>：先选未提交变更或相对基线。指定提交可填
            sha。选定后再开审，直播中不会中止当前回合。
          </p>
        </div>
        <div className="review-scope-choices">
          <button type="button" onClick={() => onPick('uncommitted')}>
            <strong>未提交变更</strong>
            <span>工作区脏文件与未跟踪文件（官方 Uncommitted）</span>
          </button>
          <button type="button" onClick={() => onPick('branch')}>
            <strong>相对基线</strong>
            <span>当前分支相对 origin/HEAD 或 main（官方 Review against a base branch）</span>
          </button>
          <button type="button" onClick={() => onPick('commit', sha.trim() || undefined)}>
            <strong>指定提交</strong>
            <span>审查某一个 commit；空 sha 则看 HEAD</span>
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
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
