import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILES_CHANGED_STATS,
  filesChangedDisplayLabel,
  filesChangedDisplayPaths,
  filesChangedFileMenuItems,
  filesChangedHeaderTargetFromElement,
  filesChangedKindLabel,
  filesChangedStatsForPath,
  filesChangedStatsFromSegments,
  formatFilesChangedHeader,
  formatFilesChangedLineStats,
  liveFilesChangedIdentity,
  nextFilesChangedStats,
  shouldReuseFilesChangedStats
} from './files-changed-card'

describe('files changed card', () => {
  it('opens review from the title, lists unique paths, and offers Finder reveal', () => {
    expect(filesChangedHeaderTargetFromElement(null)).toBe('review')
    expect(filesChangedFileMenuItems('darwin').map((item) => item.action)).toEqual([
      'open',
      'reveal',
      'copy'
    ])
    expect(filesChangedFileMenuItems('darwin')[1]?.title).toBe('Open in Finder')
    expect(filesChangedFileMenuItems('darwin')[2]?.title).toBe('Copy path')
    expect(filesChangedFileMenuItems('win32')[1]?.title).toBe('Open in Explorer')
    expect(
      filesChangedDisplayPaths(['src/a.ts', ' src/a.ts ', 'lib\\\\b.ts', '', 'src/a.ts'])
    ).toEqual(['src/a.ts', 'lib/b.ts'])
    const collided = ['skills/foo/README.md', 'skills/bar/README.md', 'src/a.ts']
    expect(filesChangedDisplayLabel('skills/foo/README.md', collided)).toBe('foo/README.md')
    expect(filesChangedDisplayLabel('src/a.ts', collided)).toBe('a.ts')
    expect(filesChangedDisplayLabel('docs/guide.md', ['docs/guide.md'])).toBe('guide.md')
    expect(filesChangedKindLabel('docs/guide.md')).toBe('Document · MD')
    expect(filesChangedKindLabel('shot.JPEG')).toBe('Image · JPG')
    expect(filesChangedKindLabel('index.html')).toBe('Document · HTML')
    expect(filesChangedKindLabel('src/a.ts')).toBe('')
    expect(formatFilesChangedHeader(['src/a.ts'])).toBe('Edited a.ts')
    expect(formatFilesChangedHeader(['src/a.ts', 'docs/guide.md'])).toBe('Edited 2 files')
    expect(formatFilesChangedLineStats(16, 199)).toBe('+16 −199')
    expect(formatFilesChangedLineStats(0, 0)).toBe('')
    const first = filesChangedStatsFromSegments([
      {
        editPreview: [{ path: 'src/a.ts', stats: { added: 2, removed: 1 } }]
      },
      {
        fileDiff: { path: 'src/a.ts', stats: { added: 16, removed: 199 } },
        fileDiffs: [{ path: 'docs/guide.md', stats: { added: 4, removed: 0 } }]
      }
    ])
    expect(first).toEqual({
      added: 20,
      removed: 199,
      byPath: {
        'src/a.ts': { added: 16, removed: 199 },
        'docs/guide.md': { added: 4, removed: 0 }
      }
    })
    expect(filesChangedStatsForPath('src\\\\a.ts', first.byPath)).toEqual({
      added: 16,
      removed: 199
    })
    expect(filesChangedStatsFromSegments([])).toBe(EMPTY_FILES_CHANGED_STATS)
    const again = nextFilesChangedStats(first, [
      {
        fileDiff: { path: 'src/a.ts', stats: { added: 16, removed: 199 } },
        fileDiffs: [{ path: 'docs/guide.md', stats: { added: 4, removed: 0 } }]
      }
    ])
    expect(again).toBe(first)
    const fileSegs = [
      {
        fileDiff: { path: 'src/a.ts', stats: { added: 16, removed: 199 } },
        fileDiffs: [{ path: 'docs/guide.md', stats: { added: 4, removed: 0 } }]
      }
    ]
    const identity = liveFilesChangedIdentity(fileSegs)
    expect(liveFilesChangedIdentity([...fileSegs, {}])).toBe(identity)
    expect(
      shouldReuseFilesChangedStats({
        prev: first,
        identity,
        prevIdentity: identity
      })
    ).toBe(true)
    expect(nextFilesChangedStats(first, [...fileSegs, {}])).toBe(first)
  })
})
