/**
 * 对话里创建 / 更新定时任务（对标 Codex Ask ChatGPT to create or update scheduled tasks）。
 * @see tools/builtins/tasks/ARCH.md
 */
import { applyScheduledTaskAction } from '../../../shared/automation'
import { listAutomations, saveAutomations } from '../../../electron/main/automation-scheduler'
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

export const manageScheduledTaskTool: ToolHandler = {
  name: 'manage_scheduled_task',
  title: '定时任务',
  assessRisk: (args) => {
    const op = String(args.op ?? 'list')
    if (op === 'list') return { highRisk: false, reason: '' }
    return { highRisk: true, reason: '创建或改动定时任务' }
  },
  async execute(args, ctx) {
    const jobs = await listAutomations()
    const result = applyScheduledTaskAction(jobs, args, {
      currentConversationId: ctx.conversationId
    })
    if (result.changed) await saveAutomations(result.jobs)
    return ok(result.message)
  }
}
