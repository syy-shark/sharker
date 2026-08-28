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
    expect(ids).toContain('search-chats')
    expect(ids).toContain('dictate')
    expect(ids).toContain('voice-chat')
    expect(ids).toContain('popout')
    expect(ids).toContain('agents')
    expect(ids).toContain('personality')
    expect(ids).toContain('shortcuts')
    expect(ids).toContain('fork')
    expect(ids).toContain('status')
    expect(ids).toContain('goal')
    expect(ids).toContain('diff')
    expect(ids).toContain('open-worktree')
    expect(ids).toContain('create-branch')
  })

  it('filters by title and keywords', () => {
    expect(filterPaletteCommands('审查').some((c) => c.id === 'review')).toBe(true)
    expect(filterPaletteCommands('terminal').some((c) => c.action === 'toggle_terminal')).toBe(true)
    expect(filterPaletteCommands('zzz-none')).toEqual([])
  })
})
