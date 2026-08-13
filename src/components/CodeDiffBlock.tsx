/**
 * 行级代码 diff 展示：复用紧凑编辑器外壳，供过程流与 Markdown diff 块使用。
 * @see src/ARCH.md
 */
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { FileDiff, FileDiffLine } from '../../shared/types'
import { statsFromLines } from '../../shared/line-diff'
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
}

function serializeDiff(lines: FileDiffLine[]): string {
  return lines
    .map((line) => `${line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}${line.content}`)
    .join('\n')
}

/** 行级 diff 块 */
export function CodeDiffBlock({
  diff,
  lines,
  path,
  maxPreviewLines = DEFAULT_MAX_LINES,
  defaultExpanded = false,
  showHeader = true
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const displayLines = diff?.lines ?? lines ?? []
  if (displayLines.length === 0) return null

  const stats = diff?.stats ?? statsFromLines(displayLines)
  const filePath = diff?.path ?? path ?? ''
  const label = filePath || 'diff'
  const previewLimit = Math.max(1, maxPreviewLines)
  const needsCollapse = displayLines.length > previewLimit
  const visible = expanded || !needsCollapse ? displayLines : displayLines.slice(0, previewLimit)

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
        {visible.map((line, index) => (
          <div
            key={`${line.kind}-${index}-${line.oldLine ?? ''}-${line.newLine ?? ''}`}
            className={`code-diff-line code-diff-line--${line.kind}`}
          >
            <span className="code-diff-gutter" aria-hidden>
              <span className="code-diff-sign">
                {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
              </span>
              <span className="code-diff-ln">{line.oldLine ?? ''}</span>
              <span className="code-diff-ln">{line.newLine ?? ''}</span>
            </span>
            <code className="code-diff-text">{line.content || ' '}</code>
          </div>
        ))}
      </div>
    </CodeArtifactShell>
  )
}
