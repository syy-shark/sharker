/**
 * 自动化任务类型与目标解析（渲染进程与主进程共用）。
 * 对标 Codex Scheduled：standalone 每次新对话，或回到指定对话沿用上下文。
 * @see shared/ARCH.md
 */

/** 到期后开新对话，或回到绑定的那条对话（对标 Codex return to current chat / start a new chat） */
export type AutomationDestination = 'new' | 'thread'

/** 新对话在隔离 worktree 跑，或直接改本地项目（对标 Codex Scheduled environment） */
export type AutomationRunIn = 'worktree' | 'local'

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
  /** 仅 `destination === 'new'`：隔离 worktree 或本地项目 */
  runIn?: AutomationRunIn
  /** 空则用当时活动模型（对标 Codex leave model on default） */
  providerId?: string
  /** 空则用当时思考档位（对标 Codex leave reasoning effort on default） */
  thinkingLevel?: string
}

export function parseAutomationDestination(raw: unknown): AutomationDestination {
  return raw === 'thread' ? 'thread' : 'new'
}

export function parseAutomationRunIn(raw: unknown): AutomationRunIn {
  return raw === 'local' ? 'local' : 'worktree'
}

/** 空字符串视为「跟随当前」 */
export function parseOptionalAutomationId(raw: unknown): string | undefined {
  const id = String(raw ?? '').trim()
  return id || undefined
}

/**
 * 定时任务本轮覆盖模型 / 思考档位；都空则原样返回（对标 Codex leave on default）。
 * 指定的 providerId 不在列表里时不改，避免跑到未知服务。
 */
export function applyScheduledTurnSettings<
  T extends {
    activeProviderId: string
    providers: Array<{ id: string; thinkingLevel?: string }>
  }
>(
  settings: T,
  override?: { providerId?: unknown; thinkingLevel?: unknown }
): T {
  const providerId = parseOptionalAutomationId(override?.providerId)
  const thinkingLevel = parseOptionalAutomationId(override?.thinkingLevel)
  if (!providerId && !thinkingLevel) return settings
  const nextId = providerId || settings.activeProviderId
  if (!settings.providers.some((row) => row.id === nextId)) return settings
  return {
    ...settings,
    activeProviderId: nextId,
    providers: settings.providers.map((row) =>
      row.id === nextId
        ? { ...row, thinkingLevel: thinkingLevel || row.thinkingLevel }
        : row
    )
  }
}

