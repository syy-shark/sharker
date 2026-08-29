/**
 * 官方 `update_plan`：任务清单（不是计划模式）。
 * 工具结果固定 `Plan updated`；过程区画 pending / in_progress / completed。
 * 不发明 /plan-model、底栏 Step N/5 徽章或第二套计划文档。
 * @see shared/ARCH.md
 */

export const UPDATE_PLAN_TOOL = 'update_plan'
export const UPDATE_PLAN_TOOL_OUTPUT = 'Plan updated'

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed'

export type UpdatePlanStep = {
  step: string
  status: PlanStepStatus
}

export type UpdatePlanArgs = {
  explanation: string | null
  plan: UpdatePlanStep[]
}

export function parsePlanStepStatus(raw: unknown): PlanStepStatus {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (value === 'in_progress' || value === 'inprogress') return 'in_progress'
  if (value === 'completed' || value === 'complete' || value === 'done') return 'completed'
  return 'pending'
}

/** 展示用解析：参数未齐时给空清单，不抛 */
export function parseUpdatePlanArgs(args: Record<string, unknown> | undefined): UpdatePlanArgs {
  const explanation = String(args?.explanation ?? '').trim() || null
  const raw = args?.plan
  if (!Array.isArray(raw)) return { explanation, plan: [] }
  const plan: UpdatePlanStep[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const step = String(rec.step ?? '').replace(/\s+/g, ' ').trim()
    if (!step) continue
    plan.push({
      step: step.length > 80 ? `${step.slice(0, 77)}…` : step,
      status: parsePlanStepStatus(rec.status)
    })
  }
  return { explanation, plan }
}

/** 执行用：官方要求 plan 数组 */
export function assertUpdatePlanArgs(args: Record<string, unknown>): UpdatePlanArgs {
  if (!Array.isArray(args.plan)) throw new Error('plan is required')
  return parseUpdatePlanArgs(args)
}

export function formatUpdatePlanToolOutput(): string {
  return UPDATE_PLAN_TOOL_OUTPUT
}

export function updatePlanProgress(plan: UpdatePlanStep[]): {
  done: number
  total: number
  current: string | null
} {
  return {
    done: plan.filter((item) => item.status === 'completed').length,
    total: plan.length,
    current: plan.find((item) => item.status === 'in_progress')?.step ?? null
  }
}

/** 直播头：进行中用当前步，完成后 Plan · done/total */
export function formatUpdatePlanActivity(
  args: Record<string, unknown> | undefined,
  status?: string
): string {
  const { plan } = parseUpdatePlanArgs(args)
  const { done, total, current } = updatePlanProgress(plan)
  if (status === 'active' && current) return current
  if (total > 0) return `Plan · ${done}/${total}`
  return status === 'active' ? 'Updating plan' : 'Plan'
}
