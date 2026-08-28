import { describe, expect, it } from 'vitest'
import { gitPushArgs } from './git-commit'
import {
  applyBranchPrefix,
  formatBranchPrefix,
  normalizeBranchPrefix
} from './git-branch-create'

describe('git settings policy', () => {
  it('never uses bare --force', () => {
    expect(gitPushArgs()).toEqual(['push'])
    expect(gitPushArgs(true)).toEqual(['push', '--force-with-lease'])
    expect(gitPushArgs(true).includes('--force')).toBe(false)
  })

  it('applies a sanitized prefix once', () => {
    expect(normalizeBranchPrefix('codex/')).toBe('codex')
    expect(formatBranchPrefix('codex')).toBe('codex/')
    expect(applyBranchPrefix('review', 'codex')).toBe('codex/review')
    expect(applyBranchPrefix('codex/review', 'codex')).toBe('codex/review')
    expect(applyBranchPrefix('codex', 'codex/')).toBe('codex')
    expect(applyBranchPrefix('has space', 'codex')).toBeNull()
    expect(normalizeBranchPrefix('..')).toBe('')
    expect(normalizeBranchPrefix('-flag')).toBe('')
  })
})
