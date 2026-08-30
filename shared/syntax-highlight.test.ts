import { describe, expect, it } from 'vitest'
import {
  SYNTAX_HIGHLIGHT_MAX_CHARS,
  collectClosedHighlightFences,
  fileHighlightLanguage,
  hasCachedFenceHighlight,
  highlightFenceLines,
  prefetchLiveFenceHighlights,
  resolveHighlightLanguage,
  shouldPrefetchLiveFenceHighlight,
  shouldWarmLiveFenceHighlight,
  splitHighlightedHtmlLines
} from './syntax-highlight'

describe('syntax-highlight', () => {
  it('maps languages, colors closed fences, and escapes markup', () => {
    expect(resolveHighlightLanguage('ts')).toBe('typescript')
    expect(resolveHighlightLanguage('language-js')).toBe('javascript')
    expect(resolveHighlightLanguage('plain')).toBeUndefined()
    expect(resolveHighlightLanguage('not-a-lang')).toBeUndefined()
    expect(fileHighlightLanguage('src/App.tsx')).toBe('typescript')
    expect(fileHighlightLanguage('Dockerfile')).toBe('dockerfile')
    expect(fileHighlightLanguage('Makefile')).toBe('makefile')
    expect(fileHighlightLanguage('notes.tex')).toBeUndefined()
    expect(
      highlightFenceLines('FROM node:22', 'dockerfile')?.some((line) => line.includes('hljs'))
    ).toBe(true)
    const ts = highlightFenceLines('const x = 1', 'ts')
    expect(ts).not.toBeNull()
    expect(ts!.some((line) => line.includes('hljs-keyword') || line.includes('hljs-number'))).toBe(
      true
    )
    expect(highlightFenceLines('const x = 1', 'ts')).toBe(ts)
    const html = highlightFenceLines('<script>alert(1)</script>', 'html')
    expect(html?.join('')).not.toContain('<script>')
    expect(html?.join('')).toContain('&lt;')
    expect(html?.join('')).toContain('alert(1)')
    const diff = highlightFenceLines('- old\n+ new', 'diff')
    expect(diff?.some((line) => line.includes('hljs-deletion'))).toBe(true)
    expect(diff?.some((line) => line.includes('hljs-addition'))).toBe(true)
    expect(highlightFenceLines('const x = 1', 'not-a-lang')).toBeNull()
    expect(highlightFenceLines('x'.repeat(SYNTAX_HIGHLIGHT_MAX_CHARS + 1), 'js')).toBeNull()
    expect(splitHighlightedHtmlLines('<span class="hljs-string">"a\nb"</span>')).toEqual([
      '<span class="hljs-string">"a</span>',
      '<span class="hljs-string">b"</span>'
    ])
  })

  it('prefetches closed highlight fences and skips mermaid/demo', () => {
    expect(shouldPrefetchLiveFenceHighlight('ts')).toBe(true)
    expect(shouldPrefetchLiveFenceHighlight('mermaid')).toBe(false)
    expect(shouldPrefetchLiveFenceHighlight('demo')).toBe(false)
    expect(shouldWarmLiveFenceHighlight({ closed: true, streaming: true, language: 'ts' })).toBe(
      true
    )
    expect(shouldWarmLiveFenceHighlight({ closed: true, streaming: false, language: 'ts' })).toBe(
      false
    )
    expect(shouldWarmLiveFenceHighlight({ closed: false, streaming: true, language: 'ts' })).toBe(
      false
    )
    expect(
      shouldWarmLiveFenceHighlight({ closed: true, streaming: true, language: 'mermaid' })
    ).toBe(false)
    expect(shouldWarmLiveFenceHighlight({ closed: true, streaming: true, language: 'demo' })).toBe(
      false
    )
    expect(shouldWarmLiveFenceHighlight({ closed: true, language: 'ts' })).toBe(false)
    expect(collectClosedHighlightFences('See\n```ts\nconst x = 1\n```\n')).toEqual([
      { lang: 'ts', body: 'const x = 1' }
    ])
    expect(collectClosedHighlightFences('```mermaid\ngraph TD\nA-->B\n```')).toEqual([])
    expect(collectClosedHighlightFences('```demo\n<div></div>\n```')).toEqual([])
    expect(hasCachedFenceHighlight('const uniquePrefetch = 1', 'ts')).toBe(false)
    expect(prefetchLiveFenceHighlights('See\n```ts\nconst uniquePrefetch = 1\n```\n')).toBe(1)
    expect(hasCachedFenceHighlight('const uniquePrefetch = 1', 'ts')).toBe(true)
    const painted = highlightFenceLines('const uniquePrefetch = 1', 'ts')
    expect(prefetchLiveFenceHighlights('See\n```ts\nconst uniquePrefetch = 1\n```\n')).toBe(1)
    expect(highlightFenceLines('const uniquePrefetch = 1', 'ts')).toBe(painted)
    expect(hasCachedFenceHighlight('const uniquePrefetch = 1', 'plain')).toBe(false)
  })
})
