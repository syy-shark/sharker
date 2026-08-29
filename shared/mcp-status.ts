/**
 * `/mcp` 状态文案与是否打开设置（对标 Codex 桌面 Open MCP status）。
 * @see shared/ARCH.md
 */

/** 已配置的 MCP Server 快照（可不连上） */
export interface McpStatusServer {
  name: string
  command?: string
  args?: string[]
  url?: string
  enabled?: boolean
  tools?: string[]
  error?: string
}

/**
 * 官方桌面 `/mcp` = Open MCP status。
 * 空配置且非 verbose 时打开设置 → MCP 服务器；已有 Server 或 verbose 只在对话里列状态。
 */
export function shouldOpenMcpSettings(
  servers: readonly McpStatusServer[],
  args = ''
): boolean {
  if (/^\s*verbose\b/i.test(args)) return false
  return servers.length === 0
}

/** 拼 MCP 状态 Markdown */
export function formatMcpStatus(servers: McpStatusServer[], verbose = false): string {
  if (!servers.length) {
    return [
      '**MCP**',
      '',
      '未配置 Server。打开 **设置 → MCP 服务器** 添加 STDIO 或 Streamable HTTP（`sharker://settings/mcp`），或把 `servers` 写入 `~/.sharker/mcp.json`。',
      '',
      '```json',
      '{ "servers": [{ "name": "example", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-everything"] }] }',
      '```'
    ].join('\n')
  }
  const lines = ['**MCP**', '', `已配置 ${servers.length} 个 Server。`, '']
  for (const server of servers) {
    const cmd = [server.command, ...(server.args ?? [])].join(' ').trim()
    const label = (server.url || cmd || '—').trim()
    const off = server.enabled === false ? '（已关闭）' : ''
    lines.push(`- **${server.name}** \`${label}\`${off}`)
    if (server.error) lines.push(`  - 连接失败：${server.error}`)
    if (verbose && server.tools?.length) {
      for (const tool of server.tools.slice(0, 24)) {
        lines.push(`  - \`${tool}\``)
      }
      if (server.tools.length > 24) lines.push(`  - …共 ${server.tools.length} 个工具`)
    } else if (verbose && !server.error && server.enabled !== false) {
      lines.push('  - （未列出工具）')
    }
  }
  if (!verbose) lines.push('', '加 `verbose` 可尝试连接并列出工具。')
  return lines.join('\n')
}
