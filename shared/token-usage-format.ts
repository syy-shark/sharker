/**
 * `/usage` 用量文案（纯逻辑，渲染进程可 import）。
 * @see shared/ARCH.md
 */

/** 单日用量（与 token-usage-store 结构一致） */
export interface DayUsage {
  date: string
  tokens: number
  turns: number
}

export type UsageScope = 'daily' | 'weekly' | 'cumulative'

/** `/usage daily|weekly|cumulative`；空或未知按今日 */
export function parseUsageScope(args: string): UsageScope {
  const token = args.trim().toLowerCase().split(/\s+/)[0] || ''
  if (token === 'weekly' || token === 'week') return 'weekly'
  if (token === 'cumulative' || token === 'all' || token === 'total') return 'cumulative'
  return 'daily'
}

export function usageHistoryDays(scope: UsageScope): number {
  if (scope === 'cumulative') return 365
  if (scope === 'weekly') return 7
  return 14
}

function sumUsage(days: DayUsage[]): { tokens: number; turns: number } {
  return days.reduce(
    (acc, d) => ({ tokens: acc.tokens + (d.tokens || 0), turns: acc.turns + (d.turns || 0) }),
    { tokens: 0, turns: 0 }
  )
}

function scopeSlice(days: DayUsage[], scope: UsageScope): DayUsage[] {
  if (scope === 'daily') return days.slice(-1)
  if (scope === 'weekly') return days.slice(-7)
  return days
}

function scopeLabel(scope: UsageScope): string {
  if (scope === 'weekly') return '近 7 天'
  if (scope === 'cumulative') return '累计'
  return '今日'
}

/** 拼一段 Markdown 用量（本地助手回复，不走模型） */
export function formatUsageReport(days: DayUsage[], scope: UsageScope): string {
  const slice = scopeSlice(days, scope)
  const { tokens, turns } = sumUsage(slice)
  const lines = [
    `**用量（${scopeLabel(scope)}）**`,
    '',
    `- **Token**：${tokens.toLocaleString()}`,
    `- **回合**：${turns}`
  ]
  const rows = (scope === 'daily' ? days.slice(-7) : slice).filter((d) => d.tokens || d.turns)
  if (rows.length) {
    lines.push('', '| 日期 | Token | 回合 |', '| --- | ---: | ---: |')
    for (const d of rows) {
      lines.push(`| ${d.date} | ${d.tokens.toLocaleString()} | ${d.turns} |`)
    }
  }
  lines.push('', '估算值，按本机记录。用法：`/usage daily|weekly|cumulative`（对标 Codex）。')
  return lines.join('\n')
}

/** 设置 → 用量：对标 Codex Profile 的本机洞察（不假装供应商额度） */
export interface UsageInsights {
  lifetimeTokens: number
  lifetimeTurns: number
  peakTokens: number
  peakDate: string | null
  currentStreak: number
  longestStreak: number
  activeDays: number
}

function dayActive(day: DayUsage): boolean {
  return (day.turns || 0) > 0 || (day.tokens || 0) > 0
}

/** 从按日期升序的本机记录汇总终身 Token、峰值日与连续活跃天数 */
export function summarizeUsageInsights(days: DayUsage[]): UsageInsights {
  const lifetime = sumUsage(days)
  let peakTokens = 0
  let peakDate: string | null = null
  let activeDays = 0
  let longestStreak = 0
  let run = 0
  for (const day of days) {
    if (dayActive(day)) {
      activeDays += 1
      run += 1
      if (run > longestStreak) longestStreak = run
      if (day.tokens > peakTokens) {
        peakTokens = day.tokens
        peakDate = day.date
      }
    } else {
      run = 0
    }
  }
  let currentStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (dayActive(days[i])) {
      currentStreak += 1
      continue
    }
    if (currentStreak === 0 && i === days.length - 1) continue
    break
  }
  return {
    lifetimeTokens: lifetime.tokens,
    lifetimeTurns: lifetime.turns,
    peakTokens,
    peakDate,
    currentStreak,
    longestStreak,
    activeDays
  }
}

/** 近 N 日 Token 柱高（0–1），供设置 → 用量火花图 */
export function usageSparkRatios(days: DayUsage[], count = 14): number[] {
  const n = Math.max(1, Math.floor(count))
  const slice = days.slice(-n)
  const max = Math.max(0, ...slice.map((d) => d.tokens || 0))
  if (!max) return slice.map(() => 0)
  return slice.map((d) => (d.tokens || 0) / max)
}
