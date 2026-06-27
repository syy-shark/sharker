/**
 * 网络隔离策略：按 settings.networkMode 限制 web 与 shell 出站。
 * @see shared/types.ts · docs/agent-capabilities.md
 */
import type { AppSettings, NetworkMode } from '../shared/types'

const LOCAL_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i

/** 默认网络模式 */
export function getNetworkMode(settings: AppSettings): NetworkMode {
  return settings.networkMode ?? 'open'
}

/** web_fetch / web_search 是否允许访问该 URL */
export function assertWebAccessAllowed(url: string, settings: AppSettings): void {
  const mode = getNetworkMode(settings)
  if (mode === 'disabled') {
    throw new Error('网络已关闭（networkMode=disabled）。请在设置 → 权限中改为 Local 或 Open。')
  }
  if (mode === 'local_only') {
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      throw new Error(`无效 URL: ${url}`)
    }
    if (!LOCAL_HOST_RE.test(host)) {
      throw new Error(
        `Local 网络模式仅允许 localhost/内网地址，拒绝: ${host}。如需外网请改为 Open。`
      )
    }
  }
}

/** shell 命令是否含明显出站网络（networkMode=disabled 时拦截） */
export function assertShellNetworkAllowed(command: string, settings: AppSettings): void {
  if (getNetworkMode(settings) !== 'disabled') return
  const netPatterns = [
    /\bcurl\b/i,
    /\bwget\b/i,
    /\bssh\b/i,
    /\bscp\b/i,
    /\brsync\b.*@/i,
    /\bnpm\s+install\b/i,
    /\bpnpm\s+(add|install)\b/i,
    /\byarn\s+add\b/i,
    /\bpip\s+install\b/i,
    /\bapt\b/i,
    /\bdnf\b/i,
    /\bpacman\b/i,
    /\bgit\s+(clone|fetch|pull|push)\b/i
  ]
  for (const re of netPatterns) {
    if (re.test(command)) {
      throw new Error(
        `网络已关闭，拒绝可能出站的命令。如需联网请在设置 → 权限 → 网络模式改为 Local 或 Open。\n命令: ${command.slice(0, 200)}`
      )
    }
  }
}
