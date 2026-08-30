import { describe, expect, it } from 'vitest'
import { formatConversationTime, formatLastActiveTime } from './format-time'

const now = new Date(2026, 7, 30, 12, 0, 0).getTime()

describe('formatLastActiveTime', () => {
  it('uses last-active age, not a shared clock', () => {
    expect(formatLastActiveTime(now - 6 * 60_000, now)).toBe('6 min')
    expect(formatLastActiveTime(now - 3 * 86_400_000, now)).toBe('3 days ago')
    expect(formatLastActiveTime(now - 6 * 60_000, now)).not.toBe(
      formatLastActiveTime(now - 3 * 86_400_000, now)
    )
  })

  it('covers official recents buckets', () => {
    expect(formatLastActiveTime(now, now)).toBe('Just now')
    expect(formatLastActiveTime(now - 59_999, now)).toBe('Just now')
    expect(formatLastActiveTime(now - 60_000, now)).toBe('1 min')
    expect(formatLastActiveTime(now - 2 * 3_600_000, now)).toBe('2 hr')
    expect(formatLastActiveTime(now - 86_400_000, now)).toBe('1 day ago')
    expect(formatLastActiveTime(now - 6 * 86_400_000, now)).toBe('6 days ago')
  })

  it('falls back to a calendar day after a week', () => {
    const sameYear = new Date(2026, 7, 10, 12, 0, 0).getTime()
    const lastYear = new Date(2025, 11, 25, 12, 0, 0).getTime()
    expect(formatLastActiveTime(sameYear, now)).toBe('8/10')
    expect(formatLastActiveTime(lastYear, now)).toBe('2025/12/25')
  })

  it('keeps formatConversationTime as an alias', () => {
    expect(formatConversationTime(now - 6 * 60_000, now)).toBe('6 min')
  })
})
