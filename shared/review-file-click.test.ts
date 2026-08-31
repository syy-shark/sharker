import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  clampReviewMenuPosition,
  REVIEW_CMD_CLICK_LINE_HINT,
  resolveReviewFileClick,
  reviewFileClickTargetFromElement,
  reviewFileMenuItems,
  shouldOpenReviewLine
} from './review-file-click'

describe('review file click', () => {
  it('opens the file from the name and toggles the diff from the row', () => {
    expect(resolveReviewFileClick('name')).toBe('open')
    expect(resolveReviewFileClick('background')).toBe('toggle')
    expect(reviewFileClickTargetFromElement(null)).toBe('background')
    expect(reviewFileMenuItems(false, 'darwin').map((item) => item.action)).toEqual([
      'open',
      'reveal',
      'toggle'
    ])
    expect(reviewFileMenuItems(false, 'darwin')[1]?.title).toBe('Open in Finder')
    expect(reviewFileMenuItems(true, 'linux')[2]?.title).toBe('收起 diff')
    expect(clampReviewMenuPosition(1200, 800, { width: 160, height: 72 }, { width: 1280, height: 800 })).toEqual({
      x: 1112,
      y: 720
    })
  })

  it('opens a diff line only with Cmd or Ctrl', () => {
    expect(shouldOpenReviewLine({ metaKey: true })).toBe(true)
    expect(shouldOpenReviewLine({ ctrlKey: true })).toBe(true)
    expect(shouldOpenReviewLine({})).toBe(false)
    expect(shouldOpenReviewLine({ metaKey: true, shiftKey: true })).toBe(false)
    expect(shouldOpenReviewLine({ ctrlKey: true, altKey: true })).toBe(false)
    expect(REVIEW_CMD_CLICK_LINE_HINT).toMatch(/holding Cmd pressed/)
    const diffSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/CodeDiffBlock.tsx'),
      'utf8'
    )
    expect(diffSrc).toContain('REVIEW_CMD_CLICK_LINE_HINT')
    expect(diffSrc).not.toContain('⌘/Ctrl+单击打开该行预览')
  })
})
