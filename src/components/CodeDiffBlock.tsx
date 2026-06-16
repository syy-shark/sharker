/**
 * 行级代码 diff 展示：绿加红删，供过程流与 Markdown diff 块复用
 * @see src/README.md
 */
import { useState } from 'react'
import type { FileDiff, FileDiffLine } from '../../shared/types'
import { statsFromLines } from '../../shared/line-diff'
import './CodeDiffBlock.css'

const DEFAULT_MAX_LINES = 40

/** CodeDiffBlock Props */
interface Props {
  diff?: FileDiff
  lines?: FileDiffLine[]
  path?: string
  /** 过程流内默认展开全部 */
  defaultExpanded?: boolean
}

/** 从路径取 basename */
function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

/** 行级 diff 块 */
export function CodeDiffBlock({ diff, lines, path, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const displayLines = diff?.lines ?? lines ?? []
  if (displayLines.length === 0) return null

  const stats = diff?.stats ?? statsFromLines(displayLines)
  const filePath = diff?.path ?? path ?? ''
  const label = filePath ? basename(filePath) : 'diff'
  const needsCollapse = displayLines.length > DEFAULT_MAX_LINES
  const visible = expanded || !needsCollapse ? displayLines : displayLines.slice(0, DEFAULT_MAX_LINES)

  return (
    <div className="code-diff-block">
      <div className="code-diff-head">
        {filePath ? <span className="code-diff-path">{label}</span> : null}
        <span className="code-diff-stats">
          {stats.added > 0 ? <span className="code-diff-stat-add">+{stats.added}</span> : null}
          {stats.removed > 0 ? (
            <span className="code-diff-stat-del">-{stats.removed}</span>
          ) : null}
        </span>
      </div>
      <div className="code-diff-body">
        {visible.map((line, index) => (
          <div
            key={`${line.kind}-${index}-${line.oldLine ?? ''}-${line.newLine ?? ''}`}
            className={`code-diff-line code-diff-line--${line.kind}`}
          >
            <span className="code-diff-gutter" aria-hidden>
              <span className="code-diff-sign">
                {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
              </span>
              <span className="code-diff-ln">
                {line.kind === 'del'
                  ? (line.oldLine ?? '')
                  : line.kind === 'add'
                    ? (line.newLine ?? '')
                    : (line.newLine ?? line.oldLine ?? '')}
              </span>
            </span>
            <code className="code-diff-text">{line.content || ' '}</code>
          </div>
        ))}
      </div>
      {needsCollapse && !expanded ? (
        <button
          type="button"
          className="code-diff-expand"
          onClick={() => setExpanded(true)}
        >
          展开全部 {displayLines.length} 行
        </button>
      ) : null}
    </div>
  )
}
