/**
 * MCP 基础：从配置文件加载 Server 列表，stdio JSON-RPC list/call。
 * @see tools/builtins/mcp/
 */
import { closeMcpSession, connectAndListMcpTools, getMcpSession } from './mcp-client'
import {
  enabledMcpServers,
  isMcpServerEnabled,
  type McpServerConfig
} from '../../shared/mcp-config'
import { readMcpConfig } from './mcp-config-io'

export type { McpServerConfig }

export interface McpToolDescriptor {
  server: string
  name: string
  description?: string
}

/** 读取 ~/.sharker/mcp.json 或工作区 .sharker/mcp.json（工作区优先） */
export async function loadMcpConfig(workspace: string): Promise<McpServerConfig[]> {
  const { config } = await readMcpConfig(workspace)
  return config.servers
}

/** 只返回已启用的 Server（官方 `enabled`） */
export async function loadEnabledMcpConfig(workspace: string): Promise<McpServerConfig[]> {
  return enabledMcpServers(await loadMcpConfig(workspace))
}

/** 列出已配置 MCP 工具（连接各 Server 并 tools/list） */
export async function listMcpTools(workspace: string): Promise<McpToolDescriptor[]> {
  return listMcpToolsWithTimeout(workspace, 120_000)
}

/** 设置页快速探测（避免长时间无响应） */
export async function listMcpToolsQuick(workspace: string, timeoutMs = 12_000): Promise<McpToolDescriptor[]> {
  return listMcpToolsWithTimeout(workspace, timeoutMs)
}

async function listMcpToolsWithTimeout(
  workspace: string,
  timeoutMs: number
): Promise<McpToolDescriptor[]> {
  const servers = await loadEnabledMcpConfig(workspace)
  const out: McpToolDescriptor[] = []

  for (const cfg of servers) {
    try {
      const tools = await connectAndListMcpTools(cfg, timeoutMs)
      if (!tools.length) {
        out.push({
          server: cfg.name,
          name: '(no tools)',
          description: `Server "${cfg.name}" connected but returned no tools`
        })
        continue
      }
      for (const t of tools) {
        out.push({
          server: cfg.name,
          name: t.name,
          description: t.description ?? `MCP tool on ${cfg.name}`
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      out.push({
        server: cfg.name,
        name: '(connection failed)',
        description: `Failed to connect ${cfg.name}: ${msg}`
      })
    }
  }
  return out
}

/** 调用 MCP 工具（stdio JSON-RPC tools/call） */
export async function callMcpTool(
  workspace: string,
  server: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const servers = await loadMcpConfig(workspace)
  const cfg = servers.find((s) => s.name === server)
  if (!cfg) {
    return (
      `MCP server not found: ${server}. Open Settings → MCP servers, or configure ~/.sharker/mcp.json:\n` +
      `{\n  "servers": [\n    { "name": "my-server", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"] }\n  ]\n}`
    )
  }
  if (!isMcpServerEnabled(cfg)) {
    return `MCP server disabled: ${server}. Enable it in Settings → MCP servers.`
  }

  try {
    const session = await getMcpSession(cfg)
    return await session.callTool(toolName, args, workspace)
  } catch (err) {
    // 连接失败时清缓存，下次重连
    closeMcpSession(server)
    const msg = err instanceof Error ? err.message : String(err)
    return `MCP call failed (${server}/${toolName}): ${msg}`
  }
}
