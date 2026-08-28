/**
 * 审查对比范围：相对基线分支的已提交变更。
 * @see shared/ARCH.md
 */
import type { GitStatusChange } from './git-status'
import type { GitRunner } from './git-review-actions'

/** 猜测基线分支：origin/HEAD → main → master */
export async function detectBaseBranch(runGit: GitRunner, cwd: string): Promise<string | null> {
  try {
    const head = await runGit(cwd, ['symbolic-ref', 'refs/remotes/origin/HEAD'])
    const m = /refs\/remotes\/(origin\/\S+)/.exec(head.trim())
    if (m?.[1]) return m[1]
  } catch {
    // 没有 origin/HEAD
  }
  for (const name of ['main', 'master', 'origin/main', 'origin/master']) {
    try {
      await runGit(cwd, ['rev-parse', '--verify', name])
      return name
    } catch {
      // 下一个
    }
  }
  return null
}

/** `git diff --name-status base...HEAD` → 审查列表行 */
export function parseNameStatus(text: string): GitStatusChange[] {
  const rows: GitStatusChange[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const code = line.slice(0, tab).trim()
    let pathPart = line.slice(tab + 1).trim()
    const arrow = pathPart.indexOf(' -> ')
    if (arrow >= 0) pathPart = pathPart.slice(arrow + 4).trim()
    if (!pathPart) continue
    const status = code.charAt(0) || 'M'
    rows.push({
      status,
      path: pathPart,
      raw: `${status}  ${pathPart}`,
      staged: false,
      unstaged: true,
      untracked: false
    })
  }
  return rows
}

/** 列出相对基线的分支变更（只读，不含工作区脏文件） */
export async function listBranchChanges(options: {
  cwd: string
  runGit: GitRunner
}): Promise<{ base: string | null; files: GitStatusChange[] }> {
  const base = await detectBaseBranch(options.runGit, options.cwd)
  if (!base) return { base: null, files: [] }
  try {
    const out = await options.runGit(options.cwd, ['diff', '--name-status', `${base}...HEAD`], {
      trim: false
    })
    return { base, files: parseNameStatus(out) }
  } catch {
    return { base, files: [] }
  }
}

/** 本轮路径是否命中该变更（相对路径或 basename） */
export function fileInLastTurn(path: string, lastTurnPaths: string[]): boolean {
  if (!lastTurnPaths.length) return false
  const posix = path.replaceAll('\\', '/')
  const base = posix.split('/').pop() ?? posix
  return lastTurnPaths.some((p) => {
    const rel = p.replaceAll('\\', '/')
    return rel === posix || rel.endsWith(`/${posix}`) || posix.endsWith(`/${rel}`) || rel === base
  })
}
