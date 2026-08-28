/**
 * 项目附加文件夹：对标 Codex desktop Edit project（主文件夹 + 次文件夹）。
 * 新对话 / Git / AGENTS.md / Skill 仍走主路径；附加路径只给搜索与读写。
 * @see shared/ARCH.md
 */

/** 只收绝对路径，拒绝 `/`、相对路径与 `..` */
export function isUsableFolderPath(value: string): boolean {
  const p = String(value ?? '').trim()
  if (!p) return false
  if (p === '/' || p === '\\') return false
  if (p.includes('..')) return false
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
}

export function normalizeFolderPath(value: string): string {
  return String(value ?? '').trim().replace(/[\\/]+$/, '')
}

/** 附加文件夹：绝对路径、去重、不与主文件夹相同 */
export function normalizeExtraFolderPaths(primary: string, extras: unknown): string[] {
  const main = normalizeFolderPath(primary)
  if (!Array.isArray(extras)) return []
  const out: string[] = []
  const seen = new Set<string>()
  if (main) seen.add(main.toLowerCase())
  for (const raw of extras) {
    const p = normalizeFolderPath(String(raw ?? ''))
    if (!isUsableFolderPath(p)) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

/** 沙箱可读可写根：主路径 + 附加路径（会话 worktree 由调用方另加） */
export function workspaceAccessRoots(primary: string, extras: unknown): string[] {
  const main = normalizeFolderPath(primary)
  const extra = normalizeExtraFolderPaths(main, extras)
  return main ? [main, ...extra] : extra
}
