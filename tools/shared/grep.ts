/**
 * 目录内正则文本搜索。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { matchGlob } from './glob'
import { IGNORE_DIRS } from './ignore-dirs'

/** 在目录下按正则搜索文本，跳过过大文件，最多 200 条 */
export async function grepDir(
  dir: string,
  pattern: string,
  fileGlob?: string
): Promise<string[]> {
  const results: string[] = []
  const re = new RegExp(pattern, 'i')

  async function walk(d: string, depth = 0): Promise<void> {
    if (depth > 12) return
    let entries
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        await walk(full, depth + 1)
      } else if (e.isFile()) {
        if (fileGlob && !matchGlob(e.name, fileGlob)) continue
        try {
          const stat = await fs.stat(full)
          if (stat.size > 512_000) continue
          const content = await fs.readFile(full, 'utf8')
          const lines = content.split('\n')
          lines.forEach((line, i) => {
            if (re.test(line)) results.push(`${full}:${i + 1}: ${line.trim()}`)
          })
        } catch {
          /* skip binary */
        }
      }
    }
  }

  await walk(dir)
  return results.slice(0, 200)
}
