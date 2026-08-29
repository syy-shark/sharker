/**
 * update_plan：官方任务清单（对标 Codex update_plan，不是计划模式）。
 * 只回 Plan updated；像素/清单由过程区画。
 * @see tools/ARCH.md
 */
import { ok } from '../context'
import type { ToolHandler } from '../types'
import { assertUpdatePlanArgs, formatUpdatePlanToolOutput } from '../../shared/update-plan'

export const updatePlanTool: ToolHandler = {
  name: 'update_plan',
  title: '更新计划',
  async execute(args) {
    assertUpdatePlanArgs(args)
    return ok(formatUpdatePlanToolOutput())
  }
}
