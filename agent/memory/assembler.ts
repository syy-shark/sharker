/**
 * Context Assembler：检索结果 → prompt block（预算内）。
 */
import { listRecentEvents } from './events'
import { retrieveMemories } from './retriever'
import type { AppSettings } from '../../shared/types'
import type { AssembledMemoryContext, RetrieveContext } from './types'

const DEFAULT_CHAR_BUDGET = 3200

export interface AssembleInput {
  settings: AppSettings
  workspaceId: string
  projectId: string | null
  sessionId: string | null
  userMessage: string
  recentMessages?: string[]
  charBudget?: number
}

/** 组装 memory context block */
export async function assembleMemoryContext(input: AssembleInput): Promise<AssembledMemoryContext | null> {
  const ctx: RetrieveContext = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    recentMessages: input.recentMessages,
    limit: 10
  }

  const { memories, projectSummary } = await retrieveMemories(ctx, input.settings)
  const recentEvents =
    input.sessionId != null ? await listRecentEvents(input.sessionId, 4) : []

  if (memories.length === 0 && !projectSummary && recentEvents.length === 0) {
    return null
  }

  const budget = input.charBudget ?? DEFAULT_CHAR_BUDGET
  const parts: string[] = [
    '# Memory context (retrieved for this turn — do not repeat verbatim to the user)'
  ]

  if (projectSummary) {
    parts.push('', `## Project`, projectSummary)
  }

  if (memories.length > 0) {
    parts.push('', '## Relevant memories')
    let used = parts.join('\n').length
    for (const m of memories) {
      const line = `- [${m.kind}/${m.scope}] ${m.content}`
      if (used + line.length + 1 > budget) break
      parts.push(line)
      used += line.length + 1
    }
  }

  const failEvents = recentEvents.filter(
    (e) => e.kind === 'tool_error' || e.kind === 'verify'
  )
  if (failEvents.length > 0 && parts.join('\n').length < budget - 200) {
    parts.push('', '## Recent issues (this session)')
    for (const e of failEvents.slice(0, 3)) {
      const tool = e.tool_name ? `${e.tool_name}: ` : ''
      const summary = JSON.stringify(e.payload).slice(0, 120)
      parts.push(`- ${e.kind} ${tool}${summary}`)
    }
  }

  const block = parts.join('\n')
  return {
    block,
    memoryIds: memories.map((m) => m.id),
    charEstimate: block.length
  }
}
