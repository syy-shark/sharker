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

/** 从键盘事件字段匹配动作；输入法组字中不触发 */
export function matchWorkbenchShortcut(event: {
  key: string
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

  if (key === 'b' && event.altKey && !event.shiftKey) return 'toggle_review'
  if (key === 'g' && event.shiftKey && !event.altKey) return 'toggle_review'
  if (key === 'k' && !event.altKey && !event.shiftKey) return 'command_palette'
  if (key === 'p' && event.shiftKey && !event.altKey) return 'command_palette'
  if (key === 'b' && !event.altKey && !event.shiftKey) return 'toggle_sidebar'
  if (key === 'j' && !event.altKey && !event.shiftKey) return 'toggle_terminal'
  if (key === 'n' && !event.altKey && !event.shiftKey) return 'new_conversation'
  if (key === ',' && !event.altKey && !event.shiftKey) return 'open_settings'
  if (key === 'o' && !event.altKey && !event.shiftKey) return 'open_folder'
  return null
}
