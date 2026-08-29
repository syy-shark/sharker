import { describe, expect, it } from 'vitest'
import {
  filesChangedDisplayLabel,
  filesChangedDisplayPaths,
  filesChangedFileMenuItems,
  filesChangedHeaderTargetFromElement,
  filesChangedKindLabel
} from './files-changed-card'

describe('files changed card', () => {
  it('opens review from the title, lists unique paths, and offers Finder reveal', () => {
    expect(filesChangedHeaderTargetFromElement(null)).toBe('review')
    expect(filesChangedFileMenuItems('darwin').map((item) => item.action)).toEqual([
      'open',
      'reveal',
      'copy'
    ])
    expect(filesChangedFileMenuItems('darwin')[1]?.title).toBe('在访达中显示')
    expect(filesChangedFileMenuItems('darwin')[2]?.title).toBe('复制路径')
    expect(filesChangedFileMenuItems('win32')[1]?.title).toBe('在资源管理器中显示')
    expect(
      filesChangedDisplayPaths(['src/a.ts', ' src/a.ts ', 'lib\\\\b.ts', '', 'src/a.ts'])
    ).toEqual(['src/a.ts', 'lib/b.ts'])
    const collided = ['skills/foo/README.md', 'skills/bar/README.md', 'src/a.ts']
    expect(filesChangedDisplayLabel('skills/foo/README.md', collided)).toBe('foo/README.md')
    expect(filesChangedDisplayLabel('src/a.ts', collided)).toBe('a.ts')
    expect(filesChangedDisplayLabel('docs/guide.md', ['docs/guide.md'])).toBe('guide.md')
    expect(filesChangedKindLabel('docs/guide.md')).toBe('Document · MD')
    expect(filesChangedKindLabel('shot.JPEG')).toBe('Image · JPG')
    expect(filesChangedKindLabel('src/a.ts')).toBe('')
  })
})
