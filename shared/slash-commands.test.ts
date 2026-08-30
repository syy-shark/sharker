import { describe, expect, it } from 'vitest'
import {
  composerSlashLine,
  filterSlashCommands,
  matchUiSlashCommand,
  slashItemsWithSkills,
  SLASH_COMMANDS
} from './slash-commands'
import {
  formatPermissionChanged,
  formatPermissionStatus,
  parsePermissionMode,
  permissionModeChipLabel,
  permissionModeChipTitle
} from './permission-mode'

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
    expect(names).toContain('plan')
    expect(names).toContain('plan-mode')
    expect(SLASH_COMMANDS.find((c) => c.name === 'plan')?.description).toBe(
      'Toggle plan mode for multi-step planning.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'plan-mode')?.description).toBe(
      'Toggle plan mode for multi-step planning.'
    )
    expect(names).toContain('init')
    expect(names).toContain('permissions')
    expect(names).toContain('archive')
    expect(names).toContain('side')
    expect(names).toContain('btw')
    expect(names).toContain('memories')
    expect(names).toContain('copy')
    expect(names).toContain('fast')
    expect(names).toContain('skills')
    expect(names).toContain('stop')
    expect(names).toContain('approve')
    expect(names).toContain('subagents')
    expect(names).toContain('rename')
    expect(names).toContain('pin')
    expect(names).toContain('unread')
    expect(names).toContain('usage')
    expect(names).toContain('keymap')
    expect(names).toContain('settings')
    expect(SLASH_COMMANDS.find((c) => c.name === 'settings')?.description).toBe('Open settings')
    expect(SLASH_COMMANDS.find((c) => c.name === 'keymap')?.description).toBe(
      'Open keyboard shortcuts'
    )
    expect(names).toContain('project')
    expect(names).toContain('chat')
    expect(names).toContain('reasoning')
    expect(names).toContain('delete')
    expect(names).toContain('theme')
    expect(names).toContain('debug-config')
    expect(names).toContain('share')
    expect(names).toContain('title')
    expect(names).toContain('agent')
    expect(SLASH_COMMANDS.find((c) => c.name === 'compact')?.action).toBe('compact_context')
    expect(SLASH_COMMANDS.find((c) => c.name === 'compact')?.description).toBe(
      "Compact the current chat's context."
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'approve')?.description).toContain(
      'Approve one retry of a recent automatic-review denial'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'task')?.description).toBe(
      'Start a chat without a project.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'worktree')?.description).toBe(
      'Run the chat in a new Git worktree.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'title')?.action).toBe('rename_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'copy')?.action).toBe('copy_last_output')
    expect(SLASH_COMMANDS.find((c) => c.name === 'copy')?.description).toBe(
      'Copy the last response, code block, or quote.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'fast')?.action).toBe('set_fast')
    expect(SLASH_COMMANDS.find((c) => c.name === 'fast')?.description).toContain('输入框旁')
    expect(SLASH_COMMANDS.find((c) => c.name === 'skills')?.action).toBe('show_skills')
    expect(SLASH_COMMANDS.find((c) => c.name === 'stop')?.action).toBe('stop_terminals')
    expect(SLASH_COMMANDS.find((c) => c.name === 'fork')?.action).toBe('fork_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'fork')?.description).toBe(
      'Copy a local chat into a new local chat or worktree.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'fork')?.argsHint).toContain('worktree')
    expect(SLASH_COMMANDS.find((c) => c.name === 'side')?.argsHint).toContain('问题')
    expect(SLASH_COMMANDS.find((c) => c.name === 'init')?.action).toBe('init_agents')
    expect(SLASH_COMMANDS.find((c) => c.name === 'init')?.description).toBe(
      'Generate an AGENTS.md scaffold for the current project.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'permissions')?.action).toBe('set_permissions')
    expect(SLASH_COMMANDS.find((c) => c.name === 'permissions')?.description).toContain('输入框下方')
    expect(parsePermissionMode('')).toBeNull()
    expect(parsePermissionMode('ask')).toBeNull()
    expect(parsePermissionMode('sandbox')).toBe('sandbox')
    expect(parsePermissionMode('FULL extra')).toBe('full')
    expect(permissionModeChipLabel('sandbox')).toBe('Ask for approval')
    expect(permissionModeChipLabel('full')).toBe('Full access')
    expect(permissionModeChipTitle('sandbox')).toBe(
      'Always ask to edit external files and use the internet'
    )
    expect(permissionModeChipTitle('full')).toMatch(/full access/i)
    expect(formatPermissionStatus('sandbox')).toContain('Ask for approval')
    expect(formatPermissionChanged('full')).toContain('Full access')
    expect(SLASH_COMMANDS.find((c) => c.name === 'archive')?.action).toBe('archive_thread')
    expect(SLASH_COMMANDS.find((c) => c.name === 'archive')?.description).toBe('Archive chat')
    expect(SLASH_COMMANDS.find((c) => c.name === 'side')?.action).toBe('side_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'side')?.description).toBe(
      'Start a temporary side chat without interrupting the main chat.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'new')?.description).toBe('New chat')
    expect(SLASH_COMMANDS.find((c) => c.name === 'rename')?.description).toBe('Rename chat')
    expect(SLASH_COMMANDS.find((c) => c.name === 'pin')?.description).toBe('Pin or unpin chat')
    expect(SLASH_COMMANDS.find((c) => c.name === 'unread')?.description).toBe('Mark chat as unread')
    expect(SLASH_COMMANDS.find((c) => c.name === 'btw')?.action).toBe('side_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'memories')?.action).toBe('show_memories')
    expect(SLASH_COMMANDS.find((c) => c.name === 'status')?.action).toBe('show_status')
    expect(SLASH_COMMANDS.find((c) => c.name === 'diff')?.action).toBe('show_diff')
    expect(SLASH_COMMANDS.find((c) => c.name === 'goal')?.action).toBe('set_goal')
    expect(SLASH_COMMANDS.find((c) => c.name === 'mcp')?.action).toBe('show_mcp')
    expect(SLASH_COMMANDS.find((c) => c.name === 'mcp')?.description).toBe(
      'Open MCP status to view connected servers.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'feedback')?.action).toBe('show_feedback')
    expect(SLASH_COMMANDS.find((c) => c.name === 'share')?.action).toBe('share_thread')
    expect(SLASH_COMMANDS.find((c) => c.name === 'local')?.action).toBe('set_thread_local')
    expect(SLASH_COMMANDS.find((c) => c.name === 'worktree')?.action).toBe('set_thread_worktree')
    expect(SLASH_COMMANDS.find((c) => c.name === 'agents')?.action).toBe('toggle_agents')
    expect(SLASH_COMMANDS.find((c) => c.name === 'changes')?.action).toBe('toggle_changes')
    expect(SLASH_COMMANDS.find((c) => c.name === 'review')?.action).toBe('review_working_tree')
    expect(SLASH_COMMANDS.find((c) => c.name === 'review')?.argsHint).toContain('关注点')
    expect(matchUiSlashCommand('/review branch here').cmd.action).toBe('review_working_tree')
    expect(matchUiSlashCommand('/review branch here').args).toBe('branch here')
    expect(matchUiSlashCommand('/status')).toEqual({
      cmd: SLASH_COMMANDS.find((c) => c.name === 'status'),
      args: ''
    })
    expect(matchUiSlashCommand('/plan 先拆步骤')).toBeNull()
    expect(matchUiSlashCommand('review branch')).toBeNull()
    expect(composerSlashLine('/review branch', 'status')).toBe('/review branch')
    expect(composerSlashLine('', 'review')).toBe('/review')
    expect(SLASH_COMMANDS.find((c) => c.name === 'mention')?.action).toBe('mention_file')
    expect(SLASH_COMMANDS.find((c) => c.name === 'skill')?.action).toBe('mention_skill')
    expect(SLASH_COMMANDS.find((c) => c.name === 'rename')?.action).toBe('rename_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'pin')?.action).toBe('pin_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'unread')?.action).toBe('mark_unread')
    expect(SLASH_COMMANDS.find((c) => c.name === 'usage')?.action).toBe('show_usage')
    expect(SLASH_COMMANDS.find((c) => c.name === 'project')?.action).toBe('open_project_picker')
    expect(SLASH_COMMANDS.find((c) => c.name === 'reasoning')?.action).toBe('set_reasoning')
    expect(SLASH_COMMANDS.find((c) => c.name === 'task')?.action).toBe('new_global_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'chat')?.action).toBe('new_global_conversation')
    expect(SLASH_COMMANDS.find((c) => c.name === 'chat')?.description).toBe(
      'Start a chat without a project.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'local')?.description).toBe(
      'Run the chat in the selected local project.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'goal')?.description).toBe(
      'Set a persistent goal for ChatGPT to work toward; use /plan first to shape it.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'feedback')?.description).toBe(
      'Open the feedback dialog to submit feedback and optionally include logs.'
    )
    expect(SLASH_COMMANDS.find((c) => c.name === 'model')?.action).toBe('pick_model')
  })

  it('filters by prefix and description', () => {
    expect(filterSlashCommands('ch').some((c) => c.name === 'changes')).toBe(true)
    expect(filterSlashCommands('review').some((c) => c.name === 'review')).toBe(true)
    expect(filterSlashCommands('code review').some((c) => c.name === 'review')).toBe(true)
    expect(filterSlashCommands('task').some((c) => c.name === 'task')).toBe(true)
    expect(filterSlashCommands('chat').some((c) => c.name === 'chat')).toBe(true)
    expect(filterSlashCommands('without a project').some((c) => c.name === 'chat')).toBe(true)
    expect(filterSlashCommands('selected local project').some((c) => c.name === 'local')).toBe(true)
    expect(filterSlashCommands('optionally include logs').some((c) => c.name === 'feedback')).toBe(
      true
    )
  })

  it('appends installed skills to the slash list without shadowing builtins', () => {
    const items = slashItemsWithSkills('rev', [
      { name: 'review-notes', description: '整理审查笔记' },
      { name: 'review', description: '不该盖住内置 /review' }
    ])
    expect(items.some((c) => c.name === 'review' && c.action === 'review_working_tree')).toBe(true)
    expect(items.some((c) => c.name === 'review-notes' && c.action === 'insert_skill')).toBe(true)
    expect(items.filter((c) => c.name === 'review')).toHaveLength(1)
  })
})
