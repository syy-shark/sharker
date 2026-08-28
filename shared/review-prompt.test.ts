import { describe, expect, it } from 'vitest'
import {
  formatReviewPrompt,
  parseReviewRequest,
  parseReviewScope,
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

  it('defaults to a detached review thread unless here is passed', () => {
    expect(parseReviewRequest('').detached).toBe(true)
    expect(parseReviewRequest('branch').detached).toBe(true)
    expect(parseReviewRequest('here').detached).toBe(false)
    expect(parseReviewRequest('branch here').detached).toBe(false)
    expect(parseReviewRequest('branch here').scope).toBe('branch')
  })

  it('uses Review delivery and allows here/detached overrides', () => {
    expect(parseReviewRequest('', { delivery: 'inline' }).detached).toBe(false)
    expect(parseReviewRequest('branch', { delivery: 'inline' }).detached).toBe(false)
    expect(parseReviewRequest('here', { delivery: 'detached' }).detached).toBe(false)
    expect(parseReviewRequest('detached', { delivery: 'inline' }).detached).toBe(true)
    expect(parseReviewRequest('new', { delivery: 'inline' }).detached).toBe(true)
    expect(parseReviewRequest('inline', { delivery: 'detached' }).detached).toBe(false)
  })
})
