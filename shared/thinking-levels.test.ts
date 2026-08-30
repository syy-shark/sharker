import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cycleThinkingLevel,
  formatReasoningStatus,
  parseReasoningArgs,
  PICK_REASONING_EFFORT_LABEL,
  REASONING_EXTRA_HIGH_LABEL,
  REASONING_HIGH_LABEL,
  REASONING_LIGHT_LABEL,
  REASONING_MAX_LABEL,
  REASONING_MEDIUM_LABEL,
  resolveThinkingOptions,
  stepThinkingLevel,
  thinkingGaugeIndex
} from './thinking-levels'

describe('stepThinkingLevel', () => {
  const opts = [{ id: 'low' }, { id: 'medium' }, { id: 'high' }]

  it('raises and lowers within bounds', () => {
    expect(stepThinkingLevel(opts, 'medium', 1)).toBe('high')
    expect(stepThinkingLevel(opts, 'medium', -1)).toBe('low')
    expect(stepThinkingLevel(opts, 'high', 1)).toBe('high')
    expect(stepThinkingLevel(opts, 'low', -1)).toBe('low')
    expect(thinkingGaugeIndex(opts, 'medium')).toBe(1)
    expect(thinkingGaugeIndex(opts, '')).toBe(0)
    expect(thinkingGaugeIndex(opts, 'high')).toBe(2)
  })

  it('starts at the first option when current is unknown', () => {
    expect(stepThinkingLevel(opts, '', 1)).toBe('medium')
    expect(stepThinkingLevel([], 'high', 1)).toBeNull()
  })

  it('cycles reasoning effort and wraps', () => {
    expect(cycleThinkingLevel(opts, 'low')).toBe('medium')
    expect(cycleThinkingLevel(opts, 'high')).toBe('low')
    expect(cycleThinkingLevel(opts, '')).toBe('low')
    expect(cycleThinkingLevel([], 'high')).toBeNull()
  })

  it('uses official desktop Light / Medium / High / Extra High / Max labels', () => {
    expect(REASONING_LIGHT_LABEL).toBe('Light')
    expect(REASONING_MEDIUM_LABEL).toBe('Medium')
    expect(REASONING_HIGH_LABEL).toBe('High')
    expect(REASONING_EXTRA_HIGH_LABEL).toBe('Extra High')
    expect(REASONING_MAX_LABEL).toBe('Max')
    expect(PICK_REASONING_EFFORT_LABEL).toBe('Pick a reasoning effort')
    expect(parseReasoningArgs('light', [{ id: 'low', label: REASONING_LIGHT_LABEL }])).toEqual({
      kind: 'set',
      id: 'low'
    })
    expect(parseReasoningArgs('extra high', [{ id: 'xhigh', label: REASONING_EXTRA_HIGH_LABEL }])).toEqual({
      kind: 'set',
      id: 'xhigh'
    })
    const gpt = resolveThinkingOptions({
      id: 'openai-chatgpt',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-5.6'
    })
    expect(gpt.find((o) => o.id === 'low')?.label).toBe(REASONING_LIGHT_LABEL)
    expect(gpt.find((o) => o.id === 'medium')?.label).toBe(REASONING_MEDIUM_LABEL)
    expect(gpt.find((o) => o.id === 'xhigh')?.label).toBe(REASONING_EXTRA_HIGH_LABEL)
    expect(gpt.some((o) => o.id === 'ultra' || /Ultra/.test(o.label))).toBe(false)
    const pickerSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ModelPicker.tsx'),
      'utf8'
    )
    const gaugeSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ReasoningGauge.tsx'),
      'utf8'
    )
    expect(pickerSrc).toContain('OPEN_MODEL_PICKER_LABEL')
    expect(pickerSrc).toContain('PICK_REASONING_EFFORT_LABEL')
    expect(pickerSrc).not.toContain('>对话模型<')
    expect(pickerSrc).not.toContain('>思考水平<')
    expect(gaugeSrc).toContain('PICK_REASONING_EFFORT_LABEL')
    expect(gaugeSrc).not.toContain('aria-label="思考水平"')
  })

  it('parses /reasoning args and lists current options', () => {
    const opts = [
      { id: 'low', label: REASONING_LIGHT_LABEL },
      { id: 'high', label: REASONING_HIGH_LABEL }
    ]
    expect(parseReasoningArgs('', opts)).toEqual({ kind: 'status' })
    expect(parseReasoningArgs('high', opts)).toEqual({ kind: 'set', id: 'high' })
    expect(parseReasoningArgs('h', opts)).toEqual({ kind: 'set', id: 'high' })
    expect(parseReasoningArgs('zzz', opts)).toEqual({ kind: 'unknown', raw: 'zzz' })
    const text = formatReasoningStatus({ supported: true, current: 'high', options: opts })
    expect(text).toContain('`high`')
    expect(text).toContain('当前')
    expect(text).toContain('思考条')
  })
})
