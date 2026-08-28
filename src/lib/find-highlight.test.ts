import { describe, expect, it } from 'vitest'
import { FIND_HIGHLIGHT_SCOPE } from './find-highlight'

describe('find highlight', () => {
  it('scopes to bubble bodies so live process chrome is skipped', () => {
    expect(FIND_HIGHLIGHT_SCOPE).toContain('message-body--assistant')
    expect(FIND_HIGHLIGHT_SCOPE).toContain('message-bubble--user')
  })
})
