/**
 * 集成终端按线程分标签（对标 Codex desktop terminal tabs per thread）。
 * @see shared/ARCH.md
 */

export const MAX_TERMINAL_TABS = 8
export const MAX_CACHED_THREAD_TERMINALS = 6

export type TerminalTab = {
  id: string
  title: string
}

/** 无对话时仍按工作区隔开，避免新聊天共用旧 PTY */
export function threadTerminalKey(
  conversationId?: string | null,
  workspacePath?: string | null
): string {
  const id = conversationId?.trim()
  if (id) return id
  const cwd = workspacePath?.trim()
  return cwd ? `pending:${cwd}` : 'pending'
}

export function terminalTabTitle(index: number): string {
  return index <= 0 ? '终端' : `终端 ${index + 1}`
}

export function ensureTerminalTabs(tabs?: readonly TerminalTab[] | null): TerminalTab[] {
  if (tabs && tabs.length > 0) {
    return tabs.map((tab, index) => ({
      id: tab.id,
      title: tab.title.trim() || terminalTabTitle(index)
    }))
  }
  return [{ id: 't1', title: terminalTabTitle(0) }]
}

export function nextTerminalTabId(tabs: readonly TerminalTab[]): string {
  const used = new Set(tabs.map((tab) => tab.id))
  let n = 1
  while (used.has(`t${n}`)) n += 1
  return `t${n}`
}

export function addTerminalTab(tabs: readonly TerminalTab[]): {
  tabs: TerminalTab[]
  activeId: string
} {
  const current = ensureTerminalTabs(tabs)
  if (current.length >= MAX_TERMINAL_TABS) {
    return { tabs: current, activeId: current[current.length - 1]?.id ?? 't1' }
  }
  const id = nextTerminalTabId(current)
  const next = [...current, { id, title: terminalTabTitle(current.length) }]
  return { tabs: next, activeId: id }
}

export function closeTerminalTab(
  tabs: readonly TerminalTab[],
  id: string,
  activeId?: string
): { tabs: TerminalTab[]; activeId: string } {
  const current = ensureTerminalTabs(tabs)
  if (current.length <= 1) return { tabs: current, activeId: current[0]?.id ?? 't1' }
  const index = current.findIndex((tab) => tab.id === id)
  if (index < 0) {
    const keep =
      activeId && current.some((tab) => tab.id === activeId) ? activeId : current[0]?.id ?? 't1'
    return { tabs: current, activeId: keep }
  }
  const next = current.filter((tab) => tab.id !== id)
  const fallback = current[index - 1] ?? next[0]
  const keepActive = Boolean(activeId && activeId !== id && next.some((tab) => tab.id === activeId))
  return { tabs: next, activeId: keepActive ? activeId! : fallback?.id ?? 't1' }
}

/** 最近用过的线程终端排前面，超出上限丢掉最旧的（会卸 PTY） */
export function rememberThreadTerminal(
  order: readonly string[],
  conversationKey: string,
  limit = MAX_CACHED_THREAD_TERMINALS
): string[] {
  const key = conversationKey.trim()
  if (!key) return [...order]
  const cap = Math.max(1, limit)
  return [key, ...order.filter((id) => id !== key)].slice(0, cap)
}
