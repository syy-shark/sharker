/**
 * run_terminal_cmd：在工作区执行 shell 命令；rm -rf 后自动验证目标路径。
 * @see tools/README.md
 */
import { assertAccess, ok, toolCwd } from '../context'
import { isHighRiskCommand, resolveCommandCwd } from '../permissions'
import { assertShellNetworkAllowed } from '../network-policy'
import { runShellCommand } from '../shell-runner'
import { extractRmTargets, verifyPathsGone } from '../shared/uninstall'
import type { ToolHandler } from '../types'
import { NO_RISK } from '../types'

export const runTerminalCmdTool: ToolHandler = {
  name: 'run_terminal_cmd',
  title: '运行命令',
  extractPaths: (args, workspace, mode) => [
    resolveCommandCwd(String(args.cwd), workspace, mode)
  ],
  assessRisk(args) {
    const cmd = String(args.command ?? '')
    if (isHighRiskCommand(cmd)) {
      return { highRisk: true, reason: '高危 shell 命令' }
    }
    return NO_RISK
  },
  async execute(args, ctx) {
    const cwd = toolCwd(ctx, args.cwd)
    assertAccess(ctx, cwd)
    const command = String(args.command)
    assertShellNetworkAllowed(command, ctx.settings)
    const blockUntilMs = args.block_until_ms != null ? Number(args.block_until_ms) : undefined
    let output = await runShellCommand(command, cwd, { blockUntilMs, signal: ctx.signal })
    if (/\brm\s+/.test(command)) {
      const targets = extractRmTargets(command)
      const verify = await verifyPathsGone(targets)
      if (verify) output = `${output}\n\n${verify}`
    }
    return ok(output)
  }
}
