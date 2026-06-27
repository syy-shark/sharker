/**
 * move_path：移动或重命名文件/目录。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { assertAccess, ok } from '../context'
import { isHighRiskPath, normalizePath } from '../permissions'
import type { ToolHandler } from '../types'
import { NO_RISK } from '../types'

export const movePathTool: ToolHandler = {
  name: 'move_path',
  title: '移动路径',
  extractPaths: (args) => [String(args.source), String(args.destination)],
  assessRisk(args) {
    const dest = String(args.destination ?? '')
    const src = String(args.source ?? '')
    if (isHighRiskPath(src) || isHighRiskPath(dest)) {
      return { highRisk: true, reason: '移动系统或敏感路径' }
    }
    return NO_RISK
  },
  async execute(args, ctx) {
    const src = normalizePath(String(args.source))
    const dest = normalizePath(String(args.destination))
    assertAccess(ctx, src)
    assertAccess(ctx, dest)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.rename(src, dest)
    return ok(`Moved ${src} -> ${dest}`)
  }
}
