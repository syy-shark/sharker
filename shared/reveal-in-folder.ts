/**
 * 在系统文件管理器中显示路径（对标 Codex Open in Finder / Explorer / File Manager）。
 * 线程菜单打开项目目录；审查右键揭示文件。不接自定义 Open with handler。
 * @see shared/ARCH.md
 */

import { resolveConversationPath } from './conversation'

/** 官方桌面按平台换文案 */
export type RevealFolderPlatform = 'darwin' | 'win32' | string

/** 官方 macOS Finder / Windows Explorer / Linux File Manager（对标 Codex #13123 / #29449） */
export const OPEN_IN_FINDER_LABEL = 'Open in Finder'
export const OPEN_IN_EXPLORER_LABEL = 'Open in Explorer'
export const OPEN_IN_FILE_MANAGER_LABEL = 'Open in File Manager'
/** 官方文件引用 / 文件树 / Files changed 右键（对标 Codex #13123 / #17591 / #29316） */
export const COPY_PATH_LABEL = 'Copy path'

/** 官方桌面按平台换文案 */
export function revealInFolderLabel(platform: RevealFolderPlatform = 'linux'): string {
  if (platform === 'darwin') return OPEN_IN_FINDER_LABEL
  if (platform === 'win32') return OPEN_IN_EXPLORER_LABEL
  return OPEN_IN_FILE_MANAGER_LABEL
}

/** 线程项目目录：隔离 worktree 优先，否则工作区 cwd */
export function threadRevealFolderPath(input: {
  mode?: string
  worktreePath?: string
  workspacePath?: string
}): string {
  if (input.mode === 'worktree') {
    return resolveConversationPath({
      worktreePath: input.worktreePath,
      workspacePath: input.workspacePath
    })
  }
  return String(input.workspacePath || '').trim()
}

