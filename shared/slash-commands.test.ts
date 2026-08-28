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
    expect(names).toContain('agents')
    expect(names).toContain('fork')
    expect(names).toContain('status')
    expect(names).toContain('diff')
    expect(names).toContain('goal')
    expect(names).toContain('plan-mode')
    expect(SLASH_COMMANDS.find((c) => c.name === 'fork')?.action).toBe('fork_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'status')?.action).toBe('show_status')
    expect(SLASH_COMMANDS.find((c) => c.name === 'diff')?.action).toBe('show_diff')
    expect(SLASH_COMMANDS.find((c) => c.name === 'goal')?.action).toBe('set_goal')
    expect(SLASH_COMMANDS.find((c) => c.name === 'mcp')?.action).toBe('show_mcp')
    expect(SLASH_COMMANDS.find((c) => c.name === 'feedback')?.action).toBe('show_feedback')
    expect(SLASH_COMMANDS.find((c) => c.name === 'local')?.action).toBe('set_thread_local')
    expect(SLASH_COMMANDS.find((c) => c.name === 'worktree')?.action).toBe('set_thread_worktree')
    expect(SLASH_COMMANDS.find((c) => c.name === 'agents')?.action).toBe('toggle_agents')
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
