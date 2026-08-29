import { describe, expect, it } from 'vitest'
import {
  SYNTAX_HIGHLIGHT_MAX_CHARS,
  fileHighlightLanguage,
  highlightFenceLines,
  resolveHighlightLanguage,
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
})
