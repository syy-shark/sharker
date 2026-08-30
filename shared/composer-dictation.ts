/**
 * Composer 听写：Ctrl+Shift+D 开关；按住 Ctrl+M 说话（对标 Codex desktop Hold Ctrl+M while the composer is visible）。
 * 失败提示用官方 Unable to transcribe audio，不发明权限/环境分句。
 * @see shared/ARCH.md
 */

/** Official desktop composer toast when dictation cannot produce text. */
export const UNABLE_TO_TRANSCRIBE_AUDIO = 'Unable to transcribe audio'

/** Official desktop hold-to-talk: Hold Ctrl+M while the composer is visible. */
export function isDictationHoldKey(event: {
  key: string
  ctrlKey: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}): boolean {
  if (event.isComposing) return false
  if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false
  return event.key.toLowerCase() === 'm'
}

/** Codex 听写和弦：两端都是 Ctrl+Shift+D，不用 ⌘ */
export function isDictationShortcut(event: {
  key: string
  ctrlKey: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}): boolean {
  if (event.isComposing) return false
  if (!event.ctrlKey || !event.shiftKey || event.altKey) return false
  return event.key.toLowerCase() === 'd'
}

/** 把一段转写接到输入框末尾，避免粘成一团 */
export function appendDictationTranscript(current: string, transcript: string): string {
  const next = String(transcript || '').replace(/\s+/g, ' ').trim()
  if (!next) return current
  const cur = String(current || '')
  if (!cur) return next
  if (/\s$/.test(cur) || /^[,.;:!?…，。！？、]/.test(next)) return `${cur}${next}`
  return `${cur} ${next}`
}

/** Codex 语音对话：两端都是 Ctrl+Shift+V */
export function isVoiceChatShortcut(event: {
  key: string
  ctrlKey: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}): boolean {
  if (event.isComposing) return false
  if (!event.ctrlKey || !event.shiftKey || event.altKey) return false
  return event.key.toLowerCase() === 'v'
}

/** 去掉围栏和标记，给 TTS 念助手回复 */
export function textForSpeech(markdown: string): string {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_>~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800)
}
