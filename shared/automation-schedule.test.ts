import { describe, expect, it } from 'vitest'
import {
  automationScheduleMatches,
  cronMatches,
  formatAutomationRRule,
  isAutomationSchedule,
  parseAutomationRRule,
  rruleMatches
} from './automation-schedule'

describe('automation schedule', () => {
  it('matches cron fields and official RRULE examples', () => {
    const nine = new Date(2026, 0, 2, 9, 0, 0)
    expect(cronMatches('0 9 * * *', nine)).toBe(true)
    expect(cronMatches('1 9 * * *', nine)).toBe(false)
    expect(cronMatches('*/15 * * * *', new Date(2026, 0, 2, 9, 30, 0))).toBe(true)
    expect(cronMatches('0,30 9 * * *', new Date(2026, 0, 2, 9, 30, 0))).toBe(true)
    expect(isAutomationSchedule({ cron: '0 9 * * *' })).toBe(true)
    expect(isAutomationSchedule({ rrule: 'RRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=0' })).toBe(true)
    expect(isAutomationSchedule({ cron: 'bad', rrule: '' })).toBe(false)
    expect(formatAutomationRRule('FREQ=DAILY;BYHOUR=9;BYMINUTE=0')).toBe(
      'RRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=0'
    )
    const monthly = parseAutomationRRule(
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0'
    )
    expect(monthly?.freq).toBe('MONTHLY')
    expect(rruleMatches(monthly!, new Date(2026, 7, 1, 9, 0, 0))).toBe(true)
    expect(rruleMatches(monthly!, new Date(2026, 7, 1, 9, 1, 0))).toBe(false)
    expect(rruleMatches(monthly!, new Date(2026, 7, 2, 9, 0, 0))).toBe(false)
    expect(
      automationScheduleMatches(
        { rrule: 'RRULE:FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0' },
        nine
      )
    ).toBe(true)
    expect(
      automationScheduleMatches({ cron: '0 9 * * *', rrule: '' }, nine)
    ).toBe(true)
    expect(
      rruleMatches(
        parseAutomationRRule('FREQ=MINUTELY;INTERVAL=15')!,
        new Date(2026, 0, 2, 9, 30, 0)
      )
    ).toBe(true)
    expect(
      rruleMatches(
        parseAutomationRRule('FREQ=DAILY;BYHOUR=9;BYMINUTE=0;UNTIL=20260101T000000Z')!,
        nine
      )
    ).toBe(false)
  })
})
