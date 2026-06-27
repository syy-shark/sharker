/**
 * Memory Writer：判断并自动写入长期记忆。
 */
import { randomUUID } from 'crypto'
import { simpleCompletion } from '../../providers/openai'
import { embedText } from './embeddings'
import { insertMemory } from './memories'
import { recordEvents } from './events'
import type { MemoryKind, MemoryScope, WriterInput, WriterMemoryCandidate } from './types'

const REMEMBER_PATTERN = /记住|别忘了|remember|don't forget|请记得/i
const PREFERENCE_PATTERN = /我喜欢|我偏好|我习惯|我常用|我默认|不要用|别用|always|never|prefer/i
const DECISION_PATTERN = /决定|方案|采用|选用|architecture|design/i

function heuristicCandidates(input: WriterInput): WriterMemoryCandidate[] {
  const out: WriterMemoryCandidate[] = []
  const user = input.userText.trim()

  if (REMEMBER_PATTERN.test(user)) {
    out.push({
      scope: input.projectId ? 'project' : 'global',
      kind: 'fact',
      content: user.replace(REMEMBER_PATTERN, '').trim() || user
    })
  }

  if (PREFERENCE_PATTERN.test(user)) {
    out.push({ scope: 'global', kind: 'preference', content: user.slice(0, 400) })
  }

  if (DECISION_PATTERN.test(user) || DECISION_PATTERN.test(input.assistantText)) {
    const snippet = (input.assistantText || user).slice(0, 500)
    out.push({
      scope: input.projectId ? 'project' : 'workspace',
      kind: 'decision',
      content: snippet
    })
  }

  for (const e of input.events) {
    if (e.kind === 'tool_error' || (e.kind === 'verify' && e.payload?.ok === false)) {
      out.push({
        scope: 'project',
        kind: 'gotcha',
        content: `Tool ${e.toolName ?? e.kind} failed: ${JSON.stringify(e.payload).slice(0, 200)}`
      })
    }
  }

  return out
}

async function llmExtractCandidates(input: WriterInput): Promise<WriterMemoryCandidate[]> {
  const prompt = `Extract 0-3 durable memories from this coding agent turn. JSON only:
{"memories":[{"scope":"global|project|workspace|session","kind":"preference|fact|decision|gotcha|workflow|summary","content":"..."}]}

User:
${input.userText.slice(0, 1500)}

Assistant:
${input.assistantText.slice(0, 1500)}

Events:
${input.events.map((e) => `${e.kind} ${e.toolName ?? ''}`).join('\n').slice(0, 800)}`

  try {
    const raw = await simpleCompletion(
      input.settings,
      'You extract durable user/project memories. Reply JSON only.',
      prompt
    )
    const json = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, '')) as {
      memories?: Array<{ scope?: string; kind?: string; content?: string }>
    }
    const scopes: MemoryScope[] = ['global', 'project', 'workspace', 'session']
    const kinds: MemoryKind[] = [
      'preference',
      'fact',
      'decision',
      'gotcha',
      'workflow',
      'summary'
    ]
    return (json.memories ?? [])
      .filter((m) => m.content?.trim())
      .slice(0, 3)
      .map((m) => ({
        scope: scopes.includes(m.scope as MemoryScope)
          ? (m.scope as MemoryScope)
          : input.projectId
            ? 'project'
            : 'global',
        kind: kinds.includes(m.kind as MemoryKind) ? (m.kind as MemoryKind) : 'fact',
        content: m.content!.trim().slice(0, 500)
      }))
  } catch {
    return []
  }
}

function resolveScope(
  scope: MemoryScope,
  input: WriterInput
): { scope: MemoryScope; projectId: string | null; workspaceId: string | null; sessionId: string | null } {
  if (scope === 'global') {
    return { scope, projectId: null, workspaceId: null, sessionId: null }
  }
  if (scope === 'project') {
    return { scope, projectId: input.projectId, workspaceId: null, sessionId: null }
  }
  if (scope === 'workspace') {
    return { scope, projectId: input.projectId, workspaceId: input.workspaceId, sessionId: null }
  }
  return {
    scope,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId
  }
}

/** Turn 结束后写入记忆与事件 */
export async function writeMemoriesFromTurn(input: WriterInput): Promise<void> {
  const turnId = randomUUID()

  if (input.sessionId) {
    await recordEvents(input.sessionId, turnId, [
      { kind: 'user_message', payload: { text: input.userText.slice(0, 500) } },
      ...input.events,
      { kind: 'assistant_message', payload: { text: input.assistantText.slice(0, 500) } }
    ])
  }

  const heuristic = heuristicCandidates(input)
  const llm =
    input.userText.length > 20 || input.assistantText.length > 80
      ? await llmExtractCandidates(input)
      : []

  const seen = new Set<string>()
  const candidates = [...heuristic, ...llm].filter((c) => {
    const key = c.content.slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  for (const c of candidates.slice(0, 5)) {
    const resolved = resolveScope(c.scope, input)
    const embedding = await embedText(input.settings, c.content)
    await insertMemory({
      scope: resolved.scope,
      projectId: resolved.projectId,
      workspaceId: resolved.workspaceId,
      sessionId: resolved.sessionId,
      kind: c.kind,
      content: c.content,
      source: 'writer',
      embedding
    })
  }
}
