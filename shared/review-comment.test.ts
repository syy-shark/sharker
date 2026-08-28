import { describe, expect, it } from 'vitest'
import { formatReviewCommentsPrompt } from './review-comment'

describe('review comments', () => {
  it('formats line-anchored comments for the agent', () => {
    const prompt = formatReviewCommentsPrompt([
      {
        id: '1',
        path: 'src/app.ts',
        line: 12,
        side: 'new',
        content: 'catch {}',
        text: '不要吞掉错误，写日志后再抛出'
      }
    ])
    expect(prompt).toContain('src/app.ts:12')
    expect(prompt).toContain('不要吞掉错误')
    expect(prompt).toContain('catch {}')
    expect(prompt).toContain('保持范围最小')
  })
})
