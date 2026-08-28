import { describe, expect, it } from 'vitest'
import {
  continueStreamingMarkdown,
  extractOpenFenceBody,
  parseCheapInlineMarkdown,
  splitStreamingMarkdown
} from './streaming-markdown'

describe('splitStreamingMarkdown', () => {
  it('keeps a growing paragraph in the tail', () => {
    const first = splitStreamingMarkdown('Hello')
    expect(first.blocks).toEqual([])
    expect(first.tail).toBe('Hello')
    expect(first.tailKind).toBe('prose')

    const next = splitStreamingMarkdown('Hello world')
    expect(next.blocks).toEqual([])
    expect(next.tail).toBe('Hello world')
  })

  it('commits a paragraph once a blank line arrives', () => {
    const split = splitStreamingMarkdown('Hello world.\n\nNext')
    expect(split.blocks).toHaveLength(1)
    expect(split.blocks[0]?.id).toBe('md-0')
    expect(split.blocks[0]?.text).toBe('Hello world.\n')
    expect(split.tail).toBe('Next')
  })

  it('keeps an open fence entirely in the tail', () => {
    const split = splitStreamingMarkdown('Intro\n\n```ts\nconst x = 1')
    expect(split.blocks).toHaveLength(1)
    expect(split.blocks[0]?.text).toBe('Intro\n')
    expect(split.tailKind).toBe('fence')
    expect(split.tailLang).toBe('ts')
    expect(split.tail).toContain('const x = 1')
  })

  it('commits a closed fence and does not remake earlier block ids', () => {
    const mid = splitStreamingMarkdown('A\n\n```js\n1')
    expect(mid.blocks.map((b) => b.id)).toEqual(['md-0'])

    const done = splitStreamingMarkdown('A\n\n```js\n1\n```\n\nB')
    expect(done.blocks.map((b) => b.id)).toEqual(['md-0', 'md-1'])
    expect(done.blocks[1]?.text).toContain('```js')
    expect(done.tail).toBe('B')
    expect(done.tailKind).toBe('prose')
  })

  it('extracts open fence body without the opener', () => {
    expect(extractOpenFenceBody('```ts\nconst a = 1\nconst b = 2')).toBe(
      'const a = 1\nconst b = 2'
    )
    expect(extractOpenFenceBody('```ts')).toBe('')
  })

  it('parses paired inline marks and keeps an open mark as text', () => {
    expect(parseCheapInlineMarkdown('见 `foo` 与 **bar** 和 *baz*')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'code', text: 'foo' },
      { type: 'text', text: ' 与 ' },
      { type: 'strong', text: 'bar' },
      { type: 'text', text: ' 和 ' },
      { type: 'em', text: 'baz' }
    ])
    expect(parseCheapInlineMarkdown('半截 **粗')).toEqual([{ type: 'text', text: '半截 **粗' }])
    expect(parseCheapInlineMarkdown('')).toEqual([])
  })

  it('reuses closed blocks when only the tail grows', () => {
    const first = splitStreamingMarkdown('Hello world.\n\nNext')
    expect(first.closedEnd).toBe('Hello world.\n\n'.length)
    const grown = continueStreamingMarkdown(first, 'Hello world.\n\nNext', 'Hello world.\n\nNext sentence')
    expect(grown.blocks[0]).toBe(first.blocks[0])
    expect(grown.blocks).toBe(first.blocks)
    expect(grown.tail).toBe('Next sentence')
    expect(grown.closedEnd).toBe(first.closedEnd)

    const committed = continueStreamingMarkdown(
      grown,
      'Hello world.\n\nNext sentence',
      'Hello world.\n\nNext sentence\n\nMore'
    )
    expect(committed.blocks[0]).toBe(first.blocks[0])
    expect(committed.blocks).toHaveLength(2)
    expect(committed.blocks[1]?.text).toBe('Next sentence\n')
    expect(committed.tail).toBe('More')
  })

  it('falls back to a full split when the prefix changes', () => {
    const first = splitStreamingMarkdown('Hello world.\n\nNext')
    const edited = continueStreamingMarkdown(first, 'Hello world.\n\nNext', 'Changed.\n\nNext')
    expect(edited.blocks[0]).not.toBe(first.blocks[0])
    expect(edited.blocks[0]?.text).toBe('Changed.\n')
  })
})
