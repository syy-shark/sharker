/**
 * Harness 运行时状态：计划模式、Build 阶段、Worktree 路径覆盖。
 * 计划阶段按会话隔离，避免并行线程互踩。
 * @see tools/ARCH.md
 */
export type HarnessPhase = 'normal' | 'plan' | 'build'

const DEFAULT_KEY = '__default__'

interface ConversationHarness {
  phase: HarnessPhase
  planDocument: string | null
  planFilePath: string | null
}

interface HarnessState {
  /** 按会话隔离的 worktree 覆盖 cwd */
  worktreeByConversation: Map<string, string>
  phaseByConversation: Map<string, ConversationHarness>
}

const state: HarnessState = {
  worktreeByConversation: new Map(),
  phaseByConversation: new Map()
}

function phaseKey(conversationId?: string | null): string {
  return conversationId?.trim() || DEFAULT_KEY
}

function bucket(conversationId?: string | null): ConversationHarness {
  const key = phaseKey(conversationId)
  let current = state.phaseByConversation.get(key)
  if (!current) {
    current = { phase: 'normal', planDocument: null, planFilePath: null }
    state.phaseByConversation.set(key, current)
  }
  return current
}

/** 当前 Harness 阶段（默认按会话，无 id 走共享桶） */
export function getHarnessPhase(conversationId?: string | null): HarnessPhase {
  return bucket(conversationId).phase
}

/** 进入计划模式（只读工具） */
export function enterPlanMode(conversationId?: string | null): void {
  const current = bucket(conversationId)
  current.phase = 'plan'
  current.planDocument = null
  current.planFilePath = null
}

/** 退出计划模式，可选保存计划文档 */
export function exitPlanMode(opts?: {
  document?: string
  filePath?: string
  conversationId?: string | null
}): void {
  const current = bucket(opts?.conversationId)
  current.phase = 'normal'
  if (opts?.document) current.planDocument = opts.document
  if (opts?.filePath) current.planFilePath = opts.filePath
}

/** 对标 Codex `/plan`：空参切换计划模式 */
export function togglePlanMode(conversationId?: string | null): HarnessPhase {
  const current = bucket(conversationId)
  if (current.phase === 'plan') {
    current.phase = 'normal'
    return 'normal'
  }
  current.phase = 'plan'
  current.planDocument = null
  current.planFilePath = null
  return 'plan'
}

/** 用户点击 Build：进入执行阶段（全工具） */
export function enterBuildMode(conversationId?: string | null): void {
  const current = bucket(conversationId)
  current.phase = 'build'
  current.planDocument = null
  current.planFilePath = null
}

/** 本轮 Build 结束，回到 normal */
export function finishBuildMode(conversationId?: string | null): void {
  const current = bucket(conversationId)
  if (current.phase === 'build') current.phase = 'normal'
}

/** 取最近产出的计划文档 */
export function getPlanDocument(conversationId?: string | null): {
  document: string | null
  filePath: string | null
} {
  const current = bucket(conversationId)
  return { document: current.planDocument, filePath: current.planFilePath }
}

/** 设置 worktree 路径覆盖；可按会话隔离，避免并行线程互踩 */
export function setWorktreePath(p: string | null, conversationId?: string | null): void {
  const key = conversationId?.trim() || DEFAULT_KEY
  if (p?.trim()) state.worktreeByConversation.set(key, p.trim())
  else state.worktreeByConversation.delete(key)
}

/** 当前 worktree 路径（优先会话，其次默认） */
export function getWorktreePath(conversationId?: string | null): string | null {
  const key = conversationId?.trim()
  if (key && state.worktreeByConversation.has(key)) {
    return state.worktreeByConversation.get(key) ?? null
  }
  return state.worktreeByConversation.get(DEFAULT_KEY) ?? null
}

/** 重置全部 Harness 状态（切换工作区时可选调用） */
export function resetHarnessState(): void {
  state.worktreeByConversation.clear()
  state.phaseByConversation.clear()
}
