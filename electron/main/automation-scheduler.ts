/**
 * 自动化任务调度：读取 ~/.sharker/automations.json 并按 cron 触发。
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import type { AutomationJob } from '../../shared/automation'

interface AutomationStore {
  jobs: AutomationJob[]
}

function storePath(): string {
  return path.join(os.homedir(), '.sharker', 'automations.json')
}

/** 读取全部自动化任务 */
export async function listAutomations(): Promise<AutomationJob[]> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as AutomationStore
    return parsed.jobs ?? []
  } catch {
    return []
  }
}

/** 保存任务列表 */
export async function saveAutomations(jobs: AutomationJob[]): Promise<void> {
  const dir = path.dirname(storePath())
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(storePath(), JSON.stringify({ jobs }, null, 2), 'utf8')
}

/** 解析简易 cron 是否匹配当前时间 */
function cronMatches(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [min, hour, dom, mon, dow] = parts
  const checks = [
    [min, now.getMinutes()],
    [hour, now.getHours()],
    [dom, now.getDate()],
    [mon, now.getMonth() + 1],
    [dow, now.getDay()]
  ] as const
  return checks.every(([p, v]) => p === '*' || Number(p) === v)
}

type RunHandler = (job: AutomationJob) => void | Promise<void>

let timer: ReturnType<typeof setInterval> | null = null

/** 每分钟检查到期任务 */
export function startAutomationScheduler(onRun: RunHandler): void {
  if (timer) return
  timer = setInterval(() => {
    void (async () => {
      const jobs = await listAutomations()
      const now = new Date()
      for (const job of jobs) {
        if (!job.enabled) continue
        if (!cronMatches(job.cron, now)) continue
        const last = job.lastRunAt ? new Date(job.lastRunAt) : null
        if (last && now.getTime() - last.getTime() < 55_000) continue
        job.lastRunAt = now.toISOString()
        await saveAutomations(jobs)
        await onRun(job)
      }
    })()
  }, 60_000)
}
