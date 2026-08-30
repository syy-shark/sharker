import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CODE_REVIEW_SETTINGS_LABEL,
  composeReviewScopeArgs,
  DETACHED_REVIEW_DESCRIPTION,
  DETACHED_REVIEW_LABEL,
  formatReviewPrompt,
  INLINE_REVIEW_DESCRIPTION,
  INLINE_REVIEW_LABEL,
  parseReviewDelivery,
  REVIEW_A_COMMIT_LABEL,
  REVIEW_AGAINST_A_BASE_BRANCH_LABEL,
  REVIEW_DELIVERY_LABEL,
  REVIEW_SCOPE_INTRO,
  REVIEW_UNCOMMITTED_CHANGES_LABEL,
  parseReviewProviderId,
  parseReviewRequest,
  parseReviewScope,
  resolveReviewProviderId,
  reviewNeedsScopePicker,
  reviewSubmitMode,
  withReviewInstructions
} from './review-prompt'

describe('review scope', () => {
  it('defaults to uncommitted and accepts branch aliases', () => {
    expect(parseReviewScope('')).toBe('uncommitted')
    expect(parseReviewScope('uncommitted')).toBe('uncommitted')
    expect(parseReviewScope('branch')).toBe('branch')
    expect(parseReviewScope('base')).toBe('branch')
    expect(parseReviewScope('commit')).toBe('commit')
    expect(parseReviewRequest('commit abc1234').commit).toBe('abc1234')
    expect(parseReviewRequest('Focus on edge cases and security issues').instructions).toBe(
      'Focus on edge cases and security issues'
    )
    expect(parseReviewRequest('branch here Focus on security').instructions).toBe('Focus on security')
    expect(parseReviewRequest('commit abc1234 look at auth').instructions).toBe('look at auth')
    expect(parseReviewRequest('branch').instructions).toBe('')
    expect(withReviewInstructions('base', '')).toBe('base')
    expect(withReviewInstructions('base', 'Focus on races')).toBe('base\n\n额外关注：Focus on races')
    expect(formatReviewPrompt(parseReviewRequest('Focus on edge cases'))).toContain('额外关注：Focus on edge cases')
  })

  it('defaults to the current chat unless detached is passed', () => {
    expect(parseReviewDelivery(undefined)).toBe('inline')
    expect(parseReviewDelivery('inline')).toBe('inline')
    expect(parseReviewDelivery('detached')).toBe('detached')
    expect(parseReviewRequest('').detached).toBe(false)
    expect(parseReviewRequest('branch').detached).toBe(false)
    expect(parseReviewRequest('here').detached).toBe(false)
    expect(parseReviewRequest('branch here').detached).toBe(false)
    expect(parseReviewRequest('branch here').scope).toBe('branch')
    expect(parseReviewRequest('detached').detached).toBe(true)
    expect(parseReviewRequest('new').detached).toBe(true)
    expect(reviewSubmitMode({ detached: false, busy: false })).toBe('send')
    expect(reviewSubmitMode({ detached: false, busy: true })).toBe('queue')
    expect(reviewSubmitMode({ detached: false, busy: true, followUp: 'steer' })).toBe('jump')
    expect(reviewSubmitMode({ detached: true, busy: true, followUp: 'queue' })).toBe('detach')
    expect(reviewNeedsScopePicker('')).toBe(true)
    expect(reviewNeedsScopePicker('here')).toBe(true)
    expect(reviewNeedsScopePicker('detached')).toBe(true)
    expect(reviewNeedsScopePicker('uncommitted')).toBe(false)
    expect(reviewNeedsScopePicker('branch')).toBe(false)
    expect(reviewNeedsScopePicker('commit abc1234')).toBe(false)
    expect(reviewNeedsScopePicker('Focus on auth')).toBe(false)
    expect(composeReviewScopeArgs('here', 'branch')).toBe('branch here')
    expect(composeReviewScopeArgs('', 'commit', 'abc1234')).toBe('commit abc1234')
    expect(reviewNeedsScopePicker(composeReviewScopeArgs('here', 'uncommitted'))).toBe(false)
  })

  it('uses official Review delivery and /review picker copy', () => {
    expect(CODE_REVIEW_SETTINGS_LABEL).toBe('Code review')
    expect(REVIEW_DELIVERY_LABEL).toBe('Review delivery')
    expect(INLINE_REVIEW_LABEL).toBe('Inline')
    expect(DETACHED_REVIEW_LABEL).toBe('Detached')
    expect(INLINE_REVIEW_DESCRIPTION).toMatch(/current chat/)
    expect(DETACHED_REVIEW_DESCRIPTION).toMatch(/separate review chat/)
    expect(REVIEW_UNCOMMITTED_CHANGES_LABEL).toBe('Review uncommitted changes')
    expect(REVIEW_AGAINST_A_BASE_BRANCH_LABEL).toBe('Review against a base branch')
    expect(REVIEW_A_COMMIT_LABEL).toBe('Review a commit')
    expect(REVIEW_SCOPE_INTRO).toBe(
      'Choose Review against a base branch or Review uncommitted changes.'
    )
    const dialogSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ReviewScopeDialog.tsx'),
      'utf8'
    )
    expect(dialogSrc).toContain('REVIEW_SCOPE_INTRO')
    expect(dialogSrc).toContain('REVIEW_LABEL')
    expect(dialogSrc).toContain('FILE_CLOSE_LABEL')
    expect(dialogSrc).not.toContain('选择审查范围')
    expect(dialogSrc).not.toContain('对标 Codex')
  })

  it('uses Review delivery and allows here/detached overrides', () => {
    expect(parseReviewRequest('', { delivery: 'inline' }).detached).toBe(false)
    expect(parseReviewRequest('branch', { delivery: 'inline' }).detached).toBe(false)
    expect(parseReviewRequest('here', { delivery: 'detached' }).detached).toBe(false)
    expect(parseReviewRequest('detached', { delivery: 'inline' }).detached).toBe(true)
    expect(parseReviewRequest('new', { delivery: 'inline' }).detached).toBe(true)
    expect(parseReviewRequest('inline', { delivery: 'detached' }).detached).toBe(false)
    expect(parseReviewProviderId(undefined)).toBe('')
    expect(parseReviewProviderId('  p1  ')).toBe('p1')
    const providers = [
      { id: 'p1', model: 'gpt-5.6-sol' },
      { id: 'p2', model: 'gpt-5.6-terra' }
    ]
    expect(resolveReviewProviderId('', providers)).toBeUndefined()
    expect(resolveReviewProviderId('p2', providers)).toBe('p2')
    expect(resolveReviewProviderId('gpt-5.6-sol', providers)).toBe('p1')
    expect(resolveReviewProviderId('missing', providers)).toBeUndefined()
    const appSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'), 'utf8')
    expect(appSrc).toContain('reviewProviderId: updated.reviewProviderId')
    expect(appSrc).toContain('reviewProviderId: draft.reviewProviderId')
    expect(appSrc).toContain('reviewProviderId: next.reviewProviderId')
    expect(appSrc).toContain('resolveReviewProviderId')
  })
})
