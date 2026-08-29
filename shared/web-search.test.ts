/**
 * 官方 web_search 活动文案与 source 行往返。
 * @see shared/web-search.ts
 */
import { describe, expect, it } from 'vitest'
import {
  formatWebSearchActivity,
  formatWebSearchLiveStatus,
  formatWebSearchToolOutput,
  normalizeWebSearchSources,
  parseWebSearchQuery,
  parseWebSearchSources
} from './web-search'

describe('web-search', () => {
  it('uses official Searching / Searched copy and keeps sources short', () => {
    expect(formatWebSearchLiveStatus()).toBe('Searching the web')
    expect(formatWebSearchActivity('')).toBe('Searched the web')
    expect(formatWebSearchActivity(' rust async ')).toBe('Searched the web for rust async')
    const output = formatWebSearchToolOutput({
      query: 'codex desktop',
      sources: [
        {
          title: 'Codex',
          url: 'https://example.com/codex',
          snippet: 'Desktop app'
        },
        { title: 'skip', url: 'javascript:alert(1)' }
      ],
      body: 'Summary: Desktop app'
    })
    expect(output.startsWith('Searched the web for codex desktop')).toBe(true)
    expect(output).toContain('source: Codex | https://example.com/codex')
    expect(output).not.toMatch(/javascript:/)
    expect(output).toContain('Summary: Desktop app')
    expect(parseWebSearchQuery(output)).toBe('codex desktop')
    expect(parseWebSearchSources(output)).toEqual([
      { title: 'Codex', url: 'https://example.com/codex' }
    ])
    expect(
      normalizeWebSearchSources([
        { type: 'text_result', title: 'Hit', url: 'https://ex.test/a', future_field: true },
        { Text: 'Related', FirstURL: 'https://ex.test/b' },
        { title: 'nope', url: '/relative' }
      ])
    ).toEqual([
      { title: 'Hit', url: 'https://ex.test/a' },
      { title: 'Related', url: 'https://ex.test/b' }
    ])
  })
})
