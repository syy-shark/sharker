import { describe, expect, it } from 'vitest'
import { filterSlashCommands, SLASH_COMMANDS } from './slash-commands'

describe('slash commands', () => {
  it('lists changes as a panel command and review as a working-tree review', () => {
    const names = SLASH_COMMANDS.map((c) => c.name)
    expect(names).toContain('changes')
    expect(names).toContain('review')
    expect(names).toContain('mention')
    expect(names).toContain('skill')
    expect(names).toContain('personality')
    expect(SLASH_COMMANDS.find((c) => c.name === 'changes')?.action).toBe('toggle_changes')
    expect(SLASH_COMMANDS.find((c) => c.name === 'review')?.action).toBe('review_working_tree')
    expect(SLASH_COMMANDS.find((c) => c.name === 'mention')?.action).toBe('mention_file')
    expect(SLASH_COMMANDS.find((c) => c.name === 'skill')?.action).toBe('mention_skill')
  })

  it('filters by prefix and description', () => {
    expect(filterSlashCommands('ch').some((c) => c.name === 'changes')).toBe(true)
    expect(filterSlashCommands('审查').some((c) => c.name === 'review')).toBe(true)
  })
})
