/**
 * search_replace：文件内字符串替换。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import { buildFileDiff, formatEditSummary } from '../../shared/line-diff'
import { assertAccess, ok } from '../context'
import { normalizePath } from '../permissions'
import type { ToolHandler } from '../types'

export const searchReplaceTool: ToolHandler = {
  name: 'search_replace',
  title: '编辑文件',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const oldStr = String(args.old_string)
    const newStr = String(args.new_string)
    const content = await fs.readFile(p, 'utf8')
    const replaceAll = Boolean(args.replace_all)
    if (!content.includes(oldStr)) throw new Error('old_string not found')
    const next = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, newStr)
    await fs.writeFile(p, next, 'utf8')
    const fileDiff = buildFileDiff(p, content, next)
    return ok(formatEditSummary(p, fileDiff.stats), fileDiff)
  }
}
