import { describe, expect, it } from 'vitest'
import { cronMatches } from './automation-scheduler'

describe('automation cronMatches', () => {
  it('matches wildcard and exact fields', () => {
    const now = new Date(2026, 0, 2, 9, 0, 0) // Fri Jan 2 2026 09:00
    expect(cronMatches('0 9 * * *', now)).toBe(true)
    expect(cronMatches('1 9 * * *', now)).toBe(false)
    expect(cronMatches('*/15 * * * *', new Date(2026, 0, 2, 9, 30, 0))).toBe(true)
    expect(cronMatches('0,30 9 * * *', new Date(2026, 0, 2, 9, 30, 0))).toBe(true)
  })
})
