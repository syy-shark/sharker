/**
 * 空对话建议提示（对标 Codex Settings → Suggested prompts）。
 * 只给本机真实动作：审查、目标、恢复最近对话。
 * @see shared/ARCH.md
 */

export type SuggestedPromptKind = 'slash' | 'resume'

export interface SuggestedPrompt {
  id: string
  title: string
  description: string
  kind: SuggestedPromptKind
  payload: string
}

/** 空对话时最多三条上下文建议 */
export function buildSuggestedPrompts(input: {
  enabled?: boolean
  hasWorkspace: boolean
  hasGoal?: boolean
  recent?: { id: string; title: string } | null
}): SuggestedPrompt[] {
  if (input.enabled === false || !input.hasWorkspace) return []
  const out: SuggestedPrompt[] = [
    {
      id: 'review',
      title: '审查本地变更',
      description: '打开未提交 diff',
      kind: 'slash',
      payload: 'review'
    }
  ]
  if (!input.hasGoal) {
    out.push({
      id: 'goal',
      title: '设定线程目标',
      description: '对标 Codex /goal',
      kind: 'slash',
      payload: 'goal'
    })
  }
  const recent = input.recent
  if (recent?.id) {
    const title = recent.title.trim() || '上一段对话'
    out.push({
      id: `resume-${recent.id}`,
      title: `继续「${title}」`,
      description: '回到最近的对话',
      kind: 'resume',
      payload: recent.id
    })
  }
  return out.slice(0, 3)
}
