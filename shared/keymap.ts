/**
 * 可改快捷键：和弦编码 / 覆盖匹配（对标 Codex Settings → Keyboard Shortcuts）。
 * @see shared/ARCH.md
 */
import {
  matchDefaultWorkbenchShortcut,
  type WorkbenchShortcutAction
} from './workbench-shortcuts'

/** 用户覆盖：动作 → `mod+shift+a`；空串表示解除默认 */
export type KeymapOverrides = Partial<Record<WorkbenchShortcutAction, string>>

const ACTION_SET = new Set<string>([
  'toggle_sidebar',
  'toggle_review',
  'toggle_terminal',
  'new_conversation',
  'open_settings',
  'open_folder',
  'command_palette',
  'prev_thread',
  'next_thread',
  'toggle_files',
  'toggle_browser',
  'pick_model',
  'shortcut_help',
  'select_chat',
  'select_recent',
  'search_chats',
  'toggle_agents',
  'nav_back',
  'nav_forward',
  'font_larger',
  'font_smaller',
  'font_reset',
  'clear_terminal',
  'clear_unread',
  'archive_thread',
  'side_conversation',
  'search_files',
  'open_browser',
  'next_attention',
  'rename_conversation',
  'pin_conversation',
  'mark_unread',
  'standalone_conversation',
  'copy_cwd',
  'copy_session_id',
  'copy_conversation_path',
  'copy_deep_link',
  'open_project_picker',
  'copy_last_output',
  'thinking_lower',
  'thinking_higher',
  'undo_app',
  'redo_app'
])

function normalizeKeyName(key: string, code?: string): string {
  if (key === 'Escape') return 'escape'
  if (key === 'ArrowLeft') return 'arrowleft'
  if (key === 'ArrowRight') return 'arrowright'
  if (key === 'ArrowUp') return 'arrowup'
  if (key === 'ArrowDown') return 'arrowdown'
  if (key === 'Backquote' || code === 'Backquote' || key === '`') return '`'
  if (key === ',' ) return ','
  if (key === '/' || key === '?') return '/'
  if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') return '+'
  if (key === '-' || key === '_' || code === 'Minus') return '-'
  if (code === 'BracketLeft' || key === '[' || key === '{') return '['
  if (code === 'BracketRight' || key === ']' || key === '}') return ']'
  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase()
}

/** 把一次按键编成稳定和弦；只按修饰键时返回 null */
export function encodeShortcutChord(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}): string | null {
  if (event.isComposing) return null
  if (event.key === 'Meta' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift') {
    return null
  }
  const key = normalizeKeyName(event.key, event.code)
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('mod')
  if (event.ctrlKey && !event.metaKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  parts.push(key)
  if (parts.length === 1 && key !== 'escape') return null
  return parts.join('+')
}

export function chordsMatch(a: string, b: string): boolean {
  const pa = a.trim().toLowerCase().split('+').filter(Boolean).sort()
  const pb = b.trim().toLowerCase().split('+').filter(Boolean).sort()
  if (pa.length !== pb.length) return false
  return pa.every((part, i) => part === pb[i])
}

/** 设置页展示：`mod+shift+a` → `⌘⇧A` */
export function formatShortcutChord(chord: string): string {
  const parts = chord.trim().toLowerCase().split('+').filter(Boolean)
  const key = parts.find((p) => !['mod', 'ctrl', 'alt', 'shift'].includes(p)) || ''
  const glyphs: string[] = []
  if (parts.includes('mod') && !parts.includes('ctrl')) glyphs.push('⌘')
  if (parts.includes('ctrl')) glyphs.push('Ctrl')
  if (parts.includes('alt')) glyphs.push('⌥')
  if (parts.includes('shift')) glyphs.push('⇧')
  const label =
    key === 'escape'
      ? 'Esc'
      : key === 'arrowleft'
        ? '←'
        : key === 'arrowright'
          ? '→'
          : key === 'arrowup'
            ? '↑'
            : key === 'arrowdown'
              ? '↓'
              : key.toUpperCase()
  glyphs.push(label)
  return glyphs.join('')
}

export function normalizeKeymap(raw: unknown): KeymapOverrides {
  if (!raw || typeof raw !== 'object') return {}
  const out: KeymapOverrides = {}
  for (const [action, chord] of Object.entries(raw as Record<string, unknown>)) {
    if (!ACTION_SET.has(action)) continue
    if (typeof chord !== 'string') continue
    const trimmed = chord.trim().toLowerCase()
    out[action as WorkbenchShortcutAction] = trimmed
  }
  return out
}

/** 先看用户覆盖，再回落到默认；覆盖（含空串）会关掉该动作的默认和弦 */
export function matchWorkbenchShortcut(
  event: {
    key: string
    code?: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    isComposing?: boolean
  },
  overrides?: KeymapOverrides | null
): WorkbenchShortcutAction | null {
  const encoded = encodeShortcutChord(event)
  if (overrides && encoded) {
    for (const [action, chord] of Object.entries(overrides)) {
      if (chord && chordsMatch(chord, encoded)) return action as WorkbenchShortcutAction
    }
  }
  const fallback = matchDefaultWorkbenchShortcut(event)
  if (fallback && overrides && Object.prototype.hasOwnProperty.call(overrides, fallback)) {
    return null
  }
  return fallback
}
