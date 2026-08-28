import { describe, expect, it } from 'vitest'
import { parseReviewRequest, parseReviewScope } from './review-prompt'

describe('review scope', () => {
  it('defaults to uncommitted and accepts branch aliases', () => {
    expect(parseReviewScope('')).toBe('uncommitted')
    expect(parseReviewScope('uncommitted')).toBe('uncommitted')
    expect(parseReviewScope('branch')).toBe('branch')
    expect(parseReviewScope('base')).toBe('branch')
    expect(parseReviewScope('commit')).toBe('commit')
    expect(parseReviewRequest('commit abc1234').commit).toBe('abc1234')
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
