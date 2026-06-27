/**
 * 内置 MCP / Skill 插件目录（设置页展示与一键安装）。
 * @see docs/agent-capabilities.md
 */
export { MCP_CATALOG, type McpCatalogItem, type McpCatalogServerTemplate } from './mcp-catalog-data'
export {
  BUNDLED_SKILL_CATALOG,
  MARKETPLACE_SKILL_CATALOG,
  type SkillCatalogEntry
} from './skill-catalog-data'

import type { McpCatalogItem } from './mcp-catalog-data'
import type { McpServerConfig } from '../tools/services/mcp-registry'

/** @deprecated 使用 MCP_CATALOG */
export type McpPluginCatalogItem = McpCatalogItem & {
  buildConfig: (ctx: McpPluginBuildContext) => McpServerConfig
}

/** 构建 MCP 配置时的路径上下文 */
export interface McpPluginBuildContext {
  homeDir: string
  workspace: string
  codexBinaryCandidates: string[]
  cuaDriverBinaryCandidates: string[]
}

/**
 * 常见 cua-driver 路径（Windows 优先 Cua Driver 安装布局，Linux 见 ydotool 回退）
 */
export function defaultCuaDriverBinaryCandidates(homeDir: string): string[] {
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA ?? `${homeDir.replace(/\//g, '\\')}\\AppData\\Local`
    const fromEnv = process.env.SHARKER_CUA_DRIVER_BIN ?? process.env.CUA_DRIVER_BIN ?? ''
    return [
      fromEnv,
      `${localAppData}\\Programs\\Cua\\cua-driver\\bin\\cua-driver.exe`,
      `${localAppData}\\Programs\\trycua\\cua-driver-rs\\bin\\cua-driver.exe`,
      `${homeDir}\\.cua-driver\\packages\\current\\cua-driver.exe`
    ].filter(Boolean)
  }
  return [
    `${homeDir}/.local/bin/cua-driver`,
    '/usr/local/bin/cua-driver',
    '/usr/bin/cua-driver'
  ]
}

/** 常见 codex-computer-use-linux 路径 */
export function defaultCodexBinaryCandidates(homeDir: string): string[] {
  return [
    `${homeDir}/下载/GitHub/codex-desktop-linux-main/target/release/codex-computer-use-linux`,
    `${homeDir}/codex-desktop-linux-main/target/release/codex-computer-use-linux`,
    `${homeDir}/GitHub/codex-desktop-linux-main/target/release/codex-computer-use-linux`,
    '/usr/local/bin/codex-computer-use-linux'
  ]
}

/** 将目录模板解析为可写入 mcp.json 的配置 */
export function resolveMcpCatalogTemplate(
  item: McpCatalogItem,
  ctx: McpPluginBuildContext
): McpServerConfig {
  const workspace = ctx.workspace || ctx.homeDir
  const codexBinary = ctx.codexBinaryCandidates[0] ?? 'codex-computer-use-linux'
  const cuaDriverBinary = ctx.cuaDriverBinaryCandidates[0] ?? 'cua-driver'
  const replace = (s: string) =>
    s
      .replace(/\{\{workspace\}\}/g, workspace)
      .replace(/\{\{codex_binary\}\}/g, codexBinary)
      .replace(/\{\{cua_driver_binary\}\}/g, cuaDriverBinary)

  const args = item.template.args?.map(replace)
  return {
    name: item.template.name,
    command: replace(item.template.command),
    args,
    env: item.template.env,
    transport: item.template.transport
  }
}

/** @deprecated 使用 MCP_CATALOG */
export const MCP_PLUGIN_CATALOG: McpPluginCatalogItem[] = []
