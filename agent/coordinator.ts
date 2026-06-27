/**
 * 子 Agent 编排：spawn、发消息、取结果。
 * @see agent/README.md
 */
import { randomUUID } from 'crypto'
import type { AppSettings, ChatMessage } from '../shared/types'
import { getActiveWorkspacePath } from '../shared/workspace'
import { buildSystemPrompt } from './loop'
import { queryLoop } from './query-loop'
import type { ApprovalHandler } from './loop'
import type { ChatCompletionMessage } from '../providers/openai'
import { createPlaceholderTask, updateTask } from '../tools/services/task-manager'

export interface SubAgentSession {
  id: string
  taskId: string
  prompt: string
  status: 'running' | 'done' | 'failed'
  result: string
  messages: ChatMessage[]
}

const sessions = new Map<string, SubAgentSession>()

/** 启动子 Agent（独立 queryLoop，共享审批） */
export async function spawnSubAgent(
  settings: AppSettings,
  prompt: string,
  onApproval: ApprovalHandler,
  signal?: AbortSignal
): Promise<SubAgentSession> {
  const id = randomUUID().slice(0, 8)
  const task = createPlaceholderTask(`Sub-agent ${id}`, prompt.slice(0, 120))
  const session: SubAgentSession = {
    id,
    taskId: task.id,
    prompt,
    status: 'running',
    result: '',
    messages: []
  }
  sessions.set(id, session)

  const workspace = getActiveWorkspacePath(settings)
  const system = await buildSystemPrompt(settings, { includeBootstrap: true })
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: `${system}\n\nYou are a sub-agent. Complete this task concisely:\n${prompt}` },
    { role: 'user', content: prompt }
  ]

  ;(async () => {
    try {
      let finalText = ''
      for await (const chunk of queryLoop(settings, messages, onApproval, signal, {
        userText: prompt,
        history: [],
        maxIterations: 8
      })) {
        if (chunk.type === 'token' && chunk.content) finalText += chunk.content
        if (signal?.aborted) break
      }
      session.result = finalText.trim() || '(no output)'
      session.status = 'done'
      updateTask(task.id, { status: 'done', output: session.result })
    } catch (e) {
      session.status = 'failed'
      session.result = e instanceof Error ? e.message : String(e)
      updateTask(task.id, { status: 'failed', output: session.result })
    }
  })()

  return session
}

export function getSubAgent(id: string): SubAgentSession | undefined {
  return sessions.get(id)
}

export function listSubAgents(): SubAgentSession[] {
  return [...sessions.values()]
}

/** 向子 Agent 追加 follow-up（重新 spawn 简化版） */
export async function sendSubAgentMessage(
  settings: AppSettings,
  agentId: string,
  message: string,
  onApproval: ApprovalHandler,
  signal?: AbortSignal
): Promise<string> {
  const prev = sessions.get(agentId)
  const prompt = prev ? `${prev.prompt}\n\nFollow-up: ${message}` : message
  const session = await spawnSubAgent(settings, prompt, onApproval, signal)
  return `New sub-agent ${session.id} started for follow-up.`
}
