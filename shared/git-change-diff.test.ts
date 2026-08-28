import { describe, expect, it } from 'vitest'
import { diffFromGitTexts, isDeletedGitChange, isNewGitChange } from './git-change-diff'

describe('git change diff', () => {
  it('treats untracked files as all additions', () => {
    expect(isNewGitChange('??')).toBe(true)
    const diff = diffFromGitTexts({
      path: 'src/new.ts',
      status: '??',
      oldText: null,
      newText: 'export const a = 1\n'
    })
    expect(diff.stats.added).toBe(1)
    expect(diff.stats.removed).toBe(0)
    expect(diff.lines.every((l) => l.kind === 'add')).toBe(true)
  })

  it('treats deletions as all removals', () => {
    expect(isDeletedGitChange('D')).toBe(true)
    const diff = diffFromGitTexts({
      path: 'gone.ts',
      status: 'D',
      oldText: 'keep\nme\n',
      newText: ''
    })
    expect(diff.stats.removed).toBe(2)
    expect(diff.lines.every((l) => l.kind === 'del')).toBe(true)
  })

  it('builds a hunk for modified files', () => {
    const diff = diffFromGitTexts({
      path: 'app.ts',
      status: 'M',
      oldText: 'alpha\nbeta\ngamma\n',
      newText: 'alpha\nBETA\ngamma\n'
    })
    expect(diff.stats.added).toBe(1)
    expect(diff.stats.removed).toBe(1)
    expect(diff.lines.some((l) => l.kind === 'del' && l.content === 'beta')).toBe(true)
    expect(diff.lines.some((l) => l.kind === 'add' && l.content === 'BETA')).toBe(true)
  })
})
