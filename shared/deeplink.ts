/**
 * `sharker://` 深链解析（对标 Codex 桌面端 `codex://`）。
 * 只落地本机真实能力：新对话 / 打开线程 / 设置 / Skills / 自动化。
 * 不解析 plugins、pets、SSH 远程主机。
 * @see shared/ARCH.md
 */

/** 本应用 URL scheme */
export const DEEPLINK_SCHEME = 'sharker'

/** 深链动作 */
export type DeeplinkAction =
  | { type: 'noop'; reason?: string }
  | { type: 'new_thread'; prompt?: string; path?: string; originUrl?: string }
  | { type: 'open_thread'; conversationId: string }
  | {
      type: 'settings'
      tab:
        | 'permissions'
        | 'models'
        | 'general'
        | 'worktrees'
        | 'browser'
        | 'appearance'
        | 'notifications'
        | 'personalization'
        | 'mcp'
        | 'suggested'
        | 'shortcuts'
        | 'appshots'
        | 'archived'
        | 'usage'
    }
  | { type: 'skills' }
  | { type: 'automations'; create?: boolean }

/** 把 git remote 收成可比较的 host/path（忽略协议与 .git） */
export function normalizeGitRemoteUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  const scp = /^git@([^:]+):(.+)$/.exec(raw)
  const hostPath = scp
    ? `${scp[1]}/${scp[2]}`
    : raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  return hostPath.replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase()
}

/** 工作区 path 是否与深链 path 相同（去尾斜杠） */
export function matchWorkspaceByPath(
  workspaces: Array<{ id: string; path: string }>,
  absPath: string
): { id: string; path: string } | null {
  const want = String(absPath || '').replace(/[\\/]+$/, '')
  if (!want) return null
  const hit = workspaces.find((w) => w.path.replace(/[\\/]+$/, '') === want)
  return hit ? { id: hit.id, path: hit.path } : null
}

/** 用已归一化的 origin 匹配工作区 */
export function matchWorkspaceByOrigin(
  remotes: Array<{ id: string; remoteUrl: string }>,
  originUrl: string
): string | null {
  const want = normalizeGitRemoteUrl(originUrl)
  if (!want) return null
  const hit = remotes.find((r) => normalizeGitRemoteUrl(r.remoteUrl) === want)
  return hit?.id ?? null
}

/** 生成当前对话的深链 */
export function formatThreadDeeplink(conversationId: string): string {
  const id = String(conversationId || '').trim()
  if (!id) return ''
  return `${DEEPLINK_SCHEME}://threads/${encodeURIComponent(id)}`
}

/** 生成新对话深链（至少要有一个查询参数才与官方 `codex://new?` 对齐） */
export function formatNewThreadDeeplink(input?: {
  prompt?: string
  path?: string
  originUrl?: string
}): string {
  const q = new URLSearchParams()
  if (input?.prompt) q.set('prompt', input.prompt)
  if (input?.path) q.set('path', input.path)
  if (input?.originUrl) q.set('originUrl', input.originUrl)
  const query = q.toString()
  return query
    ? `${DEEPLINK_SCHEME}://new?${query}`
    : `${DEEPLINK_SCHEME}://threads/new`
}

function settingsTabFromPath(rest: string[]): DeeplinkAction {
  const key = rest.join('/').toLowerCase()
  if (key === 'shortcuts' || key === 'keyboard' || key === 'keymap') {
    return { type: 'settings', tab: 'shortcuts' }
  }
  if (key === 'personalization' || key === 'personality' || key === 'agents.md' || key === 'memories') {
    return { type: 'settings', tab: 'personalization' }
  }
  if (key === 'mcp' || key === 'mcp-servers' || key === 'mcp_servers') {
    return { type: 'settings', tab: 'mcp' }
  }
  if (key === 'suggested' || key === 'suggested-prompts' || key === 'prompts') {
    return { type: 'settings', tab: 'suggested' }
  }
  if (key === 'general' || key === 'review') {
    return { type: 'settings', tab: 'general' }
  }
  if (
    key === 'browser' ||
    key === 'browsing' ||
    key === 'history' ||
    key === 'browser-use'
  ) {
    return { type: 'settings', tab: 'browser' }
  }
  if (key === 'notifications' || key === 'notify') {
    return { type: 'settings', tab: 'notifications' }
  }
  if (
    key === 'appearance' ||
    key === 'theme' ||
    key === 'code-font' ||
    key === 'codefont'
  ) {
    return { type: 'settings', tab: 'appearance' }
  }
  if (key === 'worktree' || key === 'worktrees') {
    return { type: 'settings', tab: 'worktrees' }
  }
  if (key === 'permissions' || key === 'git' || key.startsWith('computer-use')) {
    return { type: 'settings', tab: 'permissions' }
  }
  if (key === 'appshots' || key === 'appshot') {
    return { type: 'settings', tab: 'appshots' }
  }
  if (key === 'archived') return { type: 'settings', tab: 'archived' }
  if (key === 'usage' || key === 'profile' || key === 'tokens') {
    return { type: 'settings', tab: 'usage' }
  }
  return { type: 'settings', tab: 'models' }
}

function readQuery(url: URL): { prompt?: string; path?: string; originUrl?: string } {
  const prompt = url.searchParams.get('prompt') ?? ''
  const path = url.searchParams.get('path') ?? ''
  const originUrl = url.searchParams.get('originUrl') ?? ''
  return {
    prompt: prompt || undefined,
    path: path || undefined,
    originUrl: originUrl || undefined
  }
}

/**
 * 解析 `sharker://…`。非法、或官方要求「必须带参数」却没带时返回 noop。
 * plugins / pets / SSH 连接一律 noop，不假装已实现。
 */
export function parseDeeplink(raw: string): DeeplinkAction {
  const text = String(raw || '').trim()
  if (!text) return { type: 'noop', reason: 'empty' }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { type: 'noop', reason: 'invalid' }
  }
  if (url.protocol !== `${DEEPLINK_SCHEME}:`) {
    return { type: 'noop', reason: 'scheme' }
  }

  const host = url.hostname.toLowerCase()
  const segments = url.pathname
    .split('/')
    .map((s) => decodeURIComponent(s))
    .filter(Boolean)
  const q = readQuery(url)

  if (host === 'plugins' || host === 'pets') {
    return { type: 'noop', reason: 'unsupported' }
  }

  if (host === 'skills') return { type: 'skills' }
  if (host === 'automations') return { type: 'automations', create: true }

  if (host === 'settings') {
    return settingsTabFromPath(segments)
  }

  if (host === 'new') {
    if (!q.prompt && !q.path && !q.originUrl) {
      return { type: 'noop', reason: 'new-requires-query' }
    }
    return { type: 'new_thread', ...q }
  }

  if (host === 'threads') {
    const head = segments[0] || ''
    if (!head || head === 'new') {
      return { type: 'new_thread', ...q }
    }
    return { type: 'open_thread', conversationId: head }
  }

  return { type: 'noop', reason: 'unknown' }
}
