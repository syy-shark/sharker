/**
 * Linux 应用卸载：检测安装方式、清理用户数据、验证残留。
 * @see tools/builtins/uninstall-application.ts
 */
import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** 已知应用的卸载元数据 */
export interface AppUninstallProfile {
  /** 进程名片段（pkill -f） */
  processPatterns: string[]
  /** 相对 $HOME 的用户数据路径 */
  dataPaths: string[]
  /** apt 包名（精确或前缀） */
  aptPackages?: string[]
  /** 桌面/菜单文件名 glob 片段（小写匹配） */
  desktopHints: string[]
}

/** 常见应用卸载配置 */
export const APP_PROFILES: Record<string, AppUninstallProfile> = {
  steam: {
    processPatterns: ['steam', 'steamwebhelper'],
    dataPaths: [
      '.local/share/Steam',
      '.steam',
      '.steampath',
      '.steampid',
      '.local/share/Steam++',
      '.cache/Steam++'
    ],
    aptPackages: ['steam-launcher', 'steam-libs', 'steam-libs-i386', 'steam-devices'],
    desktopHints: ['steam']
  },
  watt: {
    processPatterns: ['WattToolkit', 'Steam++'],
    dataPaths: ['.local/share/Steam++', '.cache/Steam++'],
    desktopHints: ['watt-toolkit', 'steam++']
  }
}

/** 规范化应用关键词（小写、去空格） */
export function normalizeAppKeyword(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '')
}

/** 按关键词匹配已知 profile；无匹配则生成通用 profile */
export function resolveAppProfile(keyword: string): AppUninstallProfile & { key: string } {
  const key = normalizeAppKeyword(keyword)
  if (APP_PROFILES[key]) return { key, ...APP_PROFILES[key] }
  for (const [k, profile] of Object.entries(APP_PROFILES)) {
    if (key.includes(k) || k.includes(key)) return { key: k, ...profile }
  }
  return {
    key,
    processPatterns: [keyword],
    dataPaths: [],
    desktopHints: [key]
  }
}

/** 展开相对 HOME 的路径为绝对路径 */
export function expandHome(relPath: string): string {
  if (relPath.startsWith('~')) return path.join(os.homedir(), relPath.slice(1).replace(/^\//, ''))
  if (path.isAbsolute(relPath)) return path.normalize(relPath)
  return path.join(os.homedir(), relPath)
}

/** 用户桌面目录（中文/英文） */
export function desktopDirs(): string[] {
  const home = os.homedir()
  return [path.join(home, '桌面'), path.join(home, 'Desktop')]
}

/** 执行 shell 命令并返回 stdout（失败时返回 stderr 或错误信息） */
export async function runShell(cmd: string, timeoutMs = 60_000): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-lc', cmd], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: timeoutMs
    })
    return (stdout || stderr || '').trim()
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return (err.stdout || err.stderr || err.message || String(e)).trim()
  }
}

/** 终止与关键词相关的进程 */
export async function killAppProcesses(patterns: string[]): Promise<string> {
  const parts: string[] = []
  for (const p of patterns) {
    const out = await runShell(`pkill -f '${p.replace(/'/g, "'\\''")}' 2>/dev/null || true`)
    if (out) parts.push(out)
  }
  await runShell('sleep 1')
  return parts.length ? parts.join('\n') : 'processes signaled'
}

/** 查询 apt 已安装包（grep 关键词） */
export async function findAptPackages(keyword: string): Promise<string[]> {
  const out = await runShell(`dpkg -l 2>/dev/null | awk '{print $2}' | grep -i '${keyword.replace(/'/g, '')}' || true`)
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** 合并 profile 包名与 dpkg 搜索结果 */
export async function collectAptPackages(
  profile: AppUninstallProfile,
  keyword: string
): Promise<string[]> {
  const found = new Set<string>()
  for (const pkg of profile.aptPackages ?? []) {
    const status = await runShell(`dpkg -s '${pkg.replace(/'/g, '')}' 2>/dev/null | head -1 || true`)
    if (/^Status: install/.test(status)) found.add(pkg)
  }
  for (const pkg of await findAptPackages(keyword)) {
    found.add(pkg)
  }
  return [...found]
}

/** 用 pkexec 卸载 apt 包；失败则返回需用户手动执行的命令 */
export async function removeAptPackages(packages: string[]): Promise<{
  ok: boolean
  output: string
  manualCommand?: string
}> {
  if (packages.length === 0) return { ok: true, output: 'no apt packages to remove' }
  const pkgList = packages.join(' ')
  const manual = `sudo apt remove -y --purge ${pkgList} && sudo apt autoremove -y`
  const cmd = `pkexec apt remove -y --purge ${pkgList} && pkexec apt autoremove -y`
  const out = await runShell(cmd, 300_000)
  const stillInstalled = (
    await Promise.all(
      packages.map(async (p) => {
        const s = await runShell(`dpkg -s '${p.replace(/'/g, '')}' 2>/dev/null | head -1 || true`)
        return /^Status: install/.test(s) ? p : null
      })
    )
  ).filter(Boolean) as string[]
  if (stillInstalled.length === 0) {
    return { ok: true, output: out || `removed: ${pkgList}` }
  }
  return {
    ok: false,
    output: `${out}\nStill installed: ${stillInstalled.join(', ')}`,
    manualCommand: manual
  }
}

/** 递归删除路径（忽略不存在） */
export async function removePathIfExists(absPath: string): Promise<'removed' | 'missing' | 'failed'> {
  try {
    await fs.access(absPath)
    await fs.rm(absPath, { recursive: true, force: true })
    return 'removed'
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return 'missing'
    return 'failed'
  }
}

/** 收集应清理的用户数据路径（profile + find 补充） */
export async function collectUserDataPaths(
  profile: AppUninstallProfile,
  keyword: string,
  extraPaths: string[] = []
): Promise<string[]> {
  const home = os.homedir()
  const paths = new Set<string>()
  for (const rel of profile.dataPaths) paths.add(expandHome(rel))
  for (const p of extraPaths) paths.add(expandHome(p))
  const findOut = await runShell(
    `find '${home.replace(/'/g, "'\\''")}' -maxdepth 4 \\( -type d -o -type f \\) -iname '*${keyword.replace(/'/g, '')}*' 2>/dev/null | head -40`
  )
  for (const line of findOut.split('\n')) {
    const p = line.trim()
    if (!p || p.includes('/.git/') || p.includes('/node_modules/')) continue
    paths.add(p)
  }
  return [...paths]
}

/** 删除桌面与菜单中的相关 .desktop */
export async function removeDesktopEntries(hints: string[]): Promise<string[]> {
  const removed: string[] = []
  const dirs = [
    ...desktopDirs(),
    path.join(os.homedir(), '.local/share/applications')
  ]
  for (const dir of dirs) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      const lower = name.toLowerCase()
      if (!lower.endsWith('.desktop') && name !== '.desktop') continue
      if (!hints.some((h) => lower.includes(h.toLowerCase()))) continue
      const full = path.join(dir, name)
      const r = await removePathIfExists(full)
      if (r === 'removed') removed.push(full)
    }
  }
  return removed
}

