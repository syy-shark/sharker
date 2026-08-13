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
    return Array.isArray(parsed.jobs) ? parsed.jobs : []
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

function fieldMatches(part: string, value: number): boolean {
  if (part === '*') return true
  // 支持 */n 与 逗号列表（如 1,15）
  if (part.startsWith('*/')) {
    const step = Number(part.slice(2))
    return Number.isFinite(step) && step > 0 && value % step === 0
  }
  if (part.includes(',')) {
    return part.split(',').some((p) => Number(p) === value)
  }
  const n = Number(part)
  return Number.isFinite(n) && n === value
}

/** 解析简易 cron 是否匹配当前时间（分 时 日 月 周） */
export function cronMatches(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [min, hour, dom, mon, dow] = parts
  return (
    fieldMatches(min, now.getMinutes()) &&
    fieldMatches(hour, now.getHours()) &&
    fieldMatches(dom, now.getDate()) &&
    fieldMatches(mon, now.getMonth() + 1) &&
    fieldMatches(dow, now.getDay())
  )
}

type RunHandler = (job: AutomationJob) => void | Promise<void>

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false

/** 每分钟检查到期任务 */
export function startAutomationScheduler(onRun: RunHandler): void {
  if (timer) return
  timer = setInterval(() => {
    void (async () => {
      if (ticking) return
      ticking = true
      try {
        const jobs = await listAutomations()
        const now = new Date()
        let changed = false
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i]
          if (!job?.enabled) continue
          if (!cronMatches(job.cron, now)) continue
          const last = job.lastRunAt ? new Date(job.lastRunAt) : null
          if (last && !Number.isNaN(last.getTime()) && now.getTime() - last.getTime() < 55_000) {
            continue
          }
          jobs[i] = { ...job, lastRunAt: now.toISOString() }
          changed = true
          try {
            await onRun(jobs[i])
          } catch (e) {
            console.warn('[automation] run failed', job.id, e)
          }
        }
        if (changed) await saveAutomations(jobs)
      } finally {
        ticking = false
      }
    })()
  }, 60_000)
}
