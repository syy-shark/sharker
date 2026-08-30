import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  nextPersonality,
  parsePersonality,
  parsePersonalityArg,
  personalityPrompt,
  personalitySwitchNote,
  FRIENDLY_LABEL,
  NONE_PERSONALITY_LABEL,
  CHOOSE_A_PERSONALITY_LABEL,
  CUSTOM_INSTRUCTIONS_DESCRIPTION,
  CUSTOM_INSTRUCTIONS_HINT,
  CUSTOM_INSTRUCTIONS_LABEL,
  PERSONALITY_INTRO,
  PERSONALITY_OPTIONS,
  PRAGMATIC_LABEL
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
    expect(personalitySwitchNote('friendly')).toContain(FRIENDLY_LABEL)
    expect(PERSONALITY_OPTIONS.map((row) => row.title)).toEqual([
      PRAGMATIC_LABEL,
      FRIENDLY_LABEL,
      NONE_PERSONALITY_LABEL
    ])
    expect(PRAGMATIC_LABEL).toBe('Pragmatic')
    expect(FRIENDLY_LABEL).toBe('Friendly')
    expect(NONE_PERSONALITY_LABEL).toBe('None')
    expect(CUSTOM_INSTRUCTIONS_LABEL).toBe('Custom instructions')
    expect(CUSTOM_INSTRUCTIONS_DESCRIPTION).toMatch(/personal instructions in AGENTS.md/)
    expect(CUSTOM_INSTRUCTIONS_HINT).toMatch(/preferences you want ChatGPT to follow/)
    expect(CHOOSE_A_PERSONALITY_LABEL).toBe('Choose a personality')
    expect(PERSONALITY_INTRO).toMatch(/doesn't change what the model can do/)
    const settingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/PersonalizationSettings.tsx'),
      'utf8'
    )
    expect(settingsSrc).toContain('PERSONALITY_INTRO')
    expect(settingsSrc).toContain('CUSTOM_INSTRUCTIONS_DESCRIPTION')
    expect(settingsSrc).toContain('CUSTOM_INSTRUCTIONS_HINT')
  })
})
