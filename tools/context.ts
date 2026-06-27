/**
 * 工具执行共享上下文：路径校验、cwd 解析、结果包装。
 * @see tools/README.md
 */
import type { ToolRunResult } from '../shared/types'
import { getActiveWorkspacePath } from '../shared/workspace'
import { checkPathAccess, resolveCommandCwd } from './permissions'
import type { ToolContext } from './types'

/** 沙箱模式下校验目标路径，不通过则抛错 */
export function assertAccess(ctx: ToolContext, target: string): void {
  const check = checkPathAccess(
    target,
    getActiveWorkspacePath(ctx.settings),
    ctx.settings.permissionMode
  )
  if (!check.allowed) throw new Error(check.reason ?? 'Access denied')
}

/** 解析工具 cwd 参数，回落到工作区根 */
export function toolCwd(ctx: ToolContext, cwd: unknown): string {
  const ws = getActiveWorkspacePath(ctx.settings)
  return resolveCommandCwd(cwd != null ? String(cwd) : undefined, ws, ctx.settings.permissionMode)
}

/** 构造 ToolRunResult */
export function ok(output: string, fileDiff?: ToolRunResult['fileDiff']): ToolRunResult {
  return { output, fileDiff }
}
