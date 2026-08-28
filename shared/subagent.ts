/**
 * 子 Agent 活动快照（对标 Codex Activity / Subagents 面板）。
 * 不进侧栏对话列表，只挂在父线程下。
 * @see shared/ARCH.md
 */

export type SubAgentStatus = 'running' | 'done' | 'failed'

/** 给 UI / IPC 的轻量快照，不含完整 messages */
export interface SubAgentSnapshot {
  id: string
  parentConversationId: string
  prompt: string
  status: SubAgentStatus
  result: string
  streaming: string
  createdAt: number
  updatedAt: number
}

/** 只看当前父线程的孩子 */
export function filterSubAgentsForParent(
  items: SubAgentSnapshot[],
  parentConversationId: string | null | undefined
): SubAgentSnapshot[] {
  const parent = String(parentConversationId || '')
  if (!parent) return items
  return items.filter((s) => s.parentConversationId === parent)
}

/** 进行中在前，其次失败，完成最后；同组按更新时间新的在上 */
export function sortSubAgents(items: SubAgentSnapshot[]): SubAgentSnapshot[] {
  const rank: Record<SubAgentStatus, number> = { running: 0, failed: 1, done: 2 }
  return [...items].sort((a, b) => {
    const d = rank[a.status] - rank[b.status]
    if (d !== 0) return d
    return b.updatedAt - a.updatedAt
  })
}

/** 面板标题：截一段任务说明 */
export function subAgentTitle(prompt: string): string {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim()
  if (!text) return '子 Agent'
  return text.length > 42 ? `${text.slice(0, 42)}…` : text
}
