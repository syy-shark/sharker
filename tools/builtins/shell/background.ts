/**
 * 后台 Shell 会话 Tool（基于 task-manager）。
 * @see tools/README.md
 */
import { resolveCommandCwd } from '../../permissions'
import { createShellTask, getTask, stopTask } from '../../services/task-manager'
import { assertAccess, ok, toolCwd } from '../../context'
import type { ToolHandler } from '../../types'

export const runBackgroundShellTool: ToolHandler = {
  name: 'run_background_shell',
  title: '后台 Shell',
  extractPaths: (args, ws, mode) => [resolveCommandCwd(String(args.cwd), ws, mode)],
  assessRisk: () => ({ highRisk: true, reason: '后台 shell' }),
  async execute(args, ctx) {
    const cwd = toolCwd(ctx, args.cwd)
    assertAccess(ctx, cwd)
    const command = String(args.command)
    const t = createShellTask({ title: command.slice(0, 40), command, cwd })
    return ok(`Background shell started. task_id=${t.id}`)
  }
}

export const shellReadOutputTool: ToolHandler = {
  name: 'shell_read_output',
  title: '读 Shell 输出',
  async execute(args) {
    const t = getTask(String(args.task_id))
    if (!t) throw new Error('Task not found')
    const tail = args.tail_lines ? Number(args.tail_lines) : 100
    const lines = t.output.split('\n')
    return ok(lines.slice(-tail).join('\n') || '(no output)')
  }
}

export const shellKillTool: ToolHandler = {
  name: 'shell_kill',
  title: '终止 Shell',
  assessRisk: () => ({ highRisk: true, reason: '终止 shell' }),
  async execute(args) {
    if (!stopTask(String(args.task_id))) throw new Error('Task not found')
    return ok('Shell stopped')
  }
}

export const backgroundShellTools: ToolHandler[] = [
  runBackgroundShellTool,
  shellReadOutputTool,
  shellKillTool
]
