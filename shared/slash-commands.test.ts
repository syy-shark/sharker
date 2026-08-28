import { describe, expect, it } from 'vitest'
import { filterSlashCommands, SLASH_COMMANDS } from './slash-commands'

describe('slash commands', () => {
  it('lists changes/review as UI panel commands', () => {
    const names = SLASH_COMMANDS.map((c) => c.name)
    expect(names).toContain('changes')
    expect(names).toContain('review')
    expect(SLASH_COMMANDS.find((c) => c.name === 'changes')?.action).toBe('toggle_changes')
  })

  it('filters by prefix and description', () => {
    expect(filterSlashCommands('ch').some((c) => c.name === 'changes')).toBe(true)
    expect(filterSlashCommands('审查').some((c) => c.action === 'toggle_changes')).toBe(true)
  })
})
