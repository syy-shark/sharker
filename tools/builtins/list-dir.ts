/**
 * list_dir：列出目录内容。
 * @see tools/README.md
 */
import { assertAccess, ok } from '../context'
import { listDirRecursive } from '../shared/list-dir'
import { normalizePath } from '../permissions'
import type { ToolHandler } from '../types'

export const listDirTool: ToolHandler = {
  name: 'list_dir',
  title: '列出目录',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const maxDepth = Number(args.depth ?? 1)
    const lines = await listDirRecursive(p, 0, Math.max(0, maxDepth))
    return ok(lines.join('\n') || '(empty)')
  }
}
