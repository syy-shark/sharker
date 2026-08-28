import { describe, expect, it } from 'vitest'
import { parseCommitLog } from './git-compare'
import { parseReviewRequest, parseReviewScope, reviewCommitPrompt } from './review-prompt'

describe('commit review', () => {
  it('parses git log lines and ignores junk', () => {
    expect(
      parseCommitLog('abc1234\tfix login\nnot-a-sha\tnope\ndef67890123456789012345678901234567890\tfeat\n')
    ).toEqual([
      { sha: 'abc1234', subject: 'fix login' },
      { sha: 'def67890123456789012345678901234567890', subject: 'feat' }
    ])
  })

  it('treats /review commit and a sha as commit scope', () => {
    expect(parseReviewScope('commit')).toBe('commit')
    expect(parseReviewRequest('commit abc1234').scope).toBe('commit')
    expect(parseReviewRequest('commit abc1234').commit).toBe('abc1234')
    expect(parseReviewRequest('deadbeef here').scope).toBe('commit')
    expect(parseReviewRequest('deadbeef here').detached).toBe(false)
    expect(parseReviewScope('branch')).toBe('branch')
    expect(reviewCommitPrompt('abc1234')).toContain('abc1234')
    expect(reviewCommitPrompt()).toContain('HEAD')
  })
})
