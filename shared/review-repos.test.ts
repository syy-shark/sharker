import { describe, expect, it } from 'vitest'
import {
  ALL_REPOS_ID,
  ALL_REPOS_LABEL,
  BRANCH_REVIEW_LABEL,
  COMMIT_REVIEW_LABEL,
  LAST_TURN_LABEL,
  REVERT_ALL_LABEL,
  REVERT_LABEL,
  REVIEW_CREATE_ONE_HINT,
  REVIEW_REQUIRES_GIT_LABEL,
  STAGE_ALL_LABEL,
  STAGE_LABEL,
  STAGED_LABEL,
  UNSTAGE_LABEL,
  UNSTAGED_LABEL,
  fileInLastTurnForRepo,
  lastTurnPendingRelPath,
  lastTurnPendingRelPaths,
  formatReviewLineStats,
  resolveReviewRepoId,
  expandAllReviewDiffKeys,
  mergeReviewExpandedKeys,
  reviewDiffKeysForFindings,
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
  it('uses official desktop review pane scope labels', () => {
    expect(UNSTAGED_LABEL).toBe('Unstaged')
    expect(STAGED_LABEL).toBe('Staged')
    expect(LAST_TURN_LABEL).toBe('Last turn')
    expect(BRANCH_REVIEW_LABEL).toBe('Branch')
    expect(COMMIT_REVIEW_LABEL).toBe('Commit')
    expect(ALL_REPOS_LABEL).toBe('All repos')
    expect(STAGE_ALL_LABEL).toBe('Stage all')
    expect(REVERT_ALL_LABEL).toBe('Revert all')
    expect(STAGE_LABEL).toBe('Stage')
    expect(UNSTAGE_LABEL).toBe('Unstage')
    expect(REVERT_LABEL).toBe('Revert')
    expect(REVIEW_REQUIRES_GIT_LABEL).toBe(
      'The review pane requires a project inside a Git repository.'
    )
    expect(REVIEW_CREATE_ONE_HINT).toMatch(/create one/)
  })

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
        compare: 'last_turn',
        selectedId: '/extra',
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
    expect(lastTurnPendingRelPath('src/new.ts', '/proj', '/proj')).toBe('src/new.ts')
    expect(lastTurnPendingRelPath('/extra/lib/b.ts', '/extra', '/proj')).toBe('lib/b.ts')
    expect(lastTurnPendingRelPath('extra/lib/b.ts', '/extra', '/proj')).toBe('lib/b.ts')
    expect(lastTurnPendingRelPath('src/a.ts', '/extra', '/proj')).toBe(null)
    expect(
      lastTurnPendingRelPaths(['src/a.ts', 'src/new.ts'], [{ path: 'src/a.ts' }], '/proj', '/proj')
    ).toEqual(['src/new.ts'])
    expect(lastTurnPendingRelPaths(['src/a.ts'], [{ path: 'src/a.ts' }], '/proj', '/proj')).toEqual([])
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
    expect(
      reviewDiffKeysForFindings(
        [
          { path: 'src/a.ts', repoRoot: '/proj' },
          { path: 'lib/b.ts', repoRoot: '/extra' },
          { path: 'docs/skip.md', repoRoot: '/proj' }
        ],
        [{ path: 'src/a.ts' }, { path: 'lib/b.ts' }],
        '/proj'
      )
    ).toEqual(['/proj\0src/a.ts', '/extra\0lib/b.ts'])
    expect(reviewDiffKeysForFindings([{ path: 'src/a.ts' }], [], '/proj')).toEqual([])
    const kept = ['/proj\0src/a.ts']
    expect(mergeReviewExpandedKeys(kept, ['/proj\0src/a.ts'])).toBe(kept)
    expect(mergeReviewExpandedKeys(kept, ['/proj\0src/a.ts', '/extra\0lib/b.ts'])).toEqual([
      '/proj\0src/a.ts',
      '/extra\0lib/b.ts'
    ])
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
