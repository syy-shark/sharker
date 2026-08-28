import { describe, expect, it } from 'vitest'
import { lastCompletedAssistantText } from './copy-output'

describe('copy output', () => {
  it('returns the latest completed assistant text', () => {
    expect(
      lastCompletedAssistantText([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'one' },
        { role: 'user', content: 'more' },
        { role: 'assistant', content: '  two  ' }
      ])
    ).toBe('two')
  })

  it('skips empty assistant rows', () => {
    expect(
      lastCompletedAssistantText([
        { role: 'assistant', content: 'keep' },
        { role: 'assistant', content: '   ' }
      ])
    ).toBe('keep')
    expect(lastCompletedAssistantText([{ role: 'user', content: 'hi' }])).toBe('')
  })
})
