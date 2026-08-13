/**
 * 工具审批决策：Allow once / Allow for session / Deny。
 * 纯逻辑，主进程 query-loop 与单测共用同一实现。
 * @see shared/ARCH.md
 */

/** 用户对单次审批请求的选择 */
export type ApprovalDecision = 'once' | 'session' | 'deny'

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
export class SessionApprovalStore {
  private readonly grants = new Set<string>()

  /** 当前已记录的 session 授权数量（测试/调试） */
  get size(): number {
    return this.grants.size
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
  return null
}
