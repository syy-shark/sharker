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
  workspaceId?: string
  workspacePath?: string
  /** 该次自动化实际改过的相对路径（接受/拒绝只动这些文件） */
  changedPaths?: string[]
}

/** 审查队列上的人审动作（对标 Codex Approve / Revise / Reject） */
export type QueueTriageAction = 'approve' | 'revise' | 'reject'

/** 从到期任务生成队列条目 */
export function enqueueAutomationRun(
  job: Pick<AutomationJob, 'id' | 'title' | 'prompt'>,
  conversationId?: string,
  now = new Date(),
  extras?: { workspaceId?: string; workspacePath?: string }
): AutomationQueueItem {
  return {
    id: `aq-${now.getTime()}-${job.id}`,
    jobId: job.id,
    title: String(job.title || '自动化').trim() || '自动化',
    prompt: String(job.prompt || ''),
    createdAt: now.toISOString(),
    status: 'unread',
    conversationId,
    workspaceId: extras?.workspaceId,
    workspacePath: extras?.workspacePath
  }
}

/** Approve/Revise → 已读；Reject → 归档 */
export function applyQueueTriageAction(
  items: AutomationQueueItem[],
  id: string,
  action: QueueTriageAction
): AutomationQueueItem[] {
  return markQueueItem(items, id, action === 'reject' ? 'archived' : 'read')
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

/** 未读全部标已读（对标 Codex ⇧Esc 清未读徽标） */
export function markAllQueueRead(items: AutomationQueueItem[]): AutomationQueueItem[] {
  return items.map((i) => (i.status === 'unread' ? { ...i, status: 'read' as const } : i))
}

function cleanRelPaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of paths) {
    const p = String(raw || '').replaceAll('\\', '/').trim()
    if (!p || p.includes('..') || seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

/** 回合结束后把该会话改过的路径写回队列条目 */
export function attachQueueChangedPaths(
  items: AutomationQueueItem[],
  conversationId: string,
  paths: string[]
): AutomationQueueItem[] {
  const id = String(conversationId || '')
  if (!id) return items
  const cleaned = cleanRelPaths(paths)
  let changed = false
  const next = items.map((item) => {
    if (item.conversationId !== id) return item
    const prev = item.changedPaths ?? []
    if (prev.length === cleaned.length && prev.every((p, i) => p === cleaned[i])) return item
    changed = true
    return { ...item, changedPaths: cleaned }
  })
  return changed ? next : items
}

/** 接受/拒绝时优先用条目上记录的路径，避免动到用户其它脏文件 */
export function resolveQueueTriagePaths(
  item: AutomationQueueItem,
  fallback: string[] = []
): string[] {
  const fromItem = cleanRelPaths(item.changedPaths ?? [])
  if (fromItem.length) return fromItem
  return cleanRelPaths(fallback)
}

/** 审查队列「接受」：提交成功后再推送；推送失败不回滚提交 */
export async function pushAfterApproveCommit(options: {
  committed: boolean
  push?: () => Promise<{ ok: boolean; error?: string }>
}): Promise<'skipped' | 'pushed' | 'push_failed'> {
  if (!options.committed || !options.push) return 'skipped'
  try {
    const result = await options.push()
    return result.ok ? 'pushed' : 'push_failed'
  } catch {
    return 'push_failed'
  }
}

/** 推送成功且当前分支还没有 PR 时再 `gh pr create`；失败不回滚提交/推送 */
export async function createPrAfterApprovePush(options: {
  pushed: 'skipped' | 'pushed' | 'push_failed'
  hasExistingPr?: () => Promise<boolean>
  createPr?: () => Promise<{ ok: boolean; error?: string; url?: string }>
}): Promise<'skipped' | 'exists' | 'created' | 'create_failed'> {
  if (options.pushed !== 'pushed' || !options.createPr) return 'skipped'
  try {
    if (options.hasExistingPr && (await options.hasExistingPr())) return 'exists'
    const result = await options.createPr()
    return result.ok ? 'created' : 'create_failed'
  } catch {
    return 'create_failed'
  }
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
