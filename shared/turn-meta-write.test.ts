import { describe, expect, it } from 'vitest'
import { extractChangedRelPaths, liveAssistantMeta, mergeChangedRelPaths } from './turn-meta'

describe('extractChangedRelPaths', () => {
  it('strips the workspace prefix from write tools', () => {
    expect(
      extractChangedRelPaths('write_file', { path: '/proj/src/a.ts' }, '/proj')
    ).toEqual(['src/a.ts'])
    expect(extractChangedRelPaths('read_file', { path: '/proj/src/a.ts' }, '/proj')).toEqual([])
    expect(
      extractChangedRelPaths('write_file', { path: '/extra/lib/a.ts' }, '/proj')
    ).toEqual(['/extra/lib/a.ts'])
    expect(liveAssistantMeta(['a.ts'], [{ kind: 'tool', label: 'write_file' }], ['src/a.ts'])).toEqual(
      {
        browsedFiles: ['a.ts'],
        activities: [{ kind: 'tool', label: 'write_file' }],
        changedFiles: ['src/a.ts']
      }
    )
    expect(liveAssistantMeta([], []).changedFiles).toBeUndefined()
  })

  it('extracts apply_patch hunk paths', () => {
    expect(
      extractChangedRelPaths(
        'apply_patch',
        { patch: '*** Update File: /proj/src/b.ts\n+hi\n' },
        '/proj'
      )
    ).toEqual(['src/b.ts'])
    const dest = ['src/b.ts']
    expect(mergeChangedRelPaths(dest, ['src/b.ts', 'src/c.ts'])).toBe(true)
    expect(dest).toEqual(['src/b.ts', 'src/c.ts'])
    expect(mergeChangedRelPaths(dest, ['src/c.ts'])).toBe(false)
  })
})
