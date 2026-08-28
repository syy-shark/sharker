/**
 * Composer 听写：快捷键与转写拼接（对标 Codex Ctrl+Shift+D）。
 * @see shared/ARCH.md
 */

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
