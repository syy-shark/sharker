/**
 * write_file：创建或覆盖文件。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { buildFileDiff, formatWriteSummary } from '../../shared/line-diff'
import { assertAccess, ok } from '../context'
import { isHighRiskPath, normalizePath } from '../permissions'
import { readTextFileOrNull } from '../shared/fs-text'
import type { ToolHandler } from '../types'
import { NO_RISK } from '../types'

export const writeFileTool: ToolHandler = {
  name: 'write_file',
  title: '写入文件',
  extractPaths: (args) => [String(args.path)],
  assessRisk(args) {
    const p = String(args.path ?? '')
    if (isHighRiskPath(p)) {
      return { highRisk: true, reason: '写入系统或敏感路径' }
    }
    return NO_RISK
  },
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const newContent = String(args.content)
    const oldText = await readTextFileOrNull(p)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, newContent, 'utf8')
    const fileDiff = buildFileDiff(p, oldText, newContent)
    return ok(formatWriteSummary(p, oldText === null, fileDiff.stats), fileDiff)
  }
}
