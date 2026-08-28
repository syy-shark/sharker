/**
 * 行级代码 diff 展示：过程流 / Markdown 用只读块；审查模式带 hunk 动作与行内评论。
 * @see src/ARCH.md
 */
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FileDiff, FileDiffLine } from '../../shared/types'
import { statsFromLines } from '../../shared/line-diff'
import { splitDiffHunks, type DiffHunk } from '../../shared/diff-hunk'
import type { GitReviewAction } from '../../shared/git-review-actions'
import type { ReviewLineComment } from '../../shared/review-comment'
import { CodeArtifactShell } from './CodeArtifactBlock'
import './CodeDiffBlock.css'

const DEFAULT_MAX_LINES = 40

function DiffStat({ kind, value }: { kind: 'add' | 'del'; value: number }) {
  if (value <= 0) return null
  return (
    <span className={`code-diff-stat code-diff-stat-${kind}`}>
      {kind === 'add' ? '+' : '-'}
      {value}
    </span>
  )
}

/** 审查模式：hunk 动作 + 行内评论 */
export interface CodeDiffReviewProps {
  scope: 'unstaged' | 'staged'
  acting?: boolean
  comments?: ReviewLineComment[]
  onHunkAction?: (hunk: DiffHunk, action: GitReviewAction) => void
  onAddComment?: (comment: Omit<ReviewLineComment, 'id'>) => void
}

/** CodeDiffBlock Props */
interface Props {
  diff?: FileDiff
  lines?: FileDiffLine[]
  path?: string
  maxPreviewLines?: number
  /** 过程流内默认展开全部 */
  defaultExpanded?: boolean
  /** 父组件已经展示文件名/统计时可隐藏头部 */
  showHeader?: boolean
  review?: CodeDiffReviewProps
}

function serializeDiff(lines: FileDiffLine[]): string {
  return lines
    .map((line) => `${line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}${line.content}`)
    .join('\n')
}

function lineKey(line: FileDiffLine, index: number): string {
  return `${line.kind}-${index}-${line.oldLine ?? ''}-${line.newLine ?? ''}`
}

function commentLineNumber(line: FileDiffLine): number {
  return line.newLine ?? line.oldLine ?? 0
}

function commentSide(line: FileDiffLine): 'old' | 'new' {
  return line.kind === 'del' ? 'old' : 'new'
}

