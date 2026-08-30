import { readFileSync } from 'node:fs'
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
  shouldReuseFilesChangedStats,
  shouldSkipFilesChangedIdentity
} from './files-changed-card'

describe('files changed card', () => {
  it('opens review from the title, lists unique paths, and offers Finder reveal', () => {
    expect(filesChangedHeaderTargetFromElement(null)).toBe('review')
    expect(filesChangedFileMenuItems('darwin').map((item) => item.action)).toEqual([
      'open',
      'reveal',
      'copy'
    ])
    expect(filesChangedFileMenuItems('darwin')[0]?.title).toBe('Open')
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
    const prefix = fileSegs[0]!
    const answerTail = {}
    const grownTail = {}
    expect(
      shouldSkipFilesChangedIdentity({
        prevSegments: [prefix, answerTail],
        segments: [prefix, grownTail]
      })
    ).toBe(true)
    expect(nextFilesChangedStats(first, [prefix, answerTail])).toBe(first)
    expect(nextFilesChangedStats(first, [prefix, grownTail])).toBe(first)
    expect(
      shouldSkipFilesChangedIdentity({
        prevSegments: [prefix, answerTail],
        segments: [
          prefix,
          { fileDiff: { path: 'src/b.ts', stats: { added: 1, removed: 0 } } }
        ]
      })
    ).toBe(false)
    expect(
      shouldSkipFilesChangedIdentity({
        prevSegments: [prefix],
        segments: [prefix, answerTail]
      })
    ).toBe(true)
    expect(
      shouldSkipFilesChangedIdentity({
        prevSegments: [prefix],
        segments: [
          prefix,
          { fileDiff: { path: 'src/b.ts', stats: { added: 1, removed: 0 } } }
        ]
      })
    ).toBe(false)
    const thinkActive = {}
    const thinkDone = {}
    expect(
      shouldSkipFilesChangedIdentity({
        prevSegments: [thinkActive],
        segments: [thinkDone, answerTail]
      })
    ).toBe(true)
    expect(nextFilesChangedStats(first, [prefix, thinkDone, answerTail])).toBe(first)
    const cardSrc = readFileSync(
      new URL('../src/components/FilesChangedCard.tsx', import.meta.url),
      'utf8'
    )
    expect(cardSrc).toContain('OPEN_LABEL')
    expect(cardSrc).not.toContain(' · 打开')
  })
})
