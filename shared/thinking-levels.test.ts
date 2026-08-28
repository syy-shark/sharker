import { describe, expect, it } from 'vitest'
import { formatReasoningStatus, parseReasoningArgs, stepThinkingLevel } from './thinking-levels'

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

  it('parses /reasoning args and lists current options', () => {
    const opts = [
      { id: 'low', label: '低' },
      { id: 'high', label: '高' }
    ]
    expect(parseReasoningArgs('', opts)).toEqual({ kind: 'status' })
    expect(parseReasoningArgs('high', opts)).toEqual({ kind: 'set', id: 'high' })
    expect(parseReasoningArgs('h', opts)).toEqual({ kind: 'set', id: 'high' })
    expect(parseReasoningArgs('zzz', opts)).toEqual({ kind: 'unknown', raw: 'zzz' })
    const text = formatReasoningStatus({ supported: true, current: 'high', options: opts })
    expect(text).toContain('`high`')
    expect(text).toContain('当前')
  })
})
