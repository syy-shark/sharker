import { describe, expect, it } from 'vitest'
import { buildSuggestedPrompts, pickResumeSuggestions } from './suggested-prompts'

describe('suggested prompts', () => {
  it('returns nothing without a workspace or when disabled', () => {
    expect(buildSuggestedPrompts({ hasWorkspace: false })).toEqual([])
    expect(buildSuggestedPrompts({ enabled: false, hasWorkspace: true })).toEqual([])
    expect(
      pickResumeSuggestions({
        currentId: 'now',
        conversations: [
          { id: 'old', title: '最早', updatedAt: 1 },
          { id: 'now', title: '当前', updatedAt: 9 },
          { id: 'new', title: '最近', updatedAt: 8 }
        ]
      }).map((r) => r.id)
    ).toEqual(['new'])
    expect(
      pickResumeSuggestions({
        currentId: 'now',
        conversations: [
          { id: 'old', title: '最早', updatedAt: 1, unread: true },
          { id: 'live', title: '直播', updatedAt: 2 },
          { id: 'now', title: '当前', updatedAt: 9 }
        ],
        attentionIds: ['live']
      }).map((r) => r.reason)
    ).toEqual(['attention', 'unread'])
  })

  it('offers review, goal, and a recent chat', () => {
    const items = buildSuggestedPrompts({
      hasWorkspace: true,
      recent: { id: 'c1', title: '登录页' }
    })
    expect(items.map((i) => i.id)).toEqual(['resume-c1', 'review', 'goal'])
    expect(items[0]?.payload).toBe('c1')
    expect(items[0]?.title).toBe('继续「登录页」')
  })

  it('skips the goal chip when a goal is already set', () => {
    const items = buildSuggestedPrompts({
      hasWorkspace: true,
      hasGoal: true,
      recent: { id: 'c1', title: '  ' }
    })
    expect(items.map((i) => i.id)).toEqual(['resume-c1', 'review'])
    expect(items[0]?.title).toBe('继续「上一段对话」')
    const attention = buildSuggestedPrompts({
      hasWorkspace: true,
      hasGoal: true,
      resumes: [{ id: 'live', title: '改登录', reason: 'attention' }]
    })
    expect(attention[0]?.title).toBe('继续进行中的「改登录」')
  })
})
