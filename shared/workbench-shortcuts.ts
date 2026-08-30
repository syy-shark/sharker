/**
 * Codex 式工作台快捷键匹配（纯逻辑，供 App 与单测共用）。
 * @see shared/ARCH.md
 */
import {
  APPROVE_REQUEST_LABEL,
  ARCHIVE_CHAT_LABEL,
  DECLINE_REQUEST_LABEL,
  BROWSER_BACK_LABEL,
  BROWSER_FORWARD_LABEL,
  CLEAR_ALL_UNREAD_INDICATORS_LABEL,
  CLEAR_TERMINAL_LABEL,
  COPY_BROWSER_URL_LABEL,
  COPY_CHAT_DEEP_LINK_LABEL,
  COPY_CONVERSATION_PATH_LABEL,
  COPY_SESSION_ID_LABEL,
  COPY_WORKING_DIRECTORY_LABEL,
  CYCLE_REASONING_EFFORT_LABEL,
  DECREASE_FONT_SIZE_LABEL,
  DECREASE_REASONING_EFFORT_LABEL,
  FIND_IN_CHAT_LABEL,
  FIND_NEXT_MATCH_LABEL,
  FIND_PREVIOUS_MATCH_LABEL,
  GO_TO_CHAT_LABEL,
  GO_TO_LINE_OR_FOCUS_BROWSER_ADDRESS_BAR_LABEL,
  INCREASE_FONT_SIZE_LABEL,
  INCREASE_REASONING_EFFORT_LABEL,
  MARK_CHAT_AS_UNREAD_LABEL,
  NAVIGATE_BACK_LABEL,
  NAVIGATE_FORWARD_LABEL,
  NEW_CHAT_LABEL,
  NEW_STANDALONE_CHAT_LABEL,
  CLOSE_CURRENT_TAB_OR_WINDOW_LABEL,
  NEW_WINDOW_LABEL,
  NEXT_CHAT_NEEDING_ATTENTION_LABEL,
  NEXT_CHAT_OR_TAB_LABEL,
  OPEN_BROWSER_TAB_LABEL,
  OPEN_COMMAND_MENU_LABEL,
  OPEN_FOLDER_LABEL,
  OPEN_KEYBOARD_SHORTCUTS_LABEL,
  OPEN_MODEL_PICKER_LABEL,
  OPEN_PROJECT_PICKER_LABEL,
  OPEN_RECENT_CHAT_LABEL,
  OPEN_REVIEW_TAB_LABEL,
  OPEN_SETTINGS_LABEL,
  OPEN_SIDE_CHAT_LABEL,
  PIN_OR_UNPIN_CHAT_LABEL,
  PREVIOUS_CHAT_OR_TAB_LABEL,
  REDO_LAST_APP_ACTION_LABEL,
  RELOAD_BROWSER_PAGE_LABEL,
  RELOAD_BROWSER_PAGE_WITHOUT_CACHE_LABEL,
  RENAME_CHAT_LABEL,
  RESET_FONT_SIZE_LABEL,
  RESTORE_PREVIOUS_COMPOSER_PROMPT_LABEL,
  RUN_ENVIRONMENT_ACTION_1_LABEL,
  SEARCH_CHATS_LABEL,
  SEARCH_FILES_LABEL,
  START_DICTATION_LABEL,
  START_VOICE_CHAT_LABEL,
  TOGGLE_ACTIVITY_VIEW_LABEL,
  TOGGLE_BOTTOM_PANEL_LABEL,
  TOGGLE_BROWSER_BROWSE_OR_COMMENT_MODE_LABEL,
  TOGGLE_BROWSER_PANEL_LABEL,
  TOGGLE_FILE_TREE_LABEL,
  TOGGLE_REVIEW_PANEL_LABEL,
  TOGGLE_SIDEBAR_LABEL,
  TOGGLE_TERMINAL_LABEL,
  UNDO_LAST_APP_ACTION_LABEL
} from './reveal-in-folder'
import { TOGGLE_PLAN_MODE_LABEL } from './composer-submit'