export function isAutomationCron(expr: unknown): boolean {
  return String(expr ?? '').trim().split(/\s+/).length >= 5
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
    conversationId,
    runIn: parseAutomationRunIn(raw.runIn),
    providerId: parseOptionalAutomationId(raw.providerId),
    thinkingLevel: parseOptionalAutomationId(raw.thinkingLevel)
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

export function shouldPrepareAutomationWorktree(input: {
  runMode: AutomationRunMode
  runIn?: unknown
}): boolean {
  return input.runMode === 'new' && parseAutomationRunIn(input.runIn) === 'worktree'
}

export type ScheduledTaskOp = 'create' | 'update' | 'list' | 'pause' | 'resume' | 'delete'

/**
 * 对话里创建 / 改 / 列 / 暂停定时任务（对标 Codex Ask ChatGPT to create or update scheduled tasks）。
 */
export function applyScheduledTaskAction(
  jobs: AutomationJob[],
  action: {
    op?: unknown
    id?: unknown
    title?: unknown
    prompt?: unknown
    cron?: unknown
    destination?: unknown
    conversationId?: unknown
    runIn?: unknown
    run_in?: unknown
    enabled?: unknown
    providerId?: unknown
    model?: unknown
    thinkingLevel?: unknown
    reasoning?: unknown
  },
  options?: { currentConversationId?: string }
): { jobs: AutomationJob[]; message: string; changed: boolean } {
  const op = String(action.op ?? 'list') as ScheduledTaskOp
  const summarize = (rows: AutomationJob[]) =>
    rows.length === 0
      ? 'No scheduled tasks.'
      : rows
          .map((job) => {
            const dest = parseAutomationDestination(job.destination)
            const env = parseAutomationRunIn(job.runIn)
            const model = job.providerId || 'default'
            const effort = job.thinkingLevel || 'default'
            return `- ${job.id} ${job.enabled ? 'on' : 'off'} ${dest} ${env} ${model}/${effort} ${job.cron} ${job.title}`
          })
          .join('\n')

  if (op === 'list') return { jobs, message: summarize(jobs), changed: false }

  if (op === 'create') {
    const title = String(action.title ?? '').trim()
    const prompt = String(action.prompt ?? '').trim()
    const cron = String(action.cron ?? '').trim()
    if (!title || !prompt) throw new Error('title and prompt are required')
    if (!isAutomationCron(cron)) throw new Error('cron must have 5 fields (min hour day month weekday)')
    const destination = parseAutomationDestination(action.destination)
    const conversationId =
      destination === 'thread'
        ? String(action.conversationId ?? options?.currentConversationId ?? '').trim() ||
          undefined
        : undefined
    const job = normalizeAutomationJob({
      id: String(action.id ?? '').trim() || `auto-${Date.now().toString(36)}`,
      title,
      prompt,
      cron,
      enabled: action.enabled === false ? false : true,
      destination,
      conversationId,
      runIn: parseAutomationRunIn(action.runIn ?? action.run_in),
      providerId: parseOptionalAutomationId(action.providerId ?? action.model),
      thinkingLevel: parseOptionalAutomationId(action.thinkingLevel ?? action.reasoning)
    })
    return {
      jobs: [...jobs, job],
      message: `Created scheduled task ${job.id} (${job.destination}, ${job.runIn}): ${job.title}`,
      changed: true
    }
  }

  const id = String(action.id ?? '').trim()
  if (!id) throw new Error('id is required')
  const prev = jobs.find((job) => job.id === id)
  if (!prev) throw new Error(`Scheduled task not found: ${id}`)

  if (op === 'delete') {
    return {
      jobs: jobs.filter((job) => job.id !== id),
      message: `Deleted scheduled task ${id}`,
      changed: true
    }
  }
  if (op === 'pause' || op === 'resume') {
    return {
      jobs: jobs.map((job) => (job.id === id ? { ...job, enabled: op === 'resume' } : job)),
      message: `${op === 'resume' ? 'Resumed' : 'Paused'} scheduled task ${id}`,
      changed: true
    }
  }
  if (op === 'update') {
    const cron = action.cron != null ? String(action.cron).trim() : prev.cron
    if (action.cron != null && !isAutomationCron(cron)) {
      throw new Error('cron must have 5 fields (min hour day month weekday)')
    }
    const destination =
      action.destination != null
        ? parseAutomationDestination(action.destination)
        : parseAutomationDestination(prev.destination)
    const conversationId =
      destination === 'thread'
        ? String(action.conversationId ?? prev.conversationId ?? options?.currentConversationId ?? '').trim() ||
          undefined
        : undefined
    const updated = normalizeAutomationJob({
      ...prev,
      title: action.title != null ? String(action.title) : prev.title,
      prompt: action.prompt != null ? String(action.prompt) : prev.prompt,
      cron,
      enabled: typeof action.enabled === 'boolean' ? action.enabled : prev.enabled,
      destination,
      conversationId,
      runIn:
        action.runIn != null || action.run_in != null
          ? parseAutomationRunIn(action.runIn ?? action.run_in)
          : prev.runIn,
      providerId:
        action.providerId != null || action.model != null
          ? parseOptionalAutomationId(action.providerId ?? action.model)
          : prev.providerId,
      thinkingLevel:
        action.thinkingLevel != null || action.reasoning != null
          ? parseOptionalAutomationId(action.thinkingLevel ?? action.reasoning)
          : prev.thinkingLevel
    })
    return {
      jobs: jobs.map((job) => (job.id === id ? updated : job)),
      message: `Updated scheduled task ${id}`,
      changed: true
    }
  }
  throw new Error(`Unknown op: ${op}`)
}

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
