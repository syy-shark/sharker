import { describe, expect, it } from 'vitest'
import { buildSuggestedPrompts } from './suggested-prompts'

describe('suggested prompts', () => {
  it('returns nothing without a workspace or when disabled', () => {
    expect(buildSuggestedPrompts({ hasWorkspace: false })).toEqual([])
    expect(buildSuggestedPrompts({ enabled: false, hasWorkspace: true })).toEqual([])
  })

  it('offers review, goal, and a recent chat', () => {
    const items = buildSuggestedPrompts({
      hasWorkspace: true,
      recent: { id: 'c1', title: '登录页' }
    })
    expect(items.map((i) => i.id)).toEqual(['review', 'goal', 'resume-c1'])
    expect(items[2]?.payload).toBe('c1')
  })

  it('skips the goal chip when a goal is already set', () => {
    const items = buildSuggestedPrompts({
      hasWorkspace: true,
      hasGoal: true,
      recent: { id: 'c1', title: '  ' }
    })
    expect(items.map((i) => i.id)).toEqual(['review', 'resume-c1'])
    expect(items[1]?.title).toBe('继续「上一段对话」')
  })
})