/** 快捷键对应的工作台动作 */
export type WorkbenchShortcutAction =
  | 'toggle_sidebar'
  | 'toggle_review'
  | 'open_review'
  | 'toggle_panel'
  | 'toggle_terminal'
  | 'new_conversation'
  | 'open_settings'
  | 'open_folder'
  | 'command_palette'
  | 'prev_thread'
  | 'next_thread'
  | 'toggle_files'
  | 'toggle_browser'
  | 'pick_model'
  | 'shortcut_help'
  | 'select_chat'
  | 'select_recent'
  | 'search_chats'
  | 'toggle_agents'
  | 'toggle_activity'
  | 'nav_back'
  | 'nav_forward'
  | 'font_larger'
  | 'font_smaller'
  | 'font_reset'
  | 'clear_terminal'
  | 'clear_unread'
  | 'archive_thread'
  | 'side_conversation'
  | 'search_files'
  | 'open_browser'
  | 'next_attention'
  | 'rename_conversation'
  | 'pin_conversation'
  | 'mark_unread'
  | 'standalone_conversation'
  | 'new_window'
  | 'copy_cwd'
  | 'copy_session_id'
  | 'copy_conversation_path'
  | 'copy_deep_link'
  | 'open_project_picker'
  | 'copy_last_output'
  | 'thinking_lower'
  | 'thinking_higher'
  | 'thinking_cycle'
  | 'undo_app'
  | 'redo_app'
  | 'interrupt_turn'
  | 'run_environment_action'

