/**
 * Git 工具组：status / diff / log / show / add / commit / pull / push。
 * @see tools/README.md
 */
import { assertAccess, ok, toolCwd } from '../context'
import { resolveCommandCwd } from '../permissions'
import { runGit } from '../shared/git-runner'
import type { PermissionMode } from '../../shared/types'
import type { ToolHandler } from '../types'

/** Git 工具共用的 cwd 路径提取 */
function gitExtractPaths(
  args: Record<string, unknown>,
  workspace: string,
  mode: PermissionMode
): string[] {
  return [resolveCommandCwd(String(args.cwd), workspace, mode)]
}

/** 执行 git 子命令的通用 execute */
async function runGitTool(
  args: Record<string, unknown>,
  ctx: Parameters<ToolHandler['execute']>[1],
  gitArgs: string[]
): Promise<ReturnType<typeof ok>> {
  const cwd = toolCwd(ctx, args.cwd)
  assertAccess(ctx, cwd)
  return ok(await runGit(cwd, gitArgs))
}

export const gitStatusTool: ToolHandler = {
  name: 'git_status',
  title: 'Git 状态',
  extractPaths: gitExtractPaths,
  execute: (args, ctx) => runGitTool(args, ctx, ['status', '--short', '--branch'])
}

export const gitDiffTool: ToolHandler = {
  name: 'git_diff',
  title: 'Git 差异',
  extractPaths: gitExtractPaths,
  async execute(args, ctx) {
    const cwd = toolCwd(ctx, args.cwd)
    assertAccess(ctx, cwd)
    const gitArgs = ['diff']
    if (args.staged) gitArgs.push('--staged')
    if (args.path) gitArgs.push('--', String(args.path))
    return ok(await runGit(cwd, gitArgs))
  }
}

export const gitLogTool: ToolHandler = {
  name: 'git_log',
  title: 'Git 日志',
  extractPaths: gitExtractPaths,
  execute: (args, ctx) =>
    runGitTool(args, ctx, ['log', `--max-count=${args.limit ?? 20}`, '--oneline', '--decorate'])
}

export const gitShowTool: ToolHandler = {
  name: 'git_show',
  title: 'Git 查看',
  extractPaths: gitExtractPaths,
  execute: (args, ctx) => runGitTool(args, ctx, ['show', String(args.ref), '--stat'])
}

export const gitAddTool: ToolHandler = {
  name: 'git_add',
  title: 'Git 暂存',
  extractPaths: gitExtractPaths,
  execute: (args, ctx) => runGitTool(args, ctx, ['add', ...(args.paths as string[])])
}

export const gitCommitTool: ToolHandler = {
  name: 'git_commit',
  title: 'Git 提交',
  extractPaths: gitExtractPaths,
  assessRisk: () => ({ highRisk: true, reason: 'Git 提交' }),
  execute: (args, ctx) => runGitTool(args, ctx, ['commit', '-m', String(args.message)])
}

export const gitPullTool: ToolHandler = {
  name: 'git_pull',
  title: 'Git 拉取',
  extractPaths: gitExtractPaths,
  assessRisk: () => ({ highRisk: true, reason: 'Git 拉取远程' }),
  execute: (args, ctx) => runGitTool(args, ctx, ['pull'])
}

export const gitPushTool: ToolHandler = {
  name: 'git_push',
  title: 'Git 推送',
  extractPaths: gitExtractPaths,
  assessRisk: () => ({ highRisk: true, reason: 'Git 推送到远程' }),
  execute: (args, ctx) => runGitTool(args, ctx, ['push'])
}

/** 全部 Git 工具 handler */
export const gitTools: ToolHandler[] = [
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitShowTool,
  gitAddTool,
  gitCommitTool,
  gitPullTool,
  gitPushTool
]
