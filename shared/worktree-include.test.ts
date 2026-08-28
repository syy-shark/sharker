import { describe, expect, it } from 'vitest'
import {
  matchAnyWorktreeInclude,
  parseWorktreeInclude,
  sanitizeWorktreeBaseRef,
  worktreeIncludePatterns
} from './worktree-include'

describe('worktree include', () => {
  it('parses patterns and always includes AGENTS.override.md', () => {
    expect(parseWorktreeInclude('# skip\n.env\n\nconfig/secrets.json\n')).toEqual([
      '.env',
      'config/secrets.json'
    ])
    expect(worktreeIncludePatterns('.env\n.env.local')).toEqual([
      'AGENTS.override.md',
      '.env',
      '.env.local'
    ])
  })

  it('matches paths and globs', () => {
    const pats = worktreeIncludePatterns('.env*\nconfig/secrets.json\n')
    expect(matchAnyWorktreeInclude('.env', pats)).toBe(true)
    expect(matchAnyWorktreeInclude('.env.local', pats)).toBe(true)
    expect(matchAnyWorktreeInclude('config/secrets.json', pats)).toBe(true)
    expect(matchAnyWorktreeInclude('src/app.ts', pats)).toBe(false)
  })

  it('sanitizes base refs', () => {
    expect(sanitizeWorktreeBaseRef('main')).toBe('main')
    expect(sanitizeWorktreeBaseRef('--force')).toBe('HEAD')
    expect(sanitizeWorktreeBaseRef('main origin')).toBe('HEAD')
    expect(sanitizeWorktreeBaseRef('')).toBe('HEAD')
  })

})