/** 默认和弦匹配（不含用户覆盖）。对外请用 `keymap.matchWorkbenchShortcut`。 */
export function matchDefaultWorkbenchShortcut(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}): WorkbenchShortcutAction | null {
  if (event.isComposing) return null
  if (
    event.key === 'Escape' &&
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    return 'clear_unread'
  }
  if (
    event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    (event.key === ',' || event.key === '.')
  ) {
    return event.key === ',' ? 'thinking_lower' : 'thinking_higher'
  }
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const code = event.code ?? ''
  // 对标 Codex：⌃Tab / ⌃⇧Tab 切对话；⌘Tab 留给系统切应用。浏览器聚焦时由 App 放行。
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (key === 'Tab' || key === 'tab')
  ) {
    return event.shiftKey ? 'prev_thread' : 'next_thread'
  }
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (key === 'PageUp' || key === 'pageup')
  ) {
    return 'prev_thread'
  }
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (key === 'PageDown' || key === 'pagedown')
  ) {
    return 'next_thread'
  }

  if (key === 'b' && event.altKey && !event.shiftKey) return 'toggle_review'
  if (key === 'u' && event.altKey && event.shiftKey) return 'toggle_agents'
  if (key === 'u' && event.altKey && !event.shiftKey) return 'toggle_activity'
  if (
    key === 'g' &&
    event.shiftKey &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    return 'open_review'
  }
  // 官方 Search chats 默认不绑；⌘G 留给 Find next（对话或审查）
  if (key === 'z' && event.shiftKey && !event.altKey) return 'redo_app'
  if (key === 'z' && !event.shiftKey && !event.altKey) return 'undo_app'
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    return 'redo_app'
  }
  if (key === 'k' && !event.altKey && !event.shiftKey) return 'command_palette'
  if (key === 'p' && event.shiftKey && !event.altKey) return 'command_palette'
  if (key === 'p' && !event.altKey && !event.shiftKey) return 'search_files'
  if (key === 't' && !event.altKey && !event.shiftKey) return 'open_browser'
  if (key === 'a' && event.shiftKey && !event.altKey) return 'archive_thread'
  if (key === 'a' && event.altKey && !event.shiftKey) return 'next_attention'
  if (key === 's' && event.altKey && !event.shiftKey) return 'side_conversation'
  if (key === 'o' && event.altKey && event.shiftKey) return 'open_project_picker'
  if (key === 'o' && event.altKey && !event.shiftKey) return 'standalone_conversation'
  if (key === 'n' && event.altKey && !event.shiftKey) return 'standalone_conversation'
  if (key === 'n' && event.shiftKey && !event.altKey) return 'new_window'
  if (key === 'r' && event.altKey && !event.shiftKey) return 'rename_conversation'
  if (key === 'p' && event.altKey && !event.shiftKey) return 'pin_conversation'
  if (key === 'u' && event.shiftKey && !event.altKey) return 'mark_unread'
  if (key === 'c' && event.altKey && event.shiftKey) return 'copy_conversation_path'
  if (key === 'c' && event.altKey && !event.shiftKey) return 'copy_session_id'
  if (key === 'l' && event.altKey && !event.shiftKey) return 'copy_deep_link'
  if (key === 'c' && event.shiftKey && !event.altKey) return 'copy_cwd'
  if (key === 'b' && !event.altKey && !event.shiftKey) return 'toggle_sidebar'
  if ((key === '`' || code === 'Backquote') && !event.altKey && !event.shiftKey) {
    return 'toggle_terminal'
  }
  if (key === 'j' && !event.altKey && !event.shiftKey) return 'toggle_panel'
  if (key === 'e' && event.shiftKey && !event.altKey) return 'toggle_files'
  if (key === 'b' && event.shiftKey && !event.altKey) return 'toggle_browser'
  // ⌘⇧D 跑第一条 Local environment action；Ctrl⇧D 留给听写（对标 Codex）
  if (key === 'd' && event.shiftKey && !event.altKey && event.metaKey) {
    return 'run_environment_action'
  }
  if (
    key === 'm' &&
    event.shiftKey &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    return 'pick_model'
  }
  if ((key === '/' || key === '?') && !event.altKey) return 'shortcut_help'
  if (event.altKey && !event.shiftKey && /^[1-6]$/.test(key)) return 'select_recent'
  if (!event.altKey && !event.shiftKey && /^[1-9]$/.test(key)) return 'select_chat'
  if (event.altKey && !event.shiftKey && (key === 'ArrowLeft' || key === 'arrowleft')) {
    return 'prev_thread'
  }
  if (event.altKey && !event.shiftKey && (key === 'ArrowRight' || key === 'arrowright')) {
    return 'next_thread'
  }
  if (key === 'n' && !event.altKey && !event.shiftKey) return 'new_conversation'
  if (key === 'o' && event.shiftKey && !event.altKey) return 'new_conversation'
  if (key === ',' && !event.altKey && !event.shiftKey) return 'open_settings'
  if (key === 'o' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    return 'copy_last_output'
  }
  if (key === 'o' && !event.altKey && !event.shiftKey) return 'open_folder'
  if (
    !event.altKey &&
    !event.shiftKey &&
    (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd')
  ) {
    return 'font_larger'
  }
  if (
    !event.altKey &&
    !event.shiftKey &&
    (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract')
  ) {
    return 'font_smaller'
  }
  if (
    !event.altKey &&
    !event.shiftKey &&
    (key === '0' || code === 'Numpad0')
  ) {
    return 'font_reset'
  }
  if (
    event.shiftKey &&
    !event.altKey &&
    (code === 'BracketLeft' || key === '[' || key === '{')
  ) {
    return 'prev_thread'
  }
  if (
    event.shiftKey &&
    !event.altKey &&
    (code === 'BracketRight' || key === ']' || key === '}')
  ) {
    return 'next_thread'
  }
  if (!event.shiftKey && !event.altKey && (code === 'BracketLeft' || key === '[')) {
    return 'nav_back'
  }
  if (!event.shiftKey && !event.altKey && (code === 'BracketRight' || key === ']')) {
    return 'nav_forward'
  }
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (key === 'l' || key === 'L')
  ) {
    return 'clear_terminal'
  }
  return null
}

