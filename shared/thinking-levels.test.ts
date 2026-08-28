import { describe, expect, it } from 'vitest'
import { stepThinkingLevel } from './thinking-levels'

describe('stepThinkingLevel', () => {
  const opts = [{ id: 'low' }, { id: 'medium' }, { id: 'high' }]

  it('raises and lowers within bounds', () => {
    expect(stepThinkingLevel(opts, 'medium', 1)).toBe('high')
    expect(stepThinkingLevel(opts, 'medium', -1)).toBe('low')
    expect(stepThinkingLevel(opts, 'high', 1)).toBe('high')
    expect(stepThinkingLevel(opts, 'low', -1)).toBe('low')
  })

  it('starts at the first option when current is unknown', () => {
    expect(stepThinkingLevel(opts, '', 1)).toBe('medium')
    expect(stepThinkingLevel([], 'high', 1)).toBeNull()
  })
})
