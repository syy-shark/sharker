/**
 * 自动化任务类型与目标解析（渲染进程与主进程共用）。
 * 对标 Codex Scheduled：standalone 每次新对话，或回到指定对话沿用上下文。
 * @see shared/ARCH.md
 */

/** 到期后开新对话，或回到绑定的那条对话（对标 Codex return to current chat / start a new chat） */
export type AutomationDestination = 'new' | 'thread'

/** 单条自动化任务 */
export interface AutomationJob {
  id: string
  title: string
  prompt: string
  /** 简易 cron：分 时 日 月 周 */
  cron: string
  enabled: boolean
  workspacePath?: string
  lastRunAt?: string
  destination?: AutomationDestination
  /** `destination === 'thread'` 时绑定的对话 */
  conversationId?: string
}

export function parseAutomationDestination(raw: unknown): AutomationDestination {
  return raw === 'thread' ? 'thread' : 'new'
}

export function normalizeAutomationJob(
  raw: Partial<AutomationJob> & Pick<AutomationJob, 'id'>
): AutomationJob {
  const destination = parseAutomationDestination(raw.destination)
  const conversationId =
    destination === 'thread' ? String(raw.conversationId ?? '').trim() || undefined : undefined
  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    prompt: String(raw.prompt ?? ''),
    cron: String(raw.cron ?? ''),
    enabled: Boolean(raw.enabled),
    workspacePath: raw.workspacePath ? String(raw.workspacePath) : undefined,
    lastRunAt: raw.lastRunAt ? String(raw.lastRunAt) : undefined,
    destination,
    conversationId
  }
}

export function normalizeAutomationJobs(jobs: unknown): AutomationJob[] {
  if (!Array.isArray(jobs)) return []
  const out: AutomationJob[] = []
  for (const row of jobs) {
    if (!row || typeof row !== 'object') continue
    const id = String((row as { id?: unknown }).id ?? '').trim()
    if (!id) continue
    out.push(normalizeAutomationJob({ ...(row as AutomationJob), id }))
  }
  return out
}

/** 切到「回到对话」时默认绑当前会话，否则第一条 */
export function defaultAutomationThreadId(
  current: string | null | undefined,
  conversations: Array<{ id: string }>
): string | undefined {
  const id = String(current ?? '').trim()
  if (id && conversations.some((row) => row.id === id)) return id
  return conversations[0]?.id
}

export type AutomationRunMode = 'new' | 'thread' | 'queue'

/**
 * 到期怎么跑：对话不在了就退回新建；目标对话正直播则只排队，不中止。
 */
export function resolveAutomationRunPlan(input: {
  destination?: unknown
  conversationId?: unknown
  conversationExists: boolean
  conversationBusy: boolean
}): { mode: AutomationRunMode; conversationId?: string } {
  const destination = parseAutomationDestination(input.destination)
  const conversationId = String(input.conversationId ?? '').trim()
  if (destination !== 'thread' || !conversationId || !input.conversationExists) {
    return { mode: 'new' }
  }
  if (input.conversationBusy) return { mode: 'queue', conversationId }
  return { mode: 'thread', conversationId }
}
