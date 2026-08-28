import { describe, expect, it } from 'vitest'
import { rankWorkspaceFileHits, scoreWorkspaceFileHit } from './workspace-tree'

describe('workspace file search', () => {
  it('prefers basename prefix matches', () => {
    expect(scoreWorkspaceFileHit('src/App.tsx', 'app')).toBeGreaterThan(
      scoreWorkspaceFileHit('src/helpers/app-utils.ts', 'app')
    )
  })

  it('ranks and limits hits', () => {
    const ranked = rankWorkspaceFileHits(
      [
        { name: 'util.ts', path: '/r/lib/util.ts', relativePath: 'lib/util.ts' },
        { name: 'App.tsx', path: '/r/src/App.tsx', relativePath: 'src/App.tsx' },
        { name: 'readme.md', path: '/r/readme.md', relativePath: 'readme.md' }
      ],
      'app',
      2
    )
    expect(ranked.map((f) => f.relativePath)).toEqual(['src/App.tsx'])
  })

  it('returns a slice when the query is empty', () => {
    const ranked = rankWorkspaceFileHits(
      [
        { name: 'a.ts', path: '/r/a.ts', relativePath: 'a.ts' },
        { name: 'b.ts', path: '/r/b.ts', relativePath: 'b.ts' }
      ],
      '',
      10
    )
    expect(ranked).toHaveLength(2)
  })
})
