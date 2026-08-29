import { describe, expect, it } from 'vitest'
import {
  revealInFolderLabel,
  reviewFileRevealPath,
  threadMenuItems,
  threadRevealFolderPath
} from './reveal-in-folder'

describe('reveal in folder', () => {
  it('labels Finder Explorer and File Manager and resolves thread or review paths', () => {
    expect(revealInFolderLabel('darwin')).toBe('在访达中显示')
    expect(revealInFolderLabel('win32')).toBe('在资源管理器中显示')
    expect(revealInFolderLabel('linux')).toBe('在文件管理器中显示')
    expect(revealInFolderLabel()).toBe('在文件管理器中显示')
    expect(
      threadRevealFolderPath({
        mode: 'worktree',
        worktreePath: '/tmp/wt',
        workspacePath: '/repo'
      })
    ).toBe('/tmp/wt')
    expect(
      threadRevealFolderPath({
        mode: 'local',
        worktreePath: '/tmp/wt',
        workspacePath: '/repo'
      })
    ).toBe('/repo')
    expect(threadRevealFolderPath({ mode: 'worktree', workspacePath: '/repo' })).toBe('/repo')
    expect(reviewFileRevealPath('src/a.ts', '/proj')).toBe('/proj/src/a.ts')
    expect(reviewFileRevealPath('/abs/b.ts', '/proj')).toBe('/abs/b.ts')
    expect(reviewFileRevealPath('C:\\repo\\a.ts', '/proj')).toBe('C:/repo/a.ts')
    expect(reviewFileRevealPath('lib/b.ts', 'C:\\extra\\')).toBe('C:/extra/lib/b.ts')
    expect(reviewFileRevealPath('', '/proj')).toBe('')
    expect(threadMenuItems({ platform: 'darwin' }).map((item) => item.action)).toEqual([
      'reveal',
      'rename',
      'pin',
      'archive'
    ])
    expect(threadMenuItems({ pinned: true, platform: 'win32' })[2]?.title).toBe('取消置顶')
    expect(threadMenuItems({ platform: 'linux' })[0]?.title).toBe('在文件管理器中显示')
  })
})
