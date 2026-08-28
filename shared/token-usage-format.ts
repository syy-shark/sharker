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