/** 单行：审查模式下可悬停加点评 */
function DiffLineRow({
  line,
  index,
  review,
  commenting,
  onStartComment
}: {
  line: FileDiffLine
  index: number
  review?: CodeDiffReviewProps
  commenting: boolean
  onStartComment: () => void
}) {
  const comments = (review?.comments ?? []).filter(
    (c) => c.line === commentLineNumber(line) && c.side === commentSide(line)
  )
  return (
    <div className={`code-diff-line code-diff-line--${line.kind}${review ? ' code-diff-line--review' : ''}`}>
      <span className="code-diff-gutter" aria-hidden>
        {review ? (
          <button
            type="button"
            className="code-diff-comment-btn"
            title="添加行内评论"
            aria-label="添加行内评论"
            onClick={onStartComment}
          >
            <Plus size={11} aria-hidden />
          </button>
        ) : (
          <span className="code-diff-sign">
            {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
          </span>
        )}
        <span className="code-diff-ln">{line.oldLine ?? ''}</span>
        <span className="code-diff-ln">{line.newLine ?? ''}</span>
      </span>
      <code className="code-diff-text">{line.content || ' '}</code>
      {comments.length > 0 ? (
        <ul className="code-diff-comments">
          {comments.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      ) : null}
      {commenting ? <span className="code-diff-commenting-anchor" data-line-index={index} /> : null}
    </div>
  )
}

/** 行级 diff 块 */
export function CodeDiffBlock({
  diff,
  lines,
  path,
  maxPreviewLines = DEFAULT_MAX_LINES,
  defaultExpanded = false,
  showHeader = true,
  review
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [commentingKey, setCommentingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const displayLines = diff?.lines ?? lines ?? []
  const hunks = useMemo(() => (review ? splitDiffHunks(displayLines) : []), [displayLines, review])
  if (displayLines.length === 0) return null

  const stats = diff?.stats ?? statsFromLines(displayLines)
  const filePath = diff?.path ?? path ?? ''
  const label = filePath || 'diff'
  const previewLimit = Math.max(1, maxPreviewLines)
  const needsCollapse = !review && displayLines.length > previewLimit
  const visible = expanded || !needsCollapse ? displayLines : displayLines.slice(0, previewLimit)

  const submitComment = (line: FileDiffLine) => {
    const text = draft.trim()
    if (!text || !review?.onAddComment) return
    review.onAddComment({
      path: filePath,
      line: commentLineNumber(line),
      side: commentSide(line),
      content: line.content,
      text
    })
    setDraft('')
    setCommentingKey(null)
  }

  const renderLine = (line: FileDiffLine, index: number) => {
    const key = lineKey(line, index)
    return (
      <div key={key}>
        <DiffLineRow
          line={line}
          index={index}
          review={review}
          commenting={commentingKey === key}
          onStartComment={() => {
            setCommentingKey(key)
            setDraft('')
          }}
        />
        {commentingKey === key ? (
          <div className="code-diff-comment-form">
            <textarea
              className="code-diff-comment-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="写给 Agent 的行内意见…"
              rows={2}
              autoFocus
            />
            <div className="code-diff-comment-form-actions">
              <button type="button" className="code-diff-hunk-btn" onClick={() => setCommentingKey(null)}>
                取消
              </button>
              <button
                type="button"
                className="code-diff-hunk-btn code-diff-hunk-btn--primary"
                disabled={!draft.trim()}
                onClick={() => submitComment(line)}
              >
                留下评论
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const detail = (
    <>
      {diff?.language ? <span className="code-diff-language">{diff.language}</span> : null}
      <span className="code-diff-stats" aria-label="变更行数">
        <DiffStat kind="add" value={stats.added} />
        <DiffStat kind="del" value={stats.removed} />
      </span>
    </>
  )

  const footer = needsCollapse ? (
    <button
      type="button"
      className="code-diff-expand"
      onClick={() => setExpanded((value) => !value)}
      aria-expanded={expanded}
    >
      {expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      {expanded ? '收起变更' : `展开全部 ${displayLines.length} 行`}
    </button>
  ) : undefined

  return (
    <CodeArtifactShell
      label={label}
      detail={detail}
      copyText={serializeDiff(displayLines)}
      className="code-diff-block"
      bodyClassName="code-diff-body"
      footer={footer}
      showHeader={showHeader}
      ariaLabel={filePath ? `${filePath} 文件差异` : '代码差异'}
    >
      <div className="code-diff-code">
        {review && hunks.length > 0
          ? hunks.map((hunk) => (
              <section key={hunk.index} className="code-diff-hunk" aria-label={`变更块 ${hunk.index + 1}`}>
                <div className="code-diff-hunk-bar">
                  <span className="code-diff-hunk-label">
                    @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                  </span>
                  <div className="code-diff-hunk-actions">
                    {review.scope === 'unstaged' ? (
                      <button
                        type="button"
                        className="code-diff-hunk-btn"
                        disabled={review.acting}
                        onClick={() => review.onHunkAction?.(hunk, 'stage')}
                      >
                        暂存此块
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="code-diff-hunk-btn"
                        disabled={review.acting}
                        onClick={() => review.onHunkAction?.(hunk, 'unstage')}
                      >
                        取消暂存此块
                      </button>
                    )}
                    <button
                      type="button"
                      className="code-diff-hunk-btn code-diff-hunk-btn--danger"
                      disabled={review.acting}
                      onClick={() => {
                        if (window.confirm('确定还原此 hunk？此操作不可撤销。')) {
                          review.onHunkAction?.(hunk, 'revert')
                        }
                      }}
                    >
                      还原此块
                    </button>
                  </div>
                </div>
                {hunk.lines.map((line, i) => renderLine(line, hunk.index * 1000 + i))}
              </section>
            ))
          : visible.map((line, index) => renderLine(line, index))}
      </div>
    </CodeArtifactShell>
  )
}