/** 终端聚焦时 ⌘K / Ctrl+K 清屏（对标 Codex：Clear the terminal when focused） */
export function isTerminalClearChord(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}): boolean {
  if (event.isComposing) return false
  if (event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  return key === 'k'
}

/** 事件是否落在集成终端（含 xterm 隐藏 textarea） */
export function isEmbeddedTerminalTarget(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null
  if (!el || typeof el.closest !== 'function') return false
  return Boolean(el.closest('.embedded-terminal-shell, .embedded-terminal, .xterm'))
}

/**
 * ⌘⌥B 开关审查面板；⌃⇧G 只打开审查标签（对标 Codex Toggle review panel / Open review tab）。
 * 打开时始终切到审查 Tab；关掉时不必改 Tab。
 */
export function shouldOpenReviewPanel(
  action: 'toggle_review' | 'open_review',
  current: { open: boolean; tab: string }
): boolean {
  if (action === 'open_review') return true
  return !(current.open && current.tab === 'changes')
}

/** 在当前项目对话列表里循环切到上一条 / 下一条（对标 Codex ⌘⇧[ / ⌘⇧]） */
export function adjacentConversationId(
  ids: string[],
  current: string | null,
  direction: -1 | 1
): string | null {
  if (ids.length === 0) return null
  if (!current) return ids[0] ?? null
  const idx = ids.indexOf(current)
  if (idx < 0) return ids[0] ?? null
  return ids[(idx + direction + ids.length) % ids.length] ?? null
}

/** ⌘/ 快捷键一览（对标 Codex Shortcuts window） */
export const WORKBENCH_SHORTCUT_HELP: Array<{ keys: string; title: string }> = [
  { keys: '⌘B', title: TOGGLE_SIDEBAR_LABEL },
  { keys: '⌘⌥B', title: TOGGLE_REVIEW_PANEL_LABEL },
  { keys: '⌃⇧G', title: OPEN_REVIEW_TAB_LABEL },
  { keys: '⌘Z / ⌘⇧Z', title: `${UNDO_LAST_APP_ACTION_LABEL} / ${REDO_LAST_APP_ACTION_LABEL}` },
  { keys: '⌘⌥U', title: TOGGLE_ACTIVITY_VIEW_LABEL },
  { keys: '⌘⌥⇧U', title: '子 Agent 活动' },
  { keys: '⌘J', title: TOGGLE_BOTTOM_PANEL_LABEL },
  { keys: 'Ctrl+`', title: TOGGLE_TERMINAL_LABEL },
  { keys: '⌘⇧E', title: TOGGLE_FILE_TREE_LABEL },
  { keys: '⌘⇧D', title: RUN_ENVIRONMENT_ACTION_1_LABEL },
  { keys: '⌘⇧B', title: TOGGLE_BROWSER_PANEL_LABEL },
  { keys: '⌘K', title: OPEN_COMMAND_MENU_LABEL },
  { keys: '⌘N / ⌘⇧O', title: NEW_CHAT_LABEL },
  { keys: '⌘⇧N', title: NEW_WINDOW_LABEL },
  { keys: '⌘⌥O / ⌘⌥N', title: NEW_STANDALONE_CHAT_LABEL },
  { keys: '⌘⌥⇧O', title: OPEN_PROJECT_PICKER_LABEL },
  { keys: '⌘⌥R', title: RENAME_CHAT_LABEL },
  { keys: '⌘⌥P', title: PIN_OR_UNPIN_CHAT_LABEL },
  { keys: '⌘⇧U', title: MARK_CHAT_AS_UNREAD_LABEL },
  { keys: '⌘⇧C', title: `${COPY_WORKING_DIRECTORY_LABEL} / ${COPY_BROWSER_URL_LABEL}` },
  { keys: '⌘⌥C', title: COPY_SESSION_ID_LABEL },
  { keys: '⌘⌥L', title: COPY_CHAT_DEEP_LINK_LABEL },
  { keys: '⌘⌥⇧C', title: COPY_CONVERSATION_PATH_LABEL },
  { keys: '⌘[ / ⌘]', title: `${NAVIGATE_BACK_LABEL} / ${NAVIGATE_FORWARD_LABEL}` },
  { keys: '⌘+ / ⌘-', title: `${INCREASE_FONT_SIZE_LABEL} / ${DECREASE_FONT_SIZE_LABEL}` },
  { keys: '⌘0', title: RESET_FONT_SIZE_LABEL },
  { keys: 'Ctrl+L / ⌘K（终端聚焦）', title: CLEAR_TERMINAL_LABEL },
  { keys: '⌘⇧[ / ⌘⇧] / ⌃Tab / ⌃⇧Tab', title: `${PREVIOUS_CHAT_OR_TAB_LABEL} / ${NEXT_CHAT_OR_TAB_LABEL}` },
  { keys: '⌘1–9', title: GO_TO_CHAT_LABEL },
  { keys: '⌘⌥1–6', title: OPEN_RECENT_CHAT_LABEL },
  { keys: '⌘⌥← / ⌘⌥→', title: `${PREVIOUS_CHAT_OR_TAB_LABEL} / ${NEXT_CHAT_OR_TAB_LABEL}` },
  { keys: '⌘/', title: OPEN_KEYBOARD_SHORTCUTS_LABEL },
  { keys: '⇧Esc', title: CLEAR_ALL_UNREAD_INDICATORS_LABEL },
  { keys: '⌘⇧A', title: ARCHIVE_CHAT_LABEL },
  { keys: '⌘⌥S', title: OPEN_SIDE_CHAT_LABEL },
  { keys: '⌘⌥A', title: NEXT_CHAT_NEEDING_ATTENTION_LABEL },
  { keys: '⌘P', title: SEARCH_FILES_LABEL },
  { keys: '⌘W', title: CLOSE_CURRENT_TAB_OR_WINDOW_LABEL },
  { keys: '⌘T', title: OPEN_BROWSER_TAB_LABEL },
  {
    keys: '⌘R / ⌘⇧R',
    title: `${RELOAD_BROWSER_PAGE_LABEL} / ${RELOAD_BROWSER_PAGE_WITHOUT_CACHE_LABEL}`
  },
  { keys: '⌘.', title: TOGGLE_BROWSER_BROWSE_OR_COMMENT_MODE_LABEL },
  { keys: '⌘L', title: GO_TO_LINE_OR_FOCUS_BROWSER_ADDRESS_BAR_LABEL },
  { keys: '鼠标侧键', title: `${BROWSER_BACK_LABEL} / ${BROWSER_FORWARD_LABEL}` },
  { keys: '⌘↑ / ⌘↓ / Home / End', title: '对话顶 / 底' },
  { keys: '↑↓ / PgUp / Space', title: '点对话柱后滚动（不抢输入框）' },
  { keys: '⌘F', title: FIND_IN_CHAT_LABEL },
  { keys: '⌘G / ⌘⇧G', title: `${FIND_NEXT_MATCH_LABEL} / ${FIND_PREVIOUS_MATCH_LABEL}` },
  { keys: 'Ctrl⇧M', title: OPEN_MODEL_PICKER_LABEL },
  { keys: 'Ctrl⇧D', title: START_DICTATION_LABEL },
  { keys: 'Ctrl⇧V', title: START_VOICE_CHAT_LABEL },
  { keys: '↑', title: RESTORE_PREVIOUS_COMPOSER_PROMPT_LABEL },
  { keys: 'Enter', title: APPROVE_REQUEST_LABEL },
  { keys: 'Esc', title: DECLINE_REQUEST_LABEL },
  { keys: 'Enter', title: '发送；忙时按设置 Queue 或 Steer' },
  { keys: 'Esc', title: '停止当前回合（可改绑；IME 选词不触发）' },
  { keys: '⌘⇧Enter', title: '忙时使用另一种后续行为' },
  { keys: 'Tab', title: '忙时 Queue 下一条' },
  { keys: 'Shift+Tab', title: TOGGLE_PLAN_MODE_LABEL },
  { keys: '⌥, / ⌥.', title: `${DECREASE_REASONING_EFFORT_LABEL} / ${INCREASE_REASONING_EFFORT_LABEL}` },
  { keys: 'Shift+Enter', title: '换行' }
]

/** 设置 → 键盘快捷键：可改绑的动作与默认展示 */
export const SHORTCUT_CATALOG: Array<{
  action: WorkbenchShortcutAction
  title: string
  defaultKeys: string
  defaultChord?: string | string[]
}> = [
  { action: 'command_palette', title: OPEN_COMMAND_MENU_LABEL, defaultKeys: '⌘K', defaultChord: 'mod+k' },
  { action: 'open_settings', title: OPEN_SETTINGS_LABEL, defaultKeys: '⌘,', defaultChord: 'mod+,' },
  {
    action: 'shortcut_help',
    title: OPEN_KEYBOARD_SHORTCUTS_LABEL,
    defaultKeys: '⌘/ 或 ⌘⇧/',
    defaultChord: ['mod+/', 'mod+shift+/']
  },
  { action: 'open_folder', title: OPEN_FOLDER_LABEL, defaultKeys: '⌘O', defaultChord: 'mod+o' },
  { action: 'nav_back', title: NAVIGATE_BACK_LABEL, defaultKeys: '⌘[', defaultChord: 'mod+[' },
  { action: 'nav_forward', title: NAVIGATE_FORWARD_LABEL, defaultKeys: '⌘]', defaultChord: 'mod+]' },
  { action: 'font_larger', title: INCREASE_FONT_SIZE_LABEL, defaultKeys: '⌘+', defaultChord: 'mod++' },
  { action: 'font_smaller', title: DECREASE_FONT_SIZE_LABEL, defaultKeys: '⌘-', defaultChord: 'mod+-' },
  { action: 'font_reset', title: RESET_FONT_SIZE_LABEL, defaultKeys: '⌘0', defaultChord: 'mod+0' },
  { action: 'toggle_sidebar', title: TOGGLE_SIDEBAR_LABEL, defaultKeys: '⌘B', defaultChord: 'mod+b' },
  {
    action: 'toggle_review',
    title: TOGGLE_REVIEW_PANEL_LABEL,
    defaultKeys: '⌘⌥B',
    defaultChord: 'mod+alt+b'
  },
  {
    action: 'open_review',
    title: OPEN_REVIEW_TAB_LABEL,
    defaultKeys: '⌃⇧G',
    defaultChord: 'mod+ctrl+shift+g'
  },
  { action: 'undo_app', title: UNDO_LAST_APP_ACTION_LABEL, defaultKeys: '⌘Z', defaultChord: 'mod+z' },
  {
    action: 'redo_app',
    title: REDO_LAST_APP_ACTION_LABEL,
    defaultKeys: '⌘⇧Z / Ctrl+Y',
    defaultChord: ['mod+shift+z', 'mod+ctrl+y']
  },
  {
    action: 'toggle_panel',
    title: TOGGLE_BOTTOM_PANEL_LABEL,
    defaultKeys: '⌘J',
    defaultChord: 'mod+j'
  },
  { action: 'toggle_terminal', title: TOGGLE_TERMINAL_LABEL, defaultKeys: 'Ctrl+`', defaultChord: 'mod+`' },
  {
    action: 'clear_terminal',
    title: CLEAR_TERMINAL_LABEL,
    defaultKeys: 'Ctrl+L / ⌘K（终端聚焦）',
    defaultChord: 'mod+ctrl+l'
  },
  { action: 'toggle_files', title: TOGGLE_FILE_TREE_LABEL, defaultKeys: '⌘⇧E', defaultChord: 'mod+shift+e' },
  {
    action: 'run_environment_action',
    title: RUN_ENVIRONMENT_ACTION_1_LABEL,
    defaultKeys: '⌘⇧D',
    defaultChord: 'mod+shift+d'
  },
  { action: 'toggle_browser', title: TOGGLE_BROWSER_PANEL_LABEL, defaultKeys: '⌘⇧B', defaultChord: 'mod+shift+b' },
  { action: 'open_browser', title: OPEN_BROWSER_TAB_LABEL, defaultKeys: '⌘T', defaultChord: 'mod+t' },
  {
    action: 'toggle_activity',
    title: TOGGLE_ACTIVITY_VIEW_LABEL,
    defaultKeys: '⌘⌥U',
    defaultChord: 'mod+alt+u'
  },
  {
    action: 'toggle_agents',
    title: '子 Agent 活动',
    defaultKeys: '⌘⌥⇧U',
    defaultChord: 'mod+alt+shift+u'
  },
  { action: 'new_conversation', title: NEW_CHAT_LABEL, defaultKeys: '⌘N', defaultChord: ['mod+n', 'mod+shift+o'] },
  {
    action: 'new_window',
    title: NEW_WINDOW_LABEL,
    defaultKeys: '⌘⇧N',
    defaultChord: 'mod+shift+n'
  },
  {
    action: 'standalone_conversation',
    title: NEW_STANDALONE_CHAT_LABEL,
    defaultKeys: '⌘⌥O 或 ⌘⌥N',
    defaultChord: ['mod+alt+o', 'mod+alt+n']
  },
  {
    action: 'open_project_picker',
    title: OPEN_PROJECT_PICKER_LABEL,
    defaultKeys: '⌘⌥⇧O',
    defaultChord: 'mod+alt+shift+o'
  },
  { action: 'side_conversation', title: OPEN_SIDE_CHAT_LABEL, defaultKeys: '⌘⌥S', defaultChord: 'mod+alt+s' },
  { action: 'archive_thread', title: ARCHIVE_CHAT_LABEL, defaultKeys: '⌘⇧A', defaultChord: 'mod+shift+a' },
  { action: 'rename_conversation', title: RENAME_CHAT_LABEL, defaultKeys: '⌘⌥R', defaultChord: 'mod+alt+r' },
  { action: 'pin_conversation', title: PIN_OR_UNPIN_CHAT_LABEL, defaultKeys: '⌘⌥P', defaultChord: 'mod+alt+p' },
  { action: 'mark_unread', title: MARK_CHAT_AS_UNREAD_LABEL, defaultKeys: '⌘⇧U', defaultChord: 'mod+shift+u' },
  { action: 'clear_unread', title: CLEAR_ALL_UNREAD_INDICATORS_LABEL, defaultKeys: '⇧Esc', defaultChord: 'shift+escape' },
  {
    action: 'interrupt_turn',
    title: '停止当前回合',
    defaultKeys: 'Esc',
    defaultChord: 'escape'
  },
  { action: 'search_chats', title: SEARCH_CHATS_LABEL, defaultKeys: '未指定', defaultChord: '' },
  { action: 'search_files', title: SEARCH_FILES_LABEL, defaultKeys: '⌘P', defaultChord: 'mod+p' },
  { action: 'next_attention', title: NEXT_CHAT_NEEDING_ATTENTION_LABEL, defaultKeys: '⌘⌥A', defaultChord: 'mod+alt+a' },
  {
    action: 'prev_thread',
    title: PREVIOUS_CHAT_OR_TAB_LABEL,
    defaultKeys: '⌘⇧[ / ⌃⇧Tab',
    defaultChord: ['mod+shift+[', 'mod+alt+arrowleft', 'mod+ctrl+shift+tab']
  },
  {
    action: 'next_thread',
    title: NEXT_CHAT_OR_TAB_LABEL,
    defaultKeys: '⌘⇧] / ⌃Tab',
    defaultChord: ['mod+shift+]', 'mod+alt+arrowright', 'mod+ctrl+tab']
  },
  { action: 'select_chat', title: GO_TO_CHAT_LABEL, defaultKeys: '⌘1–9' },
  { action: 'select_recent', title: OPEN_RECENT_CHAT_LABEL, defaultKeys: '⌘⌥1–6' },
  { action: 'pick_model', title: OPEN_MODEL_PICKER_LABEL, defaultKeys: 'Ctrl⇧M', defaultChord: 'mod+ctrl+shift+m' },
  { action: 'copy_cwd', title: COPY_WORKING_DIRECTORY_LABEL, defaultKeys: '⌘⇧C', defaultChord: 'mod+shift+c' },
  { action: 'copy_session_id', title: COPY_SESSION_ID_LABEL, defaultKeys: '⌘⌥C', defaultChord: 'mod+alt+c' },
  {
    action: 'copy_conversation_path',
    title: COPY_CONVERSATION_PATH_LABEL,
    defaultKeys: '⌘⌥⇧C',
    defaultChord: 'mod+alt+shift+c'
  },
  {
    action: 'copy_deep_link',
    title: COPY_CHAT_DEEP_LINK_LABEL,
    defaultKeys: '⌘⌥L',
    defaultChord: 'mod+alt+l'
  },
  {
    action: 'copy_last_output',
    title: '复制上一条助手回复',
    defaultKeys: 'Ctrl+O',
    defaultChord: 'mod+ctrl+o'
  },
  { action: 'thinking_lower', title: DECREASE_REASONING_EFFORT_LABEL, defaultKeys: '⌥,', defaultChord: 'alt+,' },
  { action: 'thinking_higher', title: INCREASE_REASONING_EFFORT_LABEL, defaultKeys: '⌥.', defaultChord: 'alt+.' },
  {
    action: 'thinking_cycle',
    title: CYCLE_REASONING_EFFORT_LABEL,
    defaultKeys: '未指定',
    defaultChord: ''
  }
]
