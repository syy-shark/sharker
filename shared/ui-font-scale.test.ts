import { describe, expect, it } from 'vitest'
import {
  clampUiFontScale,
  formatUiFontScale,
  stepUiFontScale,
  UI_FONT_SCALE_MAX,
  UI_FONT_SCALE_MIN
} from './ui-font-scale'

describe('ui font scale', () => {
  it('clamps and snaps', () => {
    expect(clampUiFontScale('nope')).toBe(1)
    expect(clampUiFontScale(0.2)).toBe(UI_FONT_SCALE_MIN)
    expect(clampUiFontScale(3)).toBe(UI_FONT_SCALE_MAX)
    expect(clampUiFontScale(1.07)).toBe(1.05)
  })

  it('steps and formats', () => {
    expect(stepUiFontScale(1, 1)).toBe(1.05)
    expect(stepUiFontScale(UI_FONT_SCALE_MAX, 1)).toBe(UI_FONT_SCALE_MAX)
    expect(formatUiFontScale(1)).toBe('100%')
    expect(formatUiFontScale(1.1)).toBe('110%')
  })
})
