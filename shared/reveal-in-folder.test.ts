import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_SETTINGS_LABEL,
  BROWSER_SETTINGS_LABEL,
  GENERAL_SETTINGS_LABEL,
  KEYBOARD_SHORTCUTS_LABEL,
  MCP_SERVERS_LABEL,
  OPEN_MCP_STATUS_LABEL,
  SHOW_CONTEXT_WINDOW_USAGE_LABEL,
  PREVENT_SLEEP_WHILE_RUNNING_LABEL,
  PREVENT_SLEEP_WHILE_RUNNING_DESCRIPTION,
  NOTIFICATIONS_SETTINGS_LABEL,
  NEW_STANDALONE_CHAT_LABEL,
  OPEN_COMMAND_MENU_LABEL,
  PERSONALIZATION_SETTINGS_LABEL,
  SHARE_LABEL,
  FORK_LABEL,
  PAUSE_LABEL,
  RESUME_LABEL,
  EDIT_LABEL,
  CLEAR_LABEL,
  HAND_OFF_LABEL,
  LOCAL_LABEL,
  WORKTREE_LABEL,
  CREATE_BRANCH_HERE_LABEL,
  ALWAYS_ON_TOP_LABEL,
  KEEP_A_CHAT_NEAR_YOUR_WORK_LABEL,
  OPEN_IN_POPUP_WINDOW_LABEL,
  APPROVE_REQUEST_LABEL,
  DECLINE_REQUEST_LABEL,
  EDIT_PROJECT_LABEL,
  ARCHIVE_CHATS_ACTION_LABEL,
  ADD_FOLDER_LABEL,
  MAKE_PRIMARY_LABEL,
  SUGGESTED_PROMPTS_SETTINGS_LABEL,
  PROFILE_SETTINGS_LABEL,
  UNARCHIVE_LABEL,
  OPEN_MODEL_PICKER_LABEL,
  OPEN_SETTINGS_LABEL,
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
  TOGGLE_SIDEBAR_LABEL,
  FILE_MENU_LABEL,
  FILE_CLOSE_LABEL,
  NEW_WINDOW_LABEL,
  EDIT_MENU_LABEL,
  VIEW_MENU_LABEL,
  WINDOW_MENU_LABEL,
  HELP_MENU_LABEL,
  CODEX_DOCUMENTATION_LABEL,
  CODEX_DOCUMENTATION_URL,
  SEND_FEEDBACK_LABEL,
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
    expect(OPEN_SETTINGS_LABEL).toBe('Open settings')
    expect(NEW_STANDALONE_CHAT_LABEL).toBe('New standalone chat')
    expect(TOGGLE_SIDEBAR_LABEL).toBe('Toggle sidebar')
    expect(TOGGLE_FILE_TREE_LABEL).toBe('Toggle file tree')
    expect(TOGGLE_FILE_TREE_MENU_LABEL).toBe('Toggle File Tree')
    expect(OPEN_MODEL_PICKER_LABEL).toBe('Open model picker')
    expect(START_DICTATION_LABEL).toBe('Start dictation')
    expect(RUN_ENVIRONMENT_ACTION_1_LABEL).toBe('Run environment action 1')
    expect(TOGGLE_ACTIVITY_VIEW_LABEL).toBe('Toggle Activity view')
    expect(KEYBOARD_SHORTCUTS_LABEL).toBe('Keyboard Shortcuts')
    expect(GENERAL_SETTINGS_LABEL).toBe('General')
    expect(APPEARANCE_SETTINGS_LABEL).toBe('Appearance')
    expect(NOTIFICATIONS_SETTINGS_LABEL).toBe('Notifications')
    expect(PERSONALIZATION_SETTINGS_LABEL).toBe('Personalization')
    expect(SUGGESTED_PROMPTS_SETTINGS_LABEL).toBe('Suggested prompts')
    expect(BROWSER_SETTINGS_LABEL).toBe('Browser')
    expect(MCP_SERVERS_LABEL).toBe('MCP servers')
    expect(OPEN_MCP_STATUS_LABEL).toBe('Open MCP status')
    expect(PROFILE_SETTINGS_LABEL).toBe('Profile')
    expect(UNARCHIVE_LABEL).toBe('Unarchive')
    expect(SHOW_CONTEXT_WINDOW_USAGE_LABEL).toBe('Show context window usage')
    expect(PREVENT_SLEEP_WHILE_RUNNING_LABEL).toBe('Prevent sleep while running')
    expect(PREVENT_SLEEP_WHILE_RUNNING_DESCRIPTION).toMatch(/local chats can continue/)
    expect(SHARE_LABEL).toBe('Share')
    expect(OPEN_IN_POPUP_WINDOW_LABEL).toBe('Open in Popup Window')
    expect(ALWAYS_ON_TOP_LABEL).toBe('Always on top')
    expect(KEEP_A_CHAT_NEAR_YOUR_WORK_LABEL).toBe('Keep a chat near your work')
    expect(APPROVE_REQUEST_LABEL).toBe('Approve request')
    expect(DECLINE_REQUEST_LABEL).toBe('Decline request')
    expect(EDIT_PROJECT_LABEL).toBe('Edit project')
    expect(ARCHIVE_CHATS_ACTION_LABEL).toBe('Archive chats')
    expect(ADD_FOLDER_LABEL).toBe('Add folder')
    expect(MAKE_PRIMARY_LABEL).toBe('Make primary')
    expect(FORK_LABEL).toBe('Fork')
    expect(PAUSE_LABEL).toBe('Pause')
    expect(RESUME_LABEL).toBe('Resume')
    expect(EDIT_LABEL).toBe('Edit')
    expect(CLEAR_LABEL).toBe('Clear')
    expect(HAND_OFF_LABEL).toBe('Hand off')
    expect(LOCAL_LABEL).toBe('Local')
    expect(WORKTREE_LABEL).toBe('Worktree')
    expect(CREATE_BRANCH_HERE_LABEL).toBe('Create branch here')
    expect(FILE_MENU_LABEL).toBe('File')
    expect(FILE_CLOSE_LABEL).toBe('Close')
    expect(NEW_WINDOW_LABEL).toBe('New window')
    expect(EDIT_MENU_LABEL).toBe('Edit')
    expect(VIEW_MENU_LABEL).toBe('View')
    expect(WINDOW_MENU_LABEL).toBe('Window')
    expect(HELP_MENU_LABEL).toBe('Help')
    expect(CODEX_DOCUMENTATION_LABEL).toBe('Codex Documentation')
    expect(CODEX_DOCUMENTATION_URL).toBe('https://developers.openai.com/codex')
    expect(SEND_FEEDBACK_LABEL).toBe('Send Feedback')
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
    expect(menuSrc).toContain('CODEX_DOCUMENTATION_LABEL')
    expect(menuSrc).toContain('CODEX_DOCUMENTATION_URL')
    expect(menuSrc).toContain('SEND_FEEDBACK_LABEL')
    expect(menuSrc).toContain("send('show_feedback')")
    expect(menuSrc).not.toContain('Check for Updates')
    const appSrc = readFileSync(join(root, '../src/App.tsx'), 'utf8')
    expect(appSrc).toContain("action === 'show_feedback'")
    expect(appSrc).toContain("cmd.action === 'open_codex_docs'")
    expect(appSrc).toContain('CODEX_DOCUMENTATION_URL')
  })
})