/** 检查路径是否仍存在 */
export async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath)
    return true
  } catch {
    return false
  }
}

export interface RemovalVerifyReport {
  pathsStillExist: string[]
  aptPackagesStillInstalled: string[]
  runningProcesses: string[]
  desktopEntriesRemaining: string[]
  clean: boolean
}

/** 验证卸载是否彻底 */
export async function verifyRemoval(
  keyword: string,
  profile: AppUninstallProfile,
  checkedPaths: string[]
): Promise<RemovalVerifyReport> {
  const pathsStillExist: string[] = []
  for (const p of checkedPaths) {
    if (await pathExists(p)) pathsStillExist.push(p)
  }
  const aptPackagesStillInstalled = await collectAptPackages(profile, keyword)
  let runningProcesses: string[] = []
  const psOut = await runShell(`ps aux | grep -i '${keyword.replace(/'/g, '')}' | grep -v grep || true`)
  if (psOut) runningProcesses = psOut.split('\n').map((l) => l.trim()).filter(Boolean)
  const desktopEntriesRemaining: string[] = []
  for (const dir of [...desktopDirs(), path.join(os.homedir(), '.local/share/applications')]) {
    try {
      const entries = await fs.readdir(dir)
      for (const name of entries) {
        const lower = name.toLowerCase()
        if (!lower.endsWith('.desktop') && name !== '.desktop') continue
        if (profile.desktopHints.some((h) => lower.includes(h.toLowerCase()))) {
          desktopEntriesRemaining.push(path.join(dir, name))
        }
      }
    } catch {
      /* missing dir */
    }
  }
  const clean =
    pathsStillExist.length === 0 &&
    aptPackagesStillInstalled.length === 0 &&
    runningProcesses.length === 0 &&
    desktopEntriesRemaining.length === 0
  return {
    pathsStillExist,
    aptPackagesStillInstalled,
    runningProcesses,
    desktopEntriesRemaining,
    clean
  }
}

/** 格式化验证报告为模型可读文本 */
export function formatVerifyReport(keyword: string, report: RemovalVerifyReport): string {
  const lines = [`Verification for "${keyword}":`, `clean: ${report.clean}`]
  if (report.pathsStillExist.length) {
    lines.push('paths still exist:', ...report.pathsStillExist.map((p) => `  - ${p}`))
  }
  if (report.aptPackagesStillInstalled.length) {
    lines.push('apt packages still installed:', ...report.aptPackagesStillInstalled.map((p) => `  - ${p}`))
  }
  if (report.runningProcesses.length) {
    lines.push('running processes:', ...report.runningProcesses.map((p) => `  - ${p}`))
  }
  if (report.desktopEntriesRemaining.length) {
    lines.push('desktop/menu entries remaining:', ...report.desktopEntriesRemaining.map((p) => `  - ${p}`))
  }
  if (report.clean) lines.push('All checks passed — removal appears complete.')
  return lines.join('\n')
}

/** 从 rm 命令中提取目标路径（用于删除后自动验证） */
export function extractRmTargets(command: string): string[] {
  const targets: string[] = []
  const re = /\brm\s+(?:-[a-zA-Z]+\s+)*([^\s;|&]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(command)) !== null) {
    let t = m[1].replace(/^['"]|['"]$/g, '')
    if (t.startsWith('~') || t.startsWith('/') || t.startsWith('.')) {
      targets.push(expandHome(t))
    }
  }
  return targets
}

/** 删除后立即检查路径是否消失 */
export async function verifyPathsGone(paths: string[]): Promise<string> {
  if (paths.length === 0) return ''
  const still: string[] = []
  const gone: string[] = []
  for (const p of paths) {
    if (await pathExists(p)) still.push(p)
    else gone.push(p)
  }
  const lines: string[] = ['[Harness post-delete verify]']
  if (gone.length) lines.push('removed:', ...gone.map((p) => `  ok ${p}`))
  if (still.length) lines.push('STILL EXISTS:', ...still.map((p) => `  FAIL ${p}`))
  if (still.length === 0) lines.push('All listed paths are gone.')
  return lines.join('\n')
}
