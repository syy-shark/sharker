/**
 * uninstall_application：检测安装方式、停进程、卸 apt 包、清用户数据并验证。
 * @see tools/README.md
 */
import os from 'os'
import { ok } from '../context'
import {
  collectAptPackages,
  collectUserDataPaths,
  formatVerifyReport,
  killAppProcesses,
  removeAptPackages,
  removeDesktopEntries,
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

    const aptPackages = await collectAptPackages(profile, keyword)
    lines.push('', '## 2. Apt packages found', aptPackages.length ? aptPackages.join(', ') : '(none)')

    if (removePackages && aptPackages.length > 0) {
      lines.push('', '## 3. Remove apt packages (pkexec — GUI password prompt)')
      const aptResult = await removeAptPackages(aptPackages)
      lines.push(aptResult.output)
      if (!aptResult.ok && aptResult.manualCommand) {
        lines.push('', 'Manual command (needs password):', aptResult.manualCommand)
      }
    } else if (removePackages) {
      lines.push('', '## 3. No apt packages to remove')
    }

    const dataPaths = removeUserData
      ? await collectUserDataPaths(profile, keyword, extraPaths)
      : extraPaths.map((p) => (p.startsWith('/') || p.startsWith('~') ? p : `${os.homedir()}/${p}`))

    if (removeUserData && dataPaths.length > 0) {
      lines.push('', '## 4. Remove user data')
      for (const p of dataPaths) {
        const r = await removePathIfExists(p)
        lines.push(`  ${r}: ${p}`)
      }
    }

    lines.push('', '## 5. Remove desktop/menu shortcuts')
    const removedDesktop = await removeDesktopEntries(profile.desktopHints)
    lines.push(
      removedDesktop.length ? removedDesktop.map((p) => `  removed ${p}`).join('\n') : '  (none found)'
    )

    lines.push('', '## 6. Verification')
    const report = await verifyRemoval(keyword, profile, dataPaths)
    lines.push(formatVerifyReport(keyword, report))

    if (!report.clean) {
      lines.push('', 'STATUS: INCOMPLETE — see items above. Do not tell the user it is fully removed.')
    } else {
      lines.push('', 'STATUS: COMPLETE')
    }

    return ok(lines.join('\n'))
  }
}
