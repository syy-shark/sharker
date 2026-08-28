/**
 * 工具执行入口：经注册表分发到各 Tool 模块。
 * @see tools/ARCH.md
 */
import type { AppSettings, ToolRunResult } from '../shared/types'
import { executeRegisteredTool } from './registry'
import { truncateToolOutput } from './truncate'

/** 执行工具并截断过长输出；保留 planReady 等元数据 */
export async function executeToolWithMeta(
  name: string,
  args: Record<string, unknown>,
  settings: AppSettings,
  signal?: AbortSignal,
  onStatus?: (content: string) => void,
  conversationId?: string
): Promise<ToolRunResult> {
  const result = await executeRegisteredTool(name, args, settings, signal, onStatus, conversationId)
  return {
    output: truncateToolOutput(result.output, undefined, name),
    fileDiff: result.fileDiff,
    fileDiffs: result.fileDiffs,
    planReady: result.planReady,
    planDocument: result.planDocument,
    planFilePath: result.planFilePath
  }
}

/** 对外入口：执行工具并截断过长输出；signal 用于中止长驻终端命令 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  settings: AppSettings,
  signal?: AbortSignal,
  onStatus?: (content: string) => void,
  conversationId?: string
): Promise<string> {
  return (await executeToolWithMeta(name, args, settings, signal, onStatus, conversationId)).output
}
