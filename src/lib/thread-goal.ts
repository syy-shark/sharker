/**
 * 线程目标本机记忆（不进对话 JSON）。
 * @see src/lib/ARCH.md
 */
import type { ThreadGoal } from '../../shared/thread-goal'
import { goalPromptBlock } from '../../shared/thread-goal'

function storageKey(conversationId: string): string {
  return `sharker-goal:${conversationId}`
}

/** 读取会话目标；无记录则空 */
export function loadThreadGoal(conversationId: string | null | undefined): ThreadGoal | null {
  if (!conversationId) return null
  try {
    const raw = localStorage.getItem(storageKey(conversationId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ThreadGoal>
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : ''
    if (!text) return null
    return {
      text,
      status: parsed.status === 'paused' ? 'paused' : 'active',
      startedAt:
        typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt)
          ? parsed.startedAt
          : undefined
    }
  } catch {
    return null
  }
}

/** 落盘或清除会话目标 */
export function saveThreadGoal(
  conversationId: string,
  goal: ThreadGoal | null
): void {
  if (!goal?.text.trim()) {
    localStorage.removeItem(storageKey(conversationId))
    return
  }
  localStorage.setItem(storageKey(conversationId), JSON.stringify(goal))
}

/** 当前或后台会话里应注入 system 的目标正文 */
export function goalTextForConversation(
  conversationId: string | null | undefined,
  activeId: string | null | undefined,
  activeGoal: ThreadGoal | null
): string | undefined {
  const goal =
    conversationId && conversationId === activeId ? activeGoal : loadThreadGoal(conversationId)
  return goalPromptBlock(goal) ?? undefined
}
