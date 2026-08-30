import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  insertAtMention,
  orderComposerMentionHits,
  parseAtMention,
  TYPE_AT_TO_SEARCH_LABEL
} from './at-mention'

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

  it('uses official Type @ to search for a file and surfaces files first', () => {
    expect(TYPE_AT_TO_SEARCH_LABEL).toBe(
      'Type @ to search for a file in the workspace and add its path to the prompt.'
    )
    expect(
      orderComposerMentionHits(
        [{ kind: 'file' as const, name: 'app.ts' }],
        [{ kind: 'skill' as const, name: 'review' }],
        [{ kind: 'chat' as const, name: '旧对话' }]
      ).map((hit) => hit.kind)
    ).toEqual(['file', 'skill', 'chat'])
    const composerSrc = readFileSync(new URL('../src/components/ComposerDock.tsx', import.meta.url), 'utf8')
    expect(composerSrc).toContain('TYPE_AT_TO_SEARCH_LABEL')
    expect(composerSrc).toContain('orderComposerMentionHits')
    expect(composerSrc).not.toContain('引用文件、对话或 Skill')
  })
})
