/**
 * Memory Retriever：精确 + 关键词 + 语义（embedding 余弦）。
 */
import { embedText, cosineSimilarity } from './embeddings'
import { listMemoriesExact, searchMemoriesKeyword, loadMemoryEmbeddingCandidates, touchMemories } from './memories'
import { getProjectSummary } from './projects'
import type { MemoryRow, RetrieveContext, RetrievedMemory } from './types'

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那', '有', '和', '与', '或',
  'the', 'a', 'an', 'is', 'are', 'was', 'to', 'of', 'in', 'for', 'on', 'with', 'please'
])

function extractKeywords(text: string): string[] {
  const parts = text
    .toLowerCase()
    .split(/[\s,，。！？；;:：/\\|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !STOP_WORDS.has(s))
  return [...new Set(parts)].slice(0, 8)
}

function scopeBoost(scope: string): number {
  if (scope === 'session') return 1.2
  if (scope === 'workspace') return 1.1
  if (scope === 'project') return 1.05
  return 1
}

function rowToRetrieved(row: MemoryRow, score: number, source: RetrievedMemory['source']): RetrievedMemory {
  return {
    id: row.id,
    scope: row.scope,
    kind: row.kind,
    content: row.content,
    score,
    source
  }
}

function mergeResults(items: RetrievedMemory[], limit: number): RetrievedMemory[] {
  const byId = new Map<string, RetrievedMemory>()
  for (const item of items) {
    const prev = byId.get(item.id)
    if (!prev || item.score > prev.score) byId.set(item.id, item)
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** 混合检索 */
export async function retrieveMemories(
  ctx: RetrieveContext,
  settings: import('../../shared/types').AppSettings
): Promise<{ memories: RetrievedMemory[]; projectSummary: string | null }> {
  const limit = ctx.limit ?? 12
  const collected: RetrievedMemory[] = []

  const exactRows = await listMemoriesExact({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    sessionId: ctx.sessionId,
    limit: 8
  })
  for (const row of exactRows) {
    collected.push(
      rowToRetrieved(row, row.importance * scopeBoost(row.scope), 'exact')
    )
  }

  const keywords = extractKeywords(ctx.userMessage)
  for (const kw of keywords.slice(0, 4)) {
    const rows = await searchMemoriesKeyword(kw, {
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      limit: 5
    })
    for (const row of rows) {
      collected.push(rowToRetrieved(row, 0.4 + row.importance * 0.3, 'keyword'))
    }
  }

  const queryForEmbed = [ctx.userMessage, ...(ctx.recentMessages ?? [])].join('\n').slice(0, 2000)
  const queryVec = await embedText(settings, queryForEmbed)
  if (queryVec) {
    const candidates = await loadMemoryEmbeddingCandidates({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      limit: 60
    })
    for (const row of candidates) {
      const vec = row.embedding_json
      if (!vec) continue
      const sim = cosineSimilarity(queryVec, vec)
      if (sim > 0.72) {
        collected.push(rowToRetrieved(row, sim * scopeBoost(row.scope), 'semantic'))
      }
    }
  }

  const memories = mergeResults(collected, limit)
  void touchMemories(memories.map((m) => m.id))

  const projectSummary = ctx.projectId ? await getProjectSummary(ctx.projectId) : null
  return { memories, projectSummary }
}
