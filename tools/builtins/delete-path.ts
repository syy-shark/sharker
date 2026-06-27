/**
 * delete_path：删除文件或目录；递归删除后 Harness 自动验证路径是否消失。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import { assertAccess, ok } from '../context'
import { isHighRiskPath, normalizePath } from '../permissions'
import { verifyPathsGone } from '../shared/uninstall'
import type { ToolHandler } from '../types'
import { NO_RISK } from '../types'

export const deletePathTool: ToolHandler = {
  name: 'delete_path',
  title: '删除路径',
  extractPaths: (args) => [String(args.path)],
  assessRisk(args) {
    const recursive = Boolean(args.recursive)
    if (recursive) {
      return { highRisk: true, reason: '递归删除目录' }
    }
    const p = String(args.path ?? '')
    if (isHighRiskPath(p)) {
      return { highRisk: true, reason: '删除系统或敏感路径' }
    }
    return NO_RISK
  },
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const recursive = Boolean(args.recursive)
    const stat = await fs.stat(p)
    if (stat.isDirectory()) {
      await fs.rm(p, { recursive, force: true })
    } else {
      await fs.unlink(p)
    }
    let output = `Deleted ${p}`
    if (recursive || stat.isDirectory()) {
      const verify = await verifyPathsGone([p])
      if (verify) output += `\n\n${verify}`
    }
    return ok(output)
  }
}
