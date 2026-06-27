/**
 * 递归目录列表。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { IGNORE_DIRS } from './ignore-dirs'

/** 递归列出目录树，跳过常见忽略目录 */
export async function listDirRecursive(
  dir: string,
  depth: number,
  maxDepth: number
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const lines: string[] = []
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    const prefix = '  '.repeat(depth)
    lines.push(`${prefix}${e.name}${e.isDirectory() ? '/' : ''}`)
    if (e.isDirectory() && depth < maxDepth) {
      lines.push(...(await listDirRecursive(full, depth + 1, maxDepth)))
    }
  }
  return lines
}
