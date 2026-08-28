import { describe, expect, it } from 'vitest'
import { parseBangCommand } from './bang-command'

describe('bang command', () => {
  it('reads a leading ! command', () => {
    expect(parseBangCommand('!git status')).toBe('git status')
    expect(parseBangCommand('  ! ls -la  ')).toBe('ls -la')
  })

  it('ignores empty bang and normal text', () => {
    expect(parseBangCommand('!')).toBeNull()
    expect(parseBangCommand('hello')).toBeNull()
    expect(parseBangCommand('/status')).toBeNull()
  })
})
