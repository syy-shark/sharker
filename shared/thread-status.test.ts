import { describe, expect, it } from 'vitest'
import { formatContextUsage, formatThreadStatus, formatWritableRoots } from './thread-status'

describe('thread status', () => {
  it('lists local thread fields and hides worktree path', () => {
    const text = formatThreadStatus({
      conversationId: 'conv-live',
      modelLabel: 'DeepSeek / deepseek-chat',
      permissionMode: 'sandbox',
      networkMode: 'open',
      threadMode: 'local',
      workspacePath: '/repo',
      worktreePath: '/hidden',
      branch: 'main',
      goal: '修好滚动',
      contextUsed: 1200,
      contextLimit: 128000,
      usageTodayTokens: 4200,
      usageTodayTurns: 3,
      fast: true,
      extraRoots: ['/notes', ' /docs ']
    })
    expect(text).toContain('Local')
    expect(text).not.toContain('本地工作区')
    expect(text).not.toContain('隔离 worktree')
    expect(text).toContain('DeepSeek / deepseek-chat')
    expect(text).toContain('修好滚动')
    expect(text).toContain('1200 / 128000（1%）')
    expect(formatContextUsage(1200, 128000)).toBe('1200 / 128000（1%）')
    expect(formatContextUsage(0, 0)).toBe('0')
    expect(text).toContain('conv-live')
    expect(text).toMatch(/今日 4[,.]?200 tokens · 3 回合/)
    expect(text).not.toContain('/hidden')
    expect(text).toContain('**Fast**：开')
    expect(text).toContain('/notes、/docs')
    expect(formatWritableRoots([' /a ', ''])).toBe('/a')
    expect(formatWritableRoots([])).toBeUndefined()
  })

  it('shows the isolated worktree path', () => {
    const text = formatThreadStatus({
      modelLabel: 'kimi',
      permissionMode: 'full',
      networkMode: 'local_only',
      threadMode: 'worktree',
      workspacePath: '/repo',
      worktreePath: '/tmp/wt'
    })
    expect(text).toContain('Worktree')
    expect(text).not.toContain('隔离 worktree')
    expect(text).not.toContain('本地工作区')
    expect(text).toContain('/tmp/wt')
  })
})
