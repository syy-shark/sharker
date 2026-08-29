/**
 * 空对话建议提示（对标 Codex Settings → Suggested prompts：
 * 回来时先给出要继续的任务，再给审查 / 目标）。
 * @see shared/ARCH.md
 */

export type SuggestedPromptKind = 'slash' | 'resume'

export type ResumeSuggestionReason = 'attention' | 'unread' | 'recent'

export interface SuggestedPrompt {
  id: string
  title: string
  description: string
  kind: SuggestedPromptKind
  payload: string
}

export type ResumeCandidate = {
  id: string
  title?: string
  updatedAt?: number
  unread?: boolean
}

export type ResumeSuggestion = {
  id: string
  title: string
  reason: ResumeSuggestionReason
}

/** 先进行中/等待回复，再未读，再按 updatedAt 最近（不对创建时间排队） */
export function pickResumeSuggestions(input: {
  currentId?: string | null
  conversations: readonly ResumeCandidate[]
  attentionIds?: readonly string[]
  limit?: number
}): ResumeSuggestion[] {
  const current = input.currentId || ''
  const byId = new Map(input.conversations.map((c) => [c.id, c]))
  const out: ResumeSuggestion[] = []
  const seen = new Set<string>()
  const titleOf = (c: ResumeCandidate) => c.title?.trim() || '上一段对话'
  const push = (id: string, reason: ResumeSuggestionReason) => {
    if (!id || id === current || seen.has(id)) return
    const c = byId.get(id)
    if (!c) return
    seen.add(id)
    out.push({ id, title: titleOf(c), reason })
  }
  for (const id of input.attentionIds ?? []) push(id, 'attention')
  const others = input.conversations.filter((c) => c.id && c.id !== current)
  for (const c of [...others].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))) {
    if (c.unread) push(c.id, 'unread')
  }
  for (const c of [...others].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))) {
    push(c.id, 'recent')
  }
  return out.slice(0, Math.max(1, input.limit ?? 2))
}

function resumeChip(item: ResumeSuggestion): SuggestedPrompt {
  const quoted = `「${item.title}」`
  if (item.reason === 'attention') {
    return {
      id: `resume-${item.id}`,
      title: `继续进行中的${quoted}`,
      description: '回到正在跑或等你回复的对话',
      kind: 'resume',
      payload: item.id
    }
  }
  if (item.reason === 'unread') {
    return {
      id: `resume-${item.id}`,
      title: `打开未读的${quoted}`,
      description: '回到未读对话',
      kind: 'resume',
      payload: item.id
    }
  }
  return {
    id: `resume-${item.id}`,
    title: `继续${quoted}`,
    description: '回到最近更新的对话',
    kind: 'resume',
    payload: item.id
  }
}

/** 空对话时最多三条上下文建议：先恢复任务，再审查 / 目标 */
export function buildSuggestedPrompts(input: {
  enabled?: boolean
  hasWorkspace: boolean
  hasGoal?: boolean
  resumes?: readonly ResumeSuggestion[]
  recent?: { id: string; title: string } | null
}): SuggestedPrompt[] {
  if (input.enabled === false || !input.hasWorkspace) return []
  const resumes = input.resumes?.length
    ? input.resumes
    : input.recent?.id
      ? [{ id: input.recent.id, title: input.recent.title.trim() || '上一段对话', reason: 'recent' as const }]
      : []
  const out: SuggestedPrompt[] = resumes.map(resumeChip)
  out.push({
    id: 'review',
    title: '审查本地变更',
    description: '打开未提交 diff',
    kind: 'slash',
    payload: 'review'
  })
  if (!input.hasGoal) {
    out.push({
      id: 'goal',
      title: '设定线程目标',
      description: '对标 Codex /goal',
      kind: 'slash',
      payload: 'goal'
    })
  }
  return out.slice(0, 3)
}