/** 审查文件落盘绝对路径；相对路径接到仓根。主进程再 `path.resolve` */
export function reviewFileRevealPath(filePath: string, repoRoot: string): string {
  const file = String(filePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
  const root = String(repoRoot || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
  if (!file) return ''
  if (file.startsWith('/') || /^[A-Za-z]:\//.test(file)) return file
  if (!root) return ''
  return `${root}/${file.replace(/^\/+/, '')}`
}

export type ThreadCopyAction = 'copy-cwd' | 'copy-session' | 'copy-deeplink' | 'copy-markdown'

/** 官方桌面消息 hover / Copy 子菜单名（对标 Codex #20643 / #25201） */
export const COPY_LABEL = 'Copy'
/** 官方桌面 Copy 子菜单与快捷键（对标 Codex #25201 / #28233 / learn.chatgpt.com） */
export const COPY_WORKING_DIRECTORY_LABEL = 'Copy working directory'
export const COPY_SESSION_ID_LABEL = 'Copy session ID'
/** 顶栏 Copy 子菜单原文（对标 Codex #25201 / #28233） */
export const COPY_DEEPLINK_LABEL = 'Copy deeplink'
/** 官方快捷键表名（对标 learn.chatgpt.com Copy chat deep link） */
export const COPY_CHAT_DEEP_LINK_LABEL = 'Copy chat deep link'
export const COPY_AS_MARKDOWN_LABEL = 'Copy as Markdown'
export const COPY_CONVERSATION_PATH_LABEL = 'Copy conversation path'
export const COPY_BROWSER_URL_LABEL = 'Copy browser URL'

/** 官方侧栏线程右键短名（对标 Codex #33217 / #34139） */
export const RENAME_LABEL = 'Rename'
export const PIN_LABEL = 'Pin'
export const UNPIN_LABEL = 'Unpin'
export const ARCHIVE_LABEL = 'Archive'
/** 官方侧栏置顶分组（对标 Codex #25084 / #34139） */
export const PINNED_LABEL = 'Pinned'
/** 官方设置 Archived chats（对标 Codex #13018） */
export const ARCHIVED_CHATS_LABEL = 'Archived chats'
/** 官方项目菜单（对标 learn.chatgpt.com/docs/projects） */
export const EDIT_PROJECT_LABEL = 'Edit project'
export const ARCHIVE_CHATS_ACTION_LABEL = 'Archive chats'
export const ADD_FOLDER_LABEL = 'Add folder'
export const MAKE_PRIMARY_LABEL = 'Make primary'

/** 官方快捷键 / 命令面板（对标 learn.chatgpt.com Commands） */
export const NEW_CHAT_LABEL = 'New chat'
export const NEW_STANDALONE_CHAT_LABEL = 'New standalone chat'
export const RENAME_CHAT_LABEL = 'Rename chat'
export const PIN_OR_UNPIN_CHAT_LABEL = 'Pin or unpin chat'
export const ARCHIVE_CHAT_LABEL = 'Archive chat'
export const MARK_CHAT_AS_UNREAD_LABEL = 'Mark chat as unread'
export const OPEN_SIDE_CHAT_LABEL = 'Open side chat'
export const SEARCH_CHATS_LABEL = 'Search chats'
export const FIND_IN_CHAT_LABEL = 'Find in chat'
export const FIND_NEXT_MATCH_LABEL = 'Find next match'
export const FIND_PREVIOUS_MATCH_LABEL = 'Find previous match'
export const CLEAR_ALL_UNREAD_INDICATORS_LABEL = 'Clear all unread indicators'
export const NEXT_CHAT_NEEDING_ATTENTION_LABEL = 'Next chat needing attention'
export const SEARCH_FILES_LABEL = 'Search files'
/** Official sidebar / `codex://skills` (learn.chatgpt.com/docs/reference/commands). */
export const SKILLS_LABEL = 'Skills'

/** Official Codex app-menu roots (github.com/openai/codex#14450 File, Edit, View, Window, Help). */
export const FILE_MENU_LABEL = 'File'
export const EDIT_MENU_LABEL = 'Edit'
export const VIEW_MENU_LABEL = 'View'
export const WINDOW_MENU_LABEL = 'Window'
export const HELP_MENU_LABEL = 'Help'
/** Official macOS app menu (github.com/openai/codex#28543 About Codex; Hide/Quit follow About X). */
export function aboutAppLabel(appName: string): string {
  return `About ${String(appName || 'Sharker').trim() || 'Sharker'}`
}
export function hideAppLabel(appName: string): string {
  return `Hide ${String(appName || 'Sharker').trim() || 'Sharker'}`
}
export const HIDE_OTHERS_LABEL = 'Hide Others'
export const SHOW_ALL_LABEL = 'Show All'
export function quitAppLabel(appName: string): string {
  return `Quit ${String(appName || 'Sharker').trim() || 'Sharker'}`
}
/** Official Help menu (github.com/openai/codex#26890 Codex Documentation / Send Feedback). */
export const CODEX_DOCUMENTATION_LABEL = 'Codex Documentation'
export const SEND_FEEDBACK_LABEL = 'Send Feedback'
/** Official desktop `/feedback` dialog title (Codex Share feedback). */
export const SHARE_FEEDBACK_LABEL = 'Share feedback'
/** Official `/feedback` checkbox (Codex desktop #26654). */
export const INCLUDE_CURRENT_SESSION_LOGS_LABEL = 'Include current Codex session logs'
export const RESTORE_LABEL = 'Restore'
/** Official worktrees FAQ: reopen the chat and restore from the saved snapshot. */
export const WORKTREE_RESTORE_BANNER = 'Restore this worktree from its snapshot.'
/** Official Activity view name (learn.chatgpt.com/docs/notifications). */
export const ACTIVITY_LABEL = 'Activity'
/** Official troubleshooting: Add new project button next to Chats. */
export const ADD_NEW_PROJECT_LABEL = 'Add new project'
/** Official Settings footer / Open settings without the verb. */
export const SETTINGS_LABEL = 'Settings'
/** Official project menu: Remove. */
export const REMOVE_LABEL = 'Remove'
/** Official Projects view / sidebar section. */
export const PROJECTS_LABEL = 'Projects'
/** Official empty chats copy (do not show when chats exist). */
export const NO_CHATS_LABEL = 'No chats'
/** Official Search chats: title, phrase, or branch name. */
export const SEARCH_CHATS_PLACEHOLDER = 'Search title, message, or branch'
/** Official worktrees: create a permanent worktree from the three-dot menu. */
export const CREATE_PERMANENT_WORKTREE_LABEL = 'Create a permanent worktree'
/** Official worktrees: Select the starting branch below the composer. */
export const STARTING_BRANCH_LABEL = 'Starting branch'
export const STARTING_BRANCH_SEARCH_PLACEHOLDER = 'Search local or remote branches'
/** Official README / Help target. Do not invent Check for Updates. */
export const CODEX_DOCUMENTATION_URL = 'https://developers.openai.com/codex'
/** Official File / View items (github.com/openai/codex#26890 Close / Toggle Full Screen). */
export const FILE_CLOSE_LABEL = 'Close'
/** Official commands table (learn.chatgpt.com/docs/reference/commands). File menu stays Close. */
export const CLOSE_CURRENT_TAB_OR_WINDOW_LABEL = 'Close current tab or window'
/** Official File menu (github.com/openai/codex#12773 / #26890 New Window, ⌘⇧N). */
export const NEW_WINDOW_LABEL = 'New window'
export const TOGGLE_FULL_SCREEN_LABEL = 'Toggle Full Screen'
/** Official Edit menu (github.com/openai/codex#26890 standard Electron role items). */
export const UNDO_LABEL = 'Undo'
export const REDO_LABEL = 'Redo'
export const CUT_LABEL = 'Cut'
export const PASTE_LABEL = 'Paste'
export const SELECT_ALL_LABEL = 'Select All'
/** 官方 View 菜单（对标 Codex #30659 / #37104 Open Terminal / Open Browser Tab / Focus Browser Address Bar / Reload Browser Page / Find / Previous Chat / Next Chat / Back / Forward） */
export const OPEN_BROWSER_TAB_MENU_LABEL = 'Open Browser Tab'
export const FOCUS_BROWSER_ADDRESS_BAR_MENU_LABEL = 'Focus Browser Address Bar'
export const RELOAD_BROWSER_PAGE_MENU_LABEL = 'Reload Browser Page'
/** Official View menu (github.com/openai/codex#30659 / #37104 Open Terminal). */
export const OPEN_TERMINAL_MENU_LABEL = 'Open Terminal'
export const FIND_MENU_LABEL = 'Find'
export const PREVIOUS_CHAT_MENU_LABEL = 'Previous Chat'
export const NEXT_CHAT_MENU_LABEL = 'Next Chat'
export const BACK_MENU_LABEL = 'Back'
export const FORWARD_MENU_LABEL = 'Forward'

/** 官方快捷键 / 命令面板（对标 developers.openai.com/codex/app/commands） */
export const OPEN_COMMAND_MENU_LABEL = 'Open command menu'
export const OPEN_SETTINGS_LABEL = 'Open settings'
export const OPEN_KEYBOARD_SHORTCUTS_LABEL = 'Open keyboard shortcuts'
export const OPEN_FOLDER_LABEL = 'Open folder'
export const NAVIGATE_BACK_LABEL = 'Navigate back'
export const NAVIGATE_FORWARD_LABEL = 'Navigate forward'
export const INCREASE_FONT_SIZE_LABEL = 'Increase font size'
export const DECREASE_FONT_SIZE_LABEL = 'Decrease font size'
/** 官方 Settings → Keyboard Shortcuts：Decrease reasoning effort（#26819） */
export const DECREASE_REASONING_EFFORT_LABEL = 'Decrease reasoning effort'
/** 官方 Settings → Keyboard Shortcuts：Increase reasoning effort（#26819） */
export const INCREASE_REASONING_EFFORT_LABEL = 'Increase reasoning effort'
/** 官方 Settings → Keyboard Shortcuts：Cycle reasoning effort（无默认绑定） */
export const CYCLE_REASONING_EFFORT_LABEL = 'Cycle reasoning effort'
export const RESET_FONT_SIZE_LABEL = 'Reset font size'
export const TOGGLE_SIDEBAR_LABEL = 'Toggle sidebar'
export const TOGGLE_BOTTOM_PANEL_LABEL = 'Toggle bottom panel'
export const TOGGLE_TERMINAL_LABEL = 'Toggle terminal'
export const CLEAR_TERMINAL_LABEL = 'Clear terminal'
export const UNDO_LAST_APP_ACTION_LABEL = 'Undo last app action'
export const REDO_LAST_APP_ACTION_LABEL = 'Redo last app action'
export const PREVIOUS_CHAT_OR_TAB_LABEL = 'Previous chat or tab'
export const NEXT_CHAT_OR_TAB_LABEL = 'Next chat or tab'
export const OPEN_RECENT_CHAT_LABEL = 'Open recent chat 1–6'
export const GO_TO_CHAT_LABEL = 'Go to chat 1–9'
export const OPEN_MODEL_PICKER_LABEL = 'Open model picker'
export const OPEN_PROJECT_PICKER_LABEL = 'Open project picker'
export const START_VOICE_CHAT_LABEL = 'Start voice chat'
export const START_DICTATION_LABEL = 'Start dictation'
export const RESTORE_PREVIOUS_COMPOSER_PROMPT_LABEL = 'Restore previous composer prompt'
/** 官方 Commands：审批打开时 Enter / Esc（对标 learn.chatgpt.com/docs/reference/commands） */
export const APPROVE_REQUEST_LABEL = 'Approve request'
export const DECLINE_REQUEST_LABEL = 'Decline request'
export const TOGGLE_ACTIVITY_VIEW_LABEL = 'Toggle Activity view'
export const RUN_ENVIRONMENT_ACTION_1_LABEL = 'Run environment action 1'
export const TOGGLE_FILE_TREE_LABEL = 'Toggle file tree'
/** 官方 View 菜单（对标 Codex #20552 View → Toggle File Tree） */
export const TOGGLE_FILE_TREE_MENU_LABEL = 'Toggle File Tree'
export const OPEN_REVIEW_TAB_LABEL = 'Open review tab'
export const TOGGLE_REVIEW_PANEL_LABEL = 'Toggle review panel'
export const OPEN_BROWSER_TAB_LABEL = 'Open browser tab'
export const TOGGLE_BROWSER_PANEL_LABEL = 'Toggle browser panel'
export const GO_TO_LINE_OR_FOCUS_BROWSER_ADDRESS_BAR_LABEL =
  'Go to line or focus browser address bar'
export const BROWSER_BACK_LABEL = 'Browser back'
export const BROWSER_FORWARD_LABEL = 'Browser forward'
export const RELOAD_BROWSER_PAGE_LABEL = 'Reload browser page'
export const RELOAD_BROWSER_PAGE_WITHOUT_CACHE_LABEL = 'Reload browser page without cache'
export const TOGGLE_BROWSER_BROWSE_OR_COMMENT_MODE_LABEL = 'Toggle browser browse or comment mode'
/** 官方 Settings 页名与说明（对标 learn.chatgpt.com/docs/reference/settings） */
/** Official Settings → General. */
export const GENERAL_SETTINGS_INTRO =
  'Require Cmd+Enter for multiline prompts, or turn on Prevent sleep while running so local chats can continue while you step away. Under Follow-up behavior, choose whether a message sent while ChatGPT works should steer the current run or wait for the next run.'
/** Official Settings → Notifications. */
export const NOTIFICATIONS_SETTINGS_INTRO =
  'Choose when turn completion notifications appear, and whether the app should prompt for notification permissions.'
/** Official Settings → Suggested prompts. */
export const SUGGESTED_PROMPTS_INTRO =
  'Use context-aware suggestions to surface follow-ups and tasks you may want to resume when you start or return to ChatGPT.'
/** Official Settings → Archived chats. */
export const ARCHIVED_CHATS_INTRO =
  'The Archived chats section lists archived chats with dates and project context. Use Unarchive to restore a chat.'
/** Official Settings → Personalization. */
export const PERSONALIZATION_SETTINGS_INTRO =
  'Choose Friendly, Pragmatic, or None as your default personality. Use None to disable personality instructions. You can update this at any time.'
export const KEYBOARD_SHORTCUTS_LABEL = 'Keyboard Shortcuts'
/** Official Settings → Keyboard Shortcuts (learn.chatgpt.com/docs/reference/settings). */
export const KEYBOARD_SHORTCUTS_INTRO =
  'Open Keyboard Shortcuts to review commands, change bindings, or reset custom shortcuts to their defaults.'
export const KEYSTROKE_SEARCH_LABEL = 'Keystroke search'
export const KEYBOARD_SHORTCUTS_SEARCH_PLACEHOLDER = 'Search by command name'
export const KEYSTROKE_SEARCH_PLACEHOLDER = 'Press a key combination'
export const GENERAL_SETTINGS_LABEL = 'General'
export const APPEARANCE_SETTINGS_LABEL = 'Appearance'
export const NOTIFICATIONS_SETTINGS_LABEL = 'Notifications'
export const PERSONALIZATION_SETTINGS_LABEL = 'Personalization'
export const SUGGESTED_PROMPTS_SETTINGS_LABEL = 'Suggested prompts'
export const BROWSER_SETTINGS_LABEL = 'Browser'
/** Official Settings → Worktrees (learn.chatgpt.com/docs/environments/git-worktrees). */
export const WORKTREES_SETTINGS_LABEL = 'Worktrees'
export const WORKTREE_ROOT_LABEL = 'Worktree root'
export const WORKTREES_SETTINGS_INTRO =
  'Codex creates managed worktrees under the Worktree root. Change this limit or set it to 0 to turn off automatic deletion.'
export const MCP_SERVERS_LABEL = 'MCP servers'
/** Official Settings → MCP servers (learn.chatgpt.com/docs/extend/mcp). No OAuth Authenticate. */
export const ADD_SERVER_LABEL = 'Add server'
export const MCP_SERVERS_INTRO =
  'Select Add server. Enter a name, choose STDIO or Streamable HTTP, and provide the server’s command or URL. Save the server, then select Restart. In the composer, type /mcp to view connected servers.'
/** Official MCP transport blurbs (learn.chatgpt.com/docs/extend/mcp). */
export const MCP_STDIO_DESCRIPTION = 'Servers that run as a local process (started by a command).'
export const MCP_HTTP_DESCRIPTION = 'Servers that you access at an address.'
/** Official slash / command palette (learn.chatgpt.com / Codex Open MCP status). */
export const OPEN_MCP_STATUS_LABEL = 'Open MCP status'
/** Official Settings → Profile (learn.chatgpt.com/docs/reference/settings). No longest-task. */
export const PROFILE_SETTINGS_LABEL = 'Profile'
/** Official Archived chats restore (Use Unarchive to restore a chat). */
export const UNARCHIVE_LABEL = 'Unarchive'
/** 官方 Settings → General（对标 learn.chatgpt.com/docs/reference/settings） */
export const SHOW_CONTEXT_WINDOW_USAGE_LABEL = 'Show context window usage'
export const PREVENT_SLEEP_WHILE_RUNNING_LABEL = 'Prevent sleep while running'
export const PREVENT_SLEEP_WHILE_RUNNING_DESCRIPTION =
  'Turn on Prevent sleep while running so local chats can continue while you step away.'
/** Official Window menu (macOS role items; Codex desktop walkthroughs list Minimize / Zoom). Not View Zoom In. */
export const MINIMIZE_LABEL = 'Minimize'
export const WINDOW_ZOOM_LABEL = 'Zoom'
export const BRING_ALL_TO_FRONT_LABEL = 'Bring All to Front'

/** 官方顶栏 Share（对标 Codex #40832） */
export const SHARE_LABEL = 'Share'
/** Official Share snapshot copy (learn.chatgpt.com Use ChatGPT). Local dialog copies only; do not invent Who has access / Copy link upload. */
export const SHARE_SNAPSHOT_INTRO =
  "The snapshot doesn't give other people access to your project or computer."
export const SHARE_SNAPSHOT_CONTENTS =
  "Shared snapshots can include user-visible messages, reasoning summaries, image attachments, images viewed or generated by the agent, and file changes, including paths and diffs. They don't include the original thread's tool calls, shell commands, or tool input or output."
export const SHARE_SNAPSHOT_REVIEW =
  'Review the shared view before sending its link because sensitive content, including file paths, may remain in messages, images, or diffs.'
export const SHARE_LOCAL_COPY_NOTE = 'Copies a redacted snapshot to the clipboard. Does not upload.'
/** 官方顶栏 / 气泡 Fork（对标 Codex conversation fork / `/fork`） */
export const FORK_LABEL = 'Fork'
/** 官方 Goal 进度行按钮（对标 learn.chatgpt.com/docs/long-running-work） */
export const PAUSE_LABEL = 'Pause'
export const RESUME_LABEL = 'Resume'
export const EDIT_LABEL = 'Edit'
export const CLEAR_LABEL = 'Clear'
/** 官方顶栏交接与 composer 芯片（对标 learn.chatgpt.com/docs/environments/git-worktrees） */
export const HAND_OFF_LABEL = 'Hand off'
export const LOCAL_LABEL = 'Local'
export const WORKTREE_LABEL = 'Worktree'
export const CREATE_BRANCH_HERE_LABEL = 'Create branch here'
/** 官方顶栏弹出对话（对标 Codex #15162 Open in Popup Window） */
export const OPEN_IN_POPUP_WINDOW_LABEL = 'Open in Popup Window'
/** 官方 Settings 小节与弹出窗开关（对标 learn.chatgpt.com/docs/reference/settings） */
export const KEEP_A_CHAT_NEAR_YOUR_WORK_LABEL = 'Keep a chat near your work'
/** Official Settings → Keep a chat near your work (learn.chatgpt.com/docs/reference/settings). */
export const KEEP_A_CHAT_NEAR_YOUR_WORK_INTRO =
  'In the ChatGPT desktop app, pop out an active chat into a separate window and place it next to your browser, editor, or design preview. Turn on Always on top when you want the chat to remain visible while you work in another app.'
export const ALWAYS_ON_TOP_LABEL = 'Always on top'
export const ALWAYS_ON_TOP_DESCRIPTION =
  'Turn on Always on top when you want the chat to remain visible while you work in another app.'

/** 顶栏 Copy 子菜单（对标 Codex threadHeader Copy：cwd / session / deeplink / Markdown） */
export function threadCopyMenuItems(): Array<{ action: ThreadCopyAction; title: string }> {
  return [
    { action: 'copy-cwd', title: COPY_WORKING_DIRECTORY_LABEL },
    { action: 'copy-session', title: COPY_SESSION_ID_LABEL },
    { action: 'copy-deeplink', title: COPY_DEEPLINK_LABEL },
    { action: 'copy-markdown', title: COPY_AS_MARKDOWN_LABEL }
  ]
}

export type ThreadMenuAction = 'reveal' | 'copy-markdown' | 'rename' | 'pin' | 'archive'

/** 侧栏线程右键（对标 Codex thread menus / Copy as Markdown） */
export function threadMenuItems(input: {
  pinned?: boolean
  platform?: RevealFolderPlatform
}): Array<{ action: ThreadMenuAction; title: string }> {
  return [
    { action: 'reveal', title: revealInFolderLabel(input.platform) },
    { action: 'copy-markdown', title: COPY_AS_MARKDOWN_LABEL },
    { action: 'rename', title: RENAME_LABEL },
    { action: 'pin', title: input.pinned ? UNPIN_LABEL : PIN_LABEL },
    { action: 'archive', title: ARCHIVE_LABEL }
  ]
}
