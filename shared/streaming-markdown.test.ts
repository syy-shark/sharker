import { describe, expect, it } from 'vitest'
import {
  collectLinkDefinitions,
  continueCheapInlineMarkdown,
  continueCheapProseBlocks,
  continueStreamingMarkdown,
  extractOpenFenceBody,
  isOnlyLinkDefinitions,
  markdownBlockWithDefs,
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
    expect(parseCheapInlineMarkdown('见 `foo` 与 **bar** 和 *baz* 及 ~~删~~')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'code', text: 'foo' },
      { type: 'text', text: ' 与 ' },
      { type: 'strong', text: 'bar' },
      { type: 'text', text: ' 和 ' },
      { type: 'em', text: 'baz' },
      { type: 'text', text: ' 及 ' },
      { type: 'del', text: '删' }
    ])
    expect(parseCheapInlineMarkdown('半截 **粗')).toEqual([{ type: 'text', text: '半截 **粗' }])
    expect(parseCheapInlineMarkdown('')).toEqual([])
    expect(parseCheapInlineMarkdown('见 <https://a.test/x> 后')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: 'https://a.test/x', href: 'https://a.test/x' },
      { type: 'text', text: ' 后' }
    ])
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
    expect(parseCheapInlineMarkdown('见图 ![示意](https://a.test/p.png) 后')).toEqual([
      { type: 'text', text: '见图 ' },
      { type: 'image', alt: '示意', href: 'https://a.test/p.png' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('见图 ![示意](https://a.test/p.png "题") 后')).toEqual([
      { type: 'text', text: '见图 ' },
      { type: 'image', alt: '示意', href: 'https://a.test/p.png', title: '题' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('见 [文档](https://a.test/x "题")')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: '文档', href: 'https://a.test/x', title: '题' }
    ])
    expect(parseCheapInlineMarkdown('半截 ![未闭](https://x')).toEqual([
      { type: 'text', text: '半截 ![未闭](https://x' }
    ])
    expect(parseCheapInlineMarkdown('见 __粗__ 与 _斜_ ，但 foo_bar_baz 不动')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'strong', text: '粗', mark: '__' },
      { type: 'text', text: ' 与 ' },
      { type: 'em', text: '斜', mark: '_' },
      { type: 'text', text: ' ，但 foo_bar_baz 不动' }
    ])
    expect(parseCheapInlineMarkdown('见 [文档][d] 与 **bar**')).toEqual([
      { type: 'text', text: '见 [文档][d] 与 ' },
      { type: 'strong', text: 'bar' }
    ])
    const defs = new Map([['d', 'https://a.test/x']])
    expect(parseCheapInlineMarkdown('见 [文档][d] 与 **bar**', defs)).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: '文档', href: 'https://a.test/x', raw: '[文档][d]' },
      { type: 'text', text: ' 与 ' },
      { type: 'strong', text: 'bar' }
    ])
    expect(parseCheapInlineMarkdown('写给 <dev@a.test> 和 user@a.test 后')).toEqual([
      { type: 'text', text: '写给 ' },
      { type: 'link', text: 'dev@a.test', href: 'mailto:dev@a.test', raw: '<dev@a.test>' },
      { type: 'text', text: ' 和 ' },
      { type: 'link', text: 'user@a.test', href: 'mailto:user@a.test', raw: 'user@a.test' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('见 www.a.test 与 注[^1]')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: 'www.a.test', href: 'http://www.a.test', raw: 'www.a.test' },
      { type: 'text', text: ' 与 注' },
      { type: 'fn', id: '1' }
    ])
    expect(parseCheapInlineMarkdown('上  \n下')).toEqual([
      { type: 'text', text: '上' },
      { type: 'br' },
      { type: 'text', text: '下' }
    ])
    expect(parseCheapInlineMarkdown('见 ***粗斜*** 与 **粗**')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'em', text: '粗斜', mark: '***', inner: 'strong' },
      { type: 'text', text: ' 与 ' },
      { type: 'strong', text: '粗' }
    ])
    expect(parseCheapInlineMarkdown('见 ___粗斜___ 尾')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'em', text: '粗斜', mark: '___', inner: 'strong' },
      { type: 'text', text: ' 尾' }
    ])
    expect(parseCheapInlineMarkdown('见 **_粗斜_** 尾')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'strong', text: '粗斜', inner: 'em' },
      { type: 'text', text: ' 尾' }
    ])
    expect(parseCheapInlineMarkdown('见 *__粗斜__* 尾')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'em', text: '粗斜', inner: 'strong' },
      { type: 'text', text: ' 尾' }
    ])
  })

  it('hides reference definitions and paints indented code in the live tail', () => {
    const withDef = parseCheapProseBlocks('见 [文档][d]。\n[d]: https://a.test/x')
    expect(withDef.map((b) => b.type)).toEqual(['p'])
    if (withDef[0]?.type === 'p') {
      expect(withDef[0].nodes.some((n) => n.type === 'link' && n.href === 'https://a.test/x')).toBe(
        true
      )
    }
    const indented = parseCheapProseBlocks('    const x = 1')
    expect(indented).toEqual([{ type: 'pre', text: 'const x = 1' }])
    expect(collectLinkDefinitions('见 [文档][D]。\n[D]: https://a.test/x').get('d')).toBe(
      'https://a.test/x'
    )
    expect(isOnlyLinkDefinitions('[d]: https://a.test/x\n')).toBe(true)
    expect(markdownBlockWithDefs('见 [文档][d]。\n', '[d]: https://a.test/x')).toBe(
      '见 [文档][d]。\n\n[d]: https://a.test/x'
    )
    expect(parseCheapProseBlocks('Overview\n---').map((b) => b.type)).toEqual(['heading'])
    expect(parseCheapProseBlocks('Title\n===')[0]).toMatchObject({ type: 'heading', level: 1 })
    const notes = parseCheapProseBlocks('见注[^1]。\n[^1]: 说明')
    expect(notes.map((b) => b.type)).toEqual(['p', 'footnotes'])
    if (notes[0]?.type === 'p') {
      expect(notes[0].nodes.some((n) => n.type === 'fn' && n.id === '1')).toBe(true)
    }
    const continued = parseCheapProseBlocks('见注[^1]。\n[^1]: 说明\n    续行')
    expect(continued.map((b) => b.type)).toEqual(['p', 'footnotes'])
    if (continued[1]?.type === 'footnotes') {
      expect(continued[1].items[0]?.paragraphs).toHaveLength(1)
      expect(
        continued[1].items[0]?.paragraphs[0]?.some((n) => n.type === 'text' && n.text.includes('续行'))
      ).toBe(true)
    }
    const multi = parseCheapProseBlocks('见注[^1]。\n[^1]: 第一段\n\n    第二段')
    if (multi[1]?.type === 'footnotes') {
      expect(multi[1].items[0]?.paragraphs).toHaveLength(2)
    }
  })

  it('renders live GFM tables and rules instead of a single paragraph', () => {
    const table = parseCheapProseBlocks('| A | B |\n| --- | --- |\n| 1 | `x.ts:2` |')
    expect(table.map((b) => b.type)).toEqual(['table'])
    if (table[0]?.type === 'table') {
      expect(table[0].header).toHaveLength(2)
      expect(table[0].rows).toHaveLength(1)
      expect(table[0].rows[0]?.[1]?.some((n) => n.type === 'file')).toBe(true)
    }
    expect(parseCheapProseBlocks('| only | row |').map((b) => b.type)).toEqual(['p'])
    expect(parseCheapProseBlocks('---').map((b) => b.type)).toEqual(['hr'])
    const quoted = parseCheapProseBlocks('> 外层\n> > 内层')
    expect(quoted.map((b) => b.type)).toEqual(['quote'])
    if (quoted[0]?.type === 'quote') {
      expect(quoted[0].blocks.map((b) => b.type)).toEqual(['p', 'quote'])
    }
    expect(parseCheapProseBlocks('   > 缩进引用').map((b) => b.type)).toEqual(['quote'])
    expect(parseCheapProseBlocks('   # 标题')[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(parseCheapProseBlocks('Title\n   ---').map((b) => b.type)).toEqual(['heading'])
    const quoteTable = parseCheapProseBlocks('> | A | B |\n> | --- | --- |\n> | 1 | 2 |')
    expect(quoteTable.map((b) => b.type)).toEqual(['quote'])
    if (quoteTable[0]?.type === 'quote') {
      expect(quoteTable[0].blocks.map((b) => b.type)).toEqual(['table'])
    }
    const aligned = parseCheapProseBlocks('| A | B |\n| ---: | :---: |\n| 1 | 2 |')
    if (aligned[0]?.type === 'table') {
      expect(aligned[0].align).toEqual(['right', 'center'])
    }
  })

  it('renders live headings and lists instead of a single paragraph', () => {
    const blocks = parseCheapProseBlocks('# 标题\n- 一项 `src/a.ts:1`\n- 二项')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list'])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(blocks[1]?.type).toBe('list')
    if (blocks[1]?.type === 'list') {
      expect(blocks[1].ordered).toBe(false)
      expect(blocks[1].items).toHaveLength(2)
      expect(blocks[1].items[0]?.nodes.some((n) => n.type === 'file')).toBe(true)
    }
  })

  it('reuses closed cheap blocks when a list or table grows', () => {
    const listText = '- 一项\n- 二项'
    const first = parseCheapProseBlocks(listText)
    const grown = continueCheapProseBlocks(listText, first, '- 一项\n- 二项更长')
    expect(grown[0]).not.toBe(first[0])
    if (grown[0]?.type === 'list' && first[0]?.type === 'list') {
      expect(grown[0].items[0]).toBe(first[0].items[0])
      expect(grown[0].items[1]).not.toBe(first[0].items[1])
    }
    const tableText = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const table = parseCheapProseBlocks(tableText)
    const nestedText = '- 一项\n  - 嵌套'
    const nested = parseCheapProseBlocks(nestedText)
    expect(nested[0]?.type).toBe('list')
    if (nested[0]?.type === 'list') {
      expect(nested[0].items).toHaveLength(1)
      expect(nested[0].items[0]?.nested?.items).toHaveLength(1)
      expect(nested[0].items[0]?.nested?.items[0]?.nodes[0]).toMatchObject({
        type: 'text',
        text: '嵌套'
      })
    }
    const nestedGrown = continueCheapProseBlocks(nestedText, nested, `${nestedText}更长`)
    if (nested[0]?.type === 'list' && nestedGrown[0]?.type === 'list') {
      expect(nestedGrown[0].items[0]?.nodes).toBe(nested[0].items[0]?.nodes)
      expect(nestedGrown[0].items[0]?.nested?.items[0]).not.toBe(nested[0].items[0]?.nested?.items[0])
    }
    const wrap = parseCheapProseBlocks('- 一项\n续行仍在项内')
    expect(wrap).toHaveLength(1)
    if (wrap[0]?.type === 'list') {
      expect(wrap[0].items).toHaveLength(1)
      expect(wrap[0].items[0]?.nodes[0]).toMatchObject({ type: 'text', text: '一项' })
      expect(wrap[0].items[0]?.nodes.some((n) => n.type === 'text' && n.text.includes('续行'))).toBe(
        true
      )
    }
    const nestedWrap = parseCheapProseBlocks('- 一项\n  - 嵌套\n    续写')
    if (nestedWrap[0]?.type === 'list') {
      expect(nestedWrap[0].items).toHaveLength(1)
      expect(nestedWrap[0].items[0]?.nested?.items[0]?.nodes.some((n) => n.type === 'text' && n.text.includes('续写'))).toBe(
        true
      )
    }
    const loose = parseCheapProseBlocks('- 一项\n\n- 二项')
    expect(loose).toHaveLength(1)
    if (loose[0]?.type === 'list') {
      expect(loose[0].items).toHaveLength(2)
      expect(loose[0].loose).toBe(true)
    }
    const loosePara = parseCheapProseBlocks('- 一项\n\n  续段')
    if (loosePara[0]?.type === 'list') {
      expect(loosePara[0].loose).toBe(true)
      expect(loosePara[0].items[0]?.extra).toHaveLength(1)
    }
    const afterList = parseCheapProseBlocks('- 一项\n\n下一段')
    expect(afterList.map((b) => b.type)).toEqual(['list', 'p'])
    const tableGrown = continueCheapProseBlocks(tableText, table, `${tableText}\n| 3 | 4 |`)
    if (table[0]?.type === 'table' && tableGrown[0]?.type === 'table') {
      expect(tableGrown[0].header[0]).toBe(table[0].header[0])
      expect(tableGrown[0].rows[0]).not.toBeUndefined()
      expect(tableGrown[0].rows[0]?.[0]).toBe(table[0].rows[0]?.[0])
      expect(tableGrown[0].rows).toHaveLength(2)
    }
  })

  it('reuses closed inline nodes when the prose tail grows', () => {
    const firstText = '见 `foo` 与 '
    const first = parseCheapInlineMarkdown(firstText)
    const grown = continueCheapInlineMarkdown(firstText, first, '见 `foo` 与 **bar**')
    expect(grown[0]).toBe(first[0])
    expect(grown[1]).toBe(first[1])
    expect(grown.map((n) => n.type)).toEqual(['text', 'code', 'text', 'strong'])
    const imgFirst = '见图 ![示意](https://a.test/p.png) 与 '
    const imgNodes = parseCheapInlineMarkdown(imgFirst)
    const imgGrown = continueCheapInlineMarkdown(imgFirst, imgNodes, `${imgFirst}**bar**`)
    expect(imgGrown[0]).toBe(imgNodes[0])
    expect(imgGrown[1]).toBe(imgNodes[1])
    expect(imgGrown.map((n) => n.type)).toEqual(['text', 'image', 'text', 'strong'])
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
