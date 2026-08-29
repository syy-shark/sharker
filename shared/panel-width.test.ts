import { describe, expect, it } from 'vitest'
import {
  clampPanelWidth,
  panelWidthFromRatio,
  panelWidthToRatio,
  parseStoredPanelWidth,
  serializePanelWidthRatio
} from './panel-width'

describe('panel width', () => {
  it('clamps and restores a viewport ratio', () => {
    expect(clampPanelWidth(200, 1280, 340, 520)).toBe(340)
    expect(clampPanelWidth(900, 1280, 340, 520)).toBe(520)
    expect(clampPanelWidth(400, 1280, 340, 520)).toBe(400)
    expect(panelWidthToRatio(400, 1600)).toBeCloseTo(0.25)
    expect(panelWidthFromRatio(0.25, 2000, 340, 520)).toBe(500)
    expect(parseStoredPanelWidth('0.25', 1600, 340, 520, 400)).toBe(400)
    expect(parseStoredPanelWidth('400', 1600, 340, 520, 360)).toBe(400)
    expect(parseStoredPanelWidth('', 1600, 340, 520, 400)).toBe(400)
    expect(serializePanelWidthRatio(400, 1600)).toBe(String(panelWidthToRatio(400, 1600)))
  })
})
