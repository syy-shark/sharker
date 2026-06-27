/**
 * 行级 diff 计算与 unified / ```diff 文本解析，供 UI 绿加红删展示。
 * @see shared/README.md
 */
import type { DiffLineKind, FileDiff, FileDiffLine } from './types'

const DEFAULT_CONTEXT = 3

type RawOp = {
  kind: 'equal' | 'add' | 'del'
  content: string
  oldLine?: number
  newLine?: number
}

/** 从路径猜测语言标识（供代码块样式） */
export function languageFromPath(filePath: string): string | undefined {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return undefined
  const ext = base.slice(dot + 1).toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    vue: 'vue',
    sh: 'bash'
  }
  return map[ext]
}

/** 统计 add/del 行数 */
export function statsFromLines(lines: FileDiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.kind === 'add') added++
    if (l.kind === 'del') removed++
  }
  return { added, removed }
}

/** 按行 LCS 产出完整 diff（equal 记为 ctx） */
export function computeLineDiff(
  oldLines: string[],
  newLines: string[],
  opts?: { context?: number }
): FileDiffLine[] {
  const context = opts?.context ?? DEFAULT_CONTEXT
  const raw = lcsDiff(oldLines, newLines)
  const full: FileDiffLine[] = raw.map((op) => ({
    kind: op.kind === 'equal' ? 'ctx' : op.kind,
    oldLine: op.oldLine,
    newLine: op.newLine,
    content: op.content
  }))
  return trimToContext(full, context)
}

/** 构建文件 diff：新文件全绿，否则 hunk ±context */
export function buildFileDiff(
  path: string,
  oldText: string | null,
  newText: string,
  context = DEFAULT_CONTEXT
): FileDiff {
  const language = languageFromPath(path)
  if (oldText === null) {
    const lines = splitLines(newText)
    const diffLines: FileDiffLine[] = lines.map((content, i) => ({
      kind: 'add' as const,
      newLine: i + 1,
      content
    }))
    return { path, language, lines: diffLines, stats: statsFromLines(diffLines) }
  }
  const lines = computeLineDiff(splitLines(oldText), splitLines(newText), { context })
  return { path, language, lines, stats: statsFromLines(lines) }
}

/** 解析 unified diff 或 ```diff 块文本 */
export function parseUnifiedDiff(text: string): FileDiffLine[] {
  const rawLines = text.split('\n')
  const looksLikeDiff =
    rawLines.some((l) => l.startsWith('@@')) ||
    rawLines.some((l) => l.startsWith('---')) ||
    (rawLines.some((l) => l.startsWith('+') && !l.startsWith('+++')) &&
      rawLines.some((l) => l.startsWith('-') && !l.startsWith('---')))
  if (!looksLikeDiff) return []

  const lines: FileDiffLine[] = []
  for (const raw of rawLines) {
    if (
      raw.startsWith('+++') ||
      raw.startsWith('---') ||
      raw.startsWith('@@') ||
      raw.startsWith('diff ') ||
      raw.startsWith('index ')
    ) {
      continue
    }
    if (raw.startsWith('+')) {
      lines.push({ kind: 'add', content: raw.slice(1).replace(/^\s?/, '') })
      continue
    }
    if (raw.startsWith('-')) {
      lines.push({ kind: 'del', content: raw.slice(1).replace(/^\s?/, '') })
      continue
    }
    if (raw.startsWith(' ')) {
      lines.push({ kind: 'ctx', content: raw.slice(1) })
    }
  }
  return lines
}

function splitLines(text: string): string[] {
  if (!text) return []
  const parts = text.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

function lcsDiff(oldLines: string[], newLines: string[]): RawOp[] {
  const n = oldLines.length
  const m = newLines.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const raw: RawOp[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.unshift({
        kind: 'equal',
        oldLine: i,
        newLine: j,
        content: oldLines[i - 1]
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ kind: 'add', newLine: j, content: newLines[j - 1] })
      j--
    } else if (i > 0) {
      raw.unshift({ kind: 'del', oldLine: i, content: oldLines[i - 1] })
      i--
    }
  }
  return raw
}

/** 仅保留变更 hunk 及两侧 context 行 */
function trimToContext(full: FileDiffLine[], context: number): FileDiffLine[] {
  const n = full.length
  if (n === 0) return full

  const keep = new Array<boolean>(n).fill(false)
  let hasChange = false
  for (let i = 0; i < n; i++) {
    if (full[i].kind === 'add' || full[i].kind === 'del') {
      hasChange = true
      for (let j = Math.max(0, i - context); j <= Math.min(n - 1, i + context); j++) {
        keep[j] = true
      }
    }
  }
  if (!hasChange) return []
  return full.filter((_, i) => keep[i])
}

/** 格式化工具返回给模型的短摘要 */
export function formatEditSummary(path: string, stats: { added: number; removed: number }): string {
  if (stats.added === 0 && stats.removed === 0) return `Updated ${path}`
  return `Updated ${path} (+${stats.added} -${stats.removed})`
}

export function formatWriteSummary(
  path: string,
  isNew: boolean,
  stats: { added: number; removed: number }
): string {
  if (isNew) return `Wrote ${path} (+${stats.added} lines)`
  return formatEditSummary(path, stats)
}
