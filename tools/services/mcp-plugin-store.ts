/**
 * MCP 插件目录：读取安装状态、一键写入 mcp.json。
 * @see shared/mcp-catalog-data.ts
 */
import fs from 'fs/promises'
import os from 'os'
import {
  defaultCodexBinaryCandidates,
  defaultCuaDriverBinaryCandidates,
  resolveMcpCatalogTemplate,
  type McpPluginBuildContext
} from '../../shared/plugin-catalog'
import { MCP_CATALOG } from '../../shared/mcp-catalog-data'
import type { McpServerConfig } from './mcp-registry'
import { readMcpConfig, writeMcpConfig, globalMcpConfigPath } from './mcp-config-io'
import { invalidateMcpToolPool } from './mcp-tool-pool'

export interface McpPluginState {
  id: string
  title: string
  description: string
  installed: boolean
  category: 'recommended' | 'more'
  feature?: 'computerUse' | 'browserUse'
}

/** 解析可执行路径（首个存在；Windows 不要求 X_OK） */
async function resolveBinary(candidates: string[], fallback: string): Promise<string> {
  const mode = process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK
  for (const p of candidates) {
    if (!p) continue
    try {
      await fs.access(p, mode)
      return p
    } catch {
      /* next */
    }
  }
  return candidates.find(Boolean) ?? fallback
}

/** 构建插件上下文 */
async function buildContext(workspace: string): Promise<McpPluginBuildContext> {
  const homeDir = os.homedir()
  const codexCandidates = defaultCodexBinaryCandidates(homeDir)
  const cuaCandidates = defaultCuaDriverBinaryCandidates(homeDir)
  const resolvedCodex = await resolveBinary(codexCandidates, 'codex-computer-use-linux')
  const resolvedCua = await resolveBinary(cuaCandidates, 'cua-driver')
  return {
    homeDir,
    workspace,
    codexBinaryCandidates: [resolvedCodex, ...codexCandidates.filter((c) => c !== resolvedCodex)],
    cuaDriverBinaryCandidates: [resolvedCua, ...cuaCandidates.filter((c) => c !== resolvedCua)]
  }
}

/** 当前 mcp.json 中是否已安装指定 Server */
export function isMcpServerInstalled(
  servers: McpServerConfig[],
  serverName: string
): boolean {
  return servers.some((s) => s.name === serverName)
}

/** 列出目录插件及安装状态 */
export async function listMcpPluginStates(workspace: string): Promise<McpPluginState[]> {
  const { config } = await readMcpConfig(workspace)
  return MCP_CATALOG.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    feature: item.feature,
    installed: isMcpServerInstalled(config.servers, item.serverName)
  }))
}

/** 启用/禁用单个 MCP 插件（写入全局 ~/.sharker/mcp.json） */
export async function setMcpPluginEnabled(
  workspace: string,
  pluginId: string,
  enabled: boolean
): Promise<void> {
  const item = MCP_CATALOG.find((p) => p.id === pluginId)
  if (!item) throw new Error(`Unknown MCP plugin: ${pluginId}`)

  const { config, path: configPath } = await readMcpConfig(workspace)
  const targetPath = configPath === globalMcpConfigPath() ? configPath : globalMcpConfigPath()

  let servers = [...config.servers]
  const idx = servers.findIndex((s) => s.name === item.serverName)

  if (enabled) {
    const ctx = await buildContext(workspace)
    const entry = resolveMcpCatalogTemplate(item, ctx)
    if (idx >= 0) servers[idx] = entry
    else servers.push(entry)
  } else if (idx >= 0) {
    servers = servers.filter((s) => s.name !== item.serverName)
  }

  await writeMcpConfig(targetPath, { servers })
  invalidateMcpToolPool()
}

/** 按功能开关同步关联 MCP（Computer Use / Browser Use） */
export async function syncFeatureMcpPlugins(
  workspace: string,
  flags: { computerUseEnabled?: boolean; browserUseEnabled?: boolean }
): Promise<void> {
  if (flags.computerUseEnabled !== undefined) {
    await setMcpPluginEnabled(workspace, 'cua-driver', flags.computerUseEnabled)
  }
  if (flags.browserUseEnabled !== undefined) {
    await setMcpPluginEnabled(workspace, 'playwright', flags.browserUseEnabled)
  }
}
