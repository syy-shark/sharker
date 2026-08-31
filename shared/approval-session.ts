/**
 * 工具审批决策：Allow once / Allow for session / Deny。
 * 纯逻辑，主进程 query-loop 与单测共用同一实现。
 * @see shared/ARCH.md
 */

/** 用户对单次审批请求的选择 */
export type ApprovalDecision = 'once' | 'session' | 'deny'

/** Official leftover (learn.chatgpt.com/docs/reference/troubleshooting). */
export const CHAT_APPEARS_STUCK_HINT =
  'If a chat appears stuck: Check whether Codex is waiting for an approval. Open the terminal and run a basic command like git status. Start a new chat with a smaller, more focused prompt.'

/** Official desktop approval actions (gap-matrix / #10760 / #5131). */
export const ALLOW_ONCE_LABEL = 'Allow once'
export const ALLOW_FOR_SESSION_LABEL = 'Allow for session'
export const DENY_LABEL = 'Deny'

export function approvalActionLabel(decision: ApprovalDecision): string {
  if (decision === 'once') return ALLOW_ONCE_LABEL
  if (decision === 'session') return ALLOW_FOR_SESSION_LABEL
  return DENY_LABEL
}

/** 兼容旧 IPC：boolean → decision */
export function normalizeApprovalDecision(
  input: ApprovalDecision | boolean | undefined | null
): ApprovalDecision {
  if (input === true || input === 'once') return 'once'
  if (input === 'session') return 'session'
  return 'deny'
}

/**
 * 会话级授权匹配键。
 * 同 toolName 的后续审批可被「允许本会话」跳过（不绑具体 args，便于同工具续跑）。
 */
export function matchKeyForApproval(
  toolName: string,
  _args?: Record<string, unknown>
): string {
  return String(toolName || '').trim() || 'unknown'
}

/** 是否应将 decision 视为通过执行 */
export function isApprovalGranted(decision: ApprovalDecision): boolean {
  return decision === 'once' || decision === 'session'
}

/**
 * 会话内审批授权表：session grant 后同 matchKey 自动通过。
 * once 只通过当前请求，不写入表；deny 拒绝且不写入。
 */
/** 最近一次被拒的高危/路径审批（供 `/approve` 重试一次） */
export interface DeniedApproval {
  toolName: string
  description: string
}

export class SessionApprovalStore {
  private readonly grants = new Set<string>()
  private readonly onceKeys = new Set<string>()
  private lastDenied: DeniedApproval | null = null

  /** 当前已记录的 session 授权数量（测试/调试） */
  get size(): number {
    return this.grants.size
  }

  /** 最近一次拒绝（无则 null） */
  getLastDenied(): DeniedApproval | null {
    return this.lastDenied
  }

  /** 记下拒绝，供 `/approve` 排队一次重试 */
  recordDenial(toolName: string, description: string): void {
    this.lastDenied = {
      toolName: String(toolName || '').trim() || 'unknown',
      description: String(description || '').trim()
    }
  }

  /** `/approve`：把最近拒绝的工具排进一次性放行 */
  queueApproveOnce(): { ok: boolean; denial: DeniedApproval | null } {
    if (!this.lastDenied) return { ok: false, denial: null }
    this.onceKeys.add(matchKeyForApproval(this.lastDenied.toolName))
    return { ok: true, denial: this.lastDenied }
  }

  /** 消费一次性放行；命中则返回 true */
  consumeOnce(toolName: string, args?: Record<string, unknown>): boolean {
    const key = matchKeyForApproval(toolName, args)
    if (!this.onceKeys.has(key)) return false
    this.onceKeys.delete(key)
    return true
  }

  /** 是否已有对该工具的 session 授权 */
  isGranted(toolName: string, args?: Record<string, unknown>): boolean {
    return this.grants.has(matchKeyForApproval(toolName, args))
  }

  /**
   * 应用用户决策。
   * @returns 是否允许执行该次工具调用
   */
  applyDecision(
    decision: ApprovalDecision | boolean,
    toolName: string,
    args?: Record<string, unknown>
  ): boolean {
    const d = normalizeApprovalDecision(decision)
    if (d === 'deny') return false
    if (d === 'session') {
      this.grants.add(matchKeyForApproval(toolName, args))
    }
    return true
  }

  /** 清空本会话授权（新对话或显式重置） */
  clear(): void {
    this.grants.clear()
    this.onceKeys.clear()
    this.lastDenied = null
  }

  /** 导出授权键（测试） */
  listGrants(): string[] {
    return Array.from(this.grants).sort()
  }
}

/**
 * 按 conversationId 持有 SessionApprovalStore。
 * 主进程全局一份，切换会话时不互相污染。
 */
export class ConversationApprovalRegistry {
  private readonly byConversation = new Map<string, SessionApprovalStore>()

  get(conversationId: string | null | undefined): SessionApprovalStore {
    const id = conversationId?.trim() || '__default__'
    let store = this.byConversation.get(id)
    if (!store) {
      store = new SessionApprovalStore()
      this.byConversation.set(id, store)
    }
    return store
  }

  clear(conversationId: string): void {
    this.byConversation.get(conversationId)?.clear()
    this.byConversation.delete(conversationId)
  }

  clearAll(): void {
    this.byConversation.clear()
  }

  /** `/approve`：当前会话最近一次拒绝排队一次重试 */
  approveLastDenial(conversationId: string | null | undefined): {
    ok: boolean
    denial: DeniedApproval | null
  } {
    return this.get(conversationId).queueApproveOnce()
  }
}

/**
 * 在发起 UI 审批前解析：已 session 授权则直接通过。
 * 返回 null 表示仍需询问用户。
 */
export function resolveSessionGrant(
  store: SessionApprovalStore,
  toolName: string,
  args?: Record<string, unknown>
): ApprovalDecision | null {
  if (store.isGranted(toolName, args)) return 'session'
  if (store.consumeOnce(toolName, args)) return 'once'
  return null
}

/** `/approve` 结果文案 */
export function formatApproveRetry(result: {
  ok: boolean
  denial: DeniedApproval | null
}): string {
  if (!result.ok || !result.denial) {
    return '没有可重试的被拒操作。高危或越权路径被拒绝后，可用 `/approve` 批准下一次同工具重试（对标 Codex）。'
  }
  const detail = result.denial.description ? `\n\n${result.denial.description}` : ''
  return `已批准重试一次 \`${result.denial.toolName}\`。下一轮若再调用该工具，将跳过确认。${detail}`
}
