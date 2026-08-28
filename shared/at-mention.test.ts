import { describe, expect, it } from 'vitest'
import { insertAtMention, parseAtMention } from './at-mention'

describe('at mention', () => {
  it('parses @query after whitespace', () => {
    expect(parseAtMention('see @src/ap', 11)).toEqual({ start: 4, query: 'src/ap' })
  })

  it('parses a lone @ at the start', () => {
    expect(parseAtMention('@', 1)).toEqual({ start: 0, query: '' })
  })

  it('ignores email-like tokens', () => {
    expect(parseAtMention('user@host', 9)).toBeNull()
  })

  it('inserts a relative path and a trailing space', () => {
    const next = insertAtMention('see @ap', 7, 'src/app.ts')
    expect(next.text).toBe('see @src/app.ts ')
    expect(next.cursor).toBe('see @src/app.ts '.length)
  })
})
