import { describe, expect, it } from 'vitest'
import { extractChangedRelPaths } from './turn-meta'

describe('extractChangedRelPaths', () => {
  it('strips the workspace prefix from write tools', () => {
    expect(
      extractChangedRelPaths('write_file', { path: '/proj/src/a.ts' }, '/proj')
    ).toEqual(['src/a.ts'])
    expect(extractChangedRelPaths('read_file', { path: '/proj/src/a.ts' }, '/proj')).toEqual([])
  })

  it('extracts apply_patch hunk paths', () => {
    expect(
      extractChangedRelPaths(
        'apply_patch',
        { patch: '*** Update File: /proj/src/b.ts\n+hi\n' },
        '/proj'
      )
    ).toEqual(['src/b.ts'])
  })
})
