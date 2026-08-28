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

/** 线程终端缓存项：reactKey 稳定，convKey 可从 pending 收成对话 id */
export type ThreadTerminalPane = {
  reactKey: string
  convKey: string
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

/** 新对话拿到 id 时收编同工作区的 pending 窗格，避免再开一套 PTY */
export function rememberThreadTerminalPanes(
  panes: readonly ThreadTerminalPane[],
  convKey: string,
  workspacePath?: string | null,
  limit = MAX_CACHED_THREAD_TERMINALS
): ThreadTerminalPane[] {
  const key = convKey.trim()
  if (!key) return [...panes]
  const cap = Math.max(1, limit)
  const pending = threadTerminalKey('', workspacePath)
  const adopt =
    !key.startsWith('pending:') && pending.startsWith('pending:')
      ? panes.find((pane) => pane.convKey === pending)
      : undefined
  if (adopt) {
    const next = panes.map((pane) =>
      pane.reactKey === adopt.reactKey ? { ...pane, convKey: key } : pane
    )
    const current = next.find((pane) => pane.reactKey === adopt.reactKey)
    if (!current) return next.slice(0, cap)
    return [current, ...next.filter((pane) => pane.reactKey !== current.reactKey)].slice(0, cap)
  }
  const existing = panes.find((pane) => pane.convKey === key)
  if (existing) {
    return [existing, ...panes.filter((pane) => pane.reactKey !== existing.reactKey)].slice(0, cap)
  }
  return [{ reactKey: key, convKey: key }, ...panes].slice(0, cap)
}
