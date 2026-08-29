import { describe, expect, it } from 'vitest'
import {
  isUsableFolderPath,
  normalizeExtraFolderPaths,
  promoteExtraFolderToPrimary,
  workspaceAccessRoots
} from './workspace-folders'

describe('workspace extra folders', () => {
  it('keeps absolute extra folders and drops the primary or illegal paths', () => {
    expect(isUsableFolderPath('/Users/me/lib')).toBe(true)
    expect(isUsableFolderPath('C:\\src\\lib')).toBe(true)
    expect(isUsableFolderPath('/')).toBe(false)
    expect(isUsableFolderPath('../x')).toBe(false)
    expect(isUsableFolderPath('rel')).toBe(false)
    expect(
      normalizeExtraFolderPaths('/repo', ['/repo', '/repo/../secret', '/extra', '/extra/', 'rel', '/extra'])
    ).toEqual(['/extra'])
    expect(workspaceAccessRoots('/repo', ['/extra', '/repo'])).toEqual(['/repo', '/extra'])
    expect(normalizeExtraFolderPaths('/repo', 'nope')).toEqual([])
    expect(promoteExtraFolderToPrimary('/app', ['/docs', '/api'], '/docs')).toEqual({
      path: '/docs',
      extraPaths: ['/app', '/api']
    })
    expect(promoteExtraFolderToPrimary('/app', ['/docs'], '/missing')).toEqual({
      path: '/app',
      extraPaths: ['/docs']
    })
    expect(promoteExtraFolderToPrimary('/app', ['/docs'], '../x')).toEqual({
      path: '/app',
      extraPaths: ['/docs']
    })
  })
})
