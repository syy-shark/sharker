import { describe, expect, it } from 'vitest'
import { filterWorkspaces } from './workspace'

describe('workspace project picker', () => {
  it('filters by label, path or id', () => {
    const items = [
      { id: 'ws-1', label: 'Sharker', path: '/Users/me/sharker' },
      { id: 'ws-2', label: '映雪', path: '/Users/me/xuemusic' }
    ]
    expect(filterWorkspaces(items, 'shark').map((w) => w.id)).toEqual(['ws-1'])
    expect(filterWorkspaces(items, 'xuemusic').map((w) => w.id)).toEqual(['ws-2'])
    expect(filterWorkspaces(items, 'ws-2').map((w) => w.id)).toEqual(['ws-2'])
    expect(filterWorkspaces(items, '')).toEqual(items)
    expect(filterWorkspaces(items, 'zzz')).toEqual([])
  })
})
