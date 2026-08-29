/**
 * Codex 式工作台快捷键匹配（纯逻辑，供 App 与单测共用）。
 * @see shared/ARCH.md
 */
import {
  COPY_BROWSER_URL_LABEL,
  COPY_CHAT_DEEP_LINK_LABEL,
  COPY_CONVERSATION_PATH_LABEL,
  COPY_SESSION_ID_LABEL,
  COPY_WORKING_DIRECTORY_LABEL
} from './reveal-in-folder'

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
  | 'copy_cwd'
  | 'copy_session_id'
  | 'copy_conversation_path'
  | 'copy_deep_link'
  | 'open_project_picker'
  | 'copy_last_output'
  | 'thinking_lower'
  | 'thinking_higher'
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
  { keys: '⌘B', title: '切换侧栏' },
  { keys: '⌘⌥B', title: '开关审查面板' },
  { keys: '⌃⇧G', title: '打开审查' },
  { keys: '⌘Z / ⌘⇧Z', title: '撤销 / 重做上一次应用操作' },
  { keys: '⌘⌥U', title: '活动视图' },
  { keys: '⌘⌥⇧U', title: '子 Agent 活动' },
  { keys: '⌘J', title: '开关工作区面板' },
  { keys: 'Ctrl+`', title: '开关终端' },
  { keys: '⌘⇧E', title: '开关文件树' },
  { keys: '⌘⇧D', title: '运行环境动作 1' },
  { keys: '⌘⇧B', title: '开关内置浏览器' },
  { keys: '⌘K', title: '命令面板' },
  { keys: '⌘N / ⌘⇧O', title: '新对话' },
  { keys: '⌘⌥O / ⌘⌥N', title: '独立新对话' },
  { keys: '⌘⌥⇧O', title: '打开项目选择器' },
  { keys: '⌘⌥R', title: '重命名对话' },
  { keys: '⌘⌥P', title: '置顶 / 取消置顶' },
  { keys: '⌘⇧U', title: '标为未读' },
  { keys: '⌘⇧C', title: `${COPY_WORKING_DIRECTORY_LABEL} / ${COPY_BROWSER_URL_LABEL}` },
  { keys: '⌘⌥C', title: COPY_SESSION_ID_LABEL },
  { keys: '⌘⌥L', title: COPY_CHAT_DEEP_LINK_LABEL },
  { keys: '⌘⌥⇧C', title: COPY_CONVERSATION_PATH_LABEL },
  { keys: '⌘[ / ⌘]', title: '后退 / 前进' },
  { keys: '⌘+ / ⌘-', title: '放大 / 缩小字号' },
  { keys: '⌘0', title: '重置字号' },
  { keys: 'Ctrl+L / ⌘K（终端聚焦）', title: '清终端' },
  { keys: '⌘⇧[ / ⌘⇧] / ⌃Tab / ⌃⇧Tab', title: '上一条 / 下一条对话' },
  { keys: '⌘1–9', title: '跳到第 N 条对话' },
  { keys: '⌘⌥1–6', title: '最近对话 1–6' },
  { keys: '⌘⌥← / ⌘⌥→', title: '上一条 / 下一条对话' },
  { keys: '⌘/', title: '快捷键一览' },
  { keys: '⇧Esc', title: '清未读徽标' },
  { keys: '⌘⇧A', title: '归档当前对话' },
  { keys: '⌘⌥S', title: '旁路新线程' },
  { keys: '⌘⌥A', title: '下一条进行中对话' },
  { keys: '⌘P', title: '引用工作区文件' },
  { keys: '⌘W', title: '关闭右侧面板' },
  { keys: '⌘T', title: '打开浏览器标签' },
  { keys: '⌘R / ⌘⇧R', title: '浏览器刷新 / 无缓存刷新（聚焦时）' },
  { keys: '⌘.', title: '浏览 / 批注（浏览器聚焦）' },
  { keys: '⌘L', title: '跳到行 / 浏览器地址栏（视焦点）' },
  { keys: '鼠标侧键', title: '后退 / 前进' },
  { keys: '⌘↑ / ⌘↓ / Home / End', title: '对话顶 / 底' },
  { keys: '↑↓ / PgUp / Space', title: '点对话柱后滚动（不抢输入框）' },
  { keys: '⌘F', title: '在对话或审查中查找' },
  { keys: '⌘G / ⌘⇧G', title: '查找下一条 / 上一条（对话或审查）' },
  { keys: 'Ctrl⇧M', title: '模型选择' },
  { keys: 'Ctrl⇧D', title: '听写' },
  { keys: 'Ctrl⇧V', title: '语音对话' },
  { keys: '↑', title: '空输入时恢复上一条' },
  { keys: 'Enter', title: '发送；忙时按设置 Queue 或 Steer' },
  { keys: 'Esc', title: '停止当前回合（可改绑；IME 选词不触发）' },
  { keys: '⌘⇧Enter', title: '忙时使用另一种后续行为' },
  { keys: 'Tab', title: '忙时 Queue 下一条' },
  { keys: 'Shift+Tab', title: '输入框内切换计划模式' },
  { keys: 'Shift+Enter', title: '换行' }
]

