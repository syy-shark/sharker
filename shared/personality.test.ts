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
    expect(parsePersonality('friendly')).toBe('friendly')
    expect(parsePersonality('empathetic')).toBe('friendly')
    expect(parsePersonality('off')).toBe('none')
    expect(parsePersonality('nope')).toBe('pragmatic')
    expect(parsePersonalityArg('friendly')).toBe('friendly')
    expect(parsePersonalityArg('empathetic')).toBe('friendly')
    expect(parsePersonalityArg('')).toBeNull()
    expect(parsePersonalityArg('zzz')).toBeNull()
  })

  it('cycles and emits a prompt only when enabled', () => {
    expect(nextPersonality('pragmatic')).toBe('friendly')
    expect(nextPersonality('friendly')).toBe('none')
    expect(nextPersonality('none')).toBe('pragmatic')
    expect(personalityPrompt('none')).toBe('')
    expect(personalityPrompt('pragmatic')).toContain('pragmatic')
    expect(personalityPrompt('friendly')).toContain('friendly')
    expect(personalitySwitchNote('friendly')).toContain('友好')
  })
})
