import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_SETTINGS_LABEL,
  BROWSER_SETTINGS_INTRO,
  BROWSER_SETTINGS_LABEL,
  GENERAL_SETTINGS_LABEL,
  ARCHIVED_CHATS_INTRO,
  GENERAL_SETTINGS_INTRO,
  KEYBOARD_SHORTCUTS_INTRO,
  KEYBOARD_SHORTCUTS_LABEL,
  NOTIFICATIONS_SETTINGS_INTRO,
  PERSONALIZATION_SETTINGS_INTRO,
  SUGGESTED_PROMPTS_INTRO,
  KEYBOARD_SHORTCUTS_SEARCH_PLACEHOLDER,
  KEYSTROKE_SEARCH_LABEL,
  KEYSTROKE_SEARCH_PLACEHOLDER,
  changeShortcutLabel,
  createNewShortcutLabel,
  ADD_SERVER_LABEL,
  MCP_COMMAND_LABEL,
  MCP_HTTP_DESCRIPTION,
  MCP_NAME_LABEL,
  MCP_SERVERS_INTRO,
  MCP_STDIO_DESCRIPTION,
  MCP_SERVERS_LABEL,
  OPEN_MCP_STATUS_LABEL,
  SHOW_CONTEXT_WINDOW_USAGE_LABEL,
  PREVENT_SLEEP_WHILE_RUNNING_LABEL,
  PREVENT_SLEEP_WHILE_RUNNING_DESCRIPTION,
  NOTIFICATIONS_SETTINGS_LABEL,
  NEW_STANDALONE_CHAT_LABEL,
  OPEN_COMMAND_MENU_LABEL,
  OPEN_KEYBOARD_SHORTCUTS_LABEL,
  PERSONALIZATION_SETTINGS_LABEL,
  SHARE_LABEL,
  SHARE_SNAPSHOT_INTRO,
  SHARE_SNAPSHOT_CONTENTS,
  SHARE_SNAPSHOT_REVIEW,
  SHARE_LOCAL_COPY_NOTE,
  MINIMIZE_LABEL,
  WINDOW_ZOOM_LABEL,
  BRING_ALL_TO_FRONT_LABEL,
  FORK_LABEL,
  PAUSE_LABEL,
  RESUME_LABEL,
  EDIT_LABEL,
  CLEAR_LABEL,
  HAND_OFF_INTRO,
  HAND_OFF_LABEL,
  CODEX_ENVIRONMENTS_LABEL,
  LOCAL_ENVIRONMENT_DESCRIPTION,
  LOCAL_LABEL,
  WORKTREE_DETACHED_HEAD_HINT,
  WORKTREE_ENVIRONMENT_DESCRIPTION,
  WORKTREE_INTRO,
  WORKTREE_LABEL,
  WORKTREE_REQUIRES_GIT,
  WORKTREES_SETTINGS_INTRO,
  CREATE_BRANCH_HERE_LABEL,
  OPEN_LABEL,
  ALWAYS_ON_TOP_LABEL,
  KEEP_A_CHAT_NEAR_YOUR_WORK_INTRO,
  KEEP_A_CHAT_NEAR_YOUR_WORK_LABEL,
  OPEN_IN_POPUP_WINDOW_LABEL,
  APPROVE_REQUEST_LABEL,
  DECLINE_REQUEST_LABEL,
  EDIT_PROJECT_LABEL,
  EDIT_PROJECT_INTRO,
  PRIMARY_FOLDER_LABEL,
  SECONDARY_FOLDERS_LABEL,
  ARCHIVE_CHATS_ACTION_LABEL,
  ADD_FOLDER_LABEL,
  MAKE_PRIMARY_LABEL,
  SUGGESTED_PROMPTS_SETTINGS_LABEL,
  PROFILE_SETTINGS_LABEL,
  UNARCHIVE_LABEL,
  OPEN_MODEL_PICKER_LABEL,
  OPEN_PROJECT_PICKER_LABEL,
  START_NEW_VOICE_CHAT_LABEL,
  START_VOICE_CHAT_LABEL,
  END_VOICE_CHAT_LABEL,
  voiceChatControlLabel,
  VOICE_LABEL,
  OPEN_SETTINGS_LABEL,
  SKILLS_LABEL,
  FORCE_RELOAD_SKILLS_LABEL,
  SKILLS_DETECT_HINT,
  SKILLS_INTRO,
  SKILLS_INVOKE_HINT,
  SKILLS_MATCH_HINT,
  SKILLS_SKILL_MD_HINT,
  SKILLS_SLASH_HINT,
  revealInFolderLabel,
  reviewFileRevealPath,
  RUN_ENVIRONMENT_ACTION_1_LABEL,
  START_DICTATION_LABEL,
  threadCopyMenuItems,
  threadMenuItems,
  threadRevealFolderPath,
  TOGGLE_ACTIVITY_VIEW_LABEL,
  TOGGLE_FILE_TREE_LABEL,
  TOGGLE_FILE_TREE_MENU_LABEL,
  TOGGLE_BOTTOM_PANEL_LABEL,
  TOGGLE_SIDEBAR_LABEL,
  CLEAR_TERMINAL_HINT,
  CLEAR_TERMINAL_LABEL,
  FILES_LABEL,
  REVIEW_LABEL,
  TERMINAL_INTRO,
  TERMINAL_LABEL,
  FILE_MENU_LABEL,
  FILE_CLOSE_LABEL,
  CLOSE_CURRENT_TAB_OR_WINDOW_LABEL,
  NEW_WINDOW_LABEL,
  EDIT_MENU_LABEL,
  VIEW_MENU_LABEL,
  WINDOW_MENU_LABEL,
  HELP_MENU_LABEL,
  aboutAppLabel,
  hideAppLabel,
  HIDE_OTHERS_LABEL,
  SHOW_ALL_LABEL,
  quitAppLabel,
  CODEX_DOCUMENTATION_LABEL,
  CODEX_DOCUMENTATION_URL,
  SEND_FEEDBACK_LABEL,
  SHARE_FEEDBACK_LABEL,
  INCLUDE_CURRENT_SESSION_LOGS_LABEL,
  RESTORE_LABEL,
  ACTIVITY_LABEL,
  ADD_NEW_PROJECT_LABEL,
  SETTINGS_LABEL,
  REMOVE_LABEL,
  SAVE_LABEL,
  PIN_A_CHAT_HINT,
  PIN_A_PROJECT_HINT,
  PROJECTS_LABEL,
  PROJECTS_VIEW_INTRO,
  START_WITHOUT_A_PROJECT_INTRO,
  CREATE_A_PROJECT_FIRST_HINT,
  ADD_A_LOCAL_PROJECT_HINT,
  PROJECTS_NEED_NO_FOLDER_HINT,
  NO_CHATS_LABEL,
  NO_PROJECTS_LABEL,
  SEARCH_PROJECTS_LABEL,
  SEARCH_CHATS_INTRO,
  SEARCH_CHATS_LABEL,
  SEARCH_CHATS_MATCH_HINT,
  FIND_IN_CHAT_INTRO,
  FIND_IN_CHAT_LABEL,
  FIND_NEXT_MATCH_LABEL,
  FIND_PREVIOUS_MATCH_LABEL,
  SEARCH_CHATS_PLACEHOLDER,
  NOT_ASSIGNED_BY_DEFAULT_LABEL,
  CREATE_PERMANENT_WORKTREE_INTRO,
  CREATE_PERMANENT_WORKTREE_LABEL,
  WORKTREE_RESTORE_BANNER,
  STARTING_BRANCH_LABEL,
  STARTING_BRANCH_SEARCH_PLACEHOLDER,
  REMOTE_BRANCH_HINT,
  RESTORE_PREVIOUS_COMPOSER_PROMPT_LABEL,
  TOGGLE_FULL_SCREEN_LABEL,
  OPEN_BROWSER_TAB_MENU_LABEL,
  FOCUS_BROWSER_ADDRESS_BAR_MENU_LABEL,
  RELOAD_BROWSER_PAGE_MENU_LABEL,
  OPEN_TERMINAL_MENU_LABEL,
  FIND_MENU_LABEL,
  PREVIOUS_CHAT_MENU_LABEL,
  NEXT_CHAT_MENU_LABEL,
  BACK_MENU_LABEL,
  FORWARD_MENU_LABEL,
  UNDO_LABEL,
  REDO_LABEL,
  CUT_LABEL,
  COPY_LABEL,
  PASTE_LABEL,
  SELECT_ALL_LABEL
} from './reveal-in-folder'

