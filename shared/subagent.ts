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

/** 主线程时间线可点开活动的工具 */
export const SUBAGENT_INSPECT_TOOLS = new Set([
  'agent_spawn',
  'agent_send_message',
  'agent_get_result',
  'agent_list'
])

export function isSubAgentInspectTool(toolName?: string | null): boolean {
  return Boolean(toolName && SUBAGENT_INSPECT_TOOLS.has(toolName))
}

const SUBAGENT_ID_RE = /^[a-zA-Z0-9_-]{4,32}$/
const SPAWN_ID_RE = /Sub-agent\s+([a-zA-Z0-9_-]{4,32})\s+(?:started|steered)/i
const NEW_SPAWN_ID_RE = /New sub-agent\s+([a-zA-Z0-9_-]{4,32})\s+started/i
const LIST_ROW_ID_RE = /^\s*([a-zA-Z0-9_-]{4,32})\s+\[(?:running|done|failed)\]/m

/** 从工具输出 / 活动文案解析子 Agent id */
export function parseSubAgentId(text?: string | null): string | null {
  const raw = String(text || '')
  if (!raw) return null
  const spawn = raw.match(SPAWN_ID_RE) || raw.match(NEW_SPAWN_ID_RE)
  if (spawn?.[1]) return spawn[1]
  const row = raw.match(LIST_ROW_ID_RE)
  if (row?.[1]) return row[1]
  return null
}

function idFromUnknown(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return SUBAGENT_ID_RE.test(id) && id.length <= 32 ? id : null
}

/** 从工具名 + 参数 + 输出拼出可打开的子 Agent id */
export function subAgentIdFromTool(
  toolName: string | undefined,
  args?: Record<string, unknown> | null,
  ...texts: Array<string | undefined | null>
): string | null {
  if (!isSubAgentInspectTool(toolName)) return null
  const fromArgs = idFromUnknown(args?.agent_id ?? args?.agentId ?? args?.id)
  if (fromArgs) return fromArgs
  for (const text of texts) {
    const id = parseSubAgentId(text)
    if (id) return id
    const parts = String(text || '')
      .split('·')
      .map((part) => part.trim())
    const last = parts[parts.length - 1]
    if (last && idFromUnknown(last)) return last
  }
  return null
}

/** 活动 label 补上 id，便于旧时间线回点开 */
export function stampSubAgentIdOnLabel(label: string, id: string): string {
  const nextId = id.trim()
  if (!nextId || label.includes(nextId)) return label
  return `${label} · ${nextId}`
}

export function stampSubAgentActivity(
  activities: Array<{ kind: string; label: string }>,
  toolName: string,
  args?: Record<string, unknown> | null,
  ...texts: Array<string | undefined | null>
): boolean {
  const id = subAgentIdFromTool(toolName, args, ...texts)
  if (!id) return false
  for (let i = activities.length - 1; i >= 0; i--) {
    const row = activities[i]
    if (!row.label.startsWith(toolName)) continue
    const next = stampSubAgentIdOnLabel(row.label, id)
    if (next === row.label) return false
    activities[i] = { ...row, label: next }
    return true
  }
  return false
}

export const SUBAGENT_PERSIST_INTERRUPTED = '应用重启后中断'
const STREAMING_CAP = 4000
const RESULT_CAP = 20_000

/** 重启时进行中的孩子无法续跑，标失败并保留已有正文 */
export function interruptRunningSubAgent(
  snap: SubAgentSnapshot,
  now = Date.now()
): SubAgentSnapshot {
  if (snap.status !== 'running') return snap
  return {
    ...snap,
    status: 'failed',
    streaming: '',
    result: snap.result.trim() || SUBAGENT_PERSIST_INTERRUPTED,
    updatedAt: now
  }
}

export function capSubAgentSnapshot(snap: SubAgentSnapshot): SubAgentSnapshot {
  return {
    ...snap,
    streaming: snap.streaming.slice(-STREAMING_CAP),
    result: snap.result.slice(0, RESULT_CAP)
  }
}

/** 解析 ~/.sharker/subagents.json */
export function parsePersistedSubAgents(raw: unknown): SubAgentSnapshot[] {
  const obj = raw && typeof raw === 'object' ? (raw as { sessions?: unknown }) : null
  const list = Array.isArray(obj?.sessions) ? obj.sessions : Array.isArray(raw) ? raw : []
  const out: SubAgentSnapshot[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<SubAgentSnapshot>
    if (typeof row.id !== 'string' || !row.id.trim()) continue
    const status: SubAgentStatus =
      row.status === 'running' || row.status === 'failed' || row.status === 'done'
        ? row.status
        : 'done'
    out.push({
      id: row.id.trim(),
      parentConversationId: String(row.parentConversationId || ''),
      prompt: String(row.prompt || ''),
      status,
      result: String(row.result || ''),
      streaming: String(row.streaming || ''),
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0
    })
  }
  return out
}
