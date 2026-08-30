import { describe, expect, it } from 'vitest'
import { formatMessageTimestamp, messageCreatedAtMs } from './message-timestamp'

describe('message hover timestamp', () => {
  it('normalizes seconds vs ms and formats a static local time', () => {
    expect(messageCreatedAtMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(messageCreatedAtMs(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(messageCreatedAtMs('1700000000')).toBe(1_700_000_000_000)
    expect(messageCreatedAtMs(new Date(1_700_000_000_000))?.valueOf()).toBe(1_700_000_000_000)
    expect(messageCreatedAtMs('2024-01-15T12:00:00.000Z')).toBe(Date.parse('2024-01-15T12:00:00.000Z'))
    expect(messageCreatedAtMs(0)).toBeUndefined()
    expect(messageCreatedAtMs('')).toBeUndefined()
    expect(messageCreatedAtMs(null)).toBeUndefined()

    const now = Date.parse('2026-08-30T16:00:00')
    const sameDay = Date.parse('2026-08-30T09:05:00')
    const earlier = Date.parse('2026-07-04T09:05:00')
    const lastYear = Date.parse('2025-12-25T09:05:00')
    expect(formatMessageTimestamp(sameDay, now, 'en-US')).toBe(
      new Date(sameDay).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    )
    expect(formatMessageTimestamp(earlier, now, 'en-US')).toBe(
      new Date(earlier).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    )
    expect(formatMessageTimestamp(lastYear, now, 'en-US')).toBe(
      new Date(lastYear).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    )
    expect(formatMessageTimestamp(undefined, now, 'en-US')).toBeNull()
  })
})
