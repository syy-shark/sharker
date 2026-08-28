import { describe, expect, it } from 'vitest'
import { filterPaletteCommands, PALETTE_COMMANDS } from './command-palette'

describe('command palette', () => {
  it('lists review, mention and settings', () => {
    const ids = PALETTE_COMMANDS.map((c) => c.id)
    expect(ids).toContain('review')
    expect(ids).toContain('mention')
    expect(ids).toContain('skill')
    expect(ids).toContain('settings')
    expect(ids).toContain('find')
    expect(ids).toContain('personality')
  })

  it('filters by title and keywords', () => {
    expect(filterPaletteCommands('审查').some((c) => c.id === 'review')).toBe(true)
    expect(filterPaletteCommands('terminal').some((c) => c.action === 'toggle_terminal')).toBe(true)
    expect(filterPaletteCommands('zzz-none')).toEqual([])
  })
})
