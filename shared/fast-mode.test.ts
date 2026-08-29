import { describe, expect, it } from 'vitest'
import {
  formatFastStatus,
  isFastThinkingLevel,
  parseFastCommand,
  nextFastThinkingLevel,
  pickFastThinkingLevel
} from './fast-mode'

describe('fast mode', () => {
  it('parses on/off/status', () => {
    expect(parseFastCommand('on')).toBe('on')
    expect(parseFastCommand('off')).toBe('off')
    expect(parseFastCommand('')).toBe('status')
    expect(parseFastCommand('???')).toBe('status')
  })

  it('picks the cheapest thinking level for fast', () => {
    const opts = [{ id: 'off' }, { id: 'low' }, { id: 'high' }]
    expect(pickFastThinkingLevel(opts, true, 'high')).toBe('off')
    expect(pickFastThinkingLevel(opts, false, 'high')).toBe('high')
    expect(pickFastThinkingLevel([{ id: 'low' }, { id: 'high' }], true, 'high')).toBe('low')
    expect(pickFastThinkingLevel([], true, 'high')).toBeNull()
    expect(nextFastThinkingLevel(opts, 'high', 'high')).toBe('off')
    expect(nextFastThinkingLevel(opts, 'off', 'high')).toBe('high')
  })

  it('formats status', () => {
    expect(isFastThinkingLevel('off')).toBe(true)
    expect(formatFastStatus({ supported: true, level: 'off', fast: true })).toContain('开')
    expect(formatFastStatus({ supported: false, level: '', fast: false })).toContain('没有思考档位')
  })
})
