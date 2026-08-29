import { describe, expect, it } from 'vitest'
import {
  decodeCitationFilesystemPath,
  fileCitationMenuItems,
  formatCitationClipboardPath,
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
    expect(looksLikeFilePath('a/')).toBe(false)
    expect(parseFileCitation('a\\')).toBeNull()
    expect(matchFileCitationAt('a\\\nb', 0)).toBeNull()
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
    expect(resolveCitationPath('lib/util.ts', '/tmp/proj', ['/tmp/extra'])).toBe('/tmp/proj/lib/util.ts')
    expect(resolveCitationPath('extra/util.ts', '/tmp/proj', ['/tmp/extra'])).toBe('/tmp/extra/util.ts')
    expect(resolveCitationPath('extra', '/tmp/proj', ['/tmp/extra'])).toBe('/tmp/extra')
    expect(decodeCitationFilesystemPath('plain/src/a.ts')).toBe('plain/src/a.ts')
    expect(
      decodeCitationFilesystemPath(
        '/Users/me/CodexProjectRoots/%E6%8A%80%E8%83%BD/output/a.ts'
      )
    ).toBe('/Users/me/CodexProjectRoots/技能/output/a.ts')
    expect(
      parseFileCitation('/tmp/%E6%8A%80%E8%83%BD/a.ts:12')
    ).toEqual({ path: '/tmp/技能/a.ts', line: 12, column: undefined })
    expect(parseFileCitation('/Users/me/My%20Project/a.ts')).toEqual({
      path: '/Users/me/My Project/a.ts'
    })
    expect(looksLikeFilePath('/Users/me/My Project/a.ts')).toBe(true)
    expect(looksLikeFilePath('foo bar.ts')).toBe(false)
    expect(decodeCitationFilesystemPath('%E6%8A%80%E8%83%BD')).toBe(
      decodeCitationFilesystemPath(decodeCitationFilesystemPath('%E6%8A%80%E8%83%BD'))
    )
    expect(formatCitationClipboardPath('C:/Users/me/.codex/a.ts', 'win32')).toBe(
      'C:\\Users\\me\\.codex\\a.ts'
    )
    expect(formatCitationClipboardPath('/tmp/proj/src/a.ts', 'darwin')).toBe(
      '/tmp/proj/src/a.ts'
    )
    expect(fileCitationMenuItems('darwin').map((item) => item.action)).toEqual([
      'open',
      'reveal',
      'copy'
    ])
    expect(fileCitationMenuItems('darwin')[1]?.title).toBe('在访达中显示')
    expect(fileCitationMenuItems('win32')[2]?.title).toBe('复制路径')
  })
})
