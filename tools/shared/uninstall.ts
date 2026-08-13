/**
 * macOS 应用卸载：检测安装方式、清理用户数据、验证残留。
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
  /** Homebrew cask 名 */
  brewCasks?: string[]
  /** /Applications 下的 .app 名片段（小写匹配） */
  appHints: string[]
}

/** 常见应用卸载配置 */
export const APP_PROFILES: Record<string, AppUninstallProfile> = {
  steam: {
    processPatterns: ['steam', 'steam_osx'],
    dataPaths: ['Library/Application Support/Steam', 'Library/Caches/Steam'],
    brewCasks: ['steam'],
    appHints: ['steam']
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
    appHints: [key]
  }
}

/** 展开相对 HOME 的路径为绝对路径 */
export function expandHome(relPath: string): string {
  if (relPath.startsWith('~')) return path.join(os.homedir(), relPath.slice(1).replace(/^\//, ''))
  if (path.isAbsolute(relPath)) return path.normalize(relPath)
  return path.join(os.homedir(), relPath)
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

/** 查询已安装 brew cask */
export async function collectBrewCasks(
  profile: AppUninstallProfile,
  keyword: string
): Promise<string[]> {
  const found = new Set<string>()
  for (const cask of profile.brewCasks ?? []) {
    const status = await runShell(`brew list --cask '${cask.replace(/'/g, '')}' 2>/dev/null || true`)
    if (status && !/Error|No available/i.test(status)) found.add(cask)
  }
  const listed = await runShell(`brew list --cask 2>/dev/null | grep -i '${keyword.replace(/'/g, '')}' || true`)
  for (const line of listed.split('\n')) {
    const c = line.trim()
    if (c) found.add(c)
  }
  return [...found]
}

/** brew uninstall --cask */
export async function removeBrewCasks(casks: string[]): Promise<{
  ok: boolean
  output: string
  manualCommand?: string
}> {
  if (casks.length === 0) return { ok: true, output: 'no brew casks to remove' }
  const list = casks.join(' ')
  const manual = `brew uninstall --cask ${list}`
  const out = await runShell(manual, 300_000)
  const still = (
    await Promise.all(
      casks.map(async (c) => {
        const s = await runShell(`brew list --cask '${c.replace(/'/g, '')}' 2>/dev/null || true`)
        return s && !/Error|No available/i.test(s) ? c : null
      })
    )
  ).filter(Boolean) as string[]
  if (still.length === 0) {
    return { ok: true, output: out || `removed: ${list}` }
  }
  return {
    ok: false,
    output: `${out}\nStill installed: ${still.join(', ')}`,
    manualCommand: manual
  }
}

/** 在 /Applications 与 ~/Applications 查找 .app */
export async function findAppBundles(hints: string[]): Promise<string[]> {
  const roots = ['/Applications', path.join(os.homedir(), 'Applications')]
  const found: string[] = []
  for (const root of roots) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(root)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.app')) continue
      const lower = name.toLowerCase()
      if (hints.some((h) => lower.includes(h.toLowerCase()))) {
        found.push(path.join(root, name))
      }
    }
  }
  return found
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
  const library = path.join(home, 'Library')
  const findOut = await runShell(
    `find '${library.replace(/'/g, "'\\''")}' -maxdepth 3 \\( -type d -o -type f \\) -iname '*${keyword.replace(/'/g, '')}*' 2>/dev/null | head -40`
  )
  for (const line of findOut.split('\n')) {
    const p = line.trim()
    if (!p || p.includes('/.git/') || p.includes('/node_modules/')) continue
    paths.add(p)
  }
  return [...paths]
}

/** 兼容旧名：删除应用快捷方式（macOS 无 .desktop，返回空） */
export async function removeDesktopEntries(_hints: string[]): Promise<string[]> {
  return []
}

/** @deprecated 兼容旧 API */
export async function collectAptPackages(
  profile: AppUninstallProfile,
  keyword: string
): Promise<string[]> {
  return collectBrewCasks(profile, keyword)
}

/** @deprecated 兼容旧 API */
export async function removeAptPackages(packages: string[]): Promise<{
  ok: boolean
  output: string
  manualCommand?: string
}> {
  return removeBrewCasks(packages)
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
  brewCasksStillInstalled: string[]
  /** @deprecated 同 brewCasksStillInstalled */
  aptPackagesStillInstalled: string[]
  runningProcesses: string[]
  appBundlesRemaining: string[]
  /** @deprecated */
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
  const brewCasksStillInstalled = await collectBrewCasks(profile, keyword)
  let runningProcesses: string[] = []
  const psOut = await runShell(`ps aux | grep -i '${keyword.replace(/'/g, '')}' | grep -v grep || true`)
  if (psOut) runningProcesses = psOut.split('\n').map((l) => l.trim()).filter(Boolean)
  const appBundlesRemaining = await findAppBundles(profile.appHints)
  const clean =
    pathsStillExist.length === 0 &&
    brewCasksStillInstalled.length === 0 &&
    runningProcesses.length === 0 &&
    appBundlesRemaining.length === 0
  return {
    pathsStillExist,
    brewCasksStillInstalled,
    aptPackagesStillInstalled: brewCasksStillInstalled,
    runningProcesses,
    appBundlesRemaining,
    desktopEntriesRemaining: appBundlesRemaining,
    clean
  }
}

/** 格式化验证报告为模型可读文本 */
export function formatVerifyReport(keyword: string, report: RemovalVerifyReport): string {
  const lines = [`Verification for "${keyword}":`, `clean: ${report.clean}`]
  if (report.pathsStillExist.length) {
    lines.push('paths still exist:', ...report.pathsStillExist.map((p) => `  - ${p}`))
  }
  if (report.brewCasksStillInstalled.length) {
    lines.push('brew casks still installed:', ...report.brewCasksStillInstalled.map((p) => `  - ${p}`))
  }
  if (report.runningProcesses.length) {
    lines.push('running processes:', ...report.runningProcesses.map((p) => `  - ${p}`))
  }
  if (report.appBundlesRemaining.length) {
    lines.push('app bundles remaining:', ...report.appBundlesRemaining.map((p) => `  - ${p}`))
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
