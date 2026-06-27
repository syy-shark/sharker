/**
 * read_file：读取文件内容。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import { assertAccess, ok } from '../context'
import { normalizePath } from '../permissions'
import type { ToolHandler } from '../types'

export const readFileTool: ToolHandler = {
  name: 'read_file',
  title: '读取文件',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const content = await fs.readFile(p, 'utf8')
    const lines = content.split('\n')
    const offset = Number(args.offset ?? 1) - 1
    const limit = args.limit ? Number(args.limit) : lines.length
    const slice = lines.slice(offset, offset + limit)
    const numbered = slice.map((line, i) => `L${offset + i + 1}: ${line}`).join('\n')
    return ok(numbered)
  }
}
