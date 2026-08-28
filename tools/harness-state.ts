/**
 * Harness 运行时状态：计划模式、Build 阶段、Worktree 路径覆盖。
 * @see tools/ARCH.md
 */
export type HarnessPhase = 'normal' | 'plan' | 'build'

const DEFAULT_WORKTREE_KEY = '__default__'

interface HarnessState {
  phase: HarnessPhase
  /** 按会话隔离的 worktree 覆盖 cwd */
  worktreeByConversation: Map<string, string>
  /** exit_plan_mode 产出的计划正文 */
  planDocument: string | null
  planFilePath: string | null
}

const state: HarnessState = {
  phase: 'normal',
  worktreeByConversation: new Map(),
  planDocument: null,
  planFilePath: null
}

/** 当前 Harness 阶段 */
export function getHarnessPhase(): HarnessPhase {
  return state.phase
}

/** 进入计划模式（只读工具） */
export function enterPlanMode(): void {
  state.phase = 'plan'
  state.planDocument = null
  state.planFilePath = null
}

/** 退出计划模式，可选保存计划文档 */
export function exitPlanMode(opts?: { document?: string; filePath?: string }): void {
  state.phase = 'normal'
  if (opts?.document) state.planDocument = opts.document
  if (opts?.filePath) state.planFilePath = opts.filePath
}

/** 用户点击 Build：进入执行阶段（全工具） */
export function enterBuildMode(): void {
  state.phase = 'build'
  state.planDocument = null
  state.planFilePath = null
}

/** 本轮 Build 结束，回到 normal */
export function finishBuildMode(): void {
  if (state.phase === 'build') state.phase = 'normal'
}

/** 取最近产出的计划文档 */
export function getPlanDocument(): { document: string | null; filePath: string | null } {
  return { document: state.planDocument, filePath: state.planFilePath }
}

/** 设置 worktree 路径覆盖；可按会话隔离，避免并行线程互踩 */
export function setWorktreePath(p: string | null, conversationId?: string | null): void {
  const key = conversationId?.trim() || DEFAULT_WORKTREE_KEY
  if (p?.trim()) state.worktreeByConversation.set(key, p.trim())
  else state.worktreeByConversation.delete(key)
}

/** 当前 worktree 路径（优先会话，其次默认） */
export function getWorktreePath(conversationId?: string | null): string | null {
  const key = conversationId?.trim()
  if (key && state.worktreeByConversation.has(key)) {
    return state.worktreeByConversation.get(key) ?? null
  }
  return state.worktreeByConversation.get(DEFAULT_WORKTREE_KEY) ?? null
}

/** 重置全部 Harness 状态（切换工作区时可选调用） */
export function resetHarnessState(): void {
  state.phase = 'normal'
  state.worktreeByConversation.clear()
  state.planDocument = null
  state.planFilePath = null
}
