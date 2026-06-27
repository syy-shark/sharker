/**
 * 后台任务管理：shell、脚本、子 Agent 等长驻进程。
 * @see tools/builtins/tasks/
 */
import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import { wrapShellCommand } from '../shared/shell-spawn'

export type TaskStatus = 'running' | 'done' | 'failed' | 'stopped'

export interface BackgroundTask {
  id: string
  title: string
  description?: string
  status: TaskStatus
  command?: string
  cwd?: string
  output: string
  exitCode?: number
  createdAt: number
  updatedAt: number
  process?: ChildProcess
}

const tasks = new Map<string, BackgroundTask>()

/** 创建后台 shell 任务 */
export function createShellTask(opts: {
  title: string
  description?: string
  command: string
  cwd: string
}): BackgroundTask {
  const id = randomUUID().slice(0, 8)
  const task: BackgroundTask = {
    id,
    title: opts.title,
    description: opts.description,
    status: 'running',
    command: opts.command,
    cwd: opts.cwd,
    output: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  const { command: shellBin, args: shellArgs } = wrapShellCommand(opts.command)
  const child = spawn(shellBin, shellArgs, {
    cwd: opts.cwd,
    env: process.env
  })
  task.process = child
  const append = (chunk: Buffer | string) => {
    task.output += String(chunk)
    if (task.output.length > 512_000) {
      task.output = task.output.slice(-400_000)
    }
    task.updatedAt = Date.now()
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  child.on('close', (code) => {
    task.exitCode = code ?? undefined
    task.status = code === 0 ? 'done' : 'failed'
    task.updatedAt = Date.now()
    task.process = undefined
  })
  tasks.set(id, task)
  return task
}

/** 创建占位任务（子 Agent 等） */
export function createPlaceholderTask(title: string, description?: string): BackgroundTask {
  const id = randomUUID().slice(0, 8)
  const task: BackgroundTask = {
    id,
    title,
    description,
    status: 'running',
    output: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  tasks.set(id, task)
  return task
}

/** 更新任务元数据 */
export function updateTask(
  id: string,
  patch: Partial<Pick<BackgroundTask, 'title' | 'description' | 'status' | 'output'>>
): BackgroundTask | undefined {
  const t = tasks.get(id)
  if (!t) return undefined
  Object.assign(t, patch, { updatedAt: Date.now() })
  return t
}

export function getTask(id: string): BackgroundTask | undefined {
  return tasks.get(id)
}

export function listTasks(): BackgroundTask[] {
  return [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt)
}

/** 停止运行中任务 */
export function stopTask(id: string): boolean {
  const t = tasks.get(id)
  if (!t) return false
  if (t.process) {
    t.process.kill('SIGTERM')
    t.status = 'stopped'
    t.updatedAt = Date.now()
    return true
  }
  if (t.status === 'running') {
    t.status = 'stopped'
    t.updatedAt = Date.now()
    return true
  }
  return false
}

/** 格式化任务列表供模型阅读 */
export function formatTaskList(): string {
  const list = listTasks()
  if (!list.length) return '(no tasks)'
  return list
    .map(
      (t) =>
        `${t.id} [${t.status}] ${t.title}${t.command ? ` — ${t.command.slice(0, 60)}` : ''}`
    )
    .join('\n')
}
