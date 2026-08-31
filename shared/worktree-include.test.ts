import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  matchAnyWorktreeInclude,
  parseWorktreeInclude,
  sanitizeWorktreeBaseRef,
  CODE_DOESNT_RUN_ON_WORKTREE_HINT,
  WORKTREE_INCLUDE_AGENTS_HINT,
  WORKTREE_INCLUDE_HINT,
  WORKTREE_INCLUDE_INTRO,
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

  it('uses official desktop .worktreeinclude leftover', () => {
    expect(WORKTREE_INCLUDE_INTRO).toMatch(/add a `.worktreeinclude` file/)
    expect(WORKTREE_INCLUDE_HINT).toMatch(/\.env\.local/)
    expect(WORKTREE_INCLUDE_HINT).toMatch(/Don't list tracked files/)
    expect(WORKTREE_INCLUDE_AGENTS_HINT).toMatch(/AGENTS\.override\.md/)
    expect(CODE_DOESNT_RUN_ON_WORKTREE_HINT).toMatch(/different directory/)
    expect(CODE_DOESNT_RUN_ON_WORKTREE_HINT).toMatch(/local environment/)
    expect(CODE_DOESNT_RUN_ON_WORKTREE_HINT).toMatch(/\.worktreeinclude/)
    const settingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/WorktreeSettings.tsx'),
      'utf8'
    )
    expect(settingsSrc).toContain('WORKTREE_INCLUDE_INTRO')
    expect(settingsSrc).toContain('WORKTREE_INCLUDE_HINT')
    expect(settingsSrc).toContain('WORKTREE_INCLUDE_AGENTS_HINT')
    expect(settingsSrc).toContain('CODE_DOESNT_RUN_ON_WORKTREE_HINT')
  })

  it('sanitizes base refs', () => {
    expect(sanitizeWorktreeBaseRef('main')).toBe('main')
    expect(sanitizeWorktreeBaseRef('--force')).toBe('HEAD')
    expect(sanitizeWorktreeBaseRef('main origin')).toBe('HEAD')
    expect(sanitizeWorktreeBaseRef('')).toBe('HEAD')
  })

})
