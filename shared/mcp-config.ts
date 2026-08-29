/**
 * MCP Server 配置契约（`~/.sharker/mcp.json`）。
 * 对标 Codex Settings → MCP servers：STDIO / Streamable HTTP、enabled、不写 OAuth。
 * @see shared/ARCH.md
 */

/** 一条 MCP Server（stdio 或 Streamable HTTP） */
export interface McpServerConfig {
  name: string
  /** 官方 `enabled`，缺省视为开 */
  enabled?: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** stdio 写帧：content-length（默认）| ndjson */
  transport?: 'content-length' | 'ndjson'
  /** Streamable HTTP 地址 */
  url?: string
  /** Authorization Bearer 从该环境变量读 */
  bearerTokenEnvVar?: string
  httpHeaders?: Record<string, string>
}

/** 设置页添加 Server 草稿 */
export interface McpServerDraft {
  name: string
  kind: 'stdio' | 'http'
  command?: string
  argsText?: string
  envText?: string
  url?: string
  bearerTokenEnvVar?: string
}

/** 官方：名称只含字母、数字、连字符、下划线 */
export function isValidMcpServerName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(String(name || '').trim())
}

/** `enabled !== false` 才连 */
export function isMcpServerEnabled(server: Pick<McpServerConfig, 'enabled'>): boolean {
  return server.enabled !== false
}

/** 有 url 即 Streamable HTTP，否则 STDIO */
export function mcpServerKind(server: Pick<McpServerConfig, 'url' | 'command'>): 'stdio' | 'http' {
  return String(server.url || '').trim() ? 'http' : 'stdio'
}

/** 列表/状态一行启动说明 */
export function mcpServerLaunchLabel(
  server: Pick<McpServerConfig, 'url' | 'command' | 'args'>
): string {
  const url = String(server.url || '').trim()
  if (url) return url
  return [server.command, ...(server.args ?? [])].filter(Boolean).join(' ').trim()
}

export function enabledMcpServers(servers: McpServerConfig[]): McpServerConfig[] {
  return servers.filter(isMcpServerEnabled)
}

function asStringRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue
    out[key] = String(value ?? '')
  }
  return Object.keys(out).length ? out : undefined
}

/** 读盘后收成合法 Server 列表 */
export function normalizeMcpServers(raw: unknown): McpServerConfig[] {
  if (!Array.isArray(raw)) return []
  const out: McpServerConfig[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const name = String(rec.name || '').trim()
    if (!name) continue
    const server: McpServerConfig = { name }
    if (typeof rec.enabled === 'boolean') server.enabled = rec.enabled
    if (typeof rec.command === 'string' && rec.command.trim()) server.command = rec.command
    if (Array.isArray(rec.args)) server.args = rec.args.map((a) => String(a))
    const env = asStringRecord(rec.env)
    if (env) server.env = env
    if (rec.transport === 'ndjson' || rec.transport === 'content-length') {
      server.transport = rec.transport
    }
    if (typeof rec.url === 'string' && rec.url.trim()) server.url = rec.url.trim()
    if (typeof rec.bearerTokenEnvVar === 'string' && rec.bearerTokenEnvVar.trim()) {
      server.bearerTokenEnvVar = rec.bearerTokenEnvVar.trim()
    }
    const headers = asStringRecord(rec.httpHeaders)
    if (headers) server.httpHeaders = headers
    out.push(server)
  }
  return out
}

/** 参数行：空白分隔，支持单/双引号 */
export function parseMcpArgsLine(text: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(String(text || '')))) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (value) out.push(value)
  }
  return out
}

/** KEY=VALUE 每行一条；`#` 开头忽略 */
export function parseMcpEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1)
  }
  return env
}

export function formatMcpEnvText(env?: Record<string, string>): string {
  return Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

export function upsertMcpServer(
  servers: McpServerConfig[],
  next: McpServerConfig
): McpServerConfig[] {
  const name = next.name.trim()
  const copy = servers.filter((s) => s.name !== name)
  const prev = servers.find((s) => s.name === name)
  copy.push(prev ? { ...prev, ...next, name } : { ...next, name })
  return copy
}

export function removeMcpServer(servers: McpServerConfig[], name: string): McpServerConfig[] {
  return servers.filter((s) => s.name !== name)
}

export function setMcpServerEnabledFlag(
  servers: McpServerConfig[],
  name: string,
  enabled: boolean
): McpServerConfig[] {
  return servers.map((s) => (s.name === name ? { ...s, enabled } : s))
}

/** 设置页草稿 → 可落盘的 Server */
export function draftToMcpServer(
  draft: McpServerDraft
): { ok: true; server: McpServerConfig } | { ok: false; error: string } {
  const name = String(draft.name || '').trim()
  if (!isValidMcpServerName(name)) {
    return { ok: false, error: '名称只含字母、数字、连字符、下划线。' }
  }
  if (draft.kind === 'http') {
    const url = String(draft.url || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'Streamable HTTP 需要 http(s) 地址。' }
    }
    const server: McpServerConfig = { name, url, enabled: true }
    const bearer = String(draft.bearerTokenEnvVar || '').trim()
    if (bearer) server.bearerTokenEnvVar = bearer
    return { ok: true, server }
  }
  const command = String(draft.command || '').trim()
  if (!command) return { ok: false, error: 'STDIO 需要启动命令。' }
  const args = parseMcpArgsLine(draft.argsText || '')
  const env = parseMcpEnvText(draft.envText || '')
  const server: McpServerConfig = { name, command, enabled: true }
  if (args.length) server.args = args
  if (Object.keys(env).length) server.env = env
  return { ok: true, server }
}
