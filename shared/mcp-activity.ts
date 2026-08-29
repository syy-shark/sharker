/**
 * 官方 MCP 工具调用过程文案（对标 Codex TUI `history_cell/mcp.rs` / TurnItem::McpToolCall）。
 * 进行中 Calling、完成后 Called；调用写成 `server.tool({compact})`。
 * 不发明 Codex Apps / node_repl / @Browser / ImageGen，也不把 InProgress 标成已完成（#22300）。
 * @see shared/ARCH.md
 */

export const MCP_LIST_TOOLS = 'mcp_list_tools'
export const MCP_CALL_TOOL = 'mcp_call_tool'
export const MCP_PREFIX = 'mcp_'

/** 直播头参数上限，避免 compact JSON 把过程区顶高 */
export const MCP_ARGS_LIVE_MAX = 72

export type McpInvocation = {
  server: string
  tool: string
  arguments?: unknown
}

/** 是否为动态 MCP 工具名 `mcp_{server}__{tool}` */
export function isMcpDynamicToolName(name: string): boolean {
  return name.startsWith(MCP_PREFIX) && name.includes('__')
}

/** 过程区要按官方 MCP 单元格渲染的工具（含 list / 显式 call） */
export function isMcpActivityToolName(name: string): boolean {
  return name === MCP_LIST_TOOLS || name === MCP_CALL_TOOL || isMcpDynamicToolName(name)
}

/** 从动态名拆 server / tool（sanitize 后的下划线名） */
export function parseMcpDynamicToolName(name: string): { server: string; tool: string } | null {
  if (!isMcpDynamicToolName(name)) return null
  const rest = name.slice(MCP_PREFIX.length)
  const sep = rest.indexOf('__')
  const server = rest.slice(0, sep).trim()
  const tool = rest.slice(sep + 2).trim()
  if (!server || !tool) return null
  return { server, tool }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** 解析 MCP 调用：动态名、mcp_call_tool 参数，或 list_tools */
export function parseMcpInvocation(
  toolName: string,
  args?: Record<string, unknown>
): McpInvocation | null {
  if (toolName === MCP_LIST_TOOLS) {
    return { server: 'mcp', tool: 'list_tools' }
  }
  if (toolName === MCP_CALL_TOOL) {
    const server = String(args?.server ?? '').trim() || 'mcp'
    const tool = String(args?.tool_name ?? args?.tool ?? '').trim() || 'call_tool'
    const inner = args && 'arguments' in args ? args.arguments : undefined
    return { server, tool, arguments: inner }
  }
  const parsed = parseMcpDynamicToolName(toolName)
  if (!parsed) return null
  return { ...parsed, arguments: args }
}

/** compact JSON；空对象写成空串，直播截断 */
export function formatMcpArgs(value: unknown, max = MCP_ARGS_LIVE_MAX): string {
  if (value == null) return ''
  const rec = asRecord(value)
  if (rec && Object.keys(rec).length === 0) return ''
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (!text || text === '{}' || text === 'null' || text === '[]') return ''
  text = text.replace(/\s+/g, ' ').trim()
  if (text.length > max) return `${text.slice(0, max - 1)}…`
  return text
}

/** 官方 `server.tool(args)` */
export function formatMcpInvocation(invocation: McpInvocation, maxArgs = MCP_ARGS_LIVE_MAX): string {
  return `${invocation.server}.${invocation.tool}(${formatMcpArgs(invocation.arguments, maxArgs)})`
}

/** 进行中 Calling，完成后 Called；list_tools 也走同一头 */
export function formatMcpActivity(
  toolName: string,
  args?: Record<string, unknown>,
  status?: string
): string | null {
  const invocation = parseMcpInvocation(toolName, args)
  if (!invocation) return null
  const header = status === 'active' ? 'Calling' : 'Called'
  return `${header} ${formatMcpInvocation(invocation)}`
}

/** 大段 JSON / 数组不当过程行正文，避免直播卡顿 */
export function isMcpJsonDump(text: string | null | undefined): boolean {
  const value = String(text || '').trim()
  if (!value) return false
  if (value.startsWith('{') || value.startsWith('[')) return true
  if (/^```(?:json)?\s*[{[]/i.test(value)) return true
  return false
}
