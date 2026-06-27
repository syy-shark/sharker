/**
 * glob_file_search：按 glob 模式查找文件。
 * @see tools/README.md
 */
import { assertAccess, ok, toolCwd } from '../context'
import { resolveCommandCwd } from '../permissions'
import { walkGlob } from '../shared/glob'
import type { ToolHandler } from '../types'

export const globFileSearchTool: ToolHandler = {
  name: 'glob_file_search',
  title: '查找文件',
  extractPaths: (args, workspace, mode) => [
    resolveCommandCwd(String(args.cwd), workspace, mode)
  ],
  async execute(args, ctx) {
    const cwd = toolCwd(ctx, args.cwd)
    assertAccess(ctx, cwd)
    const pattern = String(args.pattern)
    const results: string[] = []
    await walkGlob(cwd, pattern, results)
    return ok(results.slice(0, 100).join('\n') || '(no matches)')
  }
}
