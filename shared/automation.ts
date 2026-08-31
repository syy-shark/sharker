/**
 * 自动化任务类型与目标解析（渲染进程与主进程共用）。
 * 对标 Codex Scheduled：standalone 每次新对话，或回到指定对话沿用上下文。
 * @see shared/ARCH.md
 */
import { formatAutomationRRule, isAutomationSchedule } from './automation-schedule'

/** 到期后开新对话，或回到绑定的那条对话（对标 Codex return to current chat / start a new chat） */
export type AutomationDestination = 'new' | 'thread'

/** 新对话在隔离 worktree 跑，或直接改本地项目（对标 Codex Scheduled environment） */
export type AutomationRunIn = 'worktree' | 'local'

/** 单条自动化任务 */
export interface AutomationJob {
  id: string
  title: string
  prompt: string
  /** 简易 cron：分 时 日 月 周；有 `rrule` 时只作备用 */
  cron: string
  /** 高级日程 RFC 5545（对标 Codex edit RRULE） */
  rrule?: string
  enabled: boolean
  workspacePath?: string
  /** 同一任务跑多个项目（对标 Codex one scheduled task on more than one project） */
  workspaceIds?: string[]
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

/** 勾选的工作区 id，去空去重 */
export function parseAutomationWorkspaceIds(raw: unknown): string[] | undefined {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\s]+/)
      : []
  const ids = [...new Set(list.map((row) => String(row ?? '').trim()).filter(Boolean))]
  return ids.length ? ids : undefined
}

/**
 * 独立新对话要跑哪些项目。回到指定对话时不拆项目。
 * 没勾选则跟当前工作区（或遗留的单个 `workspacePath`）。
 */
