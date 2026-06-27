/**
 * 每日 Token 消耗记录（估算值，GitHub 蓝点图）。
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export interface DayUsage {
  date: string
  tokens: number
  turns: number
}

interface UsageStore {
  days: Record<string, { tokens: number; turns: number }>
}

function storePath(): string {
  return path.join(os.homedir(), '.sharker', 'token-usage.json')
}

async function loadStore(): Promise<UsageStore> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as UsageStore
    return parsed?.days ? parsed : { days: {} }
  } catch {
    return { days: {} }
  }
}

async function saveStore(store: UsageStore): Promise<void> {
  const dir = path.dirname(storePath())
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8')
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 记录一轮对话的 token 估算 */
export async function recordTokenUsage(tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return
  const store = await loadStore()
  const key = todayKey()
  const day = store.days[key] ?? { tokens: 0, turns: 0 }
  day.tokens += Math.round(tokens)
  day.turns += 1
  store.days[key] = day
  await saveStore(store)
}

/** 最近 N 天用量（含无记录日期为 0） */
export async function getUsageHistory(days = 365): Promise<DayUsage[]> {
  const store = await loadStore()
  const result: DayUsage[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const entry = store.days[key]
    result.push({
      date: key,
      tokens: entry?.tokens ?? 0,
      turns: entry?.turns ?? 0
    })
  }
  return result
}

/** 今日用量摘要 */
export async function getTodayUsage(): Promise<DayUsage> {
  const store = await loadStore()
  const key = todayKey()
  const entry = store.days[key]
  return { date: key, tokens: entry?.tokens ?? 0, turns: entry?.turns ?? 0 }
}
