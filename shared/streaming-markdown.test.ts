import { describe, expect, it } from 'vitest'
import {
  continueCheapInlineMarkdown,
  continueStreamingMarkdown,
  extractOpenFenceBody,
  parseCheapInlineMarkdown,
  parseCheapProseBlocks,
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

  it('treats CRLF like LF so an open fence stays in the tail', () => {
    const split = splitStreamingMarkdown('Intro\r\n\r\n```ts\r\nconst x = 1')
    expect(split.blocks).toHaveLength(1)
    expect(split.tailKind).toBe('fence')
    expect(split.tailLang).toBe('ts')
    expect(split.tail).toContain('const x = 1')
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
    expect(parseCheapInlineMarkdown('见 [文档](https://example.com) 与 https://a.test/path.')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: '文档', href: 'https://example.com' },
      { type: 'text', text: ' 与 ' },
      { type: 'link', text: 'https://a.test/path', href: 'https://a.test/path' },
      { type: 'text', text: '.' }
    ])
    expect(parseCheapInlineMarkdown('半截 [未闭](https://x')).toEqual([
      { type: 'text', text: '半截 [未闭](https://x' }
    ])
    expect(parseCheapInlineMarkdown('改 src/App.tsx:12 与 `foo.ts:3`')).toEqual([
      { type: 'text', text: '改 ' },
      { type: 'file', text: 'src/App.tsx:12', path: 'src/App.tsx', line: 12, column: undefined },
      { type: 'text', text: ' 与 ' },
      { type: 'file', text: 'foo.ts:3', path: 'foo.ts', line: 3, column: undefined }
    ])
  })

  it('renders live headings and lists instead of a single paragraph', () => {
    const blocks = parseCheapProseBlocks('# 标题\n- 一项 `src/a.ts:1`\n- 二项')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list'])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(blocks[1]?.type).toBe('list')
    if (blocks[1]?.type === 'list') {
      expect(blocks[1].ordered).toBe(false)
      expect(blocks[1].items).toHaveLength(2)
      expect(blocks[1].items[0]?.some((n) => n.type === 'file')).toBe(true)
    }
  })

  it('reuses closed inline nodes when the prose tail grows', () => {
    const firstText = '见 `foo` 与 '
    const first = parseCheapInlineMarkdown(firstText)
    const grown = continueCheapInlineMarkdown(firstText, first, '见 `foo` 与 **bar**')
    expect(grown[0]).toBe(first[0])
    expect(grown[1]).toBe(first[1])
    expect(grown.map((n) => n.type)).toEqual(['text', 'code', 'text', 'strong'])
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
