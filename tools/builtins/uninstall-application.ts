/**
 * uninstall_application：停进程、卸 brew cask、删 .app、清用户数据并验证（macOS）。
 * @see tools/ARCH.md
 */
import os from 'os'
import { ok } from '../context'
import {
  collectBrewCasks,
  collectUserDataPaths,
  findAppBundles,
  formatVerifyReport,
  killAppProcesses,
  removeBrewCasks,
  removePathIfExists,
  resolveAppProfile,
  verifyRemoval
} from '../shared/uninstall'
import type { ToolHandler } from '../types'

export const uninstallApplicationTool: ToolHandler = {
  name: 'uninstall_application',
  title: '卸载应用',
  assessRisk() {
    return { highRisk: true, reason: '卸载应用（删除数据与系统包）' }
  },
  async execute(args) {
    const keyword = String(args.name ?? args.keyword ?? '').trim()
    if (!keyword) throw new Error('name is required (e.g. "steam")')

    const removePackages = args.remove_packages !== false
    const removeUserData = args.remove_user_data !== false
    const extraPaths = Array.isArray(args.extra_paths)
      ? args.extra_paths.map(String)
      : []

    const profile = resolveAppProfile(keyword)
    const lines: string[] = [`Uninstalling: ${keyword}`, `profile: ${profile.key}`]

    lines.push('', '## 1. Stop processes')
    lines.push(await killAppProcesses(profile.processPatterns))

    const brewCasks = await collectBrewCasks(profile, keyword)
    lines.push('', '## 2. Homebrew casks found', brewCasks.length ? brewCasks.join(', ') : '(none)')

    if (removePackages && brewCasks.length > 0) {
      lines.push('', '## 3. Remove brew casks')
      const brewResult = await removeBrewCasks(brewCasks)
      lines.push(brewResult.output)
      if (!brewResult.ok && brewResult.manualCommand) {
        lines.push('', 'Manual command:', brewResult.manualCommand)
      }
    } else if (removePackages) {
      lines.push('', '## 3. No brew casks to remove')
    }

    const appBundles = await findAppBundles(profile.appHints)
    if (appBundles.length > 0) {
      lines.push('', '## 4. Remove .app bundles')
      for (const p of appBundles) {
        const r = await removePathIfExists(p)
        lines.push(`  ${r}: ${p}`)
      }
    }

    const dataPaths = removeUserData
      ? await collectUserDataPaths(profile, keyword, extraPaths)
      : extraPaths.map((p) => (p.startsWith('/') || p.startsWith('~') ? p : `${os.homedir()}/${p}`))

    if (removeUserData && dataPaths.length > 0) {
      lines.push('', '## 5. Remove user data')
      for (const p of dataPaths) {
        const r = await removePathIfExists(p)
        lines.push(`  ${r}: ${p}`)
      }
    }

    lines.push('', '## 6. Verification')
    const report = await verifyRemoval(keyword, profile, [...dataPaths, ...appBundles])
    lines.push(formatVerifyReport(keyword, report))

    if (!report.clean) {
      lines.push('', 'STATUS: INCOMPLETE — see items above. Do not tell the user it is fully removed.')
    } else {
      lines.push('', 'STATUS: COMPLETE')
    }

    return ok(lines.join('\n'))
  }
}
