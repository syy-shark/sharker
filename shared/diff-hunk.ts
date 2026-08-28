/**
 * 把 FileDiff 行拆成 hunk，并生成可 `git apply` 的 unified patch。
 * @see shared/ARCH.md
 */
import type { FileDiffLine } from './types'

/** 一组连续变更（含上下文） */
export interface DiffHunk {
  index: number
  lines: FileDiffLine[]
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}

/** 行号出现跳跃时切开，得到多个 hunk */
export function splitDiffHunks(lines: FileDiffLine[]): DiffHunk[] {
  const groups: FileDiffLine[][] = []
  let current: FileDiffLine[] = []
  let lastOld = 0
  let lastNew = 0

  for (const line of lines) {
    const gap =
      current.length > 0 &&
      ((line.oldLine != null && lastOld > 0 && line.oldLine > lastOld + 1) ||
        (line.newLine != null && lastNew > 0 && line.newLine > lastNew + 1))
    if (gap) {
      groups.push(current)
      current = []
    }
    current.push(line)
    if (line.oldLine != null) lastOld = line.oldLine
    if (line.newLine != null) lastNew = line.newLine
  }
  if (current.length) groups.push(current)

  return groups
    .filter((g) => g.some((l) => l.kind === 'add' || l.kind === 'del'))
    .map((g, index) => {
      const ctxDel = g.filter((l) => l.kind === 'ctx' || l.kind === 'del')
      const ctxAdd = g.filter((l) => l.kind === 'ctx' || l.kind === 'add')
      const firstOld = g.find((l) => l.oldLine != null)?.oldLine ?? 0
      const firstNew = g.find((l) => l.newLine != null)?.newLine ?? 0
      return {
        index,
        lines: g,
        oldStart: ctxDel.length === 0 ? 0 : firstOld,
        oldCount: ctxDel.length,
        newStart: ctxAdd.length === 0 ? 0 : firstNew,
        newCount: ctxAdd.length
      }
    })
}

/** 单行写成 unified 前缀形式 */
export function formatUnifiedLine(line: FileDiffLine): string {
  const mark = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
  return `${mark}${line.content}`
}

/**
 * 生成单个 hunk 的 unified patch（含 diff --git 头）。
 * `isNew` / `isDeleted` 决定 /dev/null 一侧。
 */
export function buildHunkPatch(options: {
  path: string
  hunk: DiffHunk
  isNew?: boolean
  isDeleted?: boolean
}): string {
  const rel = options.path.replaceAll('\\', '/')
  const hunk = options.hunk
  const body = hunk.lines.map(formatUnifiedLine).join('\n')
  const header = options.isNew
    ? `diff --git a/${rel} b/${rel}\nnew file mode 100644\n--- /dev/null\n+++ b/${rel}`
    : options.isDeleted
      ? `diff --git a/${rel} b/${rel}\ndeleted file mode 100644\n--- a/${rel}\n+++ /dev/null`
      : `diff --git a/${rel} b/${rel}\n--- a/${rel}\n+++ b/${rel}`
  return `${header}\n@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n${body}\n`
}
