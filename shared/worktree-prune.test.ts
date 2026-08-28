import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANAGED_WORKTREE_LIMIT,
  isManagedWorktreeDirName,
  selectManagedWorktreesToPrune
} from './worktree-prune'

describe('worktree prune', () => {
  it('keeps the newest entries and never deletes protected paths', () => {
    const entries = [
      { path: '/wt/old', mtimeMs: 1 },
      { path: '/wt/mid', mtimeMs: 2 },
      { path: '/wt/new', mtimeMs: 3 },
      { path: '/wt/live', mtimeMs: 0 }
    ]
    expect(
      selectManagedWorktreesToPrune(entries, { keep: 2, protectPaths: ['/wt/live'] })
    ).toEqual(['/wt/old'])
  })

  it('defaults to the Codex limit of 15', () => {
    const entries = Array.from({ length: 18 }, (_, i) => ({
      path: `/wt/${i}`,
      mtimeMs: i
    }))
    const removed = selectManagedWorktreesToPrune(entries)
    expect(removed).toHaveLength(3)
    expect(DEFAULT_MANAGED_WORKTREE_LIMIT).toBe(15)
    expect(removed).toEqual(['/wt/2', '/wt/1', '/wt/0'])
  })

  it('matches managed directory names', () => {
    expect(isManagedWorktreeDirName('sharker', 'sharker-abc123')).toBe(true)
    expect(isManagedWorktreeDirName('sharker', 'other-abc123')).toBe(false)
    expect(isManagedWorktreeDirName('sharker', 'sharker-')).toBe(false)
  })
})
