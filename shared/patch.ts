/**
 * 统一 apply_patch 格式解析与应用（类 Claude Code / Cursor patch）。
 * @see tools/builtins/file/apply-patch.ts
 */

export interface PatchHunk {
  path: string
  oldLines: string[]
  newLines: string[]
}

/** 解析 *** Begin Patch / *** Update File 块 */
export function parsePatch(patch: string): PatchHunk[] {
  const hunks: PatchHunk[] = []
  const lines = patch.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('*** Update File: ') || line.startsWith('*** Add File: ')) {
      const path = line.slice(line.indexOf(':') + 1).trim()
      i++
      const oldLines: string[] = []
      const newLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('***')) {
        const l = lines[i]
        if (l.startsWith('-')) oldLines.push(l.slice(1))
        else if (l.startsWith('+')) newLines.push(l.slice(1))
        else if (l.startsWith(' ')) {
          oldLines.push(l.slice(1))
          newLines.push(l.slice(1))
        }
        i++
      }
      hunks.push({ path, oldLines, newLines })
    } else {
      i++
    }
  }
  return hunks
}

/** 将 patch hunk 应用到文件内容；oldLines 为空表示新建 */
export function applyHunkToContent(
  content: string | null,
  hunk: PatchHunk
): { next: string; created: boolean } {
  if (content === null) {
    return { next: hunk.newLines.join('\n'), created: true }
  }
  const oldBlock = hunk.oldLines.join('\n')
  if (oldBlock && !content.includes(oldBlock)) {
    throw new Error(`Patch context not found in ${hunk.path}`)
  }
  const next = oldBlock
    ? content.replace(oldBlock, hunk.newLines.join('\n'))
    : hunk.newLines.join('\n')
  return { next, created: false }
}
