/**
 * 简易 glob 匹配与目录遍历。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { IGNORE_DIRS } from './ignore-dirs'

/** 将简单 glob（*、**、?）转为正则，用于文件名匹配 */
export function matchGlob(name: string, pattern: string): boolean {
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*')
        .replace(/\?/g, '.') +
      '$'
  )
  return re.test(name)
}

/** 深度优先遍历目录，将 basename 匹配 glob 的文件路径收集到 results */
export async function walkGlob(
  dir: string,
  pattern: string,
  results: string[],
  depth = 0
): Promise<void> {
  if (depth > 12) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isFile() && matchGlob(path.basename(full), pattern)) {
      results.push(full)
    }
    if (e.isDirectory()) {
      await walkGlob(full, pattern, results, depth + 1)
    }
  }
}
