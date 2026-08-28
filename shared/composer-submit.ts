/**
 * Composer 提交键：对标 Codex —— 忙时 Enter 注入当前回合，Tab 排队。
 * @see shared/ARCH.md
 */

/** 发送模式（与 UI PromptSubmitMode 对齐） */
export type ComposerSubmitMode = 'send' | 'queue' | 'jump'

/**
 * 输入框在无菜单时的 Enter / Tab。
 * 空闲 Enter 发送；忙时 Enter 插队注入，Tab 排队。Shift+Enter 换行，不在这里处理。
 */
export function resolveComposerSubmit(options: {
  key: string
  shiftKey?: boolean
  loading: boolean
  menuOpen?: boolean
}): ComposerSubmitMode | null {
  if (options.menuOpen || options.shiftKey) return null
  if (options.key === 'Enter') return options.loading ? 'jump' : 'send'
  if (options.key === 'Tab' && options.loading) return 'queue'
  return null
}

/** 输入框为空时 ↑ 恢复上一条用户提示（对标 Codex Restore previous composer prompt） */
export function restorePreviousComposerPrompt(options: {
  input: string
  messages: Array<{ role: string; content: string }>
}): string | null {
  if (options.input.length > 0) return null
  for (let i = options.messages.length - 1; i >= 0; i--) {
    const row = options.messages[i]
    if (row.role !== 'user') continue
    const text = String(row.content || '')
    if (text.trim()) return text
  }
  return null
}
