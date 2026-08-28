import { describe, expect, it } from 'vitest'
import { wrapWorkspaceForest } from './workspace-tree'

describe('workspace forest', () => {
  it('keeps a flat primary tree until extra folders are present', () => {
    const children = [{ name: 'src', path: '/repo/src', isDirectory: true }]
    expect(wrapWorkspaceForest('/repo', children, [])).toEqual(children)
    expect(wrapWorkspaceForest('/repo', children, [{ path: '/repo', children: [] }])).toEqual(children)
    expect(wrapWorkspaceForest('/repo', children, [{ path: '/extra', children: [] }])).toEqual([
      { name: 'repo', path: '/repo', isDirectory: true, children },
      { name: 'extra', path: '/extra', isDirectory: true, children: [] }
    ])
  })
})
