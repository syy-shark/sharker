/**
 * MCP 配置文件读写（~/.sharker/mcp.json 或工作区 .sharker/mcp.json）。
 * @see tools/services/mcp-registry.ts
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { McpServerConfig } from './mcp-registry'

export interface McpConfigFile {
  servers: McpServerConfig[]
}

/** 全局 MCP 配置路径 */
export function globalMcpConfigPath(): string {
  return path.join(os.homedir(), '.sharker', 'mcp.json')
}

/** 工作区 MCP 配置路径 */
export function workspaceMcpConfigPath(workspace: string): string {
  return path.join(workspace, '.sharker', 'mcp.json')
}

/** 读取 MCP 配置（工作区优先，否则全局） */
export async function readMcpConfig(workspace: string): Promise<{
  raw: string
  path: string
  config: McpConfigFile
}> {
  const candidates = [workspaceMcpConfigPath(workspace), globalMcpConfigPath()]
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf8')
      const config = JSON.parse(raw) as McpConfigFile
      if (!Array.isArray(config.servers)) config.servers = []
      return { raw, path: p, config }
    } catch {
      /* try next */
    }
  }
  const p = globalMcpConfigPath()
  const empty: McpConfigFile = { servers: [] }
  return { raw: JSON.stringify(empty, null, 2) + '\n', path: p, config: empty }
}

/** 写入 MCP 配置 */
export async function writeMcpConfig(targetPath: string, config: McpConfigFile): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
}
