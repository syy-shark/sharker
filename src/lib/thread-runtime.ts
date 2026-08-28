/**
 * 会话线程执行模式（本地 / Worktree），存在本机，不进对话 JSON。
 * @see src/lib/ARCH.md
 */

/** Codex 式线程目标：直接改工作区，或隔离到 git worktree */
export type ThreadMode = 'local' | 'worktree'

/** 当前会话的线程运行时 */
export type ThreadRuntime = {
  mode: ThreadMode
  worktreePath?: string
}

function storageKey(conversationId: string): string {
  return `sharker-thread:${conversationId}`
}

/** 读取会话线程模式；无记录则本地 */
export function loadThreadRuntime(conversationId: string | null | undefined): ThreadRuntime {
  if (!conversationId) return { mode: 'local' }
  try {
    const raw = localStorage.getItem(storageKey(conversationId))
    if (!raw) return { mode: 'local' }
    const parsed = JSON.parse(raw) as Partial<ThreadRuntime>
    if (parsed.mode === 'worktree') {
      return {
        mode: 'worktree',
        worktreePath: typeof parsed.worktreePath === 'string' ? parsed.worktreePath : undefined
      }
    }
  } catch {
    /* ignore broken localStorage */
  }
  return { mode: 'local' }
}

/** 落盘会话线程模式 */
export function saveThreadRuntime(conversationId: string, runtime: ThreadRuntime): void {
  localStorage.setItem(storageKey(conversationId), JSON.stringify(runtime))
}

/**
 * 派发 turn 时取目标会话的线程模式：当前会话用内存态，后台会话读本机记录。
 * 避免自动化后台跑时误用正在看的那条线程的 worktree。
 */
export function runtimeForConversation(
  conversationId: string | null | undefined,
  activeId: string | null | undefined,
  activeRuntime: ThreadRuntime
): ThreadRuntime {
  if (conversationId && conversationId === activeId) return activeRuntime
  return loadThreadRuntime(conversationId)
}
