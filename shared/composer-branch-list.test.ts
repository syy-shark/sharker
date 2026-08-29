import { describe, expect, it } from 'vitest'
import {
  filterGitBranchRefs,
  gitBranchPickerLabel,
  gitBranchPickerRows,
  parseGitRefNames
} from './git-branch-list'

const SAMPLE = `
refs/heads/main
refs/heads/fix/login-redirect
refs/remotes/origin/HEAD
refs/remotes/origin/main
refs/remotes/origin/feature/autorego
refs/remotes/upstream/HEAD -> refs/remotes/upstream/main
`

describe('git branch list for composer worktree picker', () => {
  it('keeps local shorts and remote-only full refs', () => {
    const items = parseGitRefNames(SAMPLE)
    expect(items.map((i) => i.ref)).toEqual([
      'fix/login-redirect',
      'main',
      'origin/feature/autorego'
    ])
    expect(items.find((i) => i.short === 'main')?.source).toBe('local')
    expect(items.find((i) => i.ref === 'origin/feature/autorego')).toEqual({
      ref: 'origin/feature/autorego',
      short: 'feature/autorego',
      source: 'remote'
    })
  })

  it('searches short names like official local branch search', () => {
    const items = parseGitRefNames(SAMPLE)
    expect(filterGitBranchRefs(items, 'autorego').map((i) => i.ref)).toEqual([
      'origin/feature/autorego'
    ])
    expect(filterGitBranchRefs(items, 'LOGIN').map((i) => i.ref)).toEqual(['fix/login-redirect'])
    expect(gitBranchPickerRows(items)[0]).toEqual({ ref: '', label: 'HEAD' })
    expect(gitBranchPickerLabel('', items)).toBe('HEAD')
    expect(gitBranchPickerLabel('origin/feature/autorego', items)).toBe('origin/feature/autorego')
  })
})
