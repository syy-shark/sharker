import { describe, expect, it } from 'vitest'
import { formatThreadWindowHash, parseThreadWindowHash } from './thread-window'

describe('thread window hash', () => {
  it('round-trips workspace and conversation ids', () => {
    const hash = formatThreadWindowHash('ws 1', 'c/2')
    expect(parseThreadWindowHash(hash)).toEqual({ workspaceId: 'ws 1', conversationId: 'c/2' })
  })

  it('rejects other hashes', () => {
    expect(parseThreadWindowHash('')).toBeNull()
    expect(parseThreadWindowHash('#settings')).toBeNull()
    expect(parseThreadWindowHash('#thread/only')).toBeNull()
  })
})
