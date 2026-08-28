import { describe, expect, it } from 'vitest'
import {
  clipToolOutput,
  parseToolOutputDisplay,
  shouldExpandToolOutput
} from './tool-output-display'

describe('tool output display', () => {
  it('defaults to standard', () => {
    expect(parseToolOutputDisplay(undefined)).toBe('standard')
    expect(parseToolOutputDisplay('nope')).toBe('standard')
    expect(parseToolOutputDisplay('verbose')).toBe('verbose')
  })

  it('hides body in brief and keeps a tail in standard', () => {
    const long = Array.from({ length: 40 }, (_, i) => `L${i}`).join('\n')
    expect(clipToolOutput(long, 'brief')).toEqual({ text: '', clipped: true })
    const std = clipToolOutput(long, 'standard')
    expect(std.clipped).toBe(true)
    expect(std.text.split('\n')).toHaveLength(12)
    expect(std.text.startsWith('L28')).toBe(true)
    expect(shouldExpandToolOutput('verbose', 'done')).toBe(true)
    expect(shouldExpandToolOutput('verbose', 'active')).toBe(false)
    expect(shouldExpandToolOutput('standard', 'done')).toBe(false)
    expect(shouldExpandToolOutput('verbose', 'done', { isStreaming: true })).toBe(false)
  })
})
