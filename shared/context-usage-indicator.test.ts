import { describe, expect, it } from 'vitest'
import {
  contextUsageBaseTokens,
  contextUsageHoverLabel,
  contextUsageLiveExtra,
  nextContextUsageLiveExtra,
  contextUsageRing,
  parseShowContextWindowUsage,
  shouldPaintContextUsageHigh
} from './context-usage-indicator'

describe('context usage indicator', () => {
  it('defaults off and builds the official composer donut', () => {
    expect(parseShowContextWindowUsage(undefined)).toBe(false)
    expect(parseShowContextWindowUsage(true)).toBe(true)
    expect(parseShowContextWindowUsage('true')).toBe(false)
    expect(contextUsageBaseTokens([])).toBeGreaterThan(0)
    expect(contextUsageLiveExtra('hello world', '')).toBeGreaterThan(0)
    expect(nextContextUsageLiveExtra(null, 'hello world', 1000, 128000)).toBeGreaterThan(0)
    expect(
      nextContextUsageLiveExtra(12, 'hello world extra tokens', 1000, 128000)
    ).toBe(12)
    expect(contextUsageHoverLabel(1200, 128000)).toBe('1200 / 128000（1%）')
    const ring = contextUsageRing(85_000, 100_000)
    expect(ring.percent).toBe(85)
    expect(ring.dashoffset).toBeLessThan(ring.circumference)
    expect(shouldPaintContextUsageHigh(85_000, 100_000)).toBe(true)
    expect(shouldPaintContextUsageHigh(10, 100_000)).toBe(false)
    expect(contextUsageRing(0, 0).ratio).toBe(0)
  })
})
