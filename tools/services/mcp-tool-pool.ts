/**
 * MCP 动态 Tool 池：启动时 tools/list 并入模型 tool 列表，按 server/tool 路由调用。
 * @see tools/services/mcp-registry.ts
 */
import type { OpenAIToolDefinition } from '../types'
import type { ToolRiskAssessment } from '../types'
import { NO_RISK } from '../types'
import { callMcpTool, loadMcpConfig } from './mcp-registry'
import { connectAndListMcpTools, MCP_POOL_CONNECT_MS } from './mcp-client'

const MCP_PREFIX = 'mcp_'

/** 动态 MCP 工具条目（externalName → server + tool） */
export interface McpDynamicToolEntry {
  externalName: string
  server: string
  toolName: string
  description: string
  definition: OpenAIToolDefinition
  readOnly: boolean
  destructive: boolean
}

let cachedPool: McpDynamicToolEntry[] = []
let cachedWorkspace = ''

/** 将 server/tool 名转为 OpenAI function 名（仅字母数字下划线） */
export function mcpExternalToolName(server: string, toolName: string): string {
  const sanitize = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'tool'
  return `${MCP_PREFIX}${sanitize(server)}__${sanitize(toolName)}`
}

/** 是否为动态 MCP 工具名 */
export function isMcpDynamicToolName(name: string): boolean {
  return name.startsWith(MCP_PREFIX) && name.includes('__')
}

/** 解析 MCP 工具 annotations（readOnlyHint / destructiveHint） */
function parseAnnotations(raw: unknown): { readOnly: boolean; destructive: boolean } {
  if (!raw || typeof raw !== 'object') return { readOnly: false, destructive: true }
  const a = raw as Record<string, unknown>
  const readOnly = a.readOnlyHint === true
  const destructive = a.destructiveHint === true
  return { readOnly, destructive }
}

/** MCP inputSchema → OpenAI parameters */
function toOpenAiParameters(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (schema && typeof schema === 'object' && schema.type === 'object') {
    return schema as Record<string, unknown>
  }
  return { type: 'object', properties: {}, additionalProperties: true }
}

/** 刷新 MCP 动态工具池（每轮 query 开始时调用） */
export async function refreshMcpToolPool(workspace: string): Promise<McpDynamicToolEntry[]> {
  if (cachedWorkspace === workspace && cachedPool.length > 0) {
    return cachedPool
  }

  const servers = await loadMcpConfig(workspace)
  const bundles = await Promise.all(
    servers.map(async (cfg) => {
      try {
        const tools = await connectAndListMcpTools(cfg, MCP_POOL_CONNECT_MS)
        const entries: McpDynamicToolEntry[] = []
        for (const t of tools) {
          if (!t.name || t.name.startsWith('(')) continue
          const externalName = mcpExternalToolName(cfg.name, t.name)
          const { readOnly, destructive } = parseAnnotations(
            (t as { annotations?: unknown }).annotations
          )
          const desc =
            t.description ??
            `MCP tool ${t.name} on server "${cfg.name}"` +
              (readOnly ? ' (read-only)' : destructive ? ' (may modify state)' : '')
          entries.push({
            externalName,
            server: cfg.name,
            toolName: t.name,
            description: desc,
            readOnly,
            destructive,
            definition: {
              type: 'function',
              function: {
                name: externalName,
                description: `[MCP:${cfg.name}] ${desc}`,
                parameters: toOpenAiParameters(t.inputSchema)
              }
            }
          })
        }
        return entries
      } catch {
        /* 连接失败时跳过该 server，保留 mcp_list_tools 诊断 */
        return []
      }
    })
  )

  const entries = bundles.flat()
  cachedPool = entries
  cachedWorkspace = entries.length > 0 || servers.length === 0 ? workspace : ''
  return entries
}

/** 获取当前缓存的动态 tool definitions */
export function getMcpDynamicToolDefinitions(): OpenAIToolDefinition[] {
  return cachedPool.map((e) => e.definition)
}

/** 按 externalName 查找动态 MCP 工具 */
export function resolveMcpDynamicTool(externalName: string): McpDynamicToolEntry | undefined {
  return cachedPool.find((e) => e.externalName === externalName)
}

/** 执行动态 MCP 工具 */
export async function executeMcpDynamicTool(
  workspace: string,
  externalName: string,
  args: Record<string, unknown>
): Promise<string> {
  const entry = resolveMcpDynamicTool(externalName)
  if (!entry) {
    return `Unknown MCP dynamic tool: ${externalName}. Run mcp_list_tools or check ~/.sharker/mcp.json`
  }
  return callMcpTool(workspace, entry.server, entry.toolName, args)
}

/** 动态 MCP 工具风险（destructiveHint → 需审批） */
export function assessMcpDynamicToolRisk(
  externalName: string,
  _args: Record<string, unknown>
): ToolRiskAssessment {
  const entry = resolveMcpDynamicTool(externalName)
  if (!entry) return NO_RISK
  if (entry.destructive) {
    return { highRisk: true, reason: `MCP 工具 ${entry.server}/${entry.toolName}（可能修改状态）` }
  }
  return NO_RISK
}

/** 动态 MCP 只读工具是否允许在 plan 模式使用 */
export function isMcpDynamicToolAllowedInPlanMode(externalName: string): boolean {
  const entry = resolveMcpDynamicTool(externalName)
  return entry?.readOnly === true
}

/** 强制清空缓存（MCP 配置变更后） */
export function invalidateMcpToolPool(): void {
  cachedPool = []
  cachedWorkspace = ''
}
