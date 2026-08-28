import { describe, expect, it } from 'vitest'
import { formatThreadStatus } from './thread-status'

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
      contextLimit: 128000
    })
    expect(text).toContain('本地工作区')
    expect(text).toContain('DeepSeek / deepseek-chat')
    expect(text).toContain('修好滚动')
    expect(text).toContain('1200 / 128000')
    expect(text).toContain('conv-live')
    expect(text).not.toContain('/hidden')
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
    expect(text).toContain('隔离 worktree')
    expect(text).toContain('/tmp/wt')
  })
})
