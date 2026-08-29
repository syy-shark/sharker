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
    expect(ids).toContain('new-window')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'popout')?.title).toBe('Open in Popup Window')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'new-window')?.title).toBe('New window')
    expect(ids).toContain('agents')
    expect(ids).toContain('activity')
    expect(ids).toContain('personality')
    expect(ids).toContain('plan')
    expect(ids).toContain('shortcuts')
    expect(ids).toContain('fork')
    expect(ids).toContain('fork-worktree')
    expect(ids).toContain('status')
    expect(ids).toContain('goal')
    expect(ids).toContain('diff')
    expect(ids).toContain('open-worktree')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'open-worktree')?.title).toBe('Open in Finder')
    expect(ids).toContain('create-branch')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'create-branch')?.title).toBe(
      'Create branch here'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'local')?.title).toBe('Local')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'worktree')?.title).toBe('Worktree')
    expect(ids).toContain('mcp')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'mcp')?.title).toBe('Open MCP status')
    expect(ids).toContain('mcp-servers')
    expect(ids).toContain('codex-docs')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'codex-docs')?.title).toBe('Codex Documentation')
    expect(ids).toContain('feedback')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'feedback')?.title).toBe('Send Feedback')
    expect(ids).toContain('share')
    expect(ids).toContain('copy-markdown')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'copy-markdown')?.title).toBe('Copy as Markdown')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'copy-cwd')?.title).toBe('Copy working directory')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'copy-session')?.title).toBe('Copy session ID')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'copy-deeplink')?.title).toBe('Copy chat deep link')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'copy-conversation-path')?.title).toBe(
      'Copy conversation path'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'share')?.title).toBe('Share')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'archive-project-chats')?.title).toBe('Archive chats')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'new')?.title).toBe('New chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'task')?.title).toBe(
      'Start a chat without a project.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'compact')?.title).toBe(
      "Compact the current chat's context."
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'init')?.title).toBe(
      'Generate an AGENTS.md scaffold for the current project.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'status')?.title).toBe(
      'Show the chat ID, context usage, and rate limits.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'review')?.title).toBe(
      'Start code review mode to review uncommitted changes or compare against a base branch.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'goal')?.title).toBe(
      'Set a persistent goal for ChatGPT to work toward; use /plan first to shape it.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'plan')?.title).toBe(
      'Toggle plan mode for multi-step planning.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'memories')?.title).toBe(
      'Configure whether the chat can use or generate memories, when Memories is available.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'reasoning')?.title).toBe(
      'Choose the reasoning effort for the current chat.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'personality')?.title).toBe(
      'Choose how Codex responds, when the current model supports personalities.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'approve')?.title).toBe(
      'Approve one retry of a recent automatic-review denial, when automatic review is active.'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'side')?.title).toBe('Open side chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'archive')?.title).toBe('Archive chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'rename')?.title).toBe('Rename chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'pin')?.title).toBe('Pin or unpin chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'unread')?.title).toBe('Mark chat as unread')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'find')?.title).toBe('Find in chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'search-chats')?.title).toBe('Search chats')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'standalone')?.title).toBe('New standalone chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'search-files')?.title).toBe('Search files')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'general')?.title).toBe('General')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'theme')?.title).toBe('Appearance')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'notifications')?.title).toBe('Notifications')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'personalization')?.title).toBe('Personalization')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'suggested-prompts')?.title).toBe(
      'Suggested prompts'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'mcp-servers')?.title).toBe('MCP servers')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'settings')?.title).toBe('Open settings')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'sidebar')?.title).toBe('Toggle sidebar')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'files')?.title).toBe('Toggle file tree')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'panel')?.title).toBe('Toggle bottom panel')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'terminal')?.title).toBe('Toggle terminal')
    expect(ids).toContain('open-terminal')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'open-terminal')?.title).toBe('Open Terminal')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'model')?.title).toBe('Open model picker')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'project-picker')?.title).toBe('Open project picker')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'dictate')?.title).toBe('Start dictation')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'voice-chat')?.title).toBe('Start voice chat')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'environment-action')?.title).toBe(
      'Run environment action 1'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'activity')?.title).toBe('Toggle Activity view')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'shortcuts')?.title).toBe('Open keyboard shortcuts')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'undo-app')?.title).toBe('Undo last app action')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'redo-app')?.title).toBe('Redo last app action')
    expect(ids).toContain('local')
    expect(ids).toContain('worktree')
    expect(ids).toContain('side')
    expect(ids).toContain('archive')
    expect(ids).toContain('archive-project-chats')
    expect(ids).toContain('init')
    expect(ids).toContain('permissions')
    expect(ids).toContain('memories')
    expect(ids).toContain('copy')
    expect(ids).toContain('resume')
    expect(ids).toContain('compact')
    expect(ids).toContain('delete')
    expect(ids).toContain('theme')
    expect(ids).toContain('personalization')
    expect(ids).toContain('general')
    expect(ids).toContain('notifications')
    expect(ids).toContain('suggested-prompts')
    expect(ids).toContain('debug-config')
    expect(ids).toContain('fast')
    expect(ids).toContain('reasoning')
    expect(ids).toContain('skills')
    expect(ids).toContain('stop')
    expect(ids).toContain('nav-back')
    expect(ids).toContain('nav-forward')
    expect(ids).toContain('font-larger')
    expect(ids).toContain('panel')
    expect(ids).toContain('clear-terminal')
    expect(ids).toContain('clear-unread')
    expect(ids).toContain('search-files')
    expect(ids).toContain('open-browser')
    expect(ids).toContain('focus-browser-address')
    expect(ids).toContain('reload-browser-page')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'open-browser')?.title).toBe('Open browser tab')
    expect(PALETTE_COMMANDS.find((c) => c.id === 'focus-browser-address')?.title).toBe(
      'Focus Browser Address Bar'
    )
    expect(PALETTE_COMMANDS.find((c) => c.id === 'reload-browser-page')?.title).toBe(
      'Reload Browser Page'
    )
    expect(ids).toContain('next-attention')
    expect(ids).toContain('approve')
    expect(ids).toContain('plan')
    expect(ids).toContain('rename')
    expect(ids).toContain('pin')
    expect(ids).toContain('unread')
    expect(ids).toContain('standalone')
    expect(ids).toContain('usage')
    expect(ids).toContain('copy-cwd')
    expect(ids).toContain('copy-session')
    expect(ids).toContain('copy-deeplink')
    expect(ids).toContain('project-picker')
    expect(ids).toContain('copy-conversation-path')
    expect(ids).toContain('undo-app')
    expect(ids).toContain('redo-app')
    expect(ids).toContain('task')
    expect(ids).toContain('model')
    expect(ids).toContain('environment-action')
  })

  it('filters by title and keywords', () => {
    expect(filterPaletteCommands('审查').some((c) => c.id === 'review')).toBe(true)
    expect(filterPaletteCommands('terminal').some((c) => c.action === 'toggle_terminal')).toBe(true)
    expect(
      filterPaletteCommands('Focus Browser Address Bar').some(
        (c) => c.action === 'focus_browser_address'
      )
    ).toBe(true)
    expect(
      filterPaletteCommands('Reload Browser Page').some((c) => c.action === 'reload_browser_page')
    ).toBe(true)
    expect(filterPaletteCommands('Open Terminal').some((c) => c.action === 'open_terminal')).toBe(
      true
    )
    expect(
      filterPaletteCommands('环境').some((c) => c.action === 'run_environment_action')
    ).toBe(true)
    expect(filterPaletteCommands('面板').some((c) => c.action === 'toggle_panel')).toBe(true)
    expect(filterPaletteCommands('task').some((c) => c.id === 'task')).toBe(true)
    expect(filterPaletteCommands('无项目').some((c) => c.id === 'task')).toBe(true)
    expect(filterPaletteCommands('Start a chat without a project').some((c) => c.id === 'task')).toBe(
      true
    )
    expect(filterPaletteCommands('压缩上下文').some((c) => c.id === 'compact')).toBe(true)
    expect(filterPaletteCommands('Compact the current chat').some((c) => c.id === 'compact')).toBe(
      true
    )
    expect(filterPaletteCommands('初始化 AGENTS').some((c) => c.id === 'init')).toBe(true)
    expect(filterPaletteCommands('会话状态').some((c) => c.id === 'status')).toBe(true)
    expect(filterPaletteCommands('审查未提交').some((c) => c.id === 'review')).toBe(true)
    expect(filterPaletteCommands('设定线程目标').some((c) => c.id === 'goal')).toBe(true)
    expect(filterPaletteCommands('本对话记忆').some((c) => c.id === 'memories')).toBe(true)
    expect(filterPaletteCommands('查看或设定思考档').some((c) => c.id === 'reasoning')).toBe(true)
    expect(filterPaletteCommands('切换人格').some((c) => c.id === 'personality')).toBe(true)
    expect(filterPaletteCommands('批准重试').some((c) => c.id === 'approve')).toBe(true)
    expect(filterPaletteCommands('Toggle plan mode').some((c) => c.id === 'plan')).toBe(true)
    expect(filterPaletteCommands('/chat').some((c) => c.action === 'new_global_conversation')).toBe(
      true
    )
    expect(filterPaletteCommands('用量').some((c) => c.action === 'open_usage')).toBe(true)
    expect(filterPaletteCommands('Profile').some((c) => c.action === 'open_usage')).toBe(true)
    expect(filterPaletteCommands('MCP 服务器').some((c) => c.action === 'open_mcp')).toBe(true)
    expect(filterPaletteCommands('MCP servers').some((c) => c.action === 'open_mcp')).toBe(true)
    expect(filterPaletteCommands('General').some((c) => c.id === 'general')).toBe(true)
    expect(filterPaletteCommands('Appearance').some((c) => c.id === 'theme')).toBe(true)
    expect(filterPaletteCommands('个性化').some((c) => c.action === 'open_personalization')).toBe(
      true
    )
    expect(filterPaletteCommands('通知').some((c) => c.action === 'open_notifications')).toBe(true)
    expect(filterPaletteCommands('建议').some((c) => c.action === 'open_suggested_prompts')).toBe(
      true
    )
    expect(filterPaletteCommands('归档项目').some((c) => c.action === 'archive_project_chats')).toBe(
      true
    )
    expect(filterPaletteCommands('Archive chats').some((c) => c.action === 'archive_project_chats')).toBe(
      true
    )
    expect(filterPaletteCommands('Share').some((c) => c.id === 'share')).toBe(true)
    expect(filterPaletteCommands('Send Feedback').some((c) => c.id === 'feedback')).toBe(true)
    expect(filterPaletteCommands('打开反馈').some((c) => c.id === 'feedback')).toBe(true)
    expect(
      filterPaletteCommands('Codex Documentation').some((c) => c.action === 'open_codex_docs')
    ).toBe(true)
    expect(filterPaletteCommands('分享只读快照').some((c) => c.id === 'share')).toBe(true)
    expect(filterPaletteCommands('访达').some((c) => c.action === 'open_worktree')).toBe(true)
    expect(filterPaletteCommands('Open in Finder').some((c) => c.action === 'open_worktree')).toBe(
      true
    )
    expect(filterPaletteCommands('Open MCP status').some((c) => c.action === 'show_mcp')).toBe(true)
    expect(filterPaletteCommands('MCP 状态').some((c) => c.action === 'show_mcp')).toBe(true)
    expect(filterPaletteCommands('Copy as Markdown').some((c) => c.id === 'copy-markdown')).toBe(
      true
    )
    expect(filterPaletteCommands('Copy working directory').some((c) => c.id === 'copy-cwd')).toBe(
      true
    )
    expect(filterPaletteCommands('New chat').some((c) => c.id === 'new')).toBe(true)
    expect(filterPaletteCommands('Find in chat').some((c) => c.id === 'find')).toBe(true)
    expect(filterPaletteCommands('Archive chat').some((c) => c.action === 'archive_thread')).toBe(
      true
    )
    expect(filterPaletteCommands('Open settings').some((c) => c.id === 'settings')).toBe(true)
    expect(filterPaletteCommands('Open in Popup Window').some((c) => c.id === 'popout')).toBe(true)
    expect(filterPaletteCommands('New window').some((c) => c.id === 'new-window')).toBe(true)
    expect(filterPaletteCommands('弹出当前对话').some((c) => c.id === 'popout')).toBe(true)
    expect(filterPaletteCommands('Always on top').some((c) => c.id === 'theme')).toBe(true)
    expect(filterPaletteCommands('Toggle sidebar').some((c) => c.id === 'sidebar')).toBe(true)
    expect(filterPaletteCommands('Start dictation').some((c) => c.id === 'dictate')).toBe(true)
    expect(filterPaletteCommands('zzz-none')).toEqual([])
  })
})
