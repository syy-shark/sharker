import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_SETTINGS_LABEL,
  BROWSER_SETTINGS_LABEL,
  GENERAL_SETTINGS_LABEL,
  KEYBOARD_SHORTCUTS_LABEL,
  MCP_SERVERS_LABEL,
  NOTIFICATIONS_SETTINGS_LABEL,
  OPEN_COMMAND_MENU_LABEL,
  PERSONALIZATION_SETTINGS_LABEL,
  SHARE_LABEL,
  ALWAYS_ON_TOP_LABEL,
  KEEP_A_CHAT_NEAR_YOUR_WORK_LABEL,
  OPEN_IN_POPUP_WINDOW_LABEL,
  SUGGESTED_PROMPTS_SETTINGS_LABEL,
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
  TOGGLE_SIDEBAR_LABEL
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
    expect(SHARE_LABEL).toBe('Share')
    expect(OPEN_IN_POPUP_WINDOW_LABEL).toBe('Open in Popup Window')
    expect(ALWAYS_ON_TOP_LABEL).toBe('Always on top')
    expect(KEEP_A_CHAT_NEAR_YOUR_WORK_LABEL).toBe('Keep a chat near your work')
  })
})
