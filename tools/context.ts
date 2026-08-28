/**
 * 工具执行共享上下文：路径校验、cwd 解析、结果包装。
 * @see tools/ARCH.md
 */
import type { ToolRunResult } from '../shared/types'
import { getActiveWorkspace, getActiveWorkspacePath } from '../shared/workspace'
import { checkPathAccess, isInsideWorkspace, resolveCommandCwd } from './permissions'
import { getWorktreePath } from './harness-state'
import type { ToolContext } from './types'

/** 沙箱模式下校验目标路径，不通过则抛错 */
export function assertAccess(ctx: ToolContext, target: string): void {
  const workspace = getActiveWorkspacePath(ctx.settings)
  const extras = getActiveWorkspace(ctx.settings)?.extraPaths ?? []
  const overlay = getWorktreePath(ctx.conversationId)
  const check = checkPathAccess(target, workspace, ctx.settings.permissionMode, extras)
  if (check.allowed) return
  if (overlay && isInsideWorkspace(target, overlay)) return
  throw new Error(check.reason ?? 'Access denied')
}

/** 解析工具 cwd 参数：会话 worktree 覆盖优先，再回落到工作区根 */
export function toolCwd(ctx: ToolContext, cwd: unknown): string {
  const overlay = getWorktreePath(ctx.conversationId)
  const ws = overlay || getActiveWorkspacePath(ctx.settings)
  return resolveCommandCwd(cwd != null ? String(cwd) : undefined, ws, ctx.settings.permissionMode)
}

/** 构造 ToolRunResult */
export function ok(
  output: string,
  fileDiff?: ToolRunResult['fileDiff'],
  meta?: Pick<ToolRunResult, 'exitCode'>
): ToolRunResult {
  return { output, fileDiff, ...meta }
}
