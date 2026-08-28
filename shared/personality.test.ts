import { describe, expect, it } from 'vitest'
import {
  nextPersonality,
  parsePersonality,
  parsePersonalityArg,
  personalityPrompt,
  personalitySwitchNote
} from './personality'

describe('personality', () => {
  it('parses aliases and defaults to pragmatic', () => {
    expect(parsePersonality('friendly')).toBe('empathetic')
    expect(parsePersonality('off')).toBe('none')
    expect(parsePersonality('nope')).toBe('pragmatic')
    expect(parsePersonalityArg('empathetic')).toBe('empathetic')
    expect(parsePersonalityArg('')).toBeNull()
    expect(parsePersonalityArg('zzz')).toBeNull()
  })

  it('cycles and emits a prompt only when enabled', () => {
    expect(nextPersonality('pragmatic')).toBe('empathetic')
    expect(nextPersonality('empathetic')).toBe('none')
    expect(nextPersonality('none')).toBe('pragmatic')
    expect(personalityPrompt('none')).toBe('')
    expect(personalityPrompt('pragmatic')).toContain('pragmatic')
    expect(personalitySwitchNote('empathetic')).toContain('共情')
  })
})
