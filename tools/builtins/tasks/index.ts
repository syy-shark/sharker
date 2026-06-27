/**
 * 后台任务 Tool 组。
 * @see tools/README.md
 */
import {
  createShellTask,
  formatTaskList,
  getTask,
  listTasks,
  stopTask,
  updateTask
} from '../../services/task-manager'
import { assertAccess, ok, toolCwd } from '../../context'
import type { ToolHandler } from '../../types'

export const taskCreateTool: ToolHandler = {
  name: 'task_create',
  title: '创建任务',
  assessRisk: () => ({ highRisk: true, reason: '创建后台任务' }),
  async execute(args, ctx) {
    const title = String(args.title ?? 'Background task')
    const command = args.command ? String(args.command) : undefined
    if (command) {
      const cwd = toolCwd(ctx, args.cwd)
      assertAccess(ctx, cwd)
      const t = createShellTask({
        title,
        description: args.description ? String(args.description) : undefined,
        command,
        cwd
      })
      return ok(`Created task ${t.id} [running]: ${title}`)
    }
    const t = createShellTask({
      title,
      description: args.description ? String(args.description) : undefined,
      command: 'sleep 1',
      cwd: toolCwd(ctx, args.cwd)
    })
    updateTask(t.id, { status: 'done', output: '(placeholder task)' })
    return ok(`Created placeholder task ${t.id}`)
  }
}

export const taskUpdateTool: ToolHandler = {
  name: 'task_update',
  title: '更新任务',
  async execute(args) {
    const id = String(args.task_id)
    const t = updateTask(id, {
      title: args.title ? String(args.title) : undefined,
      description: args.description ? String(args.description) : undefined
    })
    if (!t) throw new Error(`Task not found: ${id}`)
    return ok(`Updated task ${id}`)
  }
}

export const taskGetTool: ToolHandler = {
  name: 'task_get',
  title: '查询任务',
  async execute(args) {
    const t = getTask(String(args.task_id))
    if (!t) throw new Error('Task not found')
    return ok(
      `ID: ${t.id}\nStatus: ${t.status}\nTitle: ${t.title}\nCommand: ${t.command ?? '—'}\nOutput length: ${t.output.length}`
    )
  }
}

export const taskListTool: ToolHandler = {
  name: 'task_list',
  title: '列出任务',
  async execute() {
    return ok(formatTaskList())
  }
}

export const taskOutputTool: ToolHandler = {
  name: 'task_output',
  title: '任务输出',
  async execute(args) {
    const t = getTask(String(args.task_id))
    if (!t) throw new Error('Task not found')
    const tail = args.tail_lines ? Number(args.tail_lines) : 200
    const lines = t.output.split('\n')
    return ok(lines.slice(-tail).join('\n') || '(no output yet)')
  }
}

export const taskStopTool: ToolHandler = {
  name: 'task_stop',
  title: '停止任务',
  assessRisk: () => ({ highRisk: true, reason: '停止后台任务' }),
  async execute(args) {
    const okStop = stopTask(String(args.task_id))
    if (!okStop) throw new Error('Task not found or not stoppable')
    return ok('Task stopped')
  }
}

export const taskTools: ToolHandler[] = [
  taskCreateTool,
  taskUpdateTool,
  taskGetTool,
  taskListTool,
  taskOutputTool,
  taskStopTool
]
