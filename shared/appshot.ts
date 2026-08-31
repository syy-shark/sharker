/**
 * 官方 Appshots：把最前窗口的截图与可读文本送进对话（对标 learn.chatgpt.com/docs/appshots）。
 * 默认热键是同时按下两个 Command；自定义和弦写在 Settings → Appshots，不进 Keyboard Shortcuts 目录。
 * @see shared/ARCH.md
 */
import { encodeShortcutChord, formatShortcutChord } from './keymap'

/** Official Settings → Appshots / Commands: Take an Appshot. */
export const APPSHOTS_SETTINGS_LABEL = 'Appshots'
export const TAKE_AN_APPSHOT_LABEL = 'Take an Appshot'
export const APPSHOT_ATTACHMENT_NAME = 'Appshot.png'
export const APPSHOT_TEXT_ATTACHMENT_NAME = 'Appshot.txt'
/** Official Commands shortcut: press both Command keys simultaneously. */
export const APPSHOT_DEFAULT_KEYS = '⌘+⌘'
export const APPSHOT_BOTH_META_CHORD = 'both-meta'
/** Official: add to the chat interacted with in the last 60 seconds. */
export const APPSHOT_RECENT_MS = 60_000

/** Official Settings / Appshots intro (learn.chatgpt.com/docs/appshots). */
export const APPSHOTS_SETTINGS_INTRO =
  'Appshots let you send the frontmost app window to a chat in ChatGPT. Use them when you’re actively working in another app on your computer and want to provide ChatGPT with your current context so it can help you with the task.'

/** Official availability + default hotkey sentence. */
export const APPSHOTS_HOTKEY_INTRO =
  'Appshots are available in the ChatGPT desktop app on macOS. Press both Command keys, or your custom Appshots hotkey, to take one.'

/** Official permissions copy. */
export const APPSHOTS_PERMISSIONS_INTRO =
  'ChatGPT may ask for permissions before it can take appshots: Screen & System Audio Recording lets ChatGPT capture an image of the frontmost window. Accessibility lets ChatGPT read available text from the frontmost window.'
/** Official Appshots routing leftover (learn.chatgpt.com/docs/appshots). Skip plugin copy. */
export const APPSHOTS_ROUTE_INTRO =
  'By default, ChatGPT starts a new chat for the appshot. If you interacted with a chat in the last 60 seconds, ChatGPT adds the appshot to that recent chat instead. Taking consecutive appshots adds them to the same chat.'
export const APPSHOTS_CAPTURE_INTRO =
  'An appshot captures the frontmost window only. It can include: An image of the visible window. Available text from that window, including visible text and text the app makes available outside the visible scroll area.'

/** 官方路由：新对话，或 60 秒内刚互动过的对话。 */
export type AppshotTarget = 'new_chat' | 'recent_chat'

/** `resolveAppshotTarget` 输入：当前时间与最近互动 / 连续 Appshot。 */
export interface AppshotRouteInput {
  now: number
  lastInteractedAt: number | null
  lastAppshotConversationId: string | null
  activeConversationId: string | null
}

/** 解析 Settings → Appshots 热键；空或非法回默认 both-meta。 */
export function parseAppshotHotkey(raw: unknown): string {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return APPSHOT_BOTH_META_CHORD
  if (text === APPSHOT_BOTH_META_CHORD || text === '⌘+⌘' || text === 'cmd+cmd') {
    return APPSHOT_BOTH_META_CHORD
  }
  return text
}

/** 设置页 / 命令面板展示用热键文案。 */
export function formatAppshotHotkey(raw: unknown): string {
  const chord = parseAppshotHotkey(raw)
  if (chord === APPSHOT_BOTH_META_CHORD) return APPSHOT_DEFAULT_KEYS
  return formatShortcutChord(chord)
}

/** 自定义和弦转 Electron globalShortcut；both-meta 不能注册。 */
export function appshotChordToAccelerator(raw: unknown): string | null {
  const chord = parseAppshotHotkey(raw)
  if (chord === APPSHOT_BOTH_META_CHORD) return null
  const parts = chord.split('+').filter(Boolean)
  const key = parts.find((part) => !['mod', 'ctrl', 'alt', 'shift'].includes(part))
  if (!key) return null
  const mapped: string[] = []
  if (parts.includes('mod') && !parts.includes('ctrl')) mapped.push('CommandOrControl')
  if (parts.includes('ctrl')) mapped.push('Control')
  if (parts.includes('alt')) mapped.push('Alt')
  if (parts.includes('shift')) mapped.push('Shift')
  const accelKey =
    key === 'arrowleft'
      ? 'Left'
      : key === 'arrowright'
        ? 'Right'
        : key === 'arrowup'
          ? 'Up'
          : key === 'arrowdown'
            ? 'Down'
            : key === 'escape'
              ? 'Escape'
              : key.length === 1
                ? key.toUpperCase()
                : key
  mapped.push(accelKey)
  return mapped.join('+')
}

/**
 * 官方路由：默认新对话；60 秒内互动过的对话，或连续 Appshot，进同一条。
 */
export function resolveAppshotTarget(input: AppshotRouteInput): {
  target: AppshotTarget
  conversationId: string | null
} {
  const active = String(input.activeConversationId || '').trim() || null
  const lastShot = String(input.lastAppshotConversationId || '').trim() || null
  const interacted = input.lastInteractedAt
  const recent =
    typeof interacted === 'number' &&
    Number.isFinite(interacted) &&
    input.now - interacted >= 0 &&
    input.now - interacted <= APPSHOT_RECENT_MS
  if (!recent) return { target: 'new_chat', conversationId: null }
  if (active) return { target: 'recent_chat', conversationId: active }
  if (lastShot) return { target: 'recent_chat', conversationId: lastShot }
  return { target: 'new_chat', conversationId: null }
}

/** 左 + 右 Command 同时按下（官方 ⌘+⌘）。 */
export function isBothCommandAppshotHotkey(input: {
  key: string
  leftMeta: boolean
  rightMeta: boolean
  altKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}): boolean {
  if (input.isComposing) return false
  if (input.altKey || input.ctrlKey || input.shiftKey) return false
  if (input.key !== 'Meta' && input.key !== 'MetaLeft' && input.key !== 'MetaRight') return false
  return input.leftMeta && input.rightMeta
}

/** 自定义 Appshots 热键是否命中当前按键。 */
export function matchAppshotHotkey(
  raw: unknown,
  event: {
    key: string
    code?: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    isComposing?: boolean
    leftMeta?: boolean
    rightMeta?: boolean
  }
): boolean {
  const chord = parseAppshotHotkey(raw)
  if (chord === APPSHOT_BOTH_META_CHORD) {
    return isBothCommandAppshotHotkey({
      key: event.key,
      leftMeta: Boolean(event.leftMeta),
      rightMeta: Boolean(event.rightMeta),
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing
    })
  }
  const encoded = encodeShortcutChord(event)
  return encoded === chord
}

/** 主进程捕获结果：图 + 可选辅助功能文本。 */
export interface AppshotCaptureResult {
  ok: boolean
  imageDataUrl?: string
  text?: string
  appName?: string
  message?: string
}
