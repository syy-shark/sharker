/**
 * 设置页 MCP Server 增删改与 Restart。
 * 写入 mcp.json，关掉会话并清工具池。不实现 OAuth。
 * @see tools/services/ARCH.md
 */
import {
  removeMcpServer,
  setMcpServerEnabledFlag,
  upsertMcpServer,
  type McpServerConfig
} from '../../shared/mcp-config'
import { closeMcpSession } from './mcp-client'
import { readMcpConfig, writeMcpConfig } from './mcp-config-io'
import { invalidateMcpToolPool } from './mcp-tool-pool'

export interface McpSettingsSnapshot {
  path: string
  servers: McpServerConfig[]
}

async function persist(
  workspace: string,
  servers: McpServerConfig[]
): Promise<McpSettingsSnapshot> {
  const { path: targetPath } = await readMcpConfig(workspace)
  await writeMcpConfig(targetPath, { servers })
  invalidateMcpToolPool()
  return { path: targetPath, servers }
}

/** 列出当前 mcp.json（工作区优先） */
export async function listMcpServerSettings(workspace: string): Promise<McpSettingsSnapshot> {
  const { path, config } = await readMcpConfig(workspace)
  return { path, servers: config.servers }
}

/** 添加或覆盖一条 Server */
export async function upsertMcpServerSettings(
  workspace: string,
  server: McpServerConfig
): Promise<McpSettingsSnapshot> {
  const { config } = await readMcpConfig(workspace)
  closeMcpSession(server.name)
  return persist(workspace, upsertMcpServer(config.servers, server))
}

/** 删除一条 Server */
export async function removeMcpServerSettings(
  workspace: string,
  name: string
): Promise<McpSettingsSnapshot> {
  const { config } = await readMcpConfig(workspace)
  closeMcpSession(name)
  return persist(workspace, removeMcpServer(config.servers, name))
}

/** 开关一条 Server（官方 enabled，不删配置） */
export async function setMcpServerEnabledSettings(
  workspace: string,
  name: string,
  enabled: boolean
): Promise<McpSettingsSnapshot> {
  const { config } = await readMcpConfig(workspace)
  closeMcpSession(name)
  return persist(workspace, setMcpServerEnabledFlag(config.servers, name, enabled))
}

/** 官方 Restart：关掉全部会话并清工具池 */
export function restartMcpServers(): void {
  closeMcpSession()
  invalidateMcpToolPool()
}
