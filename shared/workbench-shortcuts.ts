/**
 * Codex 式工作台快捷键匹配（纯逻辑，供 App 与单测共用）。
 * @see shared/ARCH.md
 */

/** 快捷键对应的工作台动作 */
export type WorkbenchShortcutAction =
  | 'toggle_sidebar'
  | 'toggle_review'
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
  | 'search_chats'
  | 'toggle_agents'

/** 从键盘事件字段匹配动作；输入法组字中不触发 */
export function matchWorkbenchShortcut(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}): WorkbenchShortcutAction | null {
  if (event.isComposing) return null
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const code = event.code ?? ''

  if (key === 'b' && event.altKey && !event.shiftKey) return 'toggle_review'
  if (key === 'u' && event.altKey && !event.shiftKey) return 'toggle_agents'
  if (key === 'g' && event.shiftKey && !event.altKey) return 'toggle_review'
  if (key === 'g' && !event.shiftKey && !event.altKey) return 'search_chats'
  if (key === 'k' && !event.altKey && !event.shiftKey) return 'command_palette'
  if (key === 'p' && event.shiftKey && !event.altKey) return 'command_palette'
  if (key === 'b' && !event.altKey && !event.shiftKey) return 'toggle_sidebar'
  if ((key === '`' || code === 'Backquote') && !event.altKey && !event.shiftKey) {
    return 'toggle_terminal'
  }
  if (key === 'j' && !event.altKey && !event.shiftKey) return 'toggle_terminal'
  if (key === 'e' && event.shiftKey && !event.altKey) return 'toggle_files'
  if (key === 'b' && event.shiftKey && !event.altKey) return 'toggle_browser'
  if (key === 'm' && event.shiftKey && !event.altKey) return 'pick_model'
  if (key === '/' && !event.altKey && !event.shiftKey) return 'shortcut_help'
  if (!event.altKey && !event.shiftKey && /^[1-9]$/.test(key)) return 'select_chat'
  if (key === 'n' && !event.altKey && !event.shiftKey) return 'new_conversation'
  if (key === ',' && !event.altKey && !event.shiftKey) return 'open_settings'
  if (key === 'o' && !event.altKey && !event.shiftKey) return 'open_folder'
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
  return null
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
  { keys: '⌘⌥B', title: '打开审查' },
  { keys: '⌘⌥U', title: '子 Agent 活动' },
  { keys: '⌘J / Ctrl+`', title: '打开终端' },
  { keys: '⌘⇧E', title: '打开文件树' },
  { keys: '⌘⇧B', title: '打开内置浏览器' },
  { keys: '⌘K', title: '命令面板' },
  { keys: '⌘N', title: '新对话' },
  { keys: '⌘⇧[ / ⌘⇧]', title: '上一条 / 下一条对话' },
  { keys: '⌘1–9', title: '跳到第 N 条对话' },
  { keys: '⌘/', title: '快捷键一览' },
  { keys: '⌘F', title: '在对话中查找' },
  { keys: '⌘G', title: '搜索对话' },
  { keys: 'Ctrl⇧M', title: '模型选择' },
  { keys: 'Ctrl⇧D', title: '听写' },
  { keys: 'Ctrl⇧V', title: '语音对话' },
  { keys: '↑', title: '空输入时恢复上一条' },
  { keys: 'Enter', title: '发送；忙时注入当前回合' },
  { keys: 'Tab', title: '忙时排队下一条' },
  { keys: 'Shift+Enter', title: '换行' }
]
