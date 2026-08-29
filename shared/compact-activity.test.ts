import { describe, expect, it } from 'vitest'
import {
  AUTO_COMPACT_DONE_TITLE,
  AUTO_COMPACT_LIVE_STATUS,
  COMPACT_DONE_TITLE,
  COMPACT_LIVE_STATUS,
  formatCompactActivity,
  isAutoCompactCopy,
  isCompactActivityToolName
} from './compact-activity'

describe('official compact activity', () => {
  it('uses official desktop compacting / compacted titles', () => {
    expect(AUTO_COMPACT_LIVE_STATUS).toBe('Automatically compacting context')
    expect(COMPACT_LIVE_STATUS).toBe('Compacting context')
    expect(AUTO_COMPACT_DONE_TITLE).toBe('Context automatically compacted')
    expect(COMPACT_DONE_TITLE).toBe('Context compacted')
    expect(isCompactActivityToolName('compress')).toBe(true)
    expect(isCompactActivityToolName('read_file')).toBe(false)
    expect(isAutoCompactCopy('正在自动压缩上下文…')).toBe(true)
    expect(formatCompactActivity('Automatically compacting context', 'active')).toBe(
      AUTO_COMPACT_LIVE_STATUS
    )
    expect(formatCompactActivity('Automatically compacting context', 'done')).toBe(
      AUTO_COMPACT_DONE_TITLE
    )
    expect(formatCompactActivity('Compacting context', 'active')).toBe(COMPACT_LIVE_STATUS)
    expect(formatCompactActivity('Compacting context', 'done')).toBe(COMPACT_DONE_TITLE)
    expect(formatCompactActivity('压缩上下文', 'done')).toBe(AUTO_COMPACT_DONE_TITLE)
  })
})
