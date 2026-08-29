import { describe, expect, it } from 'vitest'
import {
  clampPendingInputPreview,
  pendingPreviewNeedsClamp,
  PENDING_PREVIEW_MAX_CHARS,
  PENDING_PREVIEW_MAX_LINES
} from './pending-preview'

describe('pending preview', () => {
  it('clamps wrapping work to a few lines so the live viewport stays tall', () => {
    expect(PENDING_PREVIEW_MAX_LINES).toBe(3)
    expect(PENDING_PREVIEW_MAX_CHARS).toBe(240)
    expect(clampPendingInputPreview('one\ntwo')).toBe('one\ntwo')
    expect(pendingPreviewNeedsClamp('one\ntwo')).toBe(false)
    expect(clampPendingInputPreview('a\nb\nc\nd\ne')).toBe('a\nb\nc…')
    expect(pendingPreviewNeedsClamp('a\nb\nc\nd')).toBe(true)
    const long = 'x'.repeat(PENDING_PREVIEW_MAX_CHARS + 20)
    const clipped = clampPendingInputPreview(long)
    expect(clipped.endsWith('…')).toBe(true)
    expect(clipped.length).toBeLessThanOrEqual(PENDING_PREVIEW_MAX_CHARS + 1)
    expect(pendingPreviewNeedsClamp(long)).toBe(true)
    expect(clampPendingInputPreview('win\r\nline\r\nthree\r\nfour')).toBe('win\nline\nthree…')
  })
})
