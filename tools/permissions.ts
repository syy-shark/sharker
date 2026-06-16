/**
 * 沙箱路径校验、工作区边界检测与高危工具/命令识别。
 * @see tools/README.md
 */
import path from 'path'
import type { PermissionMode } from '../shared/types'

const HIGH_RISK_PATTERNS = [
  /\bsudo\b/i,
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?-?[a-zA-Z]*r/i,
  /\brm\s+-rf\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i
]

const SYSTEM_PATH_PREFIXES = ['/etc', '/usr/bin', '/bin', '/sbin', '/var', '/boot', '/proc', '/sys']

/** 解析并规范化绝对路径 */
export function normalizePath(p: string): string {
  return path.normalize(path.resolve(p))
}

/** 判断目标路径是否在工作区目录内 */
export function isInsideWorkspace(target: string, workspace: string): boolean {
  if (!workspace) return false
  const t = normalizePath(target)
  const w = normalizePath(workspace)
  return t === w || t.startsWith(w + path.sep)
}

/** 沙箱下模型常误传 "/" 或 "."，统一回落到工作区根目录 */
export function resolveCommandCwd(
  cwd: string | undefined,
  workspace: string,
  mode: PermissionMode
): string {
  const ws = normalizePath(workspace)
  if (!workspace) return normalizePath(cwd ?? '.')
  const raw = cwd?.trim()
  if (!raw || raw === '/' || raw === '.') return ws
  const resolved = normalizePath(raw)
  if (mode === 'full') return resolved
  if (isInsideWorkspace(resolved, ws)) return resolved
  return ws
}

/** 按权限模式检查路径是否允许访问 */
export function checkPathAccess(
  targetPath: string,
  workspace: string,
  mode: PermissionMode
): { allowed: boolean; reason?: string } {
  const resolved = normalizePath(targetPath)
  if (mode === 'full') return { allowed: true }
  if (!workspace) {
    return { allowed: false, reason: '请先在设置中选择工作区' }
  }
  if (!isInsideWorkspace(resolved, workspace)) {
    return { allowed: false, reason: `沙箱模式禁止访问工作区外的路径: ${resolved}` }
  }
  return { allowed: true }
}

/** 判断路径是否属于系统敏感目录 */
export function isHighRiskPath(targetPath: string): boolean {
  const resolved = normalizePath(targetPath)
  return SYSTEM_PATH_PREFIXES.some((p) => resolved === p || resolved.startsWith(p + path.sep))
}

/** 判断 shell 命令是否匹配高危模式 */
export function isHighRiskCommand(command: string): boolean {
  return HIGH_RISK_PATTERNS.some((re) => re.test(command))
}

/** 按工具名与参数判断是否需要用户审批 */
export function isHighRiskTool(
  toolName: string,
  args: Record<string, unknown>
): { highRisk: boolean; reason: string } {
  switch (toolName) {
    case 'delete_path': {
      const recursive = Boolean(args.recursive)
      if (recursive) {
        return { highRisk: true, reason: '递归删除目录' }
      }
      const p = String(args.path ?? '')
      if (isHighRiskPath(p)) {
        return { highRisk: true, reason: '删除系统或敏感路径' }
      }
      return { highRisk: false, reason: '' }
    }
    case 'move_path': {
      const dest = String(args.destination ?? args.to ?? '')
      const src = String(args.path ?? args.source ?? '')
      if (isHighRiskPath(src) || isHighRiskPath(dest)) {
        return { highRisk: true, reason: '移动系统或敏感路径' }
      }
      return { highRisk: false, reason: '' }
    }
    case 'run_terminal_cmd': {
      const cmd = String(args.command ?? '')
      if (isHighRiskCommand(cmd)) {
        return { highRisk: true, reason: '高危 shell 命令' }
      }
      return { highRisk: false, reason: '' }
    }
    case 'git_commit':
      return { highRisk: true, reason: 'Git 提交' }
    case 'git_push':
      return { highRisk: true, reason: 'Git 推送到远程' }
    case 'git_pull':
      return { highRisk: true, reason: 'Git 拉取远程' }
    case 'run_skill_script':
      return { highRisk: true, reason: '执行 Skill 脚本' }
    case 'write_file': {
      const p = String(args.path ?? '')
      if (isHighRiskPath(p)) {
        return { highRisk: true, reason: '写入系统或敏感路径' }
      }
      return { highRisk: false, reason: '' }
    }
    default:
      return { highRisk: false, reason: '' }
  }
}

/** 提取工具参数中的路径并校验，返回拒绝原因或 null */
export function needsPathApproval(
  toolName: string,
  args: Record<string, unknown>,
  workspace: string,
  mode: PermissionMode
): string | null {
  const paths: string[] = []
  if (args.path) paths.push(String(args.path))
  if (args.source) paths.push(String(args.source))
  if (args.destination) paths.push(String(args.destination))
  if (args.to) paths.push(String(args.to))
  if (args.cwd) {
    paths.push(resolveCommandCwd(String(args.cwd), workspace, mode))
  }

  for (const p of paths) {
    const check = checkPathAccess(p, workspace, mode)
    if (!check.allowed) return check.reason ?? '路径被拒绝'
  }
  return null
}
