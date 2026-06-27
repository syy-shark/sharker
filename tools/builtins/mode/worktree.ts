/**
 * Git worktree 与 Harness worktree 模式切换。
 * @see tools/README.md
 */
import { assertAccess, ok, toolCwd } from '../../context'
import { resolveCommandCwd } from '../../permissions'
import { runGit } from '../../shared/git-runner'
import { getWorktreePath, setWorktreePath } from '../../harness-state'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import type { PermissionMode } from '../../../shared/types'
import type { ToolHandler } from '../../types'

function gitCwdExtract(
  args: Record<string, unknown>,
  workspace: string,
  mode: PermissionMode
): string[] {
  return [resolveCommandCwd(String(args.cwd ?? workspace), workspace, mode)]
}

export const gitWorktreeAddTool: ToolHandler = {
  name: 'git_worktree_add',
  title: 'Git Worktree 添加',
  extractPaths: gitCwdExtract,
  assessRisk: () => ({ highRisk: true, reason: 'Git worktree 操作' }),
  async execute(args, ctx) {
    const cwd = toolCwd(ctx, args.cwd)
    assertAccess(ctx, cwd)
    const path = String(args.path)
    const branch = args.branch ? String(args.branch) : undefined
    const gitArgs = ['worktree', 'add', path]
    if (branch) gitArgs.push(branch)
    return ok(await runGit(cwd, gitArgs))
  }
}

export const gitWorktreeListTool: ToolHandler = {
  name: 'git_worktree_list',
  title: 'Git Worktree 列表',
  extractPaths: gitCwdExtract,
  async execute(args, ctx) {
    const cwd = toolCwd(ctx, args.cwd)
    assertAccess(ctx, cwd)
    return ok(await runGit(cwd, ['worktree', 'list']))
  }
}

export const gitWorktreeRemoveTool: ToolHandler = {
  name: 'git_worktree_remove',
  title: 'Git Worktree 移除',
  extractPaths: gitCwdExtract,
  assessRisk: () => ({ highRisk: true, reason: 'Git worktree 移除' }),
  async execute(args, ctx) {
    const cwd = toolCwd(ctx, args.cwd)
    assertAccess(ctx, cwd)
    const path = String(args.path)
    return ok(await runGit(cwd, ['worktree', 'remove', path]))
  }
}

export const enterWorktreeTool: ToolHandler = {
  name: 'enter_worktree',
  title: '进入 Worktree',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = String(args.path)
    assertAccess(ctx, p)
    setWorktreePath(p)
    return ok(`Active worktree set to: ${p}. File/shell tools will use this path as cwd overlay.`)
  }
}

export const exitWorktreeTool: ToolHandler = {
  name: 'exit_worktree',
  title: '退出 Worktree',
  async execute(_args, ctx) {
    const ws = getActiveWorkspacePath(ctx.settings)
    setWorktreePath(null)
    return ok(`Worktree overlay cleared. Back to workspace: ${ws}`)
  }
}

export const worktreeTools: ToolHandler[] = [
  gitWorktreeAddTool,
  gitWorktreeListTool,
  gitWorktreeRemoveTool,
  enterWorktreeTool,
  exitWorktreeTool
]

/** 解析有效 cwd（worktree 覆盖优先） */
export function resolveEffectiveCwd(settings: Parameters<typeof getActiveWorkspacePath>[0], cwd?: string): string {
  const overlay = getWorktreePath()
  if (overlay) return overlay
  const ws = getActiveWorkspacePath(settings)
  return cwd ?? ws
}
