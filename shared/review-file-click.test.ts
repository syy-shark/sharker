import { describe, expect, it } from 'vitest'
import { resolveReviewFileClick, shouldOpenReviewLine } from './review-file-click'

describe('review file click', () => {
  it('opens the file from the name and toggles the diff from the row', () => {
    expect(resolveReviewFileClick('name')).toBe('open')
    expect(resolveReviewFileClick('background')).toBe('toggle')
  })

  it('opens a diff line only with Cmd or Ctrl', () => {
    expect(shouldOpenReviewLine({ metaKey: true })).toBe(true)
    expect(shouldOpenReviewLine({ ctrlKey: true })).toBe(true)
    expect(shouldOpenReviewLine({})).toBe(false)
    expect(shouldOpenReviewLine({ metaKey: true, shiftKey: true })).toBe(false)
    expect(shouldOpenReviewLine({ ctrlKey: true, altKey: true })).toBe(false)
  })
})
