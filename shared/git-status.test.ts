import { describe, expect, it } from 'vitest'
import { parseGitStatusLine, parseGitStatusPorcelain } from './git-status'

describe('git status porcelain', () => {
  it('marks untracked files as unstaged only', () => {
    const row = parseGitStatusLine('?? src/new.ts')
    expect(row).toMatchObject({
      path: 'src/new.ts',
      status: '??',
      untracked: true,
      unstaged: true,
      staged: false
    })
  })

  it('splits staged vs unstaged for MM', () => {
    const row = parseGitStatusLine('MM src/app.ts')
    expect(row).toMatchObject({
      path: 'src/app.ts',
      staged: true,
      unstaged: true,
      untracked: false
    })
  })

  it('treats index-only M as staged', () => {
    const row = parseGitStatusLine('M  staged.ts')
    expect(row).toEqual(
      expect.objectContaining({ path: 'staged.ts', staged: true, unstaged: false })
    )
  })

  it('keeps a leading space so worktree-only M is unstaged', () => {
    const row = parseGitStatusLine(' M worktree.ts')
    expect(row).toEqual(
      expect.objectContaining({ path: 'worktree.ts', staged: false, unstaged: true })
    )
  })

  it('uses the rename target path', () => {
    const row = parseGitStatusLine('R  old.ts -> new.ts')
    expect(row?.path).toBe('new.ts')
    expect(row?.staged).toBe(true)
  })

  it('parses a multi-line porcelain dump', () => {
    const files = parseGitStatusPorcelain(' M a.ts\n?? b.ts\n')
    expect(files.map((f) => f.path)).toEqual(['a.ts', 'b.ts'])
  })
})
