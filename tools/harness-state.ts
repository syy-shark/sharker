/**
 * Harness 运行时状态：计划模式、Build 阶段、Worktree 路径覆盖。
 * @see tools/README.md
 */
export type HarnessPhase = 'normal' | 'plan' | 'build'

interface HarnessState {
  phase: HarnessPhase
  /** 当前 worktree 覆盖 cwd（enter_worktree 后生效） */
  worktreePath: string | null
  /** exit_plan_mode 产出的计划正文 */
  planDocument: string | null
  planFilePath: string | null
}

const state: HarnessState = {
  phase: 'normal',
  worktreePath: null,
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

/** 设置 worktree 路径覆盖 */
export function setWorktreePath(p: string | null): void {
  state.worktreePath = p
}

/** 当前 worktree 路径（无则 null） */
export function getWorktreePath(): string | null {
  return state.worktreePath
}

/** 重置全部 Harness 状态（切换工作区时可选调用） */
export function resetHarnessState(): void {
  state.phase = 'normal'
  state.worktreePath = null
  state.planDocument = null
  state.planFilePath = null
}
