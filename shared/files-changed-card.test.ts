import { describe, expect, it } from 'vitest'
import {
  filesChangedDisplayPaths,
  filesChangedFileMenuItems,
  filesChangedHeaderTargetFromElement
} from './files-changed-card'

describe('files changed card', () => {
  it('opens review from the title, lists unique paths, and offers Finder reveal', () => {
    expect(filesChangedHeaderTargetFromElement(null)).toBe('review')
    expect(filesChangedFileMenuItems('darwin').map((item) => item.action)).toEqual([
      'open',
      'reveal'
    ])
    expect(filesChangedFileMenuItems('darwin')[1]?.title).toBe('在访达中显示')
    expect(filesChangedFileMenuItems('win32')[1]?.title).toBe('在资源管理器中显示')
    expect(
      filesChangedDisplayPaths(['src/a.ts', ' src/a.ts ', 'lib\\\\b.ts', '', 'src/a.ts'])
    ).toEqual(['src/a.ts', 'lib/b.ts'])
  })
})
