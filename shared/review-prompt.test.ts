import { describe, expect, it } from 'vitest'
import { parseReviewRequest, parseReviewScope } from './review-prompt'

describe('review scope', () => {
  it('defaults to uncommitted and accepts branch aliases', () => {
    expect(parseReviewScope('')).toBe('uncommitted')
    expect(parseReviewScope('uncommitted')).toBe('uncommitted')
    expect(parseReviewScope('branch')).toBe('branch')
    expect(parseReviewScope('base')).toBe('branch')
  })

  it('defaults to a detached review thread unless here is passed', () => {
    expect(parseReviewRequest('').detached).toBe(true)
    expect(parseReviewRequest('branch').detached).toBe(true)
    expect(parseReviewRequest('here').detached).toBe(false)
    expect(parseReviewRequest('branch here').detached).toBe(false)
    expect(parseReviewRequest('branch here').scope).toBe('branch')
  })
})
