import { describe, expect, it } from 'vitest'
import {
  ALL_REPOS_ID,
  fileInLastTurnForRepo,
  formatReviewLineStats,
  resolveReviewRepoId,
  expandAllReviewDiffKeys,
  parseReviewDiffKey,
  pruneReviewDiffKeys,
  reviewDiffKey,
  reviewFileOpenPath,
  reviewProbeRoots,
  reviewRepoLabel,
  shouldShowReviewRepoSelector,
  sumReviewLineStats,
  toggleReviewDiffKey,
  uniqueReviewRepos,
  compareFileTreePaths,
  sortReviewFilesLikeFileTree
} from './review-repos'

describe('review repos', () => {
  it('keeps distinct git roots and defaults Last turn to all repos', () => {
    expect(reviewProbeRoots('/proj', ['/extra', '/proj'])).toEqual(['/proj', '/extra'])
    expect(reviewRepoLabel('/work/docs-site')).toBe('docs-site')
    const repos = uniqueReviewRepos([
      {
        probeRoot: '/proj',
        isRepo: true,
        toplevel: '/proj',
        commonDir: '/proj/.git',
        added: 4,
        removed: 1
      },
      {
        probeRoot: '/proj/docs',
        isRepo: true,
        toplevel: '/proj',
        commonDir: '/proj/.git'
      },
      {
        probeRoot: '/extra',
        isRepo: true,
        toplevel: '/extra',
        commonDir: '/extra/.git',
        added: 2,
        removed: 0
      },
      { probeRoot: '/plain', isRepo: false }
    ])
    expect(repos.map((r) => r.root)).toEqual(['/proj', '/extra'])
    expect(shouldShowReviewRepoSelector(repos.length)).toBe(true)
    expect(shouldShowReviewRepoSelector(1)).toBe(false)
    expect(
      resolveReviewRepoId({
        compare: 'last_turn',
        selectedId: '',
        repoRoots: ['/proj', '/extra']
      })
    ).toBe(ALL_REPOS_ID)
    expect(
      resolveReviewRepoId({
        compare: 'uncommitted',
        selectedId: ALL_REPOS_ID,
        repoRoots: ['/proj', '/extra']
      })
    ).toBe('/proj')
    expect(
      resolveReviewRepoId({
        compare: 'branch',
        selectedId: '/extra',
        repoRoots: ['/proj', '/extra']
      })
    ).toBe('/extra')
    expect(formatReviewLineStats(4, 1)).toBe('+4 −1')
    expect(formatReviewLineStats(0, 0)).toBe('')
    expect(sumReviewLineStats(repos)).toEqual({ added: 6, removed: 1 })
    expect(reviewFileOpenPath('src/a.ts', '/proj', '/proj')).toBe('src/a.ts')
    expect(reviewFileOpenPath('lib/b.ts', '/extra', '/proj')).toBe('extra/lib/b.ts')
    expect(fileInLastTurnForRepo('src/a.ts', ['src/a.ts'], '/proj', '/proj')).toBe(true)
    expect(fileInLastTurnForRepo('lib/b.ts', ['/extra/lib/b.ts'], '/extra', '/proj')).toBe(true)
    expect(fileInLastTurnForRepo('lib/b.ts', ['extra/lib/b.ts'], '/extra', '/proj')).toBe(true)
    expect(fileInLastTurnForRepo('src/a.ts', ['/extra/lib/b.ts'], '/proj', '/proj')).toBe(false)
    expect(fileInLastTurnForRepo('lib/b.ts', ['src/a.ts'], '/extra', '/proj')).toBe(false)
    expect(reviewDiffKey('/proj', 'src/a.ts')).toBe('/proj\0src/a.ts')
    expect(parseReviewDiffKey('/proj\0src/a.ts')).toEqual({ repoRoot: '/proj', path: 'src/a.ts' })
    expect(parseReviewDiffKey('src/a.ts')).toBe(null)
    expect(toggleReviewDiffKey(['/proj\0a.ts'], '/proj\0b.ts')).toEqual(['/proj\0a.ts', '/proj\0b.ts'])
    expect(toggleReviewDiffKey(['/proj\0a.ts', '/proj\0b.ts'], '/proj\0a.ts')).toEqual(['/proj\0b.ts'])
    expect(
      expandAllReviewDiffKeys(
        [
          { path: 'src/a.ts', repoRoot: '/proj' },
          { path: 'lib/b.ts', repoRoot: '/extra' },
          { path: 'src/a.ts', repoRoot: '/proj' }
        ],
        '/proj'
      )
    ).toEqual(['/proj\0src/a.ts', '/extra\0lib/b.ts'])
    expect(pruneReviewDiffKeys(['/proj\0a.ts', '/proj\0gone.ts'], ['/proj\0a.ts'])).toEqual(['/proj\0a.ts'])
    expect(compareFileTreePaths('src/a.ts', 'src/components/A.tsx')).toBeGreaterThan(0)
    expect(
      sortReviewFilesLikeFileTree(
        [
          { path: 'src/a.ts' },
          { path: 'z.ts' },
          { path: 'src/components/B.tsx' },
          { path: 'src/components/A.tsx' },
          { path: 'docs/ARCH.md' }
        ]
      ).map((f) => f.path)
    ).toEqual(['docs/ARCH.md', 'src/components/A.tsx', 'src/components/B.tsx', 'src/a.ts', 'z.ts'])
    expect(
      sortReviewFilesLikeFileTree(
        [
          { path: 'lib/b.ts', repoRoot: '/extra' },
          { path: 'src/a.ts', repoRoot: '/proj' }
        ],
        '/proj'
      ).map((f) => f.path)
    ).toEqual(['lib/b.ts', 'src/a.ts'])
  })
})
