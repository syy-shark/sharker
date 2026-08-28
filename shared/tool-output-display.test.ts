import { describe, expect, it } from 'vitest'
import {
  clipToolOutput,
  parseToolOutputDisplay,
  shouldExpandToolOutput,
  shouldMountToolExitCode,
  shouldMountToolOutputDetails
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
    expect(
      shouldMountToolOutputDetails({
        mode: 'standard',
        hasDistinctOutput: true,
        isStreaming: true
      })
    ).toBe(false)
    expect(
      shouldMountToolOutputDetails({
        mode: 'verbose',
        hasDistinctOutput: true,
        isStreaming: true
      })
    ).toBe(false)
    expect(
      shouldMountToolOutputDetails({
        mode: 'standard',
        hasDistinctOutput: true,
        isStreaming: false
      })
    ).toBe(true)
    expect(
      shouldMountToolOutputDetails({
        mode: 'brief',
        hasDistinctOutput: true,
        isStreaming: false
      })
    ).toBe(false)
    expect(
      shouldMountToolOutputDetails({
        mode: 'standard',
        hasDistinctOutput: false,
        isStreaming: false
      })
    ).toBe(false)
    expect(shouldMountToolExitCode({ exitCode: 0, isStreaming: true })).toBe(false)
    expect(shouldMountToolExitCode({ exitCode: 1, isStreaming: false })).toBe(true)
    expect(shouldMountToolExitCode({ exitCode: null, isStreaming: false })).toBe(false)
  })
})
