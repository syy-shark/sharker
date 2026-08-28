import { describe, expect, it } from 'vitest'
import { codeFontStack, parseCodeFont } from './code-font'
import { DEFAULT_SETTINGS } from './types'
import { normalizeSettings } from './workspace'

describe('code font', () => {
  it('defaults unknown or empty values to system', () => {
    expect(parseCodeFont('')).toBe('system')
    expect(parseCodeFont('Comic Sans')).toBe('system')
    expect(parseCodeFont(undefined)).toBe('system')
  })

  it('accepts official ids and aliases', () => {
    expect(parseCodeFont('JetBrains Mono')).toBe('jetbrains')
    expect(parseCodeFont('sf')).toBe('sf-mono')
    expect(parseCodeFont('cascadia-code')).toBe('cascadia')
    expect(parseCodeFont('fira')).toBe('fira')
  })

  it('returns a stack that keeps a monospace fallback', () => {
    expect(codeFontStack('menlo')).toMatch(/Menlo/)
    expect(codeFontStack('nope')).toMatch(/monospace/)
  })

  it('keeps a valid codeFont through settings normalize', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, codeFont: 'jetbrains' }, '/home/u').codeFont).toBe(
      'jetbrains'
    )
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, codeFont: 'Zapfino' as never }, '/home/u').codeFont).toBe(
      'system'
    )
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, codeFontScale: 1.2 }, '/home/u').codeFontScale).toBe(1.2)
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, codeFontScale: 9 }, '/home/u').codeFontScale).toBe(1.35)
  })
})
