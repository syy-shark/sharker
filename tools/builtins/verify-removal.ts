/**
 * verify_removal：检查应用/路径是否已从系统中清除（Harness 也会自动调用）。
 * @see tools/README.md
 */
import { ok } from '../context'
import {
  collectUserDataPaths,
  expandHome,
  formatVerifyReport,
  resolveAppProfile,
  verifyRemoval
} from '../shared/uninstall'
import type { ToolHandler } from '../types'

export const verifyRemovalTool: ToolHandler = {
  name: 'verify_removal',
  title: '验证已删除',
  async execute(args) {
    const keyword = String(args.name ?? args.keyword ?? '').trim()
    const explicitPaths = Array.isArray(args.paths) ? args.paths.map(String) : []

    if (!keyword && explicitPaths.length === 0) {
      throw new Error('Provide name (e.g. "steam") and/or paths[] to verify')
    }

    const profile = keyword ? resolveAppProfile(keyword) : resolveAppProfile('unknown')
    const paths =
      explicitPaths.length > 0
        ? explicitPaths.map(expandHome)
        : await collectUserDataPaths(profile, keyword, [])

    const report = await verifyRemoval(keyword || 'paths', profile, paths)
    return ok(formatVerifyReport(keyword || 'custom paths', report))
  }
}
