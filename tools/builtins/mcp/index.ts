/**
 * MCP 基础 Tool：list / call。
 * @see tools/README.md
 */
import { callMcpTool, listMcpTools } from '../../services/mcp-registry'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

export const mcpListToolsTool: ToolHandler = {
  name: 'mcp_list_tools',
  title: 'MCP 工具列表',
  async execute(_args, ctx) {
    const ws = getActiveWorkspacePath(ctx.settings)
    const tools = await listMcpTools(ws)
    if (!tools.length) {
      return ok('No MCP servers configured. Add ~/.sharker/mcp.json')
    }
    return ok(tools.map((t) => `${t.server}/${t.name}: ${t.description ?? ''}`).join('\n'))
  }
}

export const mcpCallToolTool: ToolHandler = {
  name: 'mcp_call_tool',
  title: 'MCP 调用',
  assessRisk: () => ({ highRisk: true, reason: 'MCP 工具调用' }),
  async execute(args, ctx) {
    const ws = getActiveWorkspacePath(ctx.settings)
    const server = String(args.server)
    const toolName = String(args.tool_name)
    const toolArgs = (args.arguments as Record<string, unknown>) ?? {}
    return ok(await callMcpTool(ws, server, toolName, toolArgs))
  }
}

export const mcpTools: ToolHandler[] = [mcpListToolsTool, mcpCallToolTool]
