import { describe, expect, it } from 'vitest'
import { formatFeedbackBundle } from './feedback-bundle'

describe('feedback bundle', () => {
  it('includes thread status and local-only notice', () => {
    const text = formatFeedbackBundle({
      modelLabel: 'kimi',
      permissionMode: 'sandbox',
      networkMode: 'open',
      threadMode: 'local',
      workspacePath: '/repo',
      conversationId: 'c1',
      mcpServerCount: 2,
      appVersion: '0.1.0'
    })
    expect(text).toContain('不会发送')
    expect(text).toContain('kimi')
    expect(text).toContain('c1')
    expect(text).toContain('MCP Server**：2')
  })
})
