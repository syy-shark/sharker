/**
 * 内置 Tool 注册表：汇总 handler + schema，供 executor 与 agent 消费。
 * @see tools/README.md
 */
import { agentTools } from './builtins/agent'
import { applyPatchTool } from './builtins/file/apply-patch'
import { readGraphTool } from './builtins/file/read-graph'
import { readImageTool } from './builtins/file/read-image'
import { readPdfTool } from './builtins/file/read-pdf'
import { editNotebookTool, readNotebookTool } from './builtins/file/notebook'
import { createDirectoryTool } from './builtins/create-directory'
import { deletePathTool } from './builtins/delete-path'
import { globFileSearchTool } from './builtins/glob-file-search'
import { grepTool } from './builtins/grep'
import { gitTools } from './builtins/git'
import { listDirTool } from './builtins/list-dir'
import { movePathTool } from './builtins/move-path'
import { openUrlTool } from './builtins/open-url'
import { uninstallApplicationTool } from './builtins/uninstall-application'
import { verifyRemovalTool } from './builtins/verify-removal'
import { enterPlanModeTool, exitPlanModeTool } from './builtins/mode/plan'
import { worktreeTools } from './builtins/mode/worktree'
import { computerUseTools } from './builtins/computer-use'
import { browserTools } from './builtins/browser'
import { voiceTools } from './builtins/voice'
import { mcpTools } from './builtins/mcp'
import { readFileTool } from './builtins/read-file'
import { runSkillScriptTool } from './builtins/run-skill-script'
import { runTerminalCmdTool } from './builtins/run-terminal-cmd'
import { searchReplaceTool } from './builtins/search-replace'
import { backgroundShellTools } from './builtins/shell/background'
import { skillDiscoveryTools } from './builtins/skill/discovery'
import { taskTools } from './builtins/tasks'
import { webTools } from './builtins/web'
import { writeFileTool } from './builtins/write-file'
import { getHarnessPhase } from './harness-state'
import { KNOWN_TOOL_NAMES, TOOL_DEFINITIONS, TOOL_SCHEMA_MAP } from './schemas'
import type { OpenAIToolDefinition } from './types'
import type { SharkerTool, ToolContext, ToolHandler, ToolRiskAssessment } from './types'
import { NO_RISK } from './types'
import { isToolAllowedInPlanMode } from './tool-groups'
import {
  assessMcpDynamicToolRisk,
  executeMcpDynamicTool,
  getMcpDynamicToolDefinitions,
  isMcpDynamicToolAllowedInPlanMode,
  isMcpDynamicToolName,
  refreshMcpToolPool
} from './services/mcp-tool-pool'
import type { AppSettings, ToolRunResult } from '../shared/types'
import { getActiveWorkspacePath } from '../shared/workspace'

/** 全部 handler 模块 */
function getAllToolHandlers(): ToolHandler[] {
  return [
    listDirTool,
    globFileSearchTool,
    grepTool,
    readFileTool,
    readPdfTool,
    readImageTool,
    readGraphTool,
    readNotebookTool,
    writeFileTool,
    searchReplaceTool,
    applyPatchTool,
    editNotebookTool,
    deletePathTool,
    uninstallApplicationTool,
    verifyRemovalTool,
    movePathTool,
    createDirectoryTool,
    runTerminalCmdTool,
    ...backgroundShellTools,
    ...gitTools,
    ...worktreeTools,
    ...taskTools,
    ...webTools,
    openUrlTool,
    ...browserTools,
    ...voiceTools,
    ...skillDiscoveryTools,
    runSkillScriptTool,
    ...mcpTools,
    ...computerUseTools,
    ...agentTools,
    enterPlanModeTool,
    exitPlanModeTool
  ]
}

function wireTool(handler: ToolHandler): SharkerTool {
  const definition = TOOL_SCHEMA_MAP.get(handler.name)
  if (!definition) throw new Error(`Missing schema for tool: ${handler.name}`)
  return { ...handler, definition }
}

function assertRegistryIntegrity(handlers: ToolHandler[]): void {
  const handlerNames = new Set(handlers.map((h) => h.name))
  for (const h of handlers) {
    if (!TOOL_SCHEMA_MAP.has(h.name)) {
      throw new Error(`Missing schema for tool handler: ${h.name}`)
    }
  }
  for (const d of TOOL_DEFINITIONS) {
    if (!handlerNames.has(d.function.name)) {
      throw new Error(`Missing handler for tool schema: ${d.function.name}`)
    }
  }
}

