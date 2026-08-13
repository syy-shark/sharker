/**
 * 内置 MCP / Skill 插件目录（设置页展示与一键安装）。
 */
export { MCP_CATALOG, type McpCatalogItem, type McpCatalogServerTemplate } from './mcp-catalog-data'
export {
  BUNDLED_SKILL_CATALOG,
  MARKETPLACE_SKILL_CATALOG,
  type SkillCatalogEntry
} from './skill-catalog-data'

import type { McpCatalogItem } from './mcp-catalog-data'
import type { McpServerConfig } from '../tools/services/mcp-registry'

export type McpPluginCatalogItem = McpCatalogItem & {
  buildConfig: (ctx: McpPluginBuildContext) => McpServerConfig
}

export interface McpPluginBuildContext {
  homeDir: string
  workspace: string
  cuaDriverBinaryCandidates: string[]
}

export function defaultCuaDriverBinaryCandidates(homeDir: string): string[] {
  const fromEnv = process.env.SHARKER_CUA_DRIVER_BIN ?? process.env.CUA_DRIVER_BIN ?? ''
  return [
    fromEnv,
    `${homeDir}/.local/bin/cua-driver`,
    '/opt/homebrew/bin/cua-driver',
    '/usr/local/bin/cua-driver',
    `${homeDir}/.cua-driver/bin/cua-driver`
  ].filter(Boolean)
}

export function resolveMcpCatalogTemplate(
  item: McpCatalogItem,
  ctx: McpPluginBuildContext
): McpServerConfig {
  const workspace = ctx.workspace || ctx.homeDir
  const cuaDriverBinary = ctx.cuaDriverBinaryCandidates[0] ?? 'cua-driver'
  const replace = (s: string) =>
    s
      .replace(/\{\{workspace\}\}/g, workspace)
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

export const MCP_PLUGIN_CATALOG: McpPluginCatalogItem[] = []
