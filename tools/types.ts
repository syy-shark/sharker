/**
 * 模块化 Tool 的类型契约：Schema、执行、权限钩子。
 * 参考 Claude Code 的 Tool 接口，适配 Sharker OpenAI function calling。
 * @see tools/README.md
 */
import type { AppSettings, PermissionMode, ToolRunResult } from '../shared/types'

/** 发给模型的 OpenAI function calling 定义 */
export type OpenAIToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

/** 单次工具执行上下文 */
export interface ToolContext {
  settings: AppSettings
  signal?: AbortSignal
}

/** 高危审批评估结果 */
export interface ToolRiskAssessment {
  highRisk: boolean
  reason: string
}

/** 工具实现模块：execute + 权限钩子（schema 在 schemas.ts） */
export interface ToolHandler {
  /** 工具名，与 OpenAI function.name 一致 */
  readonly name: string
  /** UI 过程时间线中文标题 */
  readonly title: string
  /** 执行工具逻辑 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunResult>
  /** 可选：高危操作审批 */
  assessRisk?(args: Record<string, unknown>): ToolRiskAssessment
  /** 可选：从参数提取需沙箱校验的路径 */
  extractPaths?(
    args: Record<string, unknown>,
    workspace: string,
    mode: PermissionMode
  ): string[]
}

/** 完整 Tool：handler + schema（由 registry 组装） */
export interface SharkerTool extends ToolHandler {
  readonly definition: OpenAIToolDefinition
}

/** 无风险的默认 assessRisk */
export const NO_RISK: ToolRiskAssessment = { highRisk: false, reason: '' }
