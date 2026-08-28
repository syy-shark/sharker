import { describe, expect, it } from 'vitest'
import {
  looksLikeFilePath,
  matchFileCitationAt,
  parseFileCitation,
  resolveCitationPath
} from './file-citation'

describe('file citations', () => {
  it('accepts Codex path:line and #L suffixes', () => {
    expect(parseFileCitation('src/App.tsx:42')).toEqual({
      path: 'src/App.tsx',
      line: 42,
      column: undefined
    })
    expect(parseFileCitation('codex-rs/cli/src/main.rs:94:3')).toEqual({
      path: 'codex-rs/cli/src/main.rs',
      line: 94,
      column: 3
    })
    expect(parseFileCitation('controller/user.go#L992')).toEqual({
      path: 'controller/user.go',
      line: 992,
      endLine: undefined
    })
    expect(parseFileCitation('foo.rs#L10-L20')).toEqual({
      path: 'foo.rs',
      line: 10,
      endLine: 20
    })
    expect(parseFileCitation('privacyassistant.py (line 868)')).toEqual({
      path: 'privacyassistant.py',
      line: 868
    })
  })

  it('rejects urls, times, and bare words', () => {
    expect(parseFileCitation('https://example.com/a.ts')).toBeNull()
    expect(parseFileCitation('12:30')).toBeNull()
    expect(parseFileCitation('note:123')).toBeNull()
    expect(parseFileCitation('www.a.test/x')).toBeNull()
    expect(looksLikeFilePath('hello')).toBe(false)
    expect(looksLikeFilePath('www.a.test/x')).toBe(false)
    expect(looksLikeFilePath('src/App.tsx')).toBe(true)
    expect(matchFileCitationAt('见 </span> 后', 2)).toBeNull()
    expect(matchFileCitationAt('见 </span> 后', 3)).toBeNull()
    expect(matchFileCitationAt('见 www.a.test/x 后', 2)).toBeNull()
  })

  it('matches at a boundary and leaves trailing punctuation', () => {
    const src = '见 src/App.tsx:12.'
    const hit = matchFileCitationAt(src, 2)
    expect(hit?.text).toBe('src/App.tsx:12')
    expect(hit?.citation.line).toBe(12)
    expect(src.slice(hit!.end)).toBe('.')
    expect(matchFileCitationAt(src, 3)).toBeNull()
  })

  it('joins a relative path onto the workspace', () => {
    expect(resolveCitationPath('src/App.tsx', '/tmp/proj')).toBe('/tmp/proj/src/App.tsx')
    expect(resolveCitationPath('/abs/x.ts', '/tmp/proj')).toBe('/abs/x.ts')
  })
})
