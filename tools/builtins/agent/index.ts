/**
 * 子 Agent Tool 组。
 * @see agent/coordinator.ts
 */
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

async function autoApprove(): Promise<boolean> {
  return true
}

export const agentSpawnTool: ToolHandler = {
  name: 'agent_spawn',
  title: '启动子 Agent',
  assessRisk: () => ({ highRisk: true, reason: '启动子 Agent' }),
  async execute(args, ctx) {
    const { spawnSubAgent } = await import('../../../agent/coordinator')
    const prompt = String(args.prompt)
    const session = await spawnSubAgent(ctx.settings, prompt, autoApprove, ctx.signal)
    return ok(`Sub-agent ${session.id} started (task ${session.taskId}). Use agent_get_result to poll.`)
  }
}

export const agentSendMessageTool: ToolHandler = {
  name: 'agent_send_message',
  title: '子 Agent 消息',
  assessRisk: () => ({ highRisk: true, reason: '子 Agent 通信' }),
  async execute(args, ctx) {
    const { sendSubAgentMessage } = await import('../../../agent/coordinator')
    const msg = await sendSubAgentMessage(
      ctx.settings,
      String(args.agent_id),
      String(args.message),
      autoApprove,
      ctx.signal
    )
    return ok(msg)
  }
}

export const agentGetResultTool: ToolHandler = {
  name: 'agent_get_result',
  title: '子 Agent 结果',
  async execute(args) {
    const { getSubAgent } = await import('../../../agent/coordinator')
    const s = getSubAgent(String(args.agent_id))
    if (!s) throw new Error('Agent not found')
    return ok(`Status: ${s.status}\n\n${s.result || '(still running)'}`)
  }
}

export const agentListTool: ToolHandler = {
  name: 'agent_list',
  title: '子 Agent 列表',
  async execute() {
    const { listSubAgents } = await import('../../../agent/coordinator')
    const list = listSubAgents()
    if (!list.length) return ok('(no sub-agents)')
    return ok(list.map((s) => `${s.id} [${s.status}] ${s.prompt.slice(0, 60)}`).join('\n'))
  }
}

export const agentTools: ToolHandler[] = [
  agentSpawnTool,
  agentSendMessageTool,
  agentGetResultTool,
  agentListTool
]
