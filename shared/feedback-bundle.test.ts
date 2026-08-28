import { describe, expect, it } from 'vitest'
import { formatFeedbackBundle, parseFeedbackClassification } from './feedback-bundle'

describe('feedback bundle', () => {
  const base = {
    modelLabel: 'kimi',
    permissionMode: 'sandbox' as const,
    networkMode: 'open' as const,
    threadMode: 'local' as const,
    workspacePath: '/repo',
    conversationId: 'c1',
    mcpServerCount: 2,
    appVersion: '0.1.0'
  }

  it('includes thread status and local-only notice', () => {
    const text = formatFeedbackBundle(base)
    expect(text).toContain('不会发送')
    expect(text).toContain('kimi')
    expect(text).toContain('c1')
    expect(text).toContain('MCP Server**：2')
  })

  it('keeps classification and reason and can omit session diagnostics', () => {
    expect(parseFeedbackClassification('other')).toBe('other')
    expect(parseFeedbackClassification('bug')).toBe('bug')
    const full = formatFeedbackBundle({
      ...base,
      classification: 'bug',
      reason: '滚动卡顿'
    })
    expect(full).toContain('问题')
    expect(full).toContain('滚动卡顿')
    expect(full).toContain('kimi')
    const slim = formatFeedbackBundle({
      ...base,
      classification: 'other',
      reason: '想要导出',
      includeSession: false
    })
    expect(slim).toContain('其他')
    expect(slim).toContain('想要导出')
    expect(slim).toContain('c1')
    expect(slim).not.toContain('kimi')
    expect(slim).not.toContain('MCP Server')
  })
})
