/**
 * 行级代码 diff 展示：过程流 / Markdown 用只读块；审查模式带 hunk 动作与行内评论。
 * 直播写入：无行时按 stats 占位，有参数流 +/- 就画行；同一外壳填核实 diff。
 * 直播中不折预览、内层跟尾；收束后保持展开以免跳。
 * @see src/ARCH.md
 */
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { FileDiff, FileDiffLine } from '../../shared/types'
import { shouldOpenReviewLine } from '../../shared/review-file-click'
import {
  canOfferDiffPreviewCollapse,
  estimateDiffBodyHeight,
  liveDiffBodyMinHeight,
  shouldCollapseDiffPreview,
  shouldReserveDiffCollapseFooter,
  statsFromLines
} from '../../shared/line-diff'
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
  /** 分支对比只读：保留评论，隐藏暂存/还原 */
  readOnly?: boolean
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
  /** ⌘/Ctrl+单击行打开预览（对标 Codex Review） */
  onOpenLine?: (line: number) => void
  /** 长行换行（对标 Codex Wrap long diff lines；默认开，避免横向撑开直播贴底） */
  wrapLines?: boolean
  /** 直播写入槽：不播进入动画，占位→行只升不降 */
  live?: boolean
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
  onStartComment,
  onOpenLine
}: {
  line: FileDiffLine
  index: number
  review?: CodeDiffReviewProps
  commenting: boolean
  onStartComment: () => void
  onOpenLine?: (line: number) => void
}) {
  const comments = (review?.comments ?? []).filter(
    (c) => c.line === commentLineNumber(line) && c.side === commentSide(line)
  )
  return (
    <div
      className={`code-diff-line code-diff-line--${line.kind}${review ? ' code-diff-line--review' : ''}`}
      title={onOpenLine ? '⌘/Ctrl+单击打开该行预览' : undefined}
      onClick={(e) => {
        if (!onOpenLine || !shouldOpenReviewLine(e)) return
        if ((e.target as Element | null)?.closest?.('.code-diff-comment-btn')) return
        const lineNo = commentLineNumber(line)
        if (lineNo <= 0) return
        e.preventDefault()
        onOpenLine(lineNo)
      }}
    >
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

/** 行级 diff 块；直播里同一份 fileDiff 引用不变时不跟 token 重绘 */
export const CodeDiffBlock = memo(function CodeDiffBlock({
  diff,
  lines,
  path,
  maxPreviewLines = DEFAULT_MAX_LINES,
  defaultExpanded = false,
  showHeader = true,
  onOpenLine,
  wrapLines = true,
  live = false,
  review
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [commentingKey, setCommentingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const pendingFloorRef = useRef(0)
  const displayLines = diff?.lines ?? lines ?? []
  const hunks = useMemo(() => (review ? splitDiffHunks(displayLines) : []), [displayLines, review])
  const stats = diff?.stats ?? statsFromLines(displayLines)
  const filePath = diff?.path ?? path ?? ''
  useEffect(() => {
    if (live) setExpanded(true)
  }, [live])
  if (displayLines.length === 0 && !filePath) return null

  const label = filePath || 'diff'
  const previewLimit = Math.max(1, maxPreviewLines)
  const pendingRows =
    displayLines.length === 0
      ? Math.min(previewLimit, Math.max(1, (stats.added || 0) + (stats.removed || 0)))
      : 0
  const canCollapse = canOfferDiffPreviewCollapse({
    live,
    review: Boolean(review),
    lineCount: displayLines.length,
    previewLimit
  })
  const reserveCollapseFooter = shouldReserveDiffCollapseFooter({
    review: Boolean(review),
    lineCount: displayLines.length,
    previewLimit
  })
  const needsCollapse = shouldCollapseDiffPreview({
    live,
    review: Boolean(review),
    expanded,
    lineCount: displayLines.length,
    previewLimit
  })
  const visible = needsCollapse ? displayLines.slice(0, previewLimit) : displayLines
  if (live && pendingRows > 0) {
    pendingFloorRef.current = Math.max(pendingFloorRef.current, estimateDiffBodyHeight(pendingRows))
  }
  const paintedCount = pendingRows > 0 ? 0 : displayLines.length
  const bodyMinHeight = live
    ? liveDiffBodyMinHeight(pendingFloorRef.current, pendingRows, paintedCount)
    : pendingRows
      ? estimateDiffBodyHeight(pendingRows)
      : undefined

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
          onOpenLine={onOpenLine}
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

  const footer = reserveCollapseFooter ? (
    canCollapse ? (
      <button
        type="button"
        className="code-diff-expand"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        {expanded ? '收起变更' : `展开全部 ${displayLines.length} 行`}
      </button>
    ) : (
      <div className="code-diff-expand code-diff-expand--reserved" aria-hidden />
    )
  ) : undefined

  return (
    <CodeArtifactShell
      label={label}
      detail={detail}
      copyText={displayLines.length ? serializeDiff(displayLines) : live ? '' : undefined}
      className={`code-diff-block${pendingRows ? ' code-diff-block--pending' : ''}${live ? ' code-diff-block--live' : ''}${wrapLines ? ' code-diff-block--wrap' : ''}`}
      bodyClassName="code-diff-body"
      footer={footer}
      showHeader={showHeader}
      ariaLabel={filePath ? `${filePath} 文件差异` : '代码差异'}
      followTail={live}
    >
      <div
        className={`code-diff-code${pendingRows ? ' code-diff-code--pending' : ''}`}
        style={bodyMinHeight ? { minHeight: bodyMinHeight } : undefined}
        aria-hidden={pendingRows ? true : undefined}
      >
        {pendingRows
          ? null
          : review && hunks.length > 0
            ? hunks.map((hunk) => (
                <section key={hunk.index} className="code-diff-hunk" aria-label={`变更块 ${hunk.index + 1}`}>
                  <div className="code-diff-hunk-bar">
                    <span className="code-diff-hunk-label">
                      @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                    </span>
                    {review.readOnly || !review.onHunkAction ? null : (
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
                    )}
                  </div>
                  {hunk.lines.map((line, i) => renderLine(line, hunk.index * 1000 + i))}
                </section>
              ))
            : visible.map((line, index) => renderLine(line, index))}
      </div>
    </CodeArtifactShell>
  )
})
