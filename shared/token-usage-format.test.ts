import { describe, expect, it } from 'vitest'
import {
  formatUsageReport,
  parseUsageScope,
  usageHistoryDays
} from './token-usage-format'

describe('token usage format', () => {
  it('parses /usage scopes', () => {
    expect(parseUsageScope('')).toBe('daily')
    expect(parseUsageScope('daily')).toBe('daily')
    expect(parseUsageScope('week')).toBe('weekly')
    expect(parseUsageScope('cumulative')).toBe('cumulative')
    expect(parseUsageScope('all')).toBe('cumulative')
    expect(usageHistoryDays('daily')).toBe(14)
    expect(usageHistoryDays('weekly')).toBe(7)
    expect(usageHistoryDays('cumulative')).toBe(365)
  })

  it('summarizes the requested window', () => {
    const days = [
      { date: '2026-08-26', tokens: 100, turns: 1 },
      { date: '2026-08-27', tokens: 200, turns: 2 },
      { date: '2026-08-28', tokens: 50, turns: 1 }
    ]
    const daily = formatUsageReport(days, 'daily')
    expect(daily).toContain('今日')
    expect(daily).toContain('50')
    const weekly = formatUsageReport(days, 'weekly')
    expect(weekly).toContain('近 7 天')
    expect(weekly).toContain('350')
    const all = formatUsageReport(days, 'cumulative')
    expect(all).toContain('累计')
    expect(all).toContain('350')
  })
})
