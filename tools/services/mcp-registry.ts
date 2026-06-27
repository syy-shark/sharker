/**
 * MCP 基础：从配置文件加载 Server 列表，stdio JSON-RPC list/call。
 * @see tools/builtins/mcp/
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { closeMcpSession, connectAndListMcpTools, getMcpSession } from './mcp-client'

export interface McpServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  /** stdio 写帧格式：content-length（MCP 规范默认）| ndjson（rmcp / codex-computer-use-linux） */
  transport?: 'content-length' | 'ndjson'
}

export interface McpToolDescriptor {
  server: string
  name: string
  description?: string
}

/** 读取 ~/.sharker/mcp.json 或工作区 .sharker/mcp.json（工作区优先） */
export async function loadMcpConfig(workspace: string): Promise<McpServerConfig[]> {
  const paths: string[] = []
  const ws = workspace?.trim()
  if (ws) {
    paths.push(path.join(ws, '.sharker', 'mcp.json'))
  }
  paths.push(path.join(os.homedir(), '.sharker', 'mcp.json'))
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p, 'utf8')
      const json = JSON.parse(raw) as { servers?: McpServerConfig[] }
      if (Array.isArray(json.servers)) return json.servers
    } catch {
      /* try next */
    }
  }
  return []
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
  const servers = await loadMcpConfig(workspace)
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
      `MCP server not found: ${server}. Configure ~/.sharker/mcp.json:\n` +
      `{\n  "servers": [\n    { "name": "my-server", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"] }\n  ]\n}`
    )
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