export function resolveAutomationWorkspaceTargets(input: {
  destination?: unknown
  workspaceIds?: unknown
  workspacePath?: unknown
  workspaces: Array<{ id: string; path: string }>
  activeWorkspaceId?: string
}): Array<{ workspaceId: string; workspacePath: string }> {
  if (parseAutomationDestination(input.destination) === 'thread') return []
  const byId = new Map(input.workspaces.map((row) => [row.id, row]))
  const wanted = parseAutomationWorkspaceIds(input.workspaceIds)
  if (wanted?.length) {
    return wanted.flatMap((id) => {
      const row = byId.get(id)
      return row ? [{ workspaceId: row.id, workspacePath: row.path }] : []
    })
  }
  const legacy = String(input.workspacePath ?? '').trim()
  if (legacy) {
    const hit = input.workspaces.find((row) => row.path === legacy)
    return [
      {
        workspaceId: hit?.id || String(input.activeWorkspaceId || ''),
        workspacePath: hit?.path || legacy
      }
    ].filter((row) => row.workspacePath)
  }
  const active = byId.get(String(input.activeWorkspaceId || ''))
  if (active) return [{ workspaceId: active.id, workspacePath: active.path }]
  const first = input.workspaces[0]
  return first ? [{ workspaceId: first.id, workspacePath: first.path }] : []
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
    rrule: formatAutomationRRule(raw.rrule),
    enabled: Boolean(raw.enabled),
    workspacePath: raw.workspacePath ? String(raw.workspacePath) : undefined,
    workspaceIds: parseAutomationWorkspaceIds(raw.workspaceIds),
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

/** Official desktop Scheduled page / sidebar / filters / Run now (learn.chatgpt.com / #20076). */
export const SCHEDULED_LABEL = 'Scheduled'
/** Official Scheduled inbox copy (learn.chatgpt.com/docs/automations). */
export const SCHEDULED_INTRO =
  'Find all scheduled tasks and their runs on Scheduled in the ChatGPT desktop app sidebar. The Scheduled view acts as your inbox. Scheduled task runs with findings appear there, and an unread indicator shows when a run needs your attention.'
/** Official desktop Scheduled local/worktree sentence (learn.chatgpt.com/docs/automations). */
export const SCHEDULED_LOCAL_INTRO =
  'In the ChatGPT desktop app, scheduled tasks can work with local projects and run in the project directory or an isolated worktree. Keep the computer on and the app running when a scheduled task needs local files.'
/** Official Scheduled run-in sentence (learn.chatgpt.com/docs/automations). */
export const SCHEDULED_RUN_IN_INTRO =
  'In Git repositories, you can choose whether a scheduled task runs in your local project or on a new worktree. Both options run in the background. Worktrees keep changes from scheduled tasks separate from unfinished local work, while running in your local project can modify files you are still working on. In non-version-controlled projects, scheduled tasks run directly in the project directory.'
/** Official Scheduled multi-project sentence (learn.chatgpt.com/docs/automations). */
export const SCHEDULED_MULTI_PROJECT_INTRO =
  'You can have the same scheduled task run on more than one project.'
/** Official Scheduled skill trigger (learn.chatgpt.com/docs/automations). */
export const SCHEDULED_SKILL_HINT =
  'In the ChatGPT desktop app, you can explicitly trigger a skill in a scheduled task prompt by using `$skill-name`.'
/** Official Scheduled model / reasoning sentence (learn.chatgpt.com/docs/automations). */
export const SCHEDULED_MODEL_INTRO =
  'You can also leave the model and reasoning effort on their default settings, or choose them explicitly if you want more control over how the scheduled task runs.'
/** Official Scheduled destination sentence (learn.chatgpt.com/docs/automations). */
export const SCHEDULED_DESTINATION_INTRO =
  'Use a standalone scheduled task when each run should start from the saved prompt. Use a scheduled task in a chat when you want ChatGPT to return to the same chat with its existing context.'
export const SCHEDULED_ALL_LABEL = 'All'
export const SCHEDULED_ACTIVE_LABEL = 'Active'
export const SCHEDULED_PAUSED_LABEL = 'Paused'
export const RUN_NOW_LABEL = 'Run now'
/** Official Scheduled bulk action (learn.chatgpt.com/docs/whats-new). */
export const ARCHIVE_ELIGIBLE_RUNS_LABEL = 'Archive eligible runs'

/** 官方 Scheduled 页：All / Active / Paused */
export type AutomationJobFilter = 'all' | 'active' | 'paused'

export const SCHEDULED_JOB_FILTERS: ReadonlyArray<{
  id: AutomationJobFilter
  label: string
}> = [
  { id: 'all', label: SCHEDULED_ALL_LABEL },
  { id: 'active', label: SCHEDULED_ACTIVE_LABEL },
  { id: 'paused', label: SCHEDULED_PAUSED_LABEL }
]

export function parseAutomationJobFilter(raw: unknown): AutomationJobFilter {
  return raw === 'active' || raw === 'paused' ? raw : 'all'
}

export function filterAutomationJobs(
  jobs: AutomationJob[],
  filter: unknown
): AutomationJob[] {
  const mode = parseAutomationJobFilter(filter)
  if (mode === 'active') return jobs.filter((job) => job.enabled)
  if (mode === 'paused') return jobs.filter((job) => !job.enabled)
  return jobs
}

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
    rrule?: unknown
    schedule?: unknown
    destination?: unknown
    conversationId?: unknown
    runIn?: unknown
    run_in?: unknown
    enabled?: unknown
    providerId?: unknown
    model?: unknown
    thinkingLevel?: unknown
    reasoning?: unknown
    workspaceIds?: unknown
    workspace_ids?: unknown
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
            const when = job.rrule || job.cron
            const projects = job.workspaceIds?.length ? ` projects=${job.workspaceIds.length}` : ''
            return `- ${job.id} ${job.enabled ? 'on' : 'off'} ${dest} ${env} ${model}/${effort}${projects} ${when} ${job.title}`
          })
          .join('\n')

  if (op === 'list') return { jobs, message: summarize(jobs), changed: false }

  if (op === 'create') {
    const title = String(action.title ?? '').trim()
    const prompt = String(action.prompt ?? '').trim()
    const cron = String(action.cron ?? '').trim()
    const rrule = formatAutomationRRule(action.rrule ?? action.schedule)
    if (!title || !prompt) throw new Error('title and prompt are required')
    if (!isAutomationSchedule({ cron, rrule })) {
      throw new Error('cron must have 5 fields, or rrule must be an RFC 5545 RRULE')
    }
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
      rrule,
      enabled: action.enabled === false ? false : true,
      destination,
      conversationId,
      runIn: parseAutomationRunIn(action.runIn ?? action.run_in),
      providerId: parseOptionalAutomationId(action.providerId ?? action.model),
      thinkingLevel: parseOptionalAutomationId(action.thinkingLevel ?? action.reasoning),
      workspaceIds: parseAutomationWorkspaceIds(action.workspaceIds ?? action.workspace_ids)
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
    const rrule =
      action.rrule != null || action.schedule != null
        ? formatAutomationRRule(action.rrule ?? action.schedule)
        : prev.rrule
    if (!isAutomationSchedule({ cron, rrule })) {
      throw new Error('cron must have 5 fields, or rrule must be an RFC 5545 RRULE')
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
      rrule,
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
          : prev.thinkingLevel,
      workspaceIds:
        action.workspaceIds != null || action.workspace_ids != null
          ? parseAutomationWorkspaceIds(action.workspaceIds ?? action.workspace_ids)
          : prev.workspaceIds
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

/**
 * Activity「定时」：绑定到对话的任务，以及未归档的审查队列结果。
 * 对标 Codex Activity options → Scheduled。
 */
export function scheduledActivityConversationIds(input: {
  jobs?: Array<{ destination?: string; conversationId?: string }>
  queue?: Array<{ conversationId?: string; status?: string }>
}): string[] {
  const ids = new Set<string>()
  for (const job of input.jobs ?? []) {
    if (job.destination !== 'thread') continue
    const id = String(job.conversationId || '').trim()
    if (id) ids.add(id)
  }
  for (const item of input.queue ?? []) {
    if (item.status === 'archived') continue
    const id = String(item.conversationId || '').trim()
    if (id) ids.add(id)
  }
  return [...ids]
}