/** 设置 → 键盘快捷键：可改绑的动作与默认展示 */
export const SHORTCUT_CATALOG: Array<{
  action: WorkbenchShortcutAction
  title: string
  defaultKeys: string
  defaultChord?: string | string[]
}> = [
  { action: 'command_palette', title: '命令面板', defaultKeys: '⌘K', defaultChord: 'mod+k' },
  { action: 'open_settings', title: '打开设置', defaultKeys: '⌘,', defaultChord: 'mod+,' },
  {
    action: 'shortcut_help',
    title: '键盘快捷键',
    defaultKeys: '⌘/ 或 ⌘⇧/',
    defaultChord: ['mod+/', 'mod+shift+/']
  },
  { action: 'open_folder', title: '打开文件夹', defaultKeys: '⌘O', defaultChord: 'mod+o' },
  { action: 'nav_back', title: '后退', defaultKeys: '⌘[', defaultChord: 'mod+[' },
  { action: 'nav_forward', title: '前进', defaultKeys: '⌘]', defaultChord: 'mod+]' },
  { action: 'font_larger', title: '放大字号', defaultKeys: '⌘+', defaultChord: 'mod++' },
  { action: 'font_smaller', title: '缩小字号', defaultKeys: '⌘-', defaultChord: 'mod+-' },
  { action: 'font_reset', title: '重置字号', defaultKeys: '⌘0', defaultChord: 'mod+0' },
  { action: 'toggle_sidebar', title: '切换侧栏', defaultKeys: '⌘B', defaultChord: 'mod+b' },
  {
    action: 'toggle_review',
    title: '开关审查面板',
    defaultKeys: '⌘⌥B',
    defaultChord: 'mod+alt+b'
  },
  {
    action: 'open_review',
    title: '打开审查',
    defaultKeys: '⌃⇧G',
    defaultChord: 'mod+ctrl+shift+g'
  },
  { action: 'undo_app', title: '撤销上一次应用操作', defaultKeys: '⌘Z', defaultChord: 'mod+z' },
  {
    action: 'redo_app',
    title: '重做上一次应用操作',
    defaultKeys: '⌘⇧Z / Ctrl+Y',
    defaultChord: ['mod+shift+z', 'mod+ctrl+y']
  },
  {
    action: 'toggle_panel',
    title: '开关工作区面板',
    defaultKeys: '⌘J',
    defaultChord: 'mod+j'
  },
  { action: 'toggle_terminal', title: '开关终端', defaultKeys: 'Ctrl+`', defaultChord: 'mod+`' },
  {
    action: 'clear_terminal',
    title: '清终端',
    defaultKeys: 'Ctrl+L / ⌘K（终端聚焦）',
    defaultChord: 'mod+ctrl+l'
  },
  { action: 'toggle_files', title: '开关文件树', defaultKeys: '⌘⇧E', defaultChord: 'mod+shift+e' },
  {
    action: 'run_environment_action',
    title: '运行环境动作 1',
    defaultKeys: '⌘⇧D',
    defaultChord: 'mod+shift+d'
  },
  { action: 'toggle_browser', title: '开关内置浏览器', defaultKeys: '⌘⇧B', defaultChord: 'mod+shift+b' },
  { action: 'open_browser', title: '打开浏览器标签', defaultKeys: '⌘T', defaultChord: 'mod+t' },
  {
    action: 'toggle_activity',
    title: '活动视图',
    defaultKeys: '⌘⌥U',
    defaultChord: 'mod+alt+u'
  },
  {
    action: 'toggle_agents',
    title: '子 Agent 活动',
    defaultKeys: '⌘⌥⇧U',
    defaultChord: 'mod+alt+shift+u'
  },
  { action: 'new_conversation', title: '新对话', defaultKeys: '⌘N', defaultChord: ['mod+n', 'mod+shift+o'] },
  {
    action: 'standalone_conversation',
    title: '独立新对话',
    defaultKeys: '⌘⌥O 或 ⌘⌥N',
    defaultChord: ['mod+alt+o', 'mod+alt+n']
  },
  {
    action: 'open_project_picker',
    title: '打开项目选择器',
    defaultKeys: '⌘⌥⇧O',
    defaultChord: 'mod+alt+shift+o'
  },
  { action: 'side_conversation', title: '旁路新线程', defaultKeys: '⌘⌥S', defaultChord: 'mod+alt+s' },
  { action: 'archive_thread', title: '归档当前对话', defaultKeys: '⌘⇧A', defaultChord: 'mod+shift+a' },
  { action: 'rename_conversation', title: '重命名对话', defaultKeys: '⌘⌥R', defaultChord: 'mod+alt+r' },
  { action: 'pin_conversation', title: '置顶 / 取消置顶', defaultKeys: '⌘⌥P', defaultChord: 'mod+alt+p' },
  { action: 'mark_unread', title: '标为未读', defaultKeys: '⌘⇧U', defaultChord: 'mod+shift+u' },
  { action: 'clear_unread', title: '清除未读徽标', defaultKeys: '⇧Esc', defaultChord: 'shift+escape' },
  {
    action: 'interrupt_turn',
    title: '停止当前回合',
    defaultKeys: 'Esc',
    defaultChord: 'escape'
  },
  { action: 'search_chats', title: '搜索对话', defaultKeys: '未指定', defaultChord: '' },
  { action: 'search_files', title: '引用工作区文件', defaultKeys: '⌘P', defaultChord: 'mod+p' },
  { action: 'next_attention', title: '下一条进行中对话', defaultKeys: '⌘⌥A', defaultChord: 'mod+alt+a' },
  {
    action: 'prev_thread',
    title: '上一条对话',
    defaultKeys: '⌘⇧[ / ⌃⇧Tab',
    defaultChord: ['mod+shift+[', 'mod+alt+arrowleft', 'mod+ctrl+shift+tab']
  },
  {
    action: 'next_thread',
    title: '下一条对话',
    defaultKeys: '⌘⇧] / ⌃Tab',
    defaultChord: ['mod+shift+]', 'mod+alt+arrowright', 'mod+ctrl+tab']
  },
  { action: 'select_chat', title: '跳到第 N 条对话', defaultKeys: '⌘1–9' },
  { action: 'select_recent', title: '最近对话 1–6', defaultKeys: '⌘⌥1–6' },
  { action: 'pick_model', title: '模型选择', defaultKeys: 'Ctrl⇧M', defaultChord: 'mod+ctrl+shift+m' },
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
  { action: 'thinking_lower', title: '降低思考档', defaultKeys: '⌥,', defaultChord: 'alt+,' },
  { action: 'thinking_higher', title: '提高思考档', defaultKeys: '⌥.', defaultChord: 'alt+.' }
]
