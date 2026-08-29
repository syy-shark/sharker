/**
 * DuckDuckGo Instant Answer → 官方 title/url 来源。
 * @see ./index.ts
 */
import { describe, expect, it } from 'vitest'
import { parseDuckDuckGoInstantAnswer } from './index'

describe('parseDuckDuckGoInstantAnswer', () => {
  it('keeps official title/url sources and ignores nested junk', () => {
    const parsed = parseDuckDuckGoInstantAnswer({
      Heading: 'Codex',
      Abstract: 'An agent.',
      AbstractURL: 'https://example.com/codex',
      RelatedTopics: [
        { Text: 'Desktop', FirstURL: 'https://example.com/desktop' },
        {
          Topics: [{ Text: 'Nested', FirstURL: 'https://example.com/nested' }]
        }
      ]
    })
    expect(parsed.sources).toEqual([
      { title: 'Codex', url: 'https://example.com/codex', snippet: 'An agent.' },
      { title: 'Desktop', url: 'https://example.com/desktop' },
      { title: 'Nested', url: 'https://example.com/nested' }
    ])
    expect(parsed.body).toContain('Summary: An agent.')
    expect(parsed.body).toContain('Desktop')
  })
})
