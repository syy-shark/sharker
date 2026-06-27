/**
 * 旧/新 对比行：固定宽度标签列，正文列左对齐，避免 ** 等字符导致阶梯错位。
 * @see src/components/MarkdownBody.tsx
 */
import './CompareBlock.css'

export interface CompareRow {
  label: string
  body: string
}

interface Props {
  rows: CompareRow[]
}

/** 旧/新 等宽标签 + 正文两列布局 */
export function CompareBlock({ rows }: Props) {
  return (
    <div className="compare-block" role="group" aria-label="对比">
      {rows.map((row, i) => (
        <div key={i} className="compare-block-row">
          <span className="compare-block-label">{row.label}：</span>
          <code className="compare-block-body">{row.body}</code>
        </div>
      ))}
    </div>
  )
}

/** 解析代码块文本是否为 旧/新 对比行 */
export function parseCompareRows(text: string): CompareRow[] | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return null

  const rows: CompareRow[] = []
  for (const line of lines) {
    const m = /^(旧|新)\s*[：:]\s*(.*)$/.exec(line)
    if (!m) return null
    rows.push({ label: m[1], body: m[2] })
  }
  return rows
}
