/**
 * 自动化审查队列：跑完的任务进 Triage，不抢当前对话。
 * @see shared/ARCH.md
 */
import type { AutomationJob } from './automation'

/** 队列条目状态 */
export type AutomationQueueStatus = 'unread' | 'read' | 'archived'

/** 一条待人审的自动化结果 */
export interface AutomationQueueItem {
  id: string
  jobId: string
  title: string
  prompt: string
  createdAt: string
  status: AutomationQueueStatus
  conversationId?: string
}

/** 从到期任务生成队列条目 */
export function enqueueAutomationRun(
  job: Pick<AutomationJob, 'id' | 'title' | 'prompt'>,
  conversationId?: string,
  now = new Date()
): AutomationQueueItem {
  return {
    id: `aq-${now.getTime()}-${job.id}`,
    jobId: job.id,
    title: String(job.title || '自动化').trim() || '自动化',
    prompt: String(job.prompt || ''),
    createdAt: now.toISOString(),
    status: 'unread',
    conversationId
  }
}

/** 未读条数（侧栏 / 页头徽标） */
export function unreadQueueCount(items: AutomationQueueItem[]): number {
  return items.filter((i) => i.status === 'unread').length
}

/** 改一条状态；找不到则原样返回 */
export function markQueueItem(
  items: AutomationQueueItem[],
  id: string,
  status: AutomationQueueStatus
): AutomationQueueItem[] {
  return items.map((i) => (i.id === id ? { ...i, status } : i))
}

/** 展示用：未读在前，已读次之，归档最后 */
export function sortAutomationQueue(items: AutomationQueueItem[]): AutomationQueueItem[] {
  const rank: Record<AutomationQueueStatus, number> = { unread: 0, read: 1, archived: 2 }
  return [...items].sort((a, b) => {
    const d = rank[a.status] - rank[b.status]
    if (d !== 0) return d
    return b.createdAt.localeCompare(a.createdAt)
  })
}
