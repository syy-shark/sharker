import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DISABLED_MEMORIES_CHAT_HINT,
  DISABLED_MEMORIES_LABEL,
  ENABLE_MEMORIES_DESCRIPTION,
  ENABLE_MEMORIES_LABEL,
  GENERATE_MEMORIES_CHAT_HINT,
  GENERATE_MEMORIES_DESCRIPTION,
  GENERATE_MEMORIES_LABEL,
  INHERIT_MEMORIES_CHAT_HINT,
  INHERIT_MEMORIES_LABEL,
  MEMORIES_CHAT_INTRO,
  MEMORIES_SETTINGS_INTRO,
  MEMORIES_SETTINGS_LABEL,
  USE_MEMORIES_CHAT_HINT,
  USE_MEMORIES_DESCRIPTION,
  USE_MEMORIES_LABEL,
  formatMemoryStatus,
  memoryFlagsForPick,
  memoryNeedsChatPicker,
  parseMemoryCommand,
  resolveChatMemoryFlags
} from './memory-command'

describe('memory command', () => {
  it('parses on/off and inject/generate', () => {
    expect(parseMemoryCommand('')).toEqual({ kind: 'pick' })
    expect(memoryNeedsChatPicker('')).toBe(true)
    expect(memoryNeedsChatPicker('status')).toBe(false)
    expect(parseMemoryCommand('status')).toEqual({ kind: 'status' })
    expect(parseMemoryCommand('on')).toEqual({
      kind: 'set',
      injection: true,
      generation: true
    })
    expect(parseMemoryCommand('off')).toEqual({
      kind: 'set',
      injection: false,
      generation: false
    })
    expect(parseMemoryCommand('use')).toEqual({
      kind: 'set',
      injection: true,
      generation: false
    })
    expect(parseMemoryCommand('inherit')).toEqual({ kind: 'set', inherit: true })
    expect(parseMemoryCommand('inject off')).toEqual({ kind: 'set', injection: false })
    expect(parseMemoryCommand('generate on')).toEqual({ kind: 'set', generation: true })
    expect(memoryFlagsForPick('use')).toEqual({
      memoryInjection: true,
      memoryGeneration: false
    })
    expect(memoryFlagsForPick('inherit')).toEqual({
      memoryInjection: null,
      memoryGeneration: null
    })
    expect(
      resolveChatMemoryFlags({ memoryInjection: false }, { memoryInjection: true }).injection
    ).toBe(false)
    expect(resolveChatMemoryFlags({}, { memoryInjection: false }).injection).toBe(false)
    expect(resolveChatMemoryFlags({}, {}).injectionInherited).toBe(true)
    expect(resolveChatMemoryFlags({}, {}).injection).toBe(false)
    expect(resolveChatMemoryFlags({}, { memoriesEnabled: true }).injection).toBe(true)
    expect(
      resolveChatMemoryFlags({ memoryInjection: true }, { memoriesEnabled: false }).injection
    ).toBe(false)
  })

  it('formats empty and listed memories', () => {
    expect(MEMORIES_SETTINGS_LABEL).toBe('Memories')
    expect(MEMORIES_SETTINGS_INTRO).toMatch(
      /carry useful context from past chats into future work/
    )
    const personalizationSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/PersonalizationSettings.tsx'),
      'utf8'
    )
    expect(personalizationSrc).toContain('MEMORIES_SETTINGS_LABEL')
    expect(personalizationSrc).toContain('MEMORIES_SETTINGS_INTRO')
    expect(personalizationSrc).not.toContain('title="Memories"')
    expect(ENABLE_MEMORIES_LABEL).toBe('Enable memories')
    expect(USE_MEMORIES_LABEL).toBe('Use memories')
    expect(GENERATE_MEMORIES_LABEL).toBe('Generate memories')
    expect(ENABLE_MEMORIES_DESCRIPTION).toMatch(/off by default/)
    expect(ENABLE_MEMORIES_DESCRIPTION).toMatch(/Don't store secrets in memories/)
    expect(MEMORIES_CHAT_INTRO).toMatch(/use local memories or contribute to future memories/)
    expect(USE_MEMORIES_CHAT_HINT).toMatch(/use existing memories/)
    expect(GENERATE_MEMORIES_CHAT_HINT).toMatch(/generate future memories/)
    expect(DISABLED_MEMORIES_LABEL).toBe('Disabled')
    expect(DISABLED_MEMORIES_CHAT_HINT).toMatch(/disabled/)
    expect(INHERIT_MEMORIES_LABEL).toBe('Inherit')
    expect(INHERIT_MEMORIES_CHAT_HINT).toMatch(/don't change your global memory settings/)
    const pickerSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/MemoryChatDialog.tsx'),
      'utf8'
    )
    expect(pickerSrc).toContain('MEMORIES_CHAT_INTRO')
    expect(pickerSrc).not.toContain('本对话记忆')
    expect(USE_MEMORIES_DESCRIPTION).toMatch(/injecting existing memories/)
    expect(GENERATE_MEMORIES_DESCRIPTION).toMatch(/memory-generation inputs/)
    expect(
      formatMemoryStatus({ injection: true, generation: false, items: [] })
    ).toContain(`${GENERATE_MEMORIES_LABEL}：off`)
    expect(
      formatMemoryStatus({
        injection: false,
        generation: false,
        featureEnabled: false,
        items: []
      })
    ).toContain(ENABLE_MEMORIES_LABEL)
    const text = formatMemoryStatus({
      injection: true,
      generation: true,
      items: [{ id: '1', scope: 'project', kind: 'fact', content: 'use vitest' }]
    })
    expect(text).toContain('[fact/project]')
    expect(text).toContain('use vitest')
  })
})
