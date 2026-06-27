/**
 * grep：目录内文本搜索。
 * @see tools/README.md
 */
import { assertAccess, ok } from '../context'
import { normalizePath } from '../permissions'
import { grepDir } from '../shared/grep'
import { truncateLines } from '../truncate'
import type { ToolHandler } from '../types'

export const grepTool: ToolHandler = {
  name: 'grep',
  title: '搜索内容',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const hits = await grepDir(p, String(args.pattern), args.glob ? String(args.glob) : undefined)
    return ok(hits.length ? truncateLines(hits, 200) : '(no matches)')
  }
}