describe('reveal in folder', () => {
  it('labels Finder Explorer and File Manager and resolves thread or review paths', () => {
    expect(revealInFolderLabel('darwin')).toBe('Open in Finder')
    expect(revealInFolderLabel('win32')).toBe('Open in Explorer')
    expect(revealInFolderLabel('linux')).toBe('Open in File Manager')
    expect(revealInFolderLabel()).toBe('Open in File Manager')
    expect(
      threadRevealFolderPath({
        mode: 'worktree',
        worktreePath: '/tmp/wt',
        workspacePath: '/repo'
      })
    ).toBe('/tmp/wt')
    expect(
      threadRevealFolderPath({
        mode: 'local',
        worktreePath: '/tmp/wt',
        workspacePath: '/repo'
      })
    ).toBe('/repo')
    expect(threadRevealFolderPath({ mode: 'worktree', workspacePath: '/repo' })).toBe('/repo')
    expect(reviewFileRevealPath('src/a.ts', '/proj')).toBe('/proj/src/a.ts')
    expect(reviewFileRevealPath('/abs/b.ts', '/proj')).toBe('/abs/b.ts')
    expect(reviewFileRevealPath('C:\\repo\\a.ts', '/proj')).toBe('C:/repo/a.ts')
    expect(reviewFileRevealPath('C:\\\\repo\\\\a.ts', '/proj')).toBe('C:/repo/a.ts')
    expect(reviewFileRevealPath('lib/b.ts', 'C:\\extra\\')).toBe('C:/extra/lib/b.ts')
    expect(reviewFileRevealPath('', '/proj')).toBe('')
    expect(threadMenuItems({ platform: 'darwin' }).map((item) => item.action)).toEqual([
      'reveal',
      'copy-markdown',
      'rename',
      'pin',
      'archive'
    ])
    expect(threadMenuItems({ platform: 'darwin' })[1]?.title).toBe('Copy as Markdown')
    expect(threadMenuItems({ platform: 'darwin' }).map((item) => item.title)).toEqual([
      'Open in Finder',
      'Copy as Markdown',
      'Rename',
      'Pin',
      'Archive'
    ])
    expect(threadMenuItems({ pinned: true, platform: 'win32' })[3]?.title).toBe('Unpin')
    expect(threadCopyMenuItems().map((item) => item.action)).toEqual([
      'copy-cwd',
      'copy-session',
      'copy-deeplink',
      'copy-markdown'
    ])
    expect(threadCopyMenuItems().map((item) => item.title)).toEqual([
      'Copy working directory',
      'Copy session ID',
      'Copy deeplink',
      'Copy as Markdown'
    ])
    expect(threadCopyMenuItems()[3]?.title).toBe('Copy as Markdown')
    expect(threadMenuItems({ platform: 'linux' })[0]?.title).toBe('Open in File Manager')
    expect(threadMenuItems({ platform: 'darwin' })[0]?.title).toBe('Open in Finder')
    expect(OPEN_COMMAND_MENU_LABEL).toBe('Open command menu')
    expect(OPEN_KEYBOARD_SHORTCUTS_LABEL).toBe('Open keyboard shortcuts')
    expect(RESTORE_PREVIOUS_COMPOSER_PROMPT_LABEL).toBe('Restore previous composer prompt')
    expect(OPEN_SETTINGS_LABEL).toBe('Open settings')
    expect(SKILLS_LABEL).toBe('Skills')
    expect(FORCE_RELOAD_SKILLS_LABEL).toBe('Force reload skills')
    expect(SKILLS_INTRO).toMatch(/view and explore skills created across your projects/)
    expect(SKILLS_INVOKE_HINT).toBe(
      'You can also explicitly invoke skills by typing `$` in the chat composer.'
    )
    expect(SKILLS_SLASH_HINT).toBe('Enabled skills also appear in the slash command list.')
    expect(SKILLS_SLASH_HINT).not.toMatch(/prompts:/)
    expect(SKILLS_MATCH_HINT).toMatch(/choose a skill when your request matches its purpose/)
    expect(SKILLS_MATCH_HINT).toMatch(/Codex supports `\$` mentions/)
    expect(SKILLS_DETECT_HINT).toMatch(/detects skill changes automatically/)
    expect(SKILLS_SKILL_MD_HINT).toMatch(/SKILL\.md/)
    expect(SKILLS_SKILL_MD_HINT).not.toMatch(/progressive disclosure/)
    const skillsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/pages/SkillsPage.tsx'),
      'utf8'
    )
    expect(skillsSrc).toContain('SKILLS_INTRO')
    expect(skillsSrc).toContain('SKILLS_INVOKE_HINT')
    expect(skillsSrc).toContain('SKILLS_SLASH_HINT')
    expect(skillsSrc).toContain('SKILLS_MATCH_HINT')
    expect(skillsSrc).toContain('SKILLS_DETECT_HINT')
    expect(skillsSrc).toContain('SKILLS_SKILL_MD_HINT')
    expect(skillsSrc).not.toMatch(/progressive disclosure/)
    expect(skillsSrc).toContain('CHATS_SECTION_LABEL')
    expect(skillsSrc).toContain('reloadNonce')
    const skillReloadComposerSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ComposerDock.tsx'),
      'utf8'
    )
    expect(skillReloadComposerSrc).toContain("'reload_skills'")
    const skillReloadAppSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'),
      'utf8'
    )
    expect(skillReloadAppSrc).toContain('force_reload_skills')
    expect(skillReloadAppSrc).toContain('skillReloadNonce')
    expect(NEW_STANDALONE_CHAT_LABEL).toBe('New standalone chat')
    expect(TOGGLE_SIDEBAR_LABEL).toBe('Toggle sidebar')
    const toolbarSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ChatToolbar.tsx'),
      'utf8'
    )
    expect(toolbarSrc).toContain('TOGGLE_SIDEBAR_LABEL')
    expect(toolbarSrc).toContain('TOGGLE_BOTTOM_PANEL_LABEL')
    expect(toolbarSrc).toContain('OPEN_IN_POPUP_WINDOW_LABEL')
    expect(toolbarSrc).toContain('HAND_OFF_INTRO')
    const worktreeSettingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/WorktreeSettings.tsx'),
      'utf8'
    )
    expect(worktreeSettingsSrc).toContain('WORKTREES_SETTINGS_INTRO')
    expect(toolbarSrc).not.toContain('固定展开边栏')
    expect(toolbarSrc).not.toContain('收起边栏')
    expect(toolbarSrc).not.toContain('弹出对话')
    expect(toolbarSrc).not.toContain('展开右侧面板')
    expect(toolbarSrc).not.toContain('收起右侧面板')
    expect(TOGGLE_FILE_TREE_LABEL).toBe('Toggle file tree')
    expect(TOGGLE_FILE_TREE_MENU_LABEL).toBe('Toggle File Tree')
    expect(OPEN_MODEL_PICKER_LABEL).toBe('Open model picker')
    expect(START_VOICE_CHAT_LABEL).toBe('Start voice chat')
    expect(START_NEW_VOICE_CHAT_LABEL).toBe('Start new voice chat')
    expect(END_VOICE_CHAT_LABEL).toBe('End')
    expect(voiceChatControlLabel({ active: false, hasMessages: false })).toBe('Start new voice chat')
    expect(voiceChatControlLabel({ active: false, hasMessages: true })).toBe('Start voice chat')
    expect(voiceChatControlLabel({ active: true, hasMessages: true })).toBe('End')
    expect(VOICE_LABEL).toBe('Voice')
    expect(START_DICTATION_LABEL).toBe('Start dictation')
    expect(RUN_ENVIRONMENT_ACTION_1_LABEL).toBe('Run environment action 1')
    expect(TOGGLE_ACTIVITY_VIEW_LABEL).toBe('Toggle Activity view')
    expect(ACTIVITY_LABEL).toBe('Activity')
    expect(ADD_NEW_PROJECT_LABEL).toBe('Add new project')
    expect(SETTINGS_LABEL).toBe('Settings')
    expect(REMOVE_LABEL).toBe('Remove')
    expect(PROJECTS_LABEL).toBe('Projects')
    expect(PROJECTS_VIEW_INTRO).toMatch(/ChatGPT projects and local projects/)
    expect(START_WITHOUT_A_PROJECT_INTRO).toMatch(/without a project/)
    expect(CREATE_A_PROJECT_FIRST_HINT).toMatch(/Create a project first/)
    expect(ADD_A_LOCAL_PROJECT_HINT).toMatch(/Add a local project/)
    expect(PROJECTS_NEED_NO_FOLDER_HINT).toMatch(/don't need a folder/)
    expect(PIN_A_PROJECT_HINT).toMatch(/Pin a project/)
    expect(PIN_A_PROJECT_HINT).toMatch(/doesn't add context/)
    expect(PIN_A_CHAT_HINT).toMatch(/Pin a chat when you return to it often/)
    expect(NO_CHATS_LABEL).toBe('No chats')
    expect(NO_PROJECTS_LABEL).toBe('No projects')
    expect(SEARCH_PROJECTS_LABEL).toBe('Search projects')
    expect(OPEN_PROJECT_PICKER_LABEL).toBe('Open project picker')
    expect(SEARCH_CHATS_PLACEHOLDER).toBe('Search title, message, or branch')
    expect(SEARCH_CHATS_LABEL).toBe('Search chats')
    expect(SEARCH_CHATS_INTRO).toMatch(/doesn't have a default shortcut/)
    expect(SEARCH_CHATS_MATCH_HINT).toMatch(/Git branch names/)
    expect(FIND_IN_CHAT_INTRO).toMatch(/doesn't search across other chats/)
    expect(FIND_IN_CHAT_LABEL).toBe('Find in chat')
    expect(FIND_NEXT_MATCH_LABEL).toBe('Find next match')
    expect(FIND_PREVIOUS_MATCH_LABEL).toBe('Find previous match')
    expect(FILE_CLOSE_LABEL).toBe('Close')
    expect(NOT_ASSIGNED_BY_DEFAULT_LABEL).toBe('Not assigned by default')
    expect(CREATE_PERMANENT_WORKTREE_LABEL).toBe('Create a permanent worktree')
    expect(CREATE_PERMANENT_WORKTREE_INTRO).toMatch(/three-dot menu/)
    expect(CREATE_PERMANENT_WORKTREE_INTRO).toMatch(/aren't automatically deleted/)
    expect(WORKTREE_RESTORE_BANNER).toBe('Restore this worktree from its snapshot.')
    expect(STARTING_BRANCH_LABEL).toBe('Starting branch')
    expect(STARTING_BRANCH_SEARCH_PLACEHOLDER).toBe('Search local or remote branches')
    expect(REMOTE_BRANCH_HINT).toBe('remote')
    expect(RESTORE_LABEL).toBe('Restore')
    expect(KEYBOARD_SHORTCUTS_LABEL).toBe('Keyboard Shortcuts')
    expect(KEYBOARD_SHORTCUTS_INTRO).toBe(
      'Open Keyboard Shortcuts to review commands, change bindings, or reset custom shortcuts to their defaults. Use the search field to find shortcuts by command name, or switch to keystroke search and press a key combination to find the command that uses it. Appshots use a separate global shortcut under Settings > Appshots.'
    )
    expect(KEYSTROKE_SEARCH_LABEL).toBe('Keystroke search')
    expect(KEYBOARD_SHORTCUTS_SEARCH_PLACEHOLDER).toBe('Search by command name')
    expect(KEYSTROKE_SEARCH_PLACEHOLDER).toBe('Press a key combination')
    expect(changeShortcutLabel('Search chats')).toBe('Change shortcut for Search chats')
    expect(createNewShortcutLabel('Search chats')).toBe('Create new shortcut for Search chats')
    expect(GENERAL_SETTINGS_LABEL).toBe('General')
    expect(GENERAL_SETTINGS_INTRO).toMatch(/Require Cmd\+Enter for multiline prompts/)
    expect(GENERAL_SETTINGS_INTRO).toMatch(/Follow-up behavior/)
    expect(APPEARANCE_SETTINGS_LABEL).toBe('Appearance')
    expect(NOTIFICATIONS_SETTINGS_LABEL).toBe('Notifications')
    expect(NOTIFICATIONS_SETTINGS_INTRO).toMatch(/turn completion notifications/)
    expect(NOTIFICATIONS_SETTINGS_INTRO).toMatch(
      /never, only while ChatGPT is in the background, or always/
    )
    const notificationSettingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/NotificationSettings.tsx'),
      'utf8'
    )
    expect(notificationSettingsSrc).toContain('NOTIFICATIONS_SETTINGS_INTRO')
    expect(PERSONALIZATION_SETTINGS_LABEL).toBe('Personalization')
    expect(PERSONALIZATION_SETTINGS_INTRO).toMatch(/Friendly, Pragmatic, or None/)
    expect(SUGGESTED_PROMPTS_SETTINGS_LABEL).toBe('Suggested prompts')
    expect(SUGGESTED_PROMPTS_INTRO).toMatch(/context-aware suggestions/)
    const suggestedPromptSettingsSrc = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../src/components/settings/SuggestedPromptSettings.tsx'
      ),
      'utf8'
    )
    expect(suggestedPromptSettingsSrc).toContain('SUGGESTED_PROMPTS_INTRO')
    expect(ARCHIVED_CHATS_INTRO).toMatch(/Use Unarchive to restore a chat/)
    expect(BROWSER_SETTINGS_LABEL).toBe('Browser')
    expect(BROWSER_SETTINGS_INTRO).toMatch(/separate from your regular browser/)
    expect(BROWSER_SETTINGS_INTRO).toMatch(/Ask where to save downloads/)
    expect(FILES_LABEL).toBe('Files')
    expect(REVIEW_LABEL).toBe('Review')
    expect(TERMINAL_LABEL).toBe('Terminal')
    expect(TOGGLE_BOTTOM_PANEL_LABEL).toBe('Toggle bottom panel')
    expect(CLEAR_TERMINAL_LABEL).toBe('Clear terminal')
    expect(TERMINAL_INTRO).toMatch(/terminal scoped to its current project or worktree/)
    expect(TERMINAL_INTRO).toMatch(/read the current terminal output/)
    expect(TERMINAL_INTRO).toMatch(/validate changes, run scripts/)
    expect(CLEAR_TERMINAL_HINT).toMatch(/Cmd\+K opens the app command palette/)
    expect(CLEAR_TERMINAL_HINT).toMatch(/press Ctrl\+L/)
    const terminalSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/EmbeddedTerminal.tsx'),
      'utf8'
    )
    expect(terminalSrc).toContain('CLEAR_TERMINAL_LABEL')
    expect(terminalSrc).toContain('CLEAR_TERMINAL_HINT')
    expect(terminalSrc).toContain('TERMINAL_INTRO')
    expect(terminalSrc).toContain('TERMINAL_LABEL')
    expect(terminalSrc).not.toContain('Ctrl+L / ⌘K')
    expect(terminalSrc).toContain('FILE_CLOSE_LABEL')
    expect(terminalSrc).not.toContain('aria-label="清终端"')
    expect(terminalSrc).not.toContain('>清屏<')
    expect(terminalSrc).not.toContain('aria-label={`关闭 ${tab.title}`}')
    const panelSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/RightPanel.tsx'),
      'utf8'
    )
    expect(panelSrc).toContain('FILES_LABEL')
    expect(panelSrc).toContain('REVIEW_LABEL')
    expect(panelSrc).toContain('TERMINAL_LABEL')
    expect(panelSrc).toContain('BROWSER_SETTINGS_LABEL')
    expect(panelSrc).toContain('FILE_CLOSE_LABEL')
    expect(panelSrc).toContain('TOGGLE_FULL_SCREEN_LABEL')
    expect(panelSrc).not.toContain("['files', '文件']")
    expect(panelSrc).not.toContain("['changes', '变更']")
    expect(panelSrc).not.toContain('aria-label="关闭工作区面板"')
    expect(panelSrc).not.toContain("aria-label={fullscreen ? '退出全屏' : '全屏'}")
    expect(MCP_SERVERS_LABEL).toBe('MCP servers')
    expect(ADD_SERVER_LABEL).toBe('Add server')
    expect(SAVE_LABEL).toBe('Save')
    expect(MCP_NAME_LABEL).toBe('Name')
    expect(MCP_COMMAND_LABEL).toBe('Command')
    expect(MCP_SERVERS_INTRO).toMatch(/Select Add server/)
    expect(MCP_SERVERS_INTRO).toMatch(/STDIO or Streamable HTTP/)
    expect(MCP_STDIO_DESCRIPTION).toBe(
      'Servers that run as a local process (started by a command).'
    )
    expect(MCP_HTTP_DESCRIPTION).toBe('Servers that you access at an address.')
    const mcpSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/McpSettings.tsx'),
      'utf8'
    )
    expect(mcpSrc).toContain('MCP_STDIO_DESCRIPTION')
    expect(mcpSrc).toContain('MCP_HTTP_DESCRIPTION')
    expect(mcpSrc).toContain('MCP_SERVERS_INTRO')
    expect(mcpSrc).toContain('SAVE_LABEL')
    expect(mcpSrc).toContain('REMOVE_LABEL')
    expect(mcpSrc).toContain('MCP_NAME_LABEL')
    expect(mcpSrc).toContain('MCP_COMMAND_LABEL')
    expect(OPEN_MCP_STATUS_LABEL).toBe('Open MCP status')
    expect(PROFILE_SETTINGS_LABEL).toBe('Profile')
    expect(UNARCHIVE_LABEL).toBe('Unarchive')
    expect(SHOW_CONTEXT_WINDOW_USAGE_LABEL).toBe('Show context window usage')
    expect(PREVENT_SLEEP_WHILE_RUNNING_LABEL).toBe('Prevent sleep while running')
    expect(PREVENT_SLEEP_WHILE_RUNNING_DESCRIPTION).toMatch(/local chats can continue/)
    expect(SHARE_LABEL).toBe('Share')
    expect(SHARE_SNAPSHOT_INTRO).toMatch(/doesn't give other people access/)
    expect(SHARE_SNAPSHOT_CONTENTS).toMatch(/user-visible messages/)
    expect(SHARE_SNAPSHOT_CONTENTS).toMatch(/don't include the original thread's tool calls/)
    expect(SHARE_SNAPSHOT_REVIEW).toMatch(/file paths/)
    expect(SHARE_LOCAL_COPY_NOTE).toMatch(/Does not upload/)
    expect(MINIMIZE_LABEL).toBe('Minimize')
    expect(WINDOW_ZOOM_LABEL).toBe('Zoom')
    expect(BRING_ALL_TO_FRONT_LABEL).toBe('Bring All to Front')
    expect(OPEN_IN_POPUP_WINDOW_LABEL).toBe('Open in Popup Window')
    expect(ALWAYS_ON_TOP_LABEL).toBe('Always on top')
    expect(KEEP_A_CHAT_NEAR_YOUR_WORK_LABEL).toBe('Keep a chat near your work')
    expect(KEEP_A_CHAT_NEAR_YOUR_WORK_INTRO).toMatch(/pop out an active chat/)
    expect(KEEP_A_CHAT_NEAR_YOUR_WORK_INTRO).toMatch(/Always on top/)
    expect(APPROVE_REQUEST_LABEL).toBe('Approve request')
    expect(DECLINE_REQUEST_LABEL).toBe('Decline request')
    expect(EDIT_PROJECT_LABEL).toBe('Edit project')
    expect(EDIT_PROJECT_INTRO).toMatch(/New chats start in the primary folder/)
    expect(EDIT_PROJECT_INTRO).toMatch(/Secondary folders remain available/)
    expect(PRIMARY_FOLDER_LABEL).toBe('Primary folder')
    expect(SECONDARY_FOLDERS_LABEL).toBe('Secondary folders')
    expect(ARCHIVE_CHATS_ACTION_LABEL).toBe('Archive chats')
    expect(ADD_FOLDER_LABEL).toBe('Add folder')
    expect(MAKE_PRIMARY_LABEL).toBe('Make primary')
    const composerSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ComposerDock.tsx'),
      'utf8'
    )
    expect(composerSrc).toContain('SEARCH_PROJECTS_LABEL')
    expect(composerSrc).toContain('SEARCH_CHATS_INTRO')
    expect(composerSrc).toContain('SEARCH_CHATS_MATCH_HINT')
    expect(composerSrc).toContain('NO_PROJECTS_LABEL')
    expect(composerSrc).toContain('REMOTE_BRANCH_HINT')
    expect(composerSrc).toContain('RESTORE_PREVIOUS_COMPOSER_PROMPT_LABEL')
    expect(composerSrc).toContain('PERMISSIONS_LABEL')
    expect(composerSrc).toContain('REMOVE_LABEL')
    expect(composerSrc).not.toContain('提示历史')
    expect(composerSrc).not.toContain('aria-label="权限"')
    const settingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/pages/SettingsPage.tsx'),
      'utf8'
    )
    expect(settingsSrc).toContain('PERMISSIONS_LABEL')
    expect(settingsSrc).toContain('BROWSER_SETTINGS_INTRO')
    expect(settingsSrc).not.toContain('不接系统 Chrome，不发明 @Browser')
    const sidebarSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/Sidebar.tsx'),
      'utf8'
    )
    expect(sidebarSrc).toContain('PERMISSIONS_LABEL')
    expect(sidebarSrc).toContain('PROJECTS_VIEW_INTRO')
    expect(sidebarSrc).toContain('PIN_A_PROJECT_HINT')
    expect(sidebarSrc).toContain('PIN_A_CHAT_HINT')
    expect(sidebarSrc).toContain('SEARCH_CHATS_INTRO')
    expect(sidebarSrc).toContain('CREATE_PERMANENT_WORKTREE_INTRO')
    const chatViewSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ChatView.tsx'),
      'utf8'
    )
    expect(chatViewSrc).toContain('START_WITHOUT_A_PROJECT_INTRO')
    expect(chatViewSrc).toContain('CREATE_A_PROJECT_FIRST_HINT')
    expect(chatViewSrc).toContain('isLocalProjectWorkspace')
    expect(chatViewSrc).toContain('FIND_IN_CHAT_INTRO')
    expect(chatViewSrc).not.toContain('请先在侧栏或设置中添加一个工作区文件夹')
    const permissionsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/PermissionsSettings.tsx'),
      'utf8'
    )
    expect(permissionsSrc).toContain('PERMISSIONS_LABEL')
    const paletteSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/CommandPalette.tsx'),
      'utf8'
    )
    expect(paletteSrc).toContain('OPEN_COMMAND_MENU_LABEL')
    expect(paletteSrc).toContain('FILE_CLOSE_LABEL')
    const shortcutsHelpSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ShortcutsHelp.tsx'),
      'utf8'
    )
    expect(shortcutsHelpSrc).toContain('KEYBOARD_SHORTCUTS_LABEL')
    expect(shortcutsHelpSrc).toContain('OPEN_KEYBOARD_SHORTCUTS_LABEL')
    expect(shortcutsHelpSrc).not.toContain('快捷键')
    const foldersSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ProjectFoldersDialog.tsx'),
      'utf8'
    )
    expect(foldersSrc).toContain('EDIT_PROJECT_INTRO')
    expect(foldersSrc).toContain('PRIMARY_FOLDER_LABEL')
    expect(foldersSrc).toContain('PROJECTS_NEED_NO_FOLDER_HINT')
    expect(foldersSrc).not.toContain('还没有附加文件夹')
    expect(foldersSrc).toContain('SECONDARY_FOLDERS_LABEL')
    expect(foldersSrc).toContain('FILE_CLOSE_LABEL')
    const askSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/InlineUserInput.tsx'),
      'utf8'
    )
    expect(askSrc).toContain('USER_INPUT_OTHER_LABEL')
    expect(askSrc).not.toContain('自由作答')
    expect(askSrc).not.toContain('其他答案')
    expect(FORK_LABEL).toBe('Fork')
    expect(PAUSE_LABEL).toBe('Pause')
    expect(RESUME_LABEL).toBe('Resume')
    expect(EDIT_LABEL).toBe('Edit')
    const messageActionsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/MessageActions.tsx'),
      'utf8'
    )
    expect(messageActionsSrc).toContain('EDIT_LABEL')
    expect(messageActionsSrc).not.toContain('title="编辑并重发"')
    expect(messageActionsSrc).not.toContain('aria-label="编辑并重发"')
    expect(CLEAR_LABEL).toBe('Clear')
    expect(HAND_OFF_LABEL).toBe('Hand off')
    expect(HAND_OFF_INTRO).toMatch(/Hand off in the chat header/)
    expect(HAND_OFF_INTRO).toMatch(/\.worktreeinclude/)
    expect(WORKTREE_INTRO).toMatch(/multiple independent chats/)
    expect(WORKTREE_REQUIRES_GIT).toMatch(/require a Git repository/)
    expect(WORKTREE_DETACHED_HEAD_HINT).toMatch(/detached HEAD/)
    expect(WORKTREE_DETACHED_HEAD_HINT).toMatch(/uncommitted changes/)
    expect(WORKTREES_SETTINGS_INTRO).toMatch(/most recent 15 Codex-managed worktrees/)
    expect(WORKTREES_SETTINGS_INTRO).toMatch(/change Worktree root/)
    expect(CODEX_ENVIRONMENTS_LABEL).toBe('Codex environments')
    expect(LOCAL_LABEL).toBe('Local')
    expect(LOCAL_ENVIRONMENT_DESCRIPTION).toBe(
      'Local: work directly in your current project directory.'
    )
    expect(WORKTREE_LABEL).toBe('Worktree')
    expect(WORKTREE_ENVIRONMENT_DESCRIPTION).toBe(WORKTREE_INTRO)
    const dockSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ComposerDock.tsx'),
      'utf8'
    )
    expect(dockSrc).toContain('CODEX_ENVIRONMENTS_LABEL')
    expect(dockSrc).toContain('LOCAL_ENVIRONMENT_DESCRIPTION')
    expect(dockSrc).toContain('WORKTREE_ENVIRONMENT_DESCRIPTION')
    expect(dockSrc).toContain('WORKTREE_DETACHED_HEAD_HINT')
    expect(dockSrc).not.toContain('线程模式')
    expect(dockSrc).not.toContain('title={HAND_OFF_LABEL}')
    expect(CREATE_BRANCH_HERE_LABEL).toBe('Create branch here')
    expect(OPEN_LABEL).toBe('Open')
    expect(FILE_MENU_LABEL).toBe('File')
    expect(FILE_CLOSE_LABEL).toBe('Close')
    expect(CLOSE_CURRENT_TAB_OR_WINDOW_LABEL).toBe('Close current tab or window')
    expect(NEW_WINDOW_LABEL).toBe('New window')
    expect(EDIT_MENU_LABEL).toBe('Edit')
    expect(VIEW_MENU_LABEL).toBe('View')
    expect(WINDOW_MENU_LABEL).toBe('Window')
    expect(HELP_MENU_LABEL).toBe('Help')
    expect(aboutAppLabel('Sharker')).toBe('About Sharker')
    expect(aboutAppLabel('Codex')).toBe('About Codex')
    expect(hideAppLabel('Sharker')).toBe('Hide Sharker')
    expect(HIDE_OTHERS_LABEL).toBe('Hide Others')
    expect(SHOW_ALL_LABEL).toBe('Show All')
    expect(quitAppLabel('Sharker')).toBe('Quit Sharker')
    expect(CODEX_DOCUMENTATION_LABEL).toBe('Codex Documentation')
    expect(CODEX_DOCUMENTATION_URL).toBe('https://developers.openai.com/codex')
    expect(SEND_FEEDBACK_LABEL).toBe('Send Feedback')
    expect(SHARE_FEEDBACK_LABEL).toBe('Share feedback')
    expect(INCLUDE_CURRENT_SESSION_LOGS_LABEL).toBe('Include current Codex session logs')
    expect(RESTORE_LABEL).toBe('Restore')
    expect(TOGGLE_FULL_SCREEN_LABEL).toBe('Toggle Full Screen')
    expect(OPEN_BROWSER_TAB_MENU_LABEL).toBe('Open Browser Tab')
    expect(FOCUS_BROWSER_ADDRESS_BAR_MENU_LABEL).toBe('Focus Browser Address Bar')
    expect(RELOAD_BROWSER_PAGE_MENU_LABEL).toBe('Reload Browser Page')
    expect(OPEN_TERMINAL_MENU_LABEL).toBe('Open Terminal')
    expect(FIND_MENU_LABEL).toBe('Find')
    expect(PREVIOUS_CHAT_MENU_LABEL).toBe('Previous Chat')
    expect(NEXT_CHAT_MENU_LABEL).toBe('Next Chat')
    expect(BACK_MENU_LABEL).toBe('Back')
    expect(FORWARD_MENU_LABEL).toBe('Forward')
    expect(UNDO_LABEL).toBe('Undo')
    expect(REDO_LABEL).toBe('Redo')
    expect(CUT_LABEL).toBe('Cut')
    expect(COPY_LABEL).toBe('Copy')
    expect(PASTE_LABEL).toBe('Paste')
    expect(SELECT_ALL_LABEL).toBe('Select All')
    const root = dirname(fileURLToPath(import.meta.url))
    const menuSrc = readFileSync(join(root, '../electron/main/app-menu.ts'), 'utf8')
    expect(menuSrc).toContain('MINIMIZE_LABEL')
    expect(menuSrc).toContain('WINDOW_ZOOM_LABEL')
    expect(menuSrc).toContain('BRING_ALL_TO_FRONT_LABEL')
    expect(menuSrc).not.toContain('最小化')
    expect(menuSrc).not.toContain('前置全部窗口')
    expect(menuSrc).toContain('aboutAppLabel')
    expect(menuSrc).toContain('hideAppLabel')
    expect(menuSrc).toContain('quitAppLabel')
    expect(menuSrc).toContain('HIDE_OTHERS_LABEL')
    expect(menuSrc).toContain('SHOW_ALL_LABEL')
    expect(menuSrc).not.toContain('关于 Sharker')
    expect(menuSrc).not.toContain('退出 Sharker')
    expect(menuSrc).toContain('CODEX_DOCUMENTATION_LABEL')
    expect(menuSrc).toContain('CODEX_DOCUMENTATION_URL')
    expect(menuSrc).toContain('SEND_FEEDBACK_LABEL')
    expect(menuSrc).toContain("send('show_feedback')")
    expect(menuSrc).not.toContain('Check for Updates')
    const appSrc = readFileSync(join(root, '../src/App.tsx'), 'utf8')
    expect(appSrc).toContain("action === 'show_feedback'")
    expect(appSrc).toContain("cmd.action === 'open_codex_docs'")
    expect(appSrc).toContain('CODEX_DOCUMENTATION_URL')
    const feedbackSrc = readFileSync(join(root, '../src/components/FeedbackDialog.tsx'), 'utf8')
    expect(feedbackSrc).toContain('SHARE_FEEDBACK_LABEL')
    expect(feedbackSrc).toContain('INCLUDE_CURRENT_SESSION_LOGS_LABEL')
    expect(feedbackSrc).toContain('FILE_CLOSE_LABEL')
    expect(feedbackSrc).not.toContain('aria-label="关闭反馈"')
    expect(feedbackSrc).not.toContain('>取消<')
    const imageSrc = readFileSync(join(root, '../src/components/ChatImage.tsx'), 'utf8')
    expect(imageSrc).toContain('FILE_CLOSE_LABEL')
    expect(imageSrc).not.toContain('aria-label="关闭图片预览"')
    const fileTreeSrc = readFileSync(join(root, '../src/components/panel/FileTree.tsx'), 'utf8')
    expect(fileTreeSrc).toContain('FILE_CLOSE_LABEL')
    expect(fileTreeSrc).toContain('GO_TO_LINE_OR_FOCUS_BROWSER_ADDRESS_BAR_LABEL')
    expect(fileTreeSrc).toContain('ADD_A_LOCAL_PROJECT_HINT')
    expect(fileTreeSrc).not.toContain('>关闭<')
    expect(fileTreeSrc).not.toContain('aria-label="跳到行"')
    expect(fileTreeSrc).not.toContain('请先选择工作区')
    const changesSrc = readFileSync(join(root, '../src/components/panel/ChangesPanel.tsx'), 'utf8')
    expect(changesSrc).toContain('GO_TO_LINE_OR_FOCUS_BROWSER_ADDRESS_BAR_LABEL')
    expect(changesSrc).toContain('REVIEW_REQUIRES_GIT_LABEL')
    expect(changesSrc).not.toContain('请先选择工作区')
    expect(changesSrc).not.toContain('aria-label="跳到行"')
  })
})