export function getAllBuiltinTools(): SharkerTool[] {
  const handlers = getAllToolHandlers()
  assertRegistryIntegrity(handlers)
  return handlers.map(wireTool)
}

const ALL_TOOLS = getAllBuiltinTools()
const TOOL_MAP = new Map<string, SharkerTool>(ALL_TOOLS.map((t) => [t.name, t]))

export { TOOL_DEFINITIONS, KNOWN_TOOL_NAMES }

export const TOOL_TITLES: Record<string, string> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t.title])
)

/** 按 Harness 阶段与设置开关过滤发给模型的 tools（含 MCP 动态池） */
export function getToolDefinitionsForPhase(
  phase = getHarnessPhase(),
  settings?: AppSettings
): OpenAIToolDefinition[] {
  const enabled = (name: string) => isToolEnabledForSettings(name, settings)
  const baseRaw =
    phase === 'plan'
      ? TOOL_DEFINITIONS.filter((d) => isToolAllowedInPlanMode(d.function.name))
      : TOOL_DEFINITIONS
  const base = baseRaw.filter((d) => enabled(d.function.name))
  const mcpDynamicRaw =
    phase === 'plan'
      ? getMcpDynamicToolDefinitions().filter((d) =>
          isMcpDynamicToolAllowedInPlanMode(d.function.name)
        )
      : getMcpDynamicToolDefinitions()
  const mcpDynamic = mcpDynamicRaw.filter((d) => enabled(d.function.name))
  return [...base, ...mcpDynamic]
}

/** 根据 AppSettings 开关过滤 desktop/browser/voice/MCP 工具 */
function isToolEnabledForSettings(name: string, settings?: AppSettings): boolean {
  const computerOn = settings?.computerUseEnabled !== false
  const browserOn = settings?.browserUseEnabled !== false
  if (name.startsWith('desktop_')) return computerOn
  if (name.startsWith('browser_')) return browserOn
  if (name.startsWith('voice_')) return false
  if (isMcpDynamicToolName(name)) {
    if (
      !computerOn &&
      (name.startsWith('mcp_computer_use__') ||
        name.includes('computer_use') ||
        name.startsWith('mcp_cua_driver__'))
    ) {
      return false
    }
    if (!browserOn && name.startsWith('mcp_playwright__')) return false
    if (name.startsWith('mcp_read_aloud__') || name.includes('read_aloud')) return false
  }
  return true
}

/** 刷新 MCP 动态工具池（每轮 query 前调用） */
export async function prepareMcpToolPool(workspace: string): Promise<void> {
  await refreshMcpToolPool(workspace)
}

export function getToolByName(name: string): SharkerTool | undefined {
  return TOOL_MAP.get(name)
}

/** 计划模式下拦截写操作 */
export function assertToolAllowed(toolName: string, settings?: AppSettings): void {
  if (!isToolEnabledForSettings(toolName, settings)) {
    throw new Error(`Tool "${toolName}" is disabled in settings.`)
  }
  if (getHarnessPhase() === 'plan') {
    if (isMcpDynamicToolName(toolName)) {
      if (!isMcpDynamicToolAllowedInPlanMode(toolName)) {
        throw new Error(`MCP tool "${toolName}" is blocked in plan mode.`)
      }
      return
    }
    if (!isToolAllowedInPlanMode(toolName)) {
      throw new Error(`Tool "${toolName}" is blocked in plan mode. Exit plan mode or wait for Build.`)
    }
  }
}

export async function executeRegisteredTool(
  name: string,
  args: Record<string, unknown>,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<ToolRunResult> {
  assertToolAllowed(name, settings)
  if (isMcpDynamicToolName(name)) {
    const workspace = getActiveWorkspacePath(settings)
    const output = await executeMcpDynamicTool(workspace, name, args)
    return { output }
  }
  const tool = TOOL_MAP.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  const ctx: ToolContext = { settings, signal }
  return tool.execute(args, ctx)
}

export function assessToolRisk(
  toolName: string,
  args: Record<string, unknown>
): ToolRiskAssessment {
  if (isMcpDynamicToolName(toolName)) {
    return assessMcpDynamicToolRisk(toolName, args)
  }
  const tool = TOOL_MAP.get(toolName)
  if (!tool?.assessRisk) return NO_RISK
  return tool.assessRisk(args)
}

export const isHighRiskTool = assessToolRisk
