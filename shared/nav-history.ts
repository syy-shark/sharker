/**
 * 工作台前进 / 后退（对标 Codex ⌘[ / ⌘]）。
 * @see shared/ARCH.md
 */

export type NavPage = 'chat' | 'settings' | 'automations'

export interface NavEntry {
  page: NavPage
  conversationId?: string | null
  settingsTab?: string
}

const MAX_NAV = 40

/** 两条导航是否同一落点 */
export function sameNav(a?: NavEntry | null, b?: NavEntry | null): boolean {
  if (!a || !b) return false
  return (
    a.page === b.page &&
    (a.conversationId ?? null) === (b.conversationId ?? null) &&
    (a.settingsTab ?? '') === (b.settingsTab ?? '')
  )
}

/** 记下新落点并丢掉前进栈 */
export function pushNav(
  stack: NavEntry[],
  index: number,
  entry: NavEntry
): { stack: NavEntry[]; index: number } {
  if (sameNav(stack[index], entry)) return { stack, index }
  const trimmed = stack.slice(0, Math.max(0, index + 1))
  trimmed.push(entry)
  while (trimmed.length > MAX_NAV) trimmed.shift()
  return { stack: trimmed, index: trimmed.length - 1 }
}

/** 后退一格 */
export function navBack(
  stack: NavEntry[],
  index: number
): { stack: NavEntry[]; index: number; entry: NavEntry | null } {
  if (index <= 0) return { stack, index, entry: null }
  const next = index - 1
  return { stack, index: next, entry: stack[next] ?? null }
}

/** 前进一格 */
export function navForward(
  stack: NavEntry[],
  index: number
): { stack: NavEntry[]; index: number; entry: NavEntry | null } {
  if (index < 0 || index >= stack.length - 1) return { stack, index, entry: null }
  const next = index + 1
  return { stack, index: next, entry: stack[next] ?? null }
}
