/**
 * 解析 `git status --porcelain` 行，区分暂存 / 未暂存 / 未跟踪。
 * @see shared/ARCH.md
 */

/** 审查列表里的一条 git 变更 */
export interface GitStatusChange {
  /** 展示用短状态（如 M / ?? / A） */
  status: string
  path: string
  raw: string
  /** 索引区有变更 */
  staged: boolean
  /** 工作区有未暂存变更（含未跟踪） */
  unstaged: boolean
  untracked: boolean
}

/**
 * 解析一行 porcelain（`-uall`）。
 * 前两列 XY：X=索引，Y=工作区；`??` 为未跟踪。
 */
export function parseGitStatusLine(line: string): GitStatusChange | null {
  const raw = line.trimEnd()
  if (!raw) return null
  if (raw.length < 2) return null
  const x = raw[0] ?? ' '
  const y = raw[1] ?? ' '
  let pathPart = raw.length > 3 ? raw.slice(3).trim() : ''
  const arrow = pathPart.indexOf(' -> ')
  if (arrow >= 0) pathPart = pathPart.slice(arrow + 4).trim()
  if (
    (pathPart.startsWith('"') && pathPart.endsWith('"')) ||
    (pathPart.startsWith("'") && pathPart.endsWith("'"))
  ) {
    pathPart = pathPart.slice(1, -1)
  }
  if (!pathPart) return null

  const untracked = x === '?' && y === '?'
  const staged = !untracked && x !== ' '
  const unstaged = untracked || y !== ' '
  const status = untracked ? '??' : `${x === ' ' ? '' : x}${y === ' ' ? '' : y}` || x + y

  return {
    status: status.trim() || `${x}${y}`.trim(),
    path: pathPart,
    raw,
    staged,
    unstaged,
    untracked
  }
}

/** 把整段 porcelain 收成变更列表 */
export function parseGitStatusPorcelain(porcelain: string): GitStatusChange[] {
  return porcelain
    .split('\n')
    .map((line) => parseGitStatusLine(line))
    .filter((row): row is GitStatusChange => Boolean(row))
}
