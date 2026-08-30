import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHEAP_PROSE_HOLD_LIMIT,
  STREAMING_MARKDOWN_HOLD_LIMIT,
  collectLinkDefinitions,
  cheapInlineNodeKeys,
  cheapProseBlockKeys,
  matchLiveTaskMarker,
  clearCheapProseHolds,
  clearStreamingMarkdownHolds,
  continueCheapInlineMarkdown,
  shouldGrowCheapInlineText,
  shouldGrowLastListItemInline,
  shouldAppendStreamingListItem,
  shouldAppendStreamingNestedListItem,
  paragraphSuffixNewLines,
  quoteSuffixStaysInside,
  shouldGrowStreamingTableLastLine,
  shouldGrowStreamingIndentCodeLastLine,
  shouldGrowStreamingFencedPreLastLine,
  shouldGrowOpenStreamingProseTail,
  shouldGrowOpenStreamingFenceTail,
  continueCheapProseBlocks,
  continueStreamingMarkdown,
  continueStreamingRenderSlots,
  finalizeStreamingMarkdownSplit,
  extractClosedFenceParts,
  extractOpenFenceBody,
  isOnlyLinkDefinitions,
  linkDefinitionBlob,
  markdownBlockWithDefs,
  nextCheapProseClosed,
  nextLinkDefinitions,
  parseCheapInlineMarkdown,
  parseCheapProseBlocks,
  seedCheapProseHold,
  seedStreamingMarkdownHold,
  shouldRememberCheapProseHold,
  shouldRememberStreamingMarkdownHold,
  splitStreamingMarkdown,
  normalizeStreamingText,
  streamingProseText,
  streamingRenderSlots,
  needsFullRemarkMarkdown,
  writeCheapProseHold,
  writeStreamingMarkdownHold
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
    expect(streamingProseText('Hello world', next)).toBe('Hello world')
    expect(needsFullRemarkMarkdown('Hello world')).toBe(false)
    expect(needsFullRemarkMarkdown('See the note.[^1]\n\n[^1]: hi')).toBe(false)
    expect(streamingRenderSlots(first).map((slot) => slot.key)).toEqual(['prose-run-0'])
    expect(streamingRenderSlots(next).map((slot) => slot.key)).toEqual(['prose-run-0'])
    const headingNl = splitStreamingMarkdown('# Heading\n')
    expect(headingNl.blocks).toEqual([])
    expect(headingNl.tail).toBe('# Heading')
    expect(streamingRenderSlots(headingNl).map((slot) => slot.key)).toEqual(['prose-run-0'])
    const tableRows = '| Key | Value |\n| --- | --- |\n| alpha | beta |\n'
    const tableSplit = splitStreamingMarkdown(tableRows)
    expect(tableSplit.blocks).toEqual([])
    expect(tableSplit.tail).toBe('| Key | Value |\n| --- | --- |\n| alpha | beta |')
    expect(streamingRenderSlots(tableSplit).map((slot) => slot.key)).toEqual(['prose-run-0'])
    const tableFirst = parseCheapProseBlocks('| Key | Value |\n| --- | --- |\n| alpha | beta |')
    const tableGrown = continueCheapProseBlocks(
      '| Key | Value |\n| --- | --- |\n| alpha | beta |',
      tableFirst,
      '| Key | Value |\n| --- | --- |\n| alpha | beta |\n| gamma | delta |'
    )
    if (tableFirst[0]?.type === 'table' && tableGrown[0]?.type === 'table') {
      expect(tableGrown[0].header).toBe(tableFirst[0].header)
      expect(tableGrown[0].rows[0]).toBe(tableFirst[0].rows[0])
      expect(tableGrown[0].rows).toHaveLength(2)
    }
  })

  it('commits a paragraph once a blank line arrives', () => {
    const split = splitStreamingMarkdown('Hello world.\n\nNext')
    expect(split.blocks).toHaveLength(1)
    expect(split.blocks[0]?.id).toBe('md-0')
    expect(split.blocks[0]?.text).toBe('Hello world.\n')
    expect(split.tail).toBe('Next')
    expect(streamingRenderSlots(splitStreamingMarkdown('Hello')).map((slot) => slot.key)).toEqual(['prose-run-0'])
    expect(streamingRenderSlots(split).map((slot) => slot.key)).toEqual(['prose-md-0', 'prose-run-0'])
    expect(streamingRenderSlots(split)[0]).toMatchObject({
      kind: 'prose',
      text: 'Hello world.\n',
      closed: true
    })
    expect(streamingRenderSlots(split)[1]).toMatchObject({
      kind: 'prose',
      text: 'Next',
      closed: false
    })
  })

  it('keeps an open fence entirely in the tail', () => {
    const split = splitStreamingMarkdown('Intro\n\n```ts\nconst x = 1')
    expect(split.blocks).toHaveLength(1)
    expect(split.blocks[0]?.text).toBe('Intro\n')
    expect(split.tailKind).toBe('fence')
    expect(split.tailLang).toBe('ts')
    expect(split.tail).toContain('const x = 1')
    expect(streamingProseText('Intro\n\n```ts\nconst x = 1', split)).toBe('Intro\n\n')
    const spaced = splitStreamingMarkdown('   ```js\n1')
    expect(spaced.tailKind).toBe('fence')
    expect(spaced.tailLang).toBe('js')
    const nested = splitStreamingMarkdown('````\n```\ninner\n```')
    expect(nested.tailKind).toBe('fence')
    expect(nested.tail).toContain('```\ninner\n```')
    const closedNested = splitStreamingMarkdown('````\n```\ninner\n```\n````\n\nB')
    expect(closedNested.blocks.some((b) => b.text.includes('inner'))).toBe(true)
    expect(closedNested.tail).toBe('B')
  })

  it('commits a closed fence and does not remake earlier block ids', () => {
    const mid = splitStreamingMarkdown('A\n\n```js\n1')
    expect(mid.blocks.map((b) => b.id)).toEqual(['md-0'])

    const done = splitStreamingMarkdown('A\n\n```js\n1\n```\n\nB')
    expect(done.blocks.map((b) => b.id)).toEqual(['md-0', 'md-1'])
    expect(done.blocks[1]?.text).toContain('```js')
    expect(done.tail).toBe('B')
    expect(done.tailKind).toBe('prose')
    expect(extractClosedFenceParts(done.blocks[1]?.text ?? '')).toEqual({
      lang: 'js',
      body: '1'
    })
    expect(extractClosedFenceParts('Intro\n')).toBeNull()
    expect(streamingRenderSlots(mid).map((slot) => `${slot.kind}:${slot.key}`)).toEqual([
      'prose:prose-md-0',
      'fence:live-fence-0'
    ])
    expect(streamingRenderSlots(done).map((slot) => `${slot.kind}:${slot.key}`)).toEqual([
      'prose:prose-md-0',
      'fence:live-fence-0',
      'prose:prose-run-0'
    ])
    expect(
      streamingRenderSlots(splitStreamingMarkdown('```mermaid\ngraph TD\nA-->B')).map(
        (slot) => `${slot.kind}:${slot.key}:${String(slot.closed)}`
      )
    ).toEqual(['fence:live-fence-0:false'])
    expect(
      streamingRenderSlots(splitStreamingMarkdown('```mermaid\ngraph TD\nA-->B\n```')).map(
        (slot) => `${slot.kind}:${slot.key}:${String(slot.closed)}`
      )
    ).toEqual(['fence:live-fence-0:true'])
    expect(
      streamingRenderSlots(splitStreamingMarkdown('```demo\n<div>')).map(
        (slot) => `${slot.kind}:${slot.key}:${String(slot.closed)}`
      )
    ).toEqual(['fence:live-fence-0:false'])
    expect(
      streamingRenderSlots(splitStreamingMarkdown('```demo\n<div class="scene"></div>\n```')).map(
        (slot) => `${slot.kind}:${slot.key}:${String(slot.closed)}`
      )
    ).toEqual(['fence:live-fence-0:true'])
  })

  it('treats CRLF like LF so an open fence stays in the tail', () => {
    const split = splitStreamingMarkdown('Intro\r\n\r\n```ts\r\nconst x = 1')
    expect(split.blocks).toHaveLength(1)
    expect(split.tailKind).toBe('fence')
    expect(split.tailLang).toBe('ts')
    expect(split.tail).toContain('const x = 1')
    expect(normalizeStreamingText('a\r\nb\rc\n')).toBe('a\nb\nc\n')
    expect(normalizeStreamingText('https://example.com/very/long')).toBe(
      'https://example.com/very/long'
    )
    const lfOnly = '普通段落\n第二行 **粗**'
    expect(normalizeStreamingText(lfOnly)).toBe(lfOnly)
  })

  it('extracts open fence body without the opener', () => {
    expect(extractOpenFenceBody('```ts\nconst a = 1\nconst b = 2')).toBe(
      'const a = 1\nconst b = 2'
    )
    expect(extractOpenFenceBody('```ts')).toBe('')
  })

  it('parses paired inline marks and paints an open mark before it closes', () => {
    expect(parseCheapInlineMarkdown('见 `` a`b `` 后')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'code', text: 'a`b' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('~~ not ~~')).toEqual([{ type: 'text', text: '~~ not ~~' }])
    expect(parseCheapInlineMarkdown('H~2~O')).toEqual([
      { type: 'text', text: 'H' },
      { type: 'del', text: '2', mark: '~' },
      { type: 'text', text: 'O' }
    ])
    expect(parseCheapInlineMarkdown('~one~ and ~~two~~')).toEqual([
      { type: 'del', text: 'one', mark: '~' },
      { type: 'text', text: ' and ' },
      { type: 'del', text: 'two' }
    ])
    expect(parseCheapInlineMarkdown('~ not ~')).toEqual([{ type: 'text', text: '~ not ~' }])
    expect(parseCheapInlineMarkdown('半截 ~删')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'del', text: '删', mark: '~', raw: '~删' }
    ])
    expect(parseCheapInlineMarkdown('半截 ~')).toEqual([{ type: 'text', text: '半截 ~' }])
    expect(parseCheapInlineMarkdown('~ not')).toEqual([{ type: 'text', text: '~ not' }])
    expect(parseCheapInlineMarkdown('[foo\nbar](https://a.test/x)')).toEqual([
      { type: 'link', text: 'foo bar', href: 'https://a.test/x', raw: '[foo\nbar](https://a.test/x)' }
    ])
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
    expect(parseCheapInlineMarkdown('见 **foo *bar**')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'strong', text: 'foo *bar' }
    ])
    expect(parseCheapInlineMarkdown('半截 **foo *bar')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'strong', text: 'foo *bar', raw: '**foo *bar' }
    ])
    expect(parseCheapInlineMarkdown('半截 **粗')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'strong', text: '粗', raw: '**粗' }
    ])
    expect(parseCheapInlineMarkdown('半截 *斜')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'em', text: '斜', raw: '*斜' }
    ])
    expect(parseCheapInlineMarkdown('半截 ~~删')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'del', text: '删', raw: '~~删' }
    ])
    expect(parseCheapInlineMarkdown('半截 `code')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'code', text: 'code', raw: '`code' }
    ])
    expect(parseCheapInlineMarkdown('If \\(n^2\\) then $$E=mc^2$$ and \\[a+b\\].')).toEqual([
      { type: 'text', text: 'If ' },
      { type: 'math', tex: 'n^2', display: false, fence: 'paren' },
      { type: 'text', text: ' then ' },
      { type: 'math', tex: 'E=mc^2', display: true, fence: '$$' },
      { type: 'text', text: ' and ' },
      { type: 'math', tex: 'a+b', display: true, fence: 'square' },
      { type: 'text', text: '.' }
    ])
    expect(parseCheapInlineMarkdown('costs $100 and $x$ stay')).toEqual([
      { type: 'text', text: 'costs $100 and $x$ stay' }
    ])
    expect(parseCheapInlineMarkdown('半截 \\(n')).toEqual([{ type: 'text', text: '半截 (n' }])
    expect(parseCheapInlineMarkdown('keep `n^2` then \\(x\\)')).toEqual([
      { type: 'text', text: 'keep ' },
      { type: 'code', text: 'n^2' },
      { type: 'text', text: ' then ' },
      { type: 'math', tex: 'x', display: false, fence: 'paren' }
    ])
    expect(parseCheapInlineMarkdown('半截 ***粗斜')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'em', text: '粗斜', mark: '***', inner: 'strong', raw: '***粗斜' }
    ])
    expect(parseCheapInlineMarkdown('半截 **_粗斜')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'strong', text: '粗斜', inner: 'em', raw: '**_粗斜' }
    ])
    expect(parseCheapInlineMarkdown('半截 *__粗斜')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'em', text: '粗斜', inner: 'strong', raw: '*__粗斜' }
    ])
    expect(parseCheapInlineMarkdown('半截 ___粗斜')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'em', text: '粗斜', mark: '___', inner: 'strong', raw: '___粗斜' }
    ])
    expect(parseCheapInlineMarkdown('半截 <https://a')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'link', text: 'https://a', href: 'https://a', raw: '<https://a' }
    ])
    expect(parseCheapInlineMarkdown('半截 <dev@a.test')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'link', text: 'dev@a.test', href: 'mailto:dev@a.test', raw: '<dev@a.test' }
    ])
    expect(parseCheapInlineMarkdown('见注[^1')).toEqual([
      { type: 'text', text: '见注' },
      { type: 'fn', id: '1', raw: '[^1' }
    ])
    expect(parseCheapInlineMarkdown('半截 **')).toEqual([{ type: 'text', text: '半截 **' }])
    expect(parseCheapInlineMarkdown('半截 *')).toEqual([{ type: 'text', text: '半截 *' }])
    expect(parseCheapInlineMarkdown('半截 ~~')).toEqual([{ type: 'text', text: '半截 ~~' }])
    expect(parseCheapInlineMarkdown('半截 `')).toEqual([{ type: 'text', text: '半截 `' }])
    expect(parseCheapInlineMarkdown('~~ not')).toEqual([{ type: 'text', text: '~~ not' }])
    expect(parseCheapInlineMarkdown('foo_bar_baz')).toEqual([{ type: 'text', text: 'foo_bar_baz' }])
    expect(parseCheapInlineMarkdown('_foo_bar')).toEqual([{ type: 'text', text: '_foo_bar' }])
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
      { type: 'text', text: '半截 ' },
      { type: 'link', text: '未闭', href: 'https://x', raw: '[未闭](https://x' }
    ])
    expect(parseCheapInlineMarkdown('半截 [未闭](<https://a')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'link', text: '未闭', href: 'https://a', raw: '[未闭](<https://a' }
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
    expect(parseCheapInlineMarkdown('见 [**粗**](https://a.test/x) 后')).toEqual([
      { type: 'text', text: '见 ' },
      {
        type: 'link',
        text: '**粗**',
        href: 'https://a.test/x',
        children: [{ type: 'strong', text: '粗' }]
      },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('见 [`code`](https://a.test/x)')).toEqual([
      { type: 'text', text: '见 ' },
      {
        type: 'link',
        text: '`code`',
        href: 'https://a.test/x',
        children: [{ type: 'code', text: 'code' }]
      }
    ])
    expect(parseCheapInlineMarkdown('[text](https://a.test/x (题))')).toEqual([
      { type: 'link', text: 'text', href: 'https://a.test/x', title: '题' }
    ])
    expect(parseCheapInlineMarkdown('[![示意](https://a.test/p.png)](https://a.test/x)')).toEqual([
      {
        type: 'link',
        text: '![示意](https://a.test/p.png)',
        href: 'https://a.test/x',
        children: [{ type: 'image', alt: '示意', href: 'https://a.test/p.png' }]
      }
    ])
    expect(parseCheapInlineMarkdown('见 [__粗__](https://a.test/x)')).toEqual([
      { type: 'text', text: '见 ' },
      {
        type: 'link',
        text: '__粗__',
        href: 'https://a.test/x',
        children: [{ type: 'strong', text: '粗', mark: '__' }]
      }
    ])
    expect(parseCheapInlineMarkdown('见 [文档](https://a.test/x(1)) 后')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: '文档', href: 'https://a.test/x(1)' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('见 [文档](https://a.test/x(1) "题")')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: '文档', href: 'https://a.test/x(1)', title: '题' }
    ])
    expect(parseCheapInlineMarkdown('见图 ![示意](https://a.test/p.png?x=(1)) 后')).toEqual([
      { type: 'text', text: '见图 ' },
      { type: 'image', alt: '示意', href: 'https://a.test/p.png?x=(1)' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('半截 ![未闭](https://x')).toEqual([
      { type: 'text', text: '半截 ' },
      { type: 'image', alt: '未闭', href: 'https://x', raw: '![未闭](https://x' }
    ])
    expect(parseCheapInlineMarkdown('[x]()')).toEqual([{ type: 'link', text: 'x', href: '' }])
    expect(parseCheapInlineMarkdown('[见](#sec)')).toEqual([{ type: 'link', text: '见', href: '#sec' }])
    expect(parseCheapInlineMarkdown('[rel](./a.ts)')).toEqual([
      { type: 'link', text: 'rel', href: './a.ts' }
    ])
    expect(parseCheapInlineMarkdown('[x](./a "题")')).toEqual([
      { type: 'link', text: 'x', href: './a', title: '题' }
    ])
    expect(parseCheapInlineMarkdown('[x](javascript:alert(1))')).toEqual([
      { type: 'link', text: 'x', href: '' }
    ])
    expect(parseCheapInlineMarkdown('![x](data:text/html,hi)')).toEqual([
      { type: 'image', alt: 'x', href: '' }
    ])
    expect(parseCheapInlineMarkdown('![x](data:image/png;base64,aa)')).toEqual([
      { type: 'image', alt: 'x', href: 'data:image/png;base64,aa' }
    ])
    expect(parseCheapInlineMarkdown('a\\\nb')).toEqual([
      { type: 'text', text: 'a' },
      { type: 'br' },
      { type: 'text', text: 'b' }
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
    expect(parseCheapInlineMarkdown('见图 ![示意][d] 后', defs)).toEqual([
      { type: 'text', text: '见图 ' },
      { type: 'image', alt: '示意', href: 'https://a.test/x', raw: '![示意][d]' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('见图 ![d] 后', defs)).toEqual([
      { type: 'text', text: '见图 ' },
      { type: 'image', alt: 'd', href: 'https://a.test/x', raw: '![d]' },
      { type: 'text', text: ' 后' }
    ])
    const relImg = new Map([['d', './p.png']])
    expect(parseCheapInlineMarkdown('![x][d]', relImg)).toEqual([
      { type: 'image', alt: 'x', href: './p.png', raw: '![x][d]' }
    ])
    expect(parseCheapInlineMarkdown('写给 <dev@a.test> 和 user@a.test 后')).toEqual([
      { type: 'text', text: '写给 ' },
      { type: 'link', text: 'dev@a.test', href: 'mailto:dev@a.test', raw: '<dev@a.test>' },
      { type: 'text', text: ' 和 ' },
      { type: 'link', text: 'user@a.test', href: 'mailto:user@a.test', raw: 'user@a.test' },
      { type: 'text', text: ' 后' }
    ])
    expect(parseCheapInlineMarkdown('见 www.a.test/x).')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: 'www.a.test/x', href: 'http://www.a.test/x', raw: 'www.a.test/x' },
      { type: 'text', text: ').' }
    ])
    expect(parseCheapInlineMarkdown('见 </span> 后')).toEqual([{ type: 'text', text: '见 </span> 后' }])
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
    expect(parseCheapInlineMarkdown('见 \\*不是斜体\\* 与 *是*')).toEqual([
      { type: 'text', text: '见 *不是斜体* 与 ' },
      { type: 'em', text: '是' }
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
    expect(parseCheapInlineMarkdown('见 ~~**粗删**~~ 与 **~~删粗~~**')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'del', text: '粗删', inner: 'strong' },
      { type: 'text', text: ' 与 ' },
      { type: 'strong', text: '删粗', inner: 'del' }
    ])
    expect(parseCheapInlineMarkdown('见图 ![**粗** 与 *斜*](https://a.test/p.png)')).toEqual([
      { type: 'text', text: '见图 ' },
      {
        type: 'image',
        alt: '粗 与 斜',
        href: 'https://a.test/p.png',
        label: '**粗** 与 *斜*'
      }
    ])
    expect(parseCheapInlineMarkdown('见图 ![`x`](https://a.test/p.png)')).toEqual([
      { type: 'text', text: '见图 ' },
      { type: 'image', alt: 'x', href: 'https://a.test/p.png', label: '`x`' }
    ])
    expect(parseCheapInlineMarkdown('见 **foo ~~bar~~ baz**')).toEqual([
      { type: 'text', text: '见 ' },
      {
        type: 'strong',
        text: 'foo bar baz',
        children: [
          { type: 'text', text: 'foo ' },
          { type: 'del', text: 'bar' },
          { type: 'text', text: ' baz' }
        ]
      }
    ])
    expect(parseCheapInlineMarkdown('见 **[文档](https://a.test/x)**')).toEqual([
      { type: 'text', text: '见 ' },
      {
        type: 'strong',
        text: '文档',
        children: [{ type: 'link', text: '文档', href: 'https://a.test/x' }]
      }
    ])
    expect(parseCheapInlineMarkdown('见 **`x`**')).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'strong', text: 'x', children: [{ type: 'code', text: 'x' }] }
    ])
    expect(parseCheapInlineMarkdown('见图 ![**foo ~~bar~~**](https://a.test/p.png)')).toEqual([
      { type: 'text', text: '见图 ' },
      {
        type: 'image',
        alt: 'foo bar',
        href: 'https://a.test/p.png',
        label: '**foo ~~bar~~**'
      }
    ])
    expect(parseCheapInlineMarkdown('见 &amp; &#39; 与 **&lt;粗&gt;**')).toEqual([
      { type: 'text', text: "见 & ' 与 " },
      { type: 'strong', text: '<粗>' }
    ])
    expect(parseCheapInlineMarkdown('半截 &amp')).toEqual([{ type: 'text', text: '半截 &amp' }])
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
    expect(collectLinkDefinitions('见 [文档][D]。\n[D]: https://a.test/x').get('d')).toEqual({
      href: 'https://a.test/x'
    })
    expect(
      collectLinkDefinitions('见 [文档][D]。\n\n[D]: https://a.test/x\n     "题"').get('d')
    ).toEqual({ href: 'https://a.test/x', title: '题' })
    expect(
      parseCheapProseBlocks('见 [文档][D]。\n\n[D]: https://a.test/x\n     "题"').map((b) => b.type)
    ).toEqual(['p'])
    const titledDefs = collectLinkDefinitions('见 [文档][D]。\n\n[D]: https://a.test/x "题"')
    expect(titledDefs.get('d')).toEqual({ href: 'https://a.test/x', title: '题' })
    expect(parseCheapInlineMarkdown('见 [文档][D]。', titledDefs)).toEqual([
      { type: 'text', text: '见 ' },
      { type: 'link', text: '文档', href: 'https://a.test/x', title: '题', raw: '[文档][D]' },
      { type: 'text', text: '。' }
    ])
    expect(
      parseCheapInlineMarkdown('见图 ![示意][d]', collectLinkDefinitions('[d]: https://a.test/p.png "题"'))
    ).toEqual([
      { type: 'text', text: '见图 ' },
      {
        type: 'image',
        alt: '示意',
        href: 'https://a.test/p.png',
        title: '题',
        raw: '![示意][d]'
      }
    ])
    expect(isOnlyLinkDefinitions('[d]: https://a.test/x\n')).toBe(true)
    expect(linkDefinitionBlob('普通段落 **粗** 与 `code`')).toBe('')
    expect(collectLinkDefinitions('普通段落没有引用定义').size).toBe(0)
    const defState = nextLinkDefinitions(null, '[d]: https://a.test/x\n\n见 [d]')
    expect(defState.defs.get('d')).toEqual({ href: 'https://a.test/x' })
    expect(nextLinkDefinitions(defState, '[d]: https://a.test/x\n\n见 [d] 更长')).toBe(defState)
    expect(nextLinkDefinitions(defState, '[d]: https://a.test/x\n\n见 [d] 更长').defs).toBe(defState.defs)
    const emptyDefs = nextLinkDefinitions(null, '普通段落')
    expect(nextLinkDefinitions(emptyDefs, '普通段落增长')).toBe(emptyDefs)
    const longProse = `${'段落 '.repeat(200)}继续写`
    const longDefs = nextLinkDefinitions(null, longProse)
    expect(longDefs.blob).toBe('')
    expect(nextLinkDefinitions(longDefs, `${longProse} 更长`)).toBe(longDefs)
    expect(isOnlyLinkDefinitions('普通段落')).toBe(false)
    expect(parseCheapProseBlocks('<!-- comment -->').map((b) => b.type)).toEqual([])
    expect(parseCheapProseBlocks('foo <!-- x --> bar')).toEqual([
      { type: 'p', nodes: [{ type: 'text', text: 'foo  bar' }] }
    ])
    expect(markdownBlockWithDefs('见 [文档][d]。\n', '[d]: https://a.test/x')).toBe(
      '见 [文档][d]。\n\n[d]: https://a.test/x'
    )
    expect(parseCheapProseBlocks('Overview\n---').map((b) => b.type)).toEqual(['heading'])
    expect(parseCheapProseBlocks('Title\n===')[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(parseCheapProseBlocks('Title\n=').map((b) => b.type)).toEqual(['p'])
    expect(parseCheapProseBlocks('Title\n==').map((b) => b.type)).toEqual(['p'])
    const setextFirst = parseCheapProseBlocks('Title')
    const setextPending = continueCheapProseBlocks('Title', setextFirst, 'Title\n==')
    expect(setextPending.map((b) => b.type)).toEqual(['p'])
    if (setextFirst[0]?.type === 'p' && setextPending[0]?.type === 'p') {
      expect(setextPending[0]).toBe(setextFirst[0])
    }
    const setextDone = continueCheapProseBlocks('Title\n==', setextPending, 'Title\n===')
    expect(setextDone[0]).toMatchObject({ type: 'heading', level: 1 })
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
    const noteGrown = continueCheapProseBlocks('见注[^1]。\n[^1]: 说明', notes, '见注[^1]。\n[^1]: 说明更')
    expect(noteGrown[0]).toBe(notes[0])
    if (notes[1]?.type === 'footnotes' && noteGrown[1]?.type === 'footnotes') {
      expect(noteGrown[1].items[0]?.paragraphs[0]?.some((n) => n.type === 'text' && n.text.includes('说明更'))).toBe(
        true
      )
    }
    const noteContLive = continueCheapProseBlocks(
      '见注[^1]。\n[^1]: 说明',
      notes,
      '见注[^1]。\n[^1]: 说明\n    续行'
    )
    expect(noteContLive[0]).toBe(notes[0])
    if (notes[1]?.type === 'footnotes' && noteContLive[1]?.type === 'footnotes') {
      expect(noteContLive[1].items[0]?.paragraphs).toHaveLength(1)
      expect(
        noteContLive[1].items[0]?.paragraphs[0]?.some((n) => n.type === 'text' && n.text.includes('续行'))
      ).toBe(true)
    }
    const noteParaLive = continueCheapProseBlocks(
      '见注[^1]。\n[^1]: 第一段',
      parseCheapProseBlocks('见注[^1]。\n[^1]: 第一段'),
      '见注[^1]。\n[^1]: 第一段\n\n    第二段'
    )
    if (noteParaLive[1]?.type === 'footnotes') {
      expect(noteParaLive[1].items[0]?.paragraphs).toHaveLength(2)
    }
    const twoNotes = parseCheapProseBlocks('见注[^1][^2]。\n[^1]: 一\n[^2]: 二')
    const twoGrown = continueCheapProseBlocks(
      '见注[^1][^2]。\n[^1]: 一\n[^2]: 二',
      twoNotes,
      '见注[^1][^2]。\n[^1]: 一\n[^2]: 二更'
    )
    expect(twoGrown[0]).toBe(twoNotes[0])
    if (twoNotes[1]?.type === 'footnotes' && twoGrown[1]?.type === 'footnotes') {
      expect(twoGrown[1].items[0]).toBe(twoNotes[1].items[0])
      expect(twoGrown[1].items[1]).not.toBe(twoNotes[1].items[1])
    }
    expect(parseCheapProseBlocks('[^1]: n').map((b) => b.type)).toEqual([])
  })

  it('renders live GFM tables and rules instead of a single paragraph', () => {
    const table = parseCheapProseBlocks('| A | B |\n| --- | --- |\n| 1 | `x.ts:2` |')
    expect(table.map((b) => b.type)).toEqual(['table'])
    if (table[0]?.type === 'table') {
      expect(table[0].header).toHaveLength(2)
      expect(table[0].rows).toHaveLength(1)
      expect(table[0].rows[0]?.[1]?.some((n) => n.type === 'file')).toBe(true)
    }
    expect(parseCheapProseBlocks('| only | row |').map((b) => b.type)).toEqual(['table'])
    if (parseCheapProseBlocks('| only | row |')[0]?.type === 'table') {
      expect(parseCheapProseBlocks('| only | row |')[0].header).toHaveLength(2)
      expect(parseCheapProseBlocks('| only | row |')[0].rows).toEqual([])
    }
    expect(parseCheapProseBlocks('| A | B').map((b) => b.type)).toEqual(['table'])
    if (parseCheapProseBlocks('| A | B')[0]?.type === 'table') {
      expect(parseCheapProseBlocks('| A | B')[0].header).toHaveLength(2)
      expect(parseCheapProseBlocks('| A | B')[0].rows).toEqual([])
    }
    const pendingSep = parseCheapProseBlocks('| A | B |\n|')
    expect(pendingSep.map((b) => b.type)).toEqual(['table'])
    if (pendingSep[0]?.type === 'table') {
      expect(pendingSep[0].header).toHaveLength(2)
      expect(pendingSep[0].rows).toEqual([])
    }
    const pendingSepColon = parseCheapProseBlocks('| A | B |\n|:')
    if (pendingSepColon[0]?.type === 'table') {
      expect(pendingSepColon[0].rows).toEqual([])
    }
    const pendingThenData = continueCheapProseBlocks(
      '| A | B |\n|',
      pendingSep,
      '| A | B |\n| 1 | 2 |'
    )
    if (pendingThenData[0]?.type === 'table') {
      expect(pendingThenData[0].rows).toHaveLength(1)
    }
    const pendingThenSep = continueCheapProseBlocks(
      '| A | B |\n|',
      pendingSep,
      '| A | B |\n| --- | --- |'
    )
    if (pendingThenSep[0]?.type === 'table') {
      expect(pendingThenSep[0].rows).toEqual([])
    }
    expect(parseCheapProseBlocks('---').map((b) => b.type)).toEqual(['hr'])
    const quoted = parseCheapProseBlocks('> 外层\n> > 内层')
    expect(quoted.map((b) => b.type)).toEqual(['quote'])
    if (quoted[0]?.type === 'quote') {
      expect(quoted[0].blocks.map((b) => b.type)).toEqual(['p', 'quote'])
    }
    const lazyQuote = parseCheapProseBlocks('> 注意\n下一行还是引用')
    expect(lazyQuote.map((b) => b.type)).toEqual(['quote'])
    if (lazyQuote[0]?.type === 'quote') {
      expect(lazyQuote[0].blocks.map((b) => b.type)).toEqual(['p'])
      expect(
        lazyQuote[0].blocks[0]?.type === 'p' &&
          lazyQuote[0].blocks[0].nodes.some((n) => n.type === 'text' && n.text.includes('下一行'))
      ).toBe(true)
    }
    const lazyHard = parseCheapProseBlocks('> a  \nb')
    expect(lazyHard.map((b) => b.type)).toEqual(['quote'])
    if (lazyHard[0]?.type === 'quote' && lazyHard[0].blocks[0]?.type === 'p') {
      expect(lazyHard[0].blocks[0].nodes).toEqual([
        { type: 'text', text: 'a' },
        { type: 'br' },
        { type: 'text', text: 'b' }
      ])
    }
    expect(parseCheapProseBlocks('> foo\n- bar').map((b) => b.type)).toEqual(['quote', 'list'])
    expect(parseCheapProseBlocks('> foo\n\nbar').map((b) => b.type)).toEqual(['quote', 'p'])
    expect(parseCheapProseBlocks('   > 缩进引用').map((b) => b.type)).toEqual(['quote'])
    expect(parseCheapProseBlocks('   # 标题')[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(parseCheapProseBlocks('### 标题 ##')[0]).toMatchObject({ type: 'heading', level: 3 })
    if (parseCheapProseBlocks('### 标题 ##')[0]?.type === 'heading') {
      expect(parseCheapProseBlocks('### 标题 ##')[0].nodes).toEqual([{ type: 'text', text: '标题' }])
    }
    expect(parseCheapProseBlocks('# 标题#')[0]).toMatchObject({
      type: 'heading',
      nodes: [{ type: 'text', text: '标题#' }]
    })
    expect(parseCheapProseBlocks('Title\n   ---').map((b) => b.type)).toEqual(['heading'])
    const quoteTable = parseCheapProseBlocks('> | A | B |\n> | --- | --- |\n> | 1 | 2 |')
    expect(quoteTable.map((b) => b.type)).toEqual(['quote'])
    if (quoteTable[0]?.type === 'quote') {
      expect(quoteTable[0].blocks.map((b) => b.type)).toEqual(['table'])
    }
    const quoteFence = parseCheapProseBlocks('> ```js\n> const x = 1\n> ```')
    expect(quoteFence.map((b) => b.type)).toEqual(['quote'])
    if (quoteFence[0]?.type === 'quote' && quoteFence[0].blocks[0]?.type === 'pre') {
      expect(quoteFence[0].blocks[0].lang).toBe('js')
      expect(quoteFence[0].blocks[0].text).toBe('const x = 1')
    }
    const mermaidFence = parseCheapProseBlocks('```mermaid\ngraph TD\nA-->B\n```')
    expect(mermaidFence[0]).toMatchObject({ type: 'pre', lang: 'mermaid', text: 'graph TD\nA-->B' })
    const longFence = parseCheapProseBlocks('````\n```\ninner\n```\n````')
    expect(longFence[0]).toMatchObject({ type: 'pre', text: '```\ninner\n```' })
    const openQuoteFence = parseCheapProseBlocks('> ```ts\n> let y = 2')
    if (openQuoteFence[0]?.type === 'quote' && openQuoteFence[0].blocks[0]?.type === 'pre') {
      expect(openQuoteFence[0].blocks[0].lang).toBe('ts')
      expect(openQuoteFence[0].blocks[0].text).toBe('let y = 2')
    }
    const aligned = parseCheapProseBlocks('| A | B |\n| ---: | :---: |\n| 1 | 2 |')
    if (aligned[0]?.type === 'table') {
      expect(aligned[0].align).toEqual(['right', 'center'])
    }
    const pipeless = parseCheapProseBlocks('Name | Value\n--- | ---\nfoo | bar')
    expect(pipeless.map((b) => b.type)).toEqual(['table'])
    if (pipeless[0]?.type === 'table') {
      expect(pipeless[0].header).toHaveLength(2)
      expect(pipeless[0].rows).toHaveLength(1)
    }
    expect(parseCheapProseBlocks('Name | Value\n-').map((b) => b.type)).toEqual(['p'])
    expect(parseCheapProseBlocks('Name | Value\n---').map((b) => b.type)).toEqual(['p'])
    expect(parseCheapProseBlocks('Name | Value\n--- |').map((b) => b.type)).toEqual(['p'])
    expect(parseCheapProseBlocks('Name | Value\n--- | -').map((b) => b.type)).toEqual(['table'])
    expect(parseCheapProseBlocks('Name | Value\n--- | ---\nfoo').map((b) => b.type)).toEqual(['table'])
    const pipelessDash = parseCheapProseBlocks('Name | Value')
    const pipelessMid = continueCheapProseBlocks('Name | Value', pipelessDash, 'Name | Value\n---')
    expect(pipelessMid.map((b) => b.type)).toEqual(['p'])
    if (pipelessDash[0]?.type === 'p' && pipelessMid[0]?.type === 'p') {
      expect(pipelessMid[0]).toBe(pipelessDash[0])
    }
    const pipelessTable = continueCheapProseBlocks(
      'Name | Value\n---',
      pipelessMid,
      'Name | Value\n--- | ---\nfoo | bar'
    )
    expect(pipelessTable.map((b) => b.type)).toEqual(['table'])
    expect(parseCheapProseBlocks('Title\n---').map((b) => b.type)).toEqual(['heading'])
    expect(parseCheapProseBlocks('see a | b in logs').map((b) => b.type)).toEqual(['p'])
    expect(parseCheapProseBlocks('Overview\n--- | ---\na | b').map((b) => b.type)).toEqual(['p'])
    expect(parseCheapProseBlocks('* * *').map((b) => b.type)).toEqual(['hr'])
    expect(parseCheapProseBlocks('- - -').map((b) => b.type)).toEqual(['hr'])
    expect(parseCheapProseBlocks('***').map((b) => b.type)).toEqual(['hr'])
    const quoteParas = parseCheapProseBlocks('> 一段\n>\n> 二段')
    expect(quoteParas.map((b) => b.type)).toEqual(['quote'])
    if (quoteParas[0]?.type === 'quote') {
      expect(quoteParas[0].blocks.map((b) => b.type)).toEqual(['p', 'p'])
    }
    const quotedPipeless = parseCheapProseBlocks(
      '> Name | Value\n> --- | ---\n> foo | bar'
    )
    expect(quotedPipeless.map((b) => b.type)).toEqual(['quote'])
    if (quotedPipeless[0]?.type === 'quote') {
      expect(quotedPipeless[0].blocks.map((b) => b.type)).toEqual(['table'])
    }
    const escapedPipe = parseCheapProseBlocks('| A | B |\n| --- | --- |\n| a \\| b | c |')
    expect(escapedPipe.map((b) => b.type)).toEqual(['table'])
    if (escapedPipe[0]?.type === 'table') {
      expect(escapedPipe[0].rows[0]?.[0]).toEqual([{ type: 'text', text: 'a | b' }])
      expect(escapedPipe[0].rows[0]?.[1]).toEqual([{ type: 'text', text: 'c' }])
    }
    const escapedHeader = parseCheapProseBlocks('| a \\| b | c |\n| --- | --- |\n| 1 | 2 |')
    if (escapedHeader[0]?.type === 'table') {
      expect(escapedHeader[0].header[0]).toEqual([{ type: 'text', text: 'a | b' }])
      expect(escapedHeader[0].header[1]).toEqual([{ type: 'text', text: 'c' }])
    }
    const oneCol = parseCheapProseBlocks('| A |\n| --- |\n| [x](#s) |')
    expect(oneCol.map((b) => b.type)).toEqual(['table'])
    if (oneCol[0]?.type === 'table') {
      expect(oneCol[0].header).toHaveLength(1)
      expect(oneCol[0].rows[0]?.[0]?.some((n) => n.type === 'link' && n.href === '#s')).toBe(true)
    }
    expect(parseCheapProseBlocks('---').map((b) => b.type)).toEqual(['hr'])
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
    const paren = parseCheapProseBlocks('1) first\n2) second')
    expect(paren.map((b) => b.type)).toEqual(['list'])
    if (paren[0]?.type === 'list') {
      expect(paren[0].ordered).toBe(true)
      expect(paren[0].start).toBeUndefined()
      expect(paren[0].items).toHaveLength(2)
    }
    const offset = parseCheapProseBlocks('3. starts at three\n4. four')
    expect(offset.map((b) => b.type)).toEqual(['list'])
    if (offset[0]?.type === 'list') {
      expect(offset[0].ordered).toBe(true)
      expect(offset[0].start).toBe(3)
    }
    const pendingTable = parseCheapProseBlocks('| A | B |')
    expect(pendingTable.map((b) => b.type)).toEqual(['table'])
    if (pendingTable[0]?.type === 'table') {
      expect(pendingTable[0].header).toHaveLength(2)
      expect(pendingTable[0].rows).toEqual([])
    }
    const pendingInList = parseCheapProseBlocks('- | a | b |')
    expect(pendingInList.map((b) => b.type)).toEqual(['list'])
    if (pendingInList[0]?.type === 'list') {
      expect(pendingInList[0].items[0]?.nodes).toEqual([])
      expect(pendingInList[0].items[0]?.blocks?.[0]?.type).toBe('table')
    }
    const tableInList = parseCheapProseBlocks('- | a | b |\n  | ---: | :---: |\n  | 1 | 2 |')
    expect(tableInList.map((b) => b.type)).toEqual(['list'])
    if (tableInList[0]?.type === 'list') {
      expect(tableInList[0].items[0]?.nodes).toEqual([])
      expect(tableInList[0].items[0]?.blocks?.[0]?.type).toBe('table')
      if (tableInList[0].items[0]?.blocks?.[0]?.type === 'table') {
        expect(tableInList[0].items[0].blocks[0].align).toEqual(['right', 'center'])
      }
    }
    const indentCodeInList = parseCheapProseBlocks('- item\n\n      code')
    expect(indentCodeInList.map((b) => b.type)).toEqual(['list'])
    if (indentCodeInList[0]?.type === 'list') {
      expect(indentCodeInList[0].loose).toBe(true)
      expect(indentCodeInList[0].items[0]?.blocks?.[0]).toMatchObject({
        type: 'pre',
        text: 'code'
      })
    }
    const nestedIndent = parseCheapProseBlocks('- a\n  - b\n\n        code')
    expect(nestedIndent.map((b) => b.type)).toEqual(['list'])
    if (nestedIndent[0]?.type === 'list') {
      expect(nestedIndent[0].loose).toBeUndefined()
      expect(nestedIndent[0].items[0]?.nested?.loose).toBe(true)
      expect(nestedIndent[0].items[0]?.nested?.items[0]?.blocks?.[0]).toMatchObject({
        type: 'pre',
        text: 'code'
      })
    }
    const hardInList = parseCheapProseBlocks('- a  \n  b')
    expect(hardInList.map((b) => b.type)).toEqual(['list'])
    if (hardInList[0]?.type === 'list') {
      expect(hardInList[0].items[0]?.nodes).toEqual([
        { type: 'text', text: 'a' },
        { type: 'br' },
        { type: 'text', text: 'b' }
      ])
    }
    const taskOl = parseCheapProseBlocks('1. [ ] do')
    expect(taskOl.map((b) => b.type)).toEqual(['list'])
    if (taskOl[0]?.type === 'list') {
      expect(taskOl[0].ordered).toBe(true)
      expect(taskOl[0].items[0]?.nodes).toEqual([{ type: 'text', text: '[ ] do' }])
    }
    const pendingMarker = parseCheapProseBlocks('- 一项\n-')
    expect(pendingMarker.map((b) => b.type)).toEqual(['list'])
    if (pendingMarker[0]?.type === 'list') {
      expect(pendingMarker[0].items).toHaveLength(1)
      expect(pendingMarker[0].items[0]?.nodes).toEqual([{ type: 'text', text: '一项' }])
    }
    const pendingMarkerDone = continueCheapProseBlocks('- 一项\n-', pendingMarker, '- 一项\n- 二项')
    if (pendingMarker[0]?.type === 'list' && pendingMarkerDone[0]?.type === 'list') {
      expect(pendingMarkerDone[0].items).toHaveLength(2)
      expect(pendingMarkerDone[0].items[0]).toBe(pendingMarker[0].items[0])
    }
    expect(matchLiveTaskMarker('[x')).toEqual({ checked: true, rest: '' })
    expect(matchLiveTaskMarker('[ ]')).toEqual({ checked: false, rest: '' })
    expect(matchLiveTaskMarker('[ ] do')).toEqual({ checked: false, rest: 'do' })
    expect(matchLiveTaskMarker('[x](url)')).toBeNull()
    expect(matchLiveTaskMarker('[docs')).toBeNull()
    const fenceInList = parseCheapProseBlocks('1. item\n   ```js\n   x\n   ```')
    expect(fenceInList.map((b) => b.type)).toEqual(['list'])
    if (fenceInList[0]?.type === 'list') {
      expect(fenceInList[0].items[0]?.nodes).toEqual([{ type: 'text', text: 'item' }])
      expect(fenceInList[0].items[0]?.blocks?.[0]).toMatchObject({
        type: 'pre',
        text: 'x',
        lang: 'js'
      })
    }
    const quoteInList = parseCheapProseBlocks('- note\n  > quoted')
    expect(quoteInList.map((b) => b.type)).toEqual(['list'])
    if (quoteInList[0]?.type === 'list') {
      expect(quoteInList[0].items[0]?.blocks?.[0]?.type).toBe('quote')
    }
    const headingInList = parseCheapProseBlocks('- note\n  # title')
    expect(headingInList.map((b) => b.type)).toEqual(['list'])
    if (headingInList[0]?.type === 'list') {
      expect(headingInList[0].items[0]?.blocks?.[0]).toMatchObject({ type: 'heading', level: 1 })
    }
    const fenceFirst = parseCheapProseBlocks('1) ```js\n   x\n   ```')
    expect(fenceFirst.map((b) => b.type)).toEqual(['list'])
    if (fenceFirst[0]?.type === 'list') {
      expect(fenceFirst[0].items[0]?.nodes).toEqual([])
      expect(fenceFirst[0].items[0]?.blocks?.[0]).toMatchObject({ type: 'pre', text: 'x', lang: 'js' })
    }
    const nestedFence = parseCheapProseBlocks('- a\n  - b\n    ```\n    x\n    ```')
    expect(nestedFence.map((b) => b.type)).toEqual(['list'])
    if (nestedFence[0]?.type === 'list') {
      expect(nestedFence[0].items[0]?.nested?.items[0]?.blocks?.[0]).toMatchObject({
        type: 'pre',
        text: 'x'
      })
    }
    const afterFence = parseCheapProseBlocks('- a\n  ```\n  x\n  ```\n  after')
    expect(afterFence.map((b) => b.type)).toEqual(['list'])
    if (afterFence[0]?.type === 'list') {
      expect(afterFence[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const afterTable = parseCheapProseBlocks('- note\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |\n  after')
    expect(afterTable.map((b) => b.type)).toEqual(['list'])
    if (afterTable[0]?.type === 'list') {
      expect(afterTable[0].items[0]?.blocks?.[0]?.type).toBe('table')
      expect(afterTable[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const headingThenTable = parseCheapProseBlocks(
      '- note\n  # title\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |'
    )
    expect(headingThenTable.map((b) => b.type)).toEqual(['list'])
    if (headingThenTable[0]?.type === 'list') {
      expect(headingThenTable[0].items[0]?.blocks?.map((block) => block.type)).toEqual([
        'heading',
        'table'
      ])
      expect(headingThenTable[0].items[0]?.suffix).toBeUndefined()
    }
    const looseFence = parseCheapProseBlocks('- a\n\n  ```\n  x\n  ```')
    expect(looseFence.map((b) => b.type)).toEqual(['list'])
    if (looseFence[0]?.type === 'list') {
      expect(looseFence[0].loose).toBe(true)
    }
    const lazyTableQuote = parseCheapProseBlocks('> Name | Value\n--- | ---\nfoo | bar')
    expect(lazyTableQuote.map((b) => b.type)).toEqual(['quote'])
    if (lazyTableQuote[0]?.type === 'quote') {
      expect(lazyTableQuote[0].blocks[0]?.type).toBe('p')
    }
    const quoteFenceLazy = parseCheapProseBlocks('> ```\n> x\ncode?')
    expect(quoteFenceLazy.map((b) => b.type)).toEqual(['quote', 'p'])
    const setextInList = parseCheapProseBlocks('- Title\n  ===')
    expect(setextInList.map((b) => b.type)).toEqual(['list'])
    if (setextInList[0]?.type === 'list') {
      expect(setextInList[0].items[0]?.blocks?.[0]).toMatchObject({ type: 'heading', level: 1 })
    }
    const setextInListPending = parseCheapProseBlocks('- Title\n  =')
    if (setextInListPending[0]?.type === 'list') {
      expect(setextInListPending[0].items[0]?.blocks).toBeUndefined()
      expect(setextInListPending[0].items[0]?.nodes).toEqual([{ type: 'text', text: 'Title' }])
    }
    const setextHr = parseCheapProseBlocks('- Overview\n  ---')
    expect(setextHr.map((b) => b.type)).toEqual(['list'])
    if (setextHr[0]?.type === 'list') {
      expect(setextHr[0].items[0]?.blocks?.[0]).toMatchObject({ type: 'heading', level: 2 })
    }
    const messyFenceFirst = parseCheapProseBlocks('1. ```\ncode\n```')
    expect(messyFenceFirst.map((b) => b.type)).toEqual(['list', 'p', 'pre'])
    const itemHr = parseCheapProseBlocks('- item\n  ***')
    expect(itemHr.map((b) => b.type)).toEqual(['list'])
    if (itemHr[0]?.type === 'list') {
      expect(itemHr[0].items[0]?.blocks?.[0]?.type).toBe('hr')
    }
    const hashDef = parseCheapProseBlocks('见 [节][s]。\n[s]: #sec')
    expect(hashDef.map((b) => b.type)).toEqual(['p'])
    if (hashDef[0]?.type === 'p') {
      expect(hashDef[0].nodes.some((n) => n.type === 'link' && n.href === '#sec')).toBe(true)
    }
    const imageHash = parseCheapProseBlocks('![x][d]\n\n[d]: ./p.png')
    expect(imageHash.map((b) => b.type)).toEqual(['p'])
    if (imageHash[0]?.type === 'p') {
      expect(imageHash[0].nodes).toEqual([
        { type: 'image', alt: 'x', href: './p.png', raw: '![x][d]' }
      ])
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
      expect(wrap[0].items[0]?.nodes).toEqual([{ type: 'text', text: '一项\n续行仍在项内' }])
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
    const introListText = '前言\n- 一项'
    const introList = parseCheapProseBlocks(introListText)
    expect(introList.map((b) => b.type)).toEqual(['p', 'list'])
    const introListGrown = continueCheapProseBlocks(introListText, introList, '前言\n- 一项更长')
    expect(introListGrown[0]).toBe(introList[0])
    const introListGrownAgain = continueCheapProseBlocks(
      '前言\n- 一项更长',
      introListGrown,
      '前言\n- 一项更长了'
    )
    expect(introListGrownAgain[0]).toBe(introList[0])
    expect(introListGrownAgain[1]?.type).toBe('list')
    const wrapIntroText = '前言\n- 一项\n  续行'
    const wrapIntro = parseCheapProseBlocks(wrapIntroText)
    expect(wrapIntro.map((b) => b.type)).toEqual(['p', 'list'])
    const wrapIntroGrown = continueCheapProseBlocks(wrapIntroText, wrapIntro, `${wrapIntroText}更长`)
    expect(wrapIntroGrown[0]).toBe(wrapIntro[0])
    const tableGrown = continueCheapProseBlocks(tableText, table, `${tableText}\n| 3 | 4 |`)
    if (table[0]?.type === 'table' && tableGrown[0]?.type === 'table') {
      expect(tableGrown[0].header[0]).toBe(table[0].header[0])
      expect(tableGrown[0].rows[0]).not.toBeUndefined()
      expect(tableGrown[0].rows[0]?.[0]).toBe(table[0].rows[0]?.[0])
      expect(tableGrown[0].rows).toHaveLength(2)
    }
    const pipeless = 'Name | Value\n\n# 标题\n\n- 一项'
    const pipelessFirst = parseCheapProseBlocks(pipeless)
    expect(pipelessFirst.map((b) => b.type)).toEqual(['p', 'heading', 'list'])
    const pipelessGrown = continueCheapProseBlocks(
      pipeless,
      pipelessFirst,
      'Name | Value\n---|---\n\n# 标题\n\n- 一项'
    )
    expect(pipelessGrown.map((b) => b.type)).toEqual(['table', 'heading', 'list'])
    expect(pipelessGrown[1]).toBe(pipelessFirst[1])
    expect(pipelessGrown[2]).toBe(pipelessFirst[2])
    const pipelessFirstKeys = cheapProseBlockKeys(pipelessFirst)
    const pipelessGrownKeys = cheapProseBlockKeys(pipelessGrown)
    expect(pipelessGrownKeys[1]).toBe(pipelessFirstKeys[1])
    expect(pipelessGrownKeys[2]).toBe(pipelessFirstKeys[2])
    expect(pipelessGrownKeys[0]).not.toBe(pipelessFirstKeys[0])
    const multi = parseCheapProseBlocks('# 标题\n\n第一段\n\n第二')
    expect(multi.map((b) => b.type)).toEqual(['heading', 'p', 'p'])
    const multiGrown = continueCheapProseBlocks('# 标题\n\n第一段\n\n第二', multi, '# 标题\n\n第一段\n\n第二段更长')
    expect(multiGrown[0]).toBe(multi[0])
    expect(multiGrown[1]).toBe(multi[1])
    const closedFirst = nextCheapProseClosed(null, multi)
    const closedGrown = nextCheapProseClosed(closedFirst, multiGrown)
    expect(closedGrown).toBe(closedFirst)
    expect(closedGrown[0]).toBe(multi[0])
    expect(closedGrown[1]).toBe(multi[1])
    expect(nextCheapProseClosed(null, grown).length).toBe(0)
    const manyItems = Array.from({ length: 12 }, (_, i) => `- item-${i}`).join('\n')
    const manyFirst = parseCheapProseBlocks(manyItems)
    const manyGrown = continueCheapProseBlocks(manyItems, manyFirst, `${manyItems} longer`)
    const manyFull = parseCheapProseBlocks(`${manyItems} longer`)
    if (manyFirst[0]?.type === 'list' && manyGrown[0]?.type === 'list' && manyFull[0]?.type === 'list') {
      expect(manyGrown[0].items.slice(0, 11).every((item, i) => item === manyFirst[0].items[i])).toBe(true)
      expect(manyGrown[0].items[11]).not.toBe(manyFirst[0].items[11])
      expect(manyGrown[0].items[11]?.nodes).toEqual(manyFull[0].items[11]?.nodes)
    }
    const manyNew = continueCheapProseBlocks(manyItems, manyFirst, `${manyItems}\n- item-12`)
    if (manyFirst[0]?.type === 'list' && manyNew[0]?.type === 'list') {
      expect(manyNew[0].items.slice(0, 12).every((item, i) => item === manyFirst[0].items[i])).toBe(true)
      expect(manyNew[0].items).toHaveLength(13)
    }
    const manyNl = continueCheapProseBlocks(manyItems, manyFirst, `${manyItems}\n`)
    const manyAfterNl = continueCheapProseBlocks(`${manyItems}\n`, manyNl, `${manyItems}\n- item-12`)
    if (manyFirst[0]?.type === 'list' && manyAfterNl[0]?.type === 'list') {
      expect(manyAfterNl[0].items.slice(0, 12).every((item, i) => item === manyFirst[0].items[i])).toBe(true)
      expect(manyAfterNl[0].items).toHaveLength(13)
    }
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项', suffix: '更长' })).toBe(true)
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项', suffix: '\n' })).toBe(false)
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项', suffix: '\n续行' })).toBe(true)
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项\n', suffix: '续行' })).toBe(true)
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项', suffix: '\n- 二项' })).toBe(false)
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项\n', suffix: '- 二项' })).toBe(false)
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项', suffix: '\n\n下一段' })).toBe(false)
    expect(shouldGrowLastListItemInline({ prevNorm: '- 一项', suffix: '\n  - 嵌套' })).toBe(false)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项', suffix: '\n- 二项', ordered: false })).toBe(true)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项\n', suffix: '- 二项', ordered: false })).toBe(true)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项', suffix: '\n', ordered: false })).toBe(false)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项', suffix: '\n-', ordered: false })).toBe(false)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项', suffix: '\n  - 嵌套', ordered: false })).toBe(false)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项', suffix: '\n1. 有序', ordered: false })).toBe(false)
    expect(shouldAppendStreamingListItem({ prevNorm: '1. 一项', suffix: '\n2. 二项', ordered: true })).toBe(true)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项', suffix: '\n\n- 松散', ordered: false })).toBe(false)
    expect(shouldAppendStreamingListItem({ prevNorm: '- 一项', suffix: '\n- ```ts', ordered: false })).toBe(false)
    expect(shouldAppendStreamingNestedListItem({ prevNorm: '- 一项', suffix: '\n  - 嵌套' })).toBe(true)
    expect(shouldAppendStreamingNestedListItem({ prevNorm: '- 一项\n  - 嵌套', suffix: '\n  - 第二' })).toBe(true)
    expect(shouldAppendStreamingNestedListItem({ prevNorm: '- 一项\n  - 嵌套', suffix: '\n    - 更深' })).toBe(true)
    expect(shouldAppendStreamingNestedListItem({ prevNorm: '- 一项', suffix: '\n- 二项' })).toBe(false)
    expect(shouldAppendStreamingNestedListItem({ prevNorm: '- 一项', suffix: '\n  -' })).toBe(false)
    const nestSrc = '- 一项\n  - 嵌套'
    const nestFirst = parseCheapProseBlocks(nestSrc)
    const nestSibling = continueCheapProseBlocks(nestSrc, nestFirst, `${nestSrc}\n  - 第二`)
    if (nestFirst[0]?.type === 'list' && nestSibling[0]?.type === 'list') {
      expect(nestSibling[0].items[0]?.nodes).toBe(nestFirst[0].items[0]?.nodes)
      expect(nestSibling[0].items[0]?.nested?.items[0]).toBe(nestFirst[0].items[0]?.nested?.items[0])
      expect(nestSibling[0].items[0]?.nested?.items).toHaveLength(2)
      expect(nestSibling[0].items[0]?.nested?.items[1]?.nodes).toEqual([{ type: 'text', text: '第二' }])
    }
    const nestOpenFirst = parseCheapProseBlocks('- 一项')
    const nestOpen = continueCheapProseBlocks('- 一项', nestOpenFirst, '- 一项\n  - 嵌套')
    if (nestOpenFirst[0]?.type === 'list' && nestOpen[0]?.type === 'list') {
      expect(nestOpen[0].items[0]?.nodes).toBe(nestOpenFirst[0].items[0]?.nodes)
      expect(nestOpen[0].items[0]?.nested?.items).toHaveLength(1)
      expect(nestOpen[0].items[0]?.nested?.items[0]?.nodes).toEqual([{ type: 'text', text: '嵌套' }])
    }
    const nestDeep = continueCheapProseBlocks(nestSrc, nestFirst, `${nestSrc}\n    - 更深`)
    if (nestFirst[0]?.type === 'list' && nestDeep[0]?.type === 'list') {
      expect(nestDeep[0].items[0]?.nodes).toBe(nestFirst[0].items[0]?.nodes)
      expect(nestDeep[0].items[0]?.nested?.items[0]?.nodes).toBe(nestFirst[0].items[0]?.nested?.items[0]?.nodes)
      expect(nestDeep[0].items[0]?.nested?.items[0]?.nested?.items).toHaveLength(1)
    }
    const wrapPrefix = parseCheapProseBlocks('见 `foo` 然后')
    const wrapPrefixGrown = continueCheapProseBlocks('见 `foo` 然后', wrapPrefix, '见 `foo` 然后\n继续')
    if (wrapPrefix[0]?.type === 'p' && wrapPrefixGrown[0]?.type === 'p') {
      expect(wrapPrefixGrown[0].nodes[0]).toBe(wrapPrefix[0].nodes[0])
      expect(wrapPrefixGrown[0].nodes[1]).toBe(wrapPrefix[0].nodes[1])
    }
    const orderedSrc = '1. 一项\n2. 二项'
    const orderedFirst = parseCheapProseBlocks(orderedSrc)
    const orderedNew = continueCheapProseBlocks(orderedSrc, orderedFirst, `${orderedSrc}\n3. 三项`)
    if (orderedFirst[0]?.type === 'list' && orderedNew[0]?.type === 'list') {
      expect(orderedNew[0].items[0]).toBe(orderedFirst[0].items[0])
      expect(orderedNew[0].items[1]).toBe(orderedFirst[0].items[1])
      expect(orderedNew[0].items).toHaveLength(3)
      expect(orderedNew[0].items[2]?.nodes).toEqual([{ type: 'text', text: '三项' }])
    }
    expect(paragraphSuffixNewLines('第一行\n第二行', '继续')).toBeNull()
    expect(paragraphSuffixNewLines('第一行\n第二行', '\n第三行')).toEqual(['第三行'])
    expect(paragraphSuffixNewLines('第一行\n第二行\n', '第三行')).toEqual(['第三行'])
    expect(paragraphSuffixNewLines('第一行', '续写\n- 新项')).toEqual(['- 新项'])
    const longPara = Array.from({ length: 20 }, (_, i) => `第${i}行软换行正文`).join('\n')
    const longFirst = parseCheapProseBlocks(longPara)
    const longWrap = continueCheapProseBlocks(longPara, longFirst, `${longPara}\n又一行`)
    expect(longWrap).toHaveLength(1)
    expect(longWrap[0]?.type).toBe('p')
    const longThenList = continueCheapProseBlocks(longPara, longFirst, `${longPara}\n- 新项`)
    expect(longThenList[0]).toBe(longFirst[0])
    expect(longThenList[1]?.type).toBe('list')
    const longListGrown = continueCheapProseBlocks(
      `${longPara}\n- 新项`,
      longThenList,
      `${longPara}\n- 新项更长`
    )
    expect(longListGrown[0]).toBe(longFirst[0])
    expect(longListGrown[1]?.type).toBe('list')
    if (longThenList[1]?.type === 'list' && longListGrown[1]?.type === 'list') {
      expect(longListGrown[1].items[0]?.nodes).toEqual([{ type: 'text', text: '新项更长' }])
    }
    const wrapSrc = '- 一项\n- 二项'
    const wrapFirst = parseCheapProseBlocks(wrapSrc)
    const wrapNl = continueCheapProseBlocks(wrapSrc, wrapFirst, `${wrapSrc}\n`)
    const wrapCont = continueCheapProseBlocks(`${wrapSrc}\n`, wrapNl, `${wrapSrc}\n续行仍在项内`)
    if (wrapFirst[0]?.type === 'list' && wrapCont[0]?.type === 'list') {
      expect(wrapCont[0].items[0]).toBe(wrapFirst[0].items[0])
      expect(wrapCont[0].items[1]?.nodes).toEqual([{ type: 'text', text: '二项\n续行仍在项内' }])
    }
    const pendingSetext = parseCheapProseBlocks('- Title\n  ==')
    const setextLive = continueCheapProseBlocks('- Title\n  ==', pendingSetext, '- Title\n  ===')
    if (setextLive[0]?.type === 'list') {
      expect(setextLive[0].items[0]?.blocks?.[0]).toMatchObject({ type: 'heading', level: 1 })
    }
    const manyRows =
      '| A | B |\n| --- | --- |\n' + Array.from({ length: 8 }, (_, i) => `| ${i} | x |`).join('\n')
    const manyTable = parseCheapProseBlocks(manyRows)
    const manyTableGrown = continueCheapProseBlocks(manyRows, manyTable, `${manyRows}y`)
    const manyTableNew = continueCheapProseBlocks(manyRows, manyTable, `${manyRows}\n| 8 | y |`)
    if (manyTable[0]?.type === 'table' && manyTableGrown[0]?.type === 'table') {
      expect(manyTableGrown[0].header[0]).toBe(manyTable[0].header[0])
      expect(manyTableGrown[0].rows.slice(0, 7).every((row, i) => row[0] === manyTable[0].rows[i]?.[0])).toBe(
        true
      )
      expect(manyTableGrown[0].rows[7]?.[1]).not.toBe(manyTable[0].rows[7]?.[1])
    }
    if (manyTable[0]?.type === 'table' && manyTableNew[0]?.type === 'table') {
      expect(manyTableNew[0].header).toBe(manyTable[0].header)
      expect(manyTableNew[0].rows.slice(0, 8).every((row, i) => row === manyTable[0].rows[i])).toBe(true)
      expect(manyTableNew[0].rows.slice(0, 8).every((row, i) => row[0] === manyTable[0].rows[i]?.[0])).toBe(true)
      expect(manyTableNew[0].rows).toHaveLength(9)
    }
    expect(shouldGrowStreamingTableLastLine({ prevNorm: manyRows, suffix: 'y' })).toBe(false)
    expect(shouldGrowStreamingTableLastLine({ prevNorm: manyRows, suffix: '\n' })).toBe(false)
    expect(shouldGrowStreamingTableLastLine({ prevNorm: manyRows, suffix: '\n| 8 | y |' })).toBe(true)
    expect(shouldGrowStreamingTableLastLine({ prevNorm: `${manyRows}\n`, suffix: '| 8 | y |' })).toBe(true)
    expect(shouldGrowStreamingTableLastLine({ prevNorm: `${manyRows}\n| 8`, suffix: ' | y |' })).toBe(true)
    expect(shouldGrowStreamingTableLastLine({ prevNorm: manyRows, suffix: '\n\n下一段' })).toBe(false)
    const tableNl = continueCheapProseBlocks(manyRows, manyTable, `${manyRows}\n`)
    const tableMid = continueCheapProseBlocks(`${manyRows}\n`, tableNl, `${manyRows}\n| 8`)
    const tableDone = continueCheapProseBlocks(`${manyRows}\n| 8`, tableMid, `${manyRows}\n| 8 | y |`)
    if (manyTable[0]?.type === 'table' && tableMid[0]?.type === 'table' && tableDone[0]?.type === 'table') {
      expect(tableNl[0]).toBe(manyTable[0])
      expect(tableMid[0].header).toBe(manyTable[0].header)
      expect(tableMid[0].rows.slice(0, 8).every((row, i) => row === manyTable[0].rows[i])).toBe(true)
      expect(tableDone[0].header).toBe(manyTable[0].header)
      expect(tableDone[0].rows.slice(0, 8).every((row, i) => row === manyTable[0].rows[i])).toBe(true)
      expect(tableDone[0].rows[8]?.[0]).toBe(tableMid[0].rows[8]?.[0])
      expect(tableDone[0].rows).toHaveLength(9)
    }
    const tableHead = '| A | B |\n| --- | --- |'
    const tableHeadFirst = parseCheapProseBlocks(tableHead)
    const tableHeadRow = continueCheapProseBlocks(tableHead, tableHeadFirst, `${tableHead}\n| 1 | 2 |`)
    if (tableHeadFirst[0]?.type === 'table' && tableHeadRow[0]?.type === 'table') {
      expect(tableHeadRow[0].header).toBe(tableHeadFirst[0].header)
      expect(tableHeadRow[0].rows).toHaveLength(1)
    }
    const marked = parseCheapProseBlocks('见 `foo` 与 ')
    const markedGrown = continueCheapProseBlocks('见 `foo` 与 ', marked, '见 `foo` 与 bar')
    if (marked[0]?.type === 'p' && markedGrown[0]?.type === 'p') {
      expect(markedGrown[0].nodes[0]).toBe(marked[0].nodes[0])
      expect(markedGrown[0].nodes[1]).toBe(marked[0].nodes[1])
      expect(markedGrown[0].nodes.map((n) => n.type)).toEqual(['text', 'code', 'text'])
    }
    const quote = parseCheapProseBlocks('> 注意')
    const quoteGrown = continueCheapProseBlocks('> 注意', quote, '> 注意点')
    if (quote[0]?.type === 'quote' && quoteGrown[0]?.type === 'quote') {
      const inner = quote[0].blocks[0]
      const grownInner = quoteGrown[0].blocks[0]
      if (inner?.type === 'p' && grownInner?.type === 'p') {
        expect(grownInner.nodes).toEqual([{ type: 'text', text: '注意点' }])
      }
    }
    const headingOnly = parseCheapProseBlocks('## 标题')
    const headingGrown = continueCheapProseBlocks('## 标题', headingOnly, '## 标题更长')
    if (headingOnly[0]?.type === 'heading' && headingGrown[0]?.type === 'heading') {
      expect(headingGrown[0].level).toBe(2)
      expect(headingGrown[0].nodes).toEqual([{ type: 'text', text: '标题更长' }])
    }
    const headingPara = parseCheapProseBlocks('# 标题\n见 `foo` 与 ')
    const headingParaGrown = continueCheapProseBlocks('# 标题\n见 `foo` 与 ', headingPara, '# 标题\n见 `foo` 与 bar')
    expect(headingParaGrown[0]).toBe(headingPara[0])
    if (headingPara[1]?.type === 'p' && headingParaGrown[1]?.type === 'p') {
      expect(headingParaGrown[1].nodes[0]).toBe(headingPara[1].nodes[0])
      expect(headingParaGrown[1].nodes[1]).toBe(headingPara[1].nodes[1])
    }
    const headingParaNl = continueCheapProseBlocks(
      '# 标题\n见 `foo` 与 ',
      headingPara,
      '# 标题\n见 `foo` 与 \nbar'
    )
    expect(headingParaNl[0]).toBe(headingPara[0])
    if (headingPara[1]?.type === 'p' && headingParaNl[1]?.type === 'p') {
      expect(headingParaNl[1].nodes[0]).toBe(headingPara[1].nodes[0])
      expect(headingParaNl[1].nodes[1]).toBe(headingPara[1].nodes[1])
    }
    const headingParaThenList = continueCheapProseBlocks(
      '# 标题\n见 `foo` 与 ',
      headingPara,
      '# 标题\n见 `foo` 与 \n- 一项'
    )
    expect(headingParaThenList[0]).toBe(headingPara[0])
    expect(headingParaThenList.map((b) => b.type)).toEqual(['heading', 'p', 'list'])
    const paraSoft = parseCheapProseBlocks('见 `foo` 与 ')
    const paraSoftGrown = continueCheapProseBlocks('见 `foo` 与 ', paraSoft, '见 `foo` 与 \n下一句')
    if (paraSoft[0]?.type === 'p' && paraSoftGrown[0]?.type === 'p') {
      expect(paraSoftGrown[0].nodes[0]).toBe(paraSoft[0].nodes[0])
      expect(paraSoftGrown[0].nodes[1]).toBe(paraSoft[0].nodes[1])
    }
    const paraSoftNl = continueCheapProseBlocks('见 `foo` 与 ', paraSoft, '见 `foo` 与 \n')
    const paraSoftAfterNl = continueCheapProseBlocks('见 `foo` 与 \n', paraSoftNl, '见 `foo` 与 \n下一句')
    if (paraSoft[0]?.type === 'p' && paraSoftAfterNl[0]?.type === 'p') {
      expect(paraSoftAfterNl[0].nodes[0]).toBe(paraSoft[0].nodes[0])
      expect(paraSoftAfterNl[0].nodes[1]).toBe(paraSoft[0].nodes[1])
    }
    const headingList = parseCheapProseBlocks('# 标题\n- 一项')
    const headingListGrown = continueCheapProseBlocks('# 标题\n- 一项', headingList, '# 标题\n- 一项更长')
    expect(headingListGrown[0]).toBe(headingList[0])
    if (headingList[1]?.type === 'list' && headingListGrown[1]?.type === 'list') {
      expect(headingListGrown[1].items[0]).not.toBe(headingList[1].items[0])
      expect(headingListGrown[1].items[0]?.nodes).toEqual([{ type: 'text', text: '一项更长' }])
    }
    const paraList = parseCheapProseBlocks('先说一句\n- 一项')
    expect(paraList.map((b) => b.type)).toEqual(['p', 'list'])
    const paraListGrown = continueCheapProseBlocks('先说一句\n- 一项', paraList, '先说一句\n- 一项更长')
    expect(paraListGrown[0]).toBe(paraList[0])
    if (paraList[1]?.type === 'list' && paraListGrown[1]?.type === 'list') {
      expect(paraListGrown[1].items[0]?.nodes).toEqual([{ type: 'text', text: '一项更长' }])
    }
    const paraHeading = parseCheapProseBlocks('先说一句\n## 标题')
    expect(paraHeading.map((b) => b.type)).toEqual(['p', 'heading'])
    const paraHeadingGrown = continueCheapProseBlocks('先说一句\n## 标题', paraHeading, '先说一句\n## 标题更长')
    expect(paraHeadingGrown[0]).toBe(paraHeading[0])
    if (paraHeadingGrown[1]?.type === 'heading') {
      expect(paraHeadingGrown[1].nodes).toEqual([{ type: 'text', text: '标题更长' }])
    }
    const indentPre = parseCheapProseBlocks('    const x = 1')
    const indentGrown = continueCheapProseBlocks('    const x = 1', indentPre, '    const x = 12')
    if (indentPre[0]?.type === 'pre' && indentGrown[0]?.type === 'pre') {
      expect(indentGrown[0].text).toBe('const x = 12')
    }
    expect(shouldGrowStreamingIndentCodeLastLine({ prevNorm: '    const x = 1', suffix: '2' })).toBe(
      true
    )
    expect(shouldGrowStreamingIndentCodeLastLine({ prevNorm: '    const x = 1', suffix: '\n' })).toBe(
      false
    )
    expect(
      shouldGrowStreamingIndentCodeLastLine({ prevNorm: '    const x = 1', suffix: '\n    const y' })
    ).toBe(true)
    expect(
      shouldGrowStreamingIndentCodeLastLine({
        prevNorm: '    const x = 1\n',
        suffix: '    const y'
      })
    ).toBe(true)
    expect(
      shouldGrowStreamingIndentCodeLastLine({ prevNorm: '    const x = 1', suffix: '\n# title' })
    ).toBe(false)
    expect(
      shouldGrowStreamingIndentCodeLastLine({ prevNorm: '    const x = 1', suffix: '\nafter' })
    ).toBe(false)
    expect(
      shouldGrowStreamingIndentCodeLastLine({ prevNorm: '    const x = 1', suffix: '\n- item' })
    ).toBe(false)
    expect(
      shouldGrowStreamingIndentCodeLastLine({ prevNorm: '    const x = 1', suffix: '\n\n下一段' })
    ).toBe(false)
    const indentNl = continueCheapProseBlocks('    const x = 1', indentPre, '    const x = 1\n')
    expect(indentNl[0]).toBe(indentPre[0])
    const manyIndent = Array.from({ length: 12 }, (_, i) => `    const x = ${i}`).join('\n')
    const manyIndentFirst = parseCheapProseBlocks(manyIndent)
    const manyIndentGrown = continueCheapProseBlocks(manyIndent, manyIndentFirst, `${manyIndent}0`)
    if (manyIndentFirst[0]?.type === 'pre' && manyIndentGrown[0]?.type === 'pre') {
      expect(manyIndentGrown[0].text.endsWith('110')).toBe(true)
      expect(manyIndentGrown[0].text.startsWith('const x = 0\n')).toBe(true)
    }
    const manyIndentNext = continueCheapProseBlocks(
      manyIndent,
      manyIndentFirst,
      `${manyIndent}\n    const x = 12`
    )
    if (manyIndentFirst[0]?.type === 'pre' && manyIndentNext[0]?.type === 'pre') {
      expect(manyIndentNext[0].text.endsWith('\nconst x = 12')).toBe(true)
    }
    expect(shouldGrowStreamingFencedPreLastLine({ prevNorm: '```js\nconst x = 1', suffix: '2' })).toBe(
      true
    )
    expect(shouldGrowStreamingFencedPreLastLine({ prevNorm: '```js\nconst x = 1', suffix: '\n' })).toBe(
      false
    )
    expect(
      shouldGrowStreamingFencedPreLastLine({ prevNorm: '```js\nconst x = 1', suffix: '\nconst y' })
    ).toBe(true)
    expect(
      shouldGrowStreamingFencedPreLastLine({ prevNorm: '```js\nconst x = 1', suffix: '\n```' })
    ).toBe(false)
    expect(shouldGrowStreamingFencedPreLastLine({ prevNorm: '```js\n``', suffix: '`' })).toBe(false)
    expect(
      shouldGrowStreamingFencedPreLastLine({ prevNorm: '```\nx\n```', suffix: '\nafter' })
    ).toBe(false)
    expect(
      shouldGrowStreamingFencedPreLastLine({ prevNorm: '```\nx\n```\n', suffix: 'after' })
    ).toBe(false)
    expect(
      shouldGrowStreamingFencedPreLastLine({
        prevNorm: '```\nx\n```\nafter',
        suffix: ' more',
        body: 'x'
      })
    ).toBe(false)
    expect(
      shouldGrowStreamingFencedPreLastLine({
        prevNorm: '```js\nconst x = 1',
        suffix: '2',
        body: 'const x = 1'
      })
    ).toBe(true)
    const manyFenceBody = `\`\`\`js\n${Array.from({ length: 12 }, (_, i) => `const x = ${i}`).join('\n')}`
    const manyFenceBodyFirst = parseCheapProseBlocks(manyFenceBody)
    const manyFenceBodyGrown = continueCheapProseBlocks(
      manyFenceBody,
      manyFenceBodyFirst,
      `${manyFenceBody}0`
    )
    if (manyFenceBodyFirst[0]?.type === 'pre' && manyFenceBodyGrown[0]?.type === 'pre') {
      expect(manyFenceBodyGrown[0].text.endsWith('110')).toBe(true)
      expect(manyFenceBodyGrown[0].lang).toBe('js')
    }
    const manyFenceBodyNl = continueCheapProseBlocks(
      manyFenceBody,
      manyFenceBodyFirst,
      `${manyFenceBody}\n`
    )
    expect(manyFenceBodyNl[0]).toBe(manyFenceBodyFirst[0])
    const manyFenceBodyNext = continueCheapProseBlocks(
      manyFenceBody,
      manyFenceBodyFirst,
      `${manyFenceBody}\nconst x = 12`
    )
    if (manyFenceBodyFirst[0]?.type === 'pre' && manyFenceBodyNext[0]?.type === 'pre') {
      expect(manyFenceBodyNext[0].text.endsWith('\nconst x = 12')).toBe(true)
    }
    const quoteFenceLive = parseCheapProseBlocks('> ```ts\n> let y = 2')
    const quoteFenceGrown = continueCheapProseBlocks(
      '> ```ts\n> let y = 2',
      quoteFenceLive,
      '> ```ts\n> let y = 20'
    )
    if (quoteFenceLive[0]?.type === 'quote' && quoteFenceGrown[0]?.type === 'quote') {
      expect(quoteFenceGrown[0].blocks[0]).toMatchObject({ type: 'pre', text: 'let y = 20', lang: 'ts' })
    }
    const indentThenHeading = continueCheapProseBlocks(
      '    const x = 1',
      indentPre,
      '    const x = 1\n# title'
    )
    expect(indentThenHeading.map((b) => b.type)).toEqual(['pre', 'heading'])
    expect(indentThenHeading[0]).toBe(indentPre[0])
    const indentThenAfter = continueCheapProseBlocks(
      '    const x = 1',
      indentPre,
      '    const x = 1\nafter'
    )
    expect(indentThenAfter[0]).toBe(indentPre[0])
    expect(indentThenAfter.map((b) => b.type)).toEqual(['pre', 'p'])
    const indentThenList = continueCheapProseBlocks(
      '    const x = 1',
      indentPre,
      '    const x = 1\n- item'
    )
    expect(indentThenList[0]).toBe(indentPre[0])
    expect(indentThenList.map((b) => b.type)).toEqual(['pre', 'list'])
    const quoteIndentSrc = '>     const x = 1'
    const quoteIndent = parseCheapProseBlocks(quoteIndentSrc)
    const quoteIndentGrown = continueCheapProseBlocks(
      quoteIndentSrc,
      quoteIndent,
      `${quoteIndentSrc}\n> after`
    )
    if (quoteIndent[0]?.type === 'quote' && quoteIndentGrown[0]?.type === 'quote') {
      expect(quoteIndentGrown[0].blocks[0]).toBe(quoteIndent[0].blocks[0])
      expect(quoteIndentGrown[0].blocks.map((block) => block.type)).toEqual(['pre', 'p'])
    }
    const itemIndent = parseCheapProseBlocks('- n\n\n      const x = 1')
    const itemIndentThenHeading = continueCheapProseBlocks(
      '- n\n\n      const x = 1',
      itemIndent,
      '- n\n\n      const x = 1\n  # title'
    )
    if (itemIndent[0]?.type === 'list' && itemIndentThenHeading[0]?.type === 'list') {
      expect(itemIndentThenHeading[0].items[0]?.nodes).toBe(itemIndent[0].items[0]?.nodes)
      expect(itemIndentThenHeading[0].items[0]?.blocks?.map((block) => block.type)).toEqual([
        'pre',
        'heading'
      ])
      expect(itemIndentThenHeading[0].items[0]?.blocks?.[0]).toBe(itemIndent[0].items[0]?.blocks?.[0])
    }
    const closedFenceOnly = '```\nx\n```'
    const closedFenceOnlyFirst = parseCheapProseBlocks(closedFenceOnly)
    const closedFenceThenPara = continueCheapProseBlocks(
      closedFenceOnly,
      closedFenceOnlyFirst,
      `${closedFenceOnly}\nafter`
    )
    expect(closedFenceThenPara[0]).toBe(closedFenceOnlyFirst[0])
    expect(closedFenceThenPara.map((block) => block.type)).toEqual(['pre', 'p'])
    expect(closedFenceThenPara[1]).toMatchObject({
      type: 'p',
      nodes: [{ type: 'text', text: 'after' }]
    })
    const closedFenceThenHeading = continueCheapProseBlocks(
      closedFenceOnly,
      closedFenceOnlyFirst,
      `${closedFenceOnly}\n# t`
    )
    expect(closedFenceThenHeading[0]).toBe(closedFenceOnlyFirst[0])
    expect(closedFenceThenHeading.map((block) => block.type)).toEqual(['pre', 'heading'])
    const closedFenceThenList = continueCheapProseBlocks(
      closedFenceOnly,
      closedFenceOnlyFirst,
      `${closedFenceOnly}\n- x`
    )
    expect(closedFenceThenList[0]).toBe(closedFenceOnlyFirst[0])
    expect(closedFenceThenList.map((block) => block.type)).toEqual(['pre', 'list'])
    const openFence = '```\nx'
    const openFenceFirst = parseCheapProseBlocks(openFence)
    const openFenceClosePara = continueCheapProseBlocks(openFence, openFenceFirst, '```\nx\n```\nafter')
    expect(openFenceClosePara[0]).toBe(openFenceFirst[0])
    expect(openFenceClosePara.map((block) => block.type)).toEqual(['pre', 'p'])
    const headingFence = '# t\n```\nx\n```'
    const headingFenceFirst = parseCheapProseBlocks(headingFence)
    const headingFenceThenPara = continueCheapProseBlocks(
      headingFence,
      headingFenceFirst,
      `${headingFence}\nafter`
    )
    expect(headingFenceThenPara[0]).toBe(headingFenceFirst[0])
    expect(headingFenceThenPara[1]).toBe(headingFenceFirst[1])
    expect(headingFenceThenPara.map((block) => block.type)).toEqual(['heading', 'pre', 'p'])
    const taggedFence = '```js\nx\n```'
    const taggedFenceFirst = parseCheapProseBlocks(taggedFence)
    const taggedFenceThenPara = continueCheapProseBlocks(
      taggedFence,
      taggedFenceFirst,
      `${taggedFence}\nafter`
    )
    expect(taggedFenceThenPara[0]).toBe(taggedFenceFirst[0])
    expect(taggedFenceThenPara.map((block) => block.type)).toEqual(['pre', 'p'])
    const fenceThenPara = '```\nx\n```\n见 `foo` 与 '
    const fenceThenParaFirst = parseCheapProseBlocks(fenceThenPara)
    const fenceThenParaGrown = continueCheapProseBlocks(
      fenceThenPara,
      fenceThenParaFirst,
      `${fenceThenPara}bar`
    )
    expect(fenceThenParaGrown[0]).toBe(fenceThenParaFirst[0])
    if (fenceThenParaFirst[1]?.type === 'p' && fenceThenParaGrown[1]?.type === 'p') {
      expect(fenceThenParaGrown[1].nodes[0]).toBe(fenceThenParaFirst[1].nodes[0])
      expect(fenceThenParaGrown[1].nodes[1]).toBe(fenceThenParaFirst[1].nodes[1])
    }
    const tableThenPara = '| A |\n| --- |\n| 1 |\n见 `foo` 与 '
    const tableThenParaFirst = parseCheapProseBlocks(tableThenPara)
    const tableThenParaGrown = continueCheapProseBlocks(
      tableThenPara,
      tableThenParaFirst,
      `${tableThenPara}bar`
    )
    expect(tableThenParaGrown[0]).toBe(tableThenParaFirst[0])
    if (tableThenParaFirst[1]?.type === 'p' && tableThenParaGrown[1]?.type === 'p') {
      expect(tableThenParaGrown[1].nodes[0]).toBe(tableThenParaFirst[1].nodes[0])
      expect(tableThenParaGrown[1].nodes[1]).toBe(tableThenParaFirst[1].nodes[1])
    }
    const twoPara = '第一段\n\n见 `foo` 与 '
    const twoParaFirst = parseCheapProseBlocks(twoPara)
    const twoParaGrown = continueCheapProseBlocks(twoPara, twoParaFirst, `${twoPara}bar`)
    expect(twoParaGrown[0]).toBe(twoParaFirst[0])
    if (twoParaFirst[1]?.type === 'p' && twoParaGrown[1]?.type === 'p') {
      expect(twoParaGrown[1].nodes[0]).toBe(twoParaFirst[1].nodes[0])
      expect(twoParaGrown[1].nodes[1]).toBe(twoParaFirst[1].nodes[1])
    }
    const listThenPara = '- x\n\n见 `foo` 与 '
    const listThenParaFirst = parseCheapProseBlocks(listThenPara)
    const listThenParaGrown = continueCheapProseBlocks(listThenPara, listThenParaFirst, `${listThenPara}bar`)
    expect(listThenParaGrown[0]).toBe(listThenParaFirst[0])
    if (listThenParaFirst[1]?.type === 'p' && listThenParaGrown[1]?.type === 'p') {
      expect(listThenParaGrown[1].nodes[0]).toBe(listThenParaFirst[1].nodes[0])
      expect(listThenParaGrown[1].nodes[1]).toBe(listThenParaFirst[1].nodes[1])
    }
    const quoteThenPara = '> q\n\n见 `foo` 与 '
    const quoteThenParaFirst = parseCheapProseBlocks(quoteThenPara)
    const quoteThenParaGrown = continueCheapProseBlocks(
      quoteThenPara,
      quoteThenParaFirst,
      `${quoteThenPara}bar`
    )
    expect(quoteThenParaGrown[0]).toBe(quoteThenParaFirst[0])
    if (quoteThenParaFirst[1]?.type === 'p' && quoteThenParaGrown[1]?.type === 'p') {
      expect(quoteThenParaGrown[1].nodes[0]).toBe(quoteThenParaFirst[1].nodes[0])
      expect(quoteThenParaGrown[1].nodes[1]).toBe(quoteThenParaFirst[1].nodes[1])
    }
    const indentThenPara = '    const x = 1\n见 `foo` 与 '
    const indentThenParaFirst = parseCheapProseBlocks(indentThenPara)
    const indentThenParaGrown = continueCheapProseBlocks(
      indentThenPara,
      indentThenParaFirst,
      `${indentThenPara}bar`
    )
    expect(indentThenParaGrown[0]).toBe(indentThenParaFirst[0])
    if (indentThenParaFirst[1]?.type === 'p' && indentThenParaGrown[1]?.type === 'p') {
      expect(indentThenParaGrown[1].nodes[0]).toBe(indentThenParaFirst[1].nodes[0])
      expect(indentThenParaGrown[1].nodes[1]).toBe(indentThenParaFirst[1].nodes[1])
    }
    const fenceEntityPara = '```\nx\n```\n见 &amp; 与 '
    const fenceEntityFirst = parseCheapProseBlocks(fenceEntityPara)
    const fenceEntityGrown = continueCheapProseBlocks(
      fenceEntityPara,
      fenceEntityFirst,
      `${fenceEntityPara}bar`
    )
    expect(fenceEntityGrown[0]).toBe(fenceEntityFirst[0])
    if (fenceEntityFirst[1]?.type === 'p' && fenceEntityGrown[1]?.type === 'p') {
      expect(fenceEntityGrown[1].nodes).toEqual([{ type: 'text', text: '见 & 与 bar' }])
    }
    const quoteHeading = parseCheapProseBlocks('> # 标题')
    const quoteHeadingGrown = continueCheapProseBlocks('> # 标题', quoteHeading, '> # 标题更长')
    if (quoteHeadingGrown[0]?.type === 'quote' && quoteHeadingGrown[0].blocks[0]?.type === 'heading') {
      expect(quoteHeadingGrown[0].blocks[0].nodes).toEqual([{ type: 'text', text: '标题更长' }])
    }
    const quoteHeadingPara = parseCheapProseBlocks('> # 标题\n> 见 `foo` 与 ')
    const quoteHeadingParaGrown = continueCheapProseBlocks(
      '> # 标题\n> 见 `foo` 与 ',
      quoteHeadingPara,
      '> # 标题\n> 见 `foo` 与 bar'
    )
    if (quoteHeadingPara[0]?.type === 'quote' && quoteHeadingParaGrown[0]?.type === 'quote') {
      expect(quoteHeadingParaGrown[0].blocks[0]).toBe(quoteHeadingPara[0].blocks[0])
      if (quoteHeadingPara[0].blocks[1]?.type === 'p' && quoteHeadingParaGrown[0].blocks[1]?.type === 'p') {
        expect(quoteHeadingParaGrown[0].blocks[1].nodes[0]).toBe(quoteHeadingPara[0].blocks[1].nodes[0])
        expect(quoteHeadingParaGrown[0].blocks[1].nodes[1]).toBe(quoteHeadingPara[0].blocks[1].nodes[1])
      }
    }
    const quoteHeadingList = parseCheapProseBlocks('> # 标题\n> - 一项')
    const quoteHeadingListGrown = continueCheapProseBlocks(
      '> # 标题\n> - 一项',
      quoteHeadingList,
      '> # 标题\n> - 一项更长'
    )
    if (quoteHeadingList[0]?.type === 'quote' && quoteHeadingListGrown[0]?.type === 'quote') {
      expect(quoteHeadingListGrown[0].blocks[0]).toBe(quoteHeadingList[0].blocks[0])
      if (quoteHeadingListGrown[0].blocks[1]?.type === 'list') {
        expect(quoteHeadingListGrown[0].blocks[1].items[0]?.nodes).toEqual([{ type: 'text', text: '一项更长' }])
      }
    }
    const liveNotes = parseCheapProseBlocks('见注[^1]。\n[^1]: 说明')
    const liveNotesGrown = continueCheapProseBlocks(
      '见注[^1]。\n[^1]: 说明',
      liveNotes,
      '见注[^1]。\n[^1]: 说明更'
    )
    expect(liveNotesGrown[0]).toBe(liveNotes[0])
    const quoteInListLive = parseCheapProseBlocks('- note\n  > quoted')
    const quoteInListGrown = continueCheapProseBlocks(
      '- note\n  > quoted',
      quoteInListLive,
      '- note\n  > quoted more'
    )
    if (quoteInListLive[0]?.type === 'list' && quoteInListGrown[0]?.type === 'list') {
      expect(quoteInListGrown[0].items[0]?.nodes).toBe(quoteInListLive[0].items[0]?.nodes)
    }
    const headingQuoteInList = parseCheapProseBlocks('- note\n  # title\n  > quoted')
    const headingQuoteGrown = continueCheapProseBlocks(
      '- note\n  # title\n  > quoted',
      headingQuoteInList,
      '- note\n  # title\n  > quoted more'
    )
    if (headingQuoteInList[0]?.type === 'list' && headingQuoteGrown[0]?.type === 'list') {
      expect(headingQuoteGrown[0].items[0]?.nodes).toBe(headingQuoteInList[0].items[0]?.nodes)
      expect(headingQuoteGrown[0].items[0]?.blocks?.[0]).toBe(headingQuoteInList[0].items[0]?.blocks?.[0])
    }
    const fenceInListLive = parseCheapProseBlocks('1. item\n   ```js\n   x')
    const fenceInListGrown = continueCheapProseBlocks(
      '1. item\n   ```js\n   x',
      fenceInListLive,
      '1. item\n   ```js\n   xy'
    )
    if (fenceInListLive[0]?.type === 'list' && fenceInListGrown[0]?.type === 'list') {
      expect(fenceInListGrown[0].items[0]?.nodes).toBe(fenceInListLive[0].items[0]?.nodes)
      expect(fenceInListGrown[0].items[0]?.blocks?.[0]).toMatchObject({ type: 'pre', text: 'xy', lang: 'js' })
    }
    const manyFence =
      Array.from({ length: 12 }, (_, i) => `- keep-${i}`).join('\n') + '\n- tail\n   ```js\n   x'
    const manyFenceFirst = parseCheapProseBlocks(manyFence)
    const manyFenceGrown = continueCheapProseBlocks(manyFence, manyFenceFirst, `${manyFence}y`)
    if (manyFenceFirst[0]?.type === 'list' && manyFenceGrown[0]?.type === 'list') {
      expect(manyFenceGrown[0].items.slice(0, 12).every((item, i) => item === manyFenceFirst[0].items[i])).toBe(
        true
      )
      expect(manyFenceGrown[0].items[12]?.nodes).toBe(manyFenceFirst[0].items[12]?.nodes)
      expect(manyFenceGrown[0].items[12]?.blocks?.[0]).toMatchObject({ type: 'pre', text: 'xy', lang: 'js' })
    }
    const manyThenQuote =
      Array.from({ length: 8 }, (_, i) => `- keep-${i}`).join('\n') + '\n- note\n  > quoted'
    const manyThenQuoteFirst = parseCheapProseBlocks(manyThenQuote)
    const manyThenQuoteGrown = continueCheapProseBlocks(
      manyThenQuote,
      manyThenQuoteFirst,
      `${manyThenQuote} more`
    )
    if (manyThenQuoteFirst[0]?.type === 'list' && manyThenQuoteGrown[0]?.type === 'list') {
      expect(manyThenQuoteGrown[0].items.slice(0, 8).every((item, i) => item === manyThenQuoteFirst[0].items[i])).toBe(
        true
      )
      expect(manyThenQuoteGrown[0].items[8]?.nodes).toBe(manyThenQuoteFirst[0].items[8]?.nodes)
    }
    const nestedQuote = parseCheapProseBlocks('- a\n  - b\n    > quoted')
    const nestedQuoteGrown = continueCheapProseBlocks(
      '- a\n  - b\n    > quoted',
      nestedQuote,
      '- a\n  - b\n    > quoted more'
    )
    if (nestedQuote[0]?.type === 'list' && nestedQuoteGrown[0]?.type === 'list') {
      expect(nestedQuoteGrown[0].items[0]?.nodes).toBe(nestedQuote[0].items[0]?.nodes)
      expect(nestedQuoteGrown[0].items[0]?.nested?.items[0]?.nodes).toBe(
        nestedQuote[0].items[0]?.nested?.items[0]?.nodes
      )
    }
    const nestedHeadingQuote = parseCheapProseBlocks('- a\n  - b\n    # title\n    > quoted')
    const nestedHeadingQuoteGrown = continueCheapProseBlocks(
      '- a\n  - b\n    # title\n    > quoted',
      nestedHeadingQuote,
      '- a\n  - b\n    # title\n    > quoted more'
    )
    if (nestedHeadingQuote[0]?.type === 'list' && nestedHeadingQuoteGrown[0]?.type === 'list') {
      expect(nestedHeadingQuoteGrown[0].items[0]?.nodes).toBe(nestedHeadingQuote[0].items[0]?.nodes)
      expect(nestedHeadingQuoteGrown[0].items[0]?.nested?.items[0]?.nodes).toBe(
        nestedHeadingQuote[0].items[0]?.nested?.items[0]?.nodes
      )
      expect(nestedHeadingQuoteGrown[0].items[0]?.nested?.items[0]?.blocks?.[0]).toBe(
        nestedHeadingQuote[0].items[0]?.nested?.items[0]?.blocks?.[0]
      )
    }
    const nestedFenceLive = parseCheapProseBlocks('- a\n  - b\n    ```js\n    x')
    const nestedFenceGrown = continueCheapProseBlocks(
      '- a\n  - b\n    ```js\n    x',
      nestedFenceLive,
      '- a\n  - b\n    ```js\n    xy'
    )
    if (nestedFenceLive[0]?.type === 'list' && nestedFenceGrown[0]?.type === 'list') {
      expect(nestedFenceGrown[0].items[0]?.nodes).toBe(nestedFenceLive[0].items[0]?.nodes)
      expect(nestedFenceGrown[0].items[0]?.nested?.items[0]?.nodes).toBe(
        nestedFenceLive[0].items[0]?.nested?.items[0]?.nodes
      )
      expect(nestedFenceGrown[0].items[0]?.nested?.items[0]?.blocks?.[0]).toMatchObject({
        type: 'pre',
        text: 'xy',
        lang: 'js'
      })
    }
    const looseExtra = parseCheapProseBlocks('- 一项\n\n  续段')
    const looseExtraGrown = continueCheapProseBlocks('- 一项\n\n  续段', looseExtra, '- 一项\n\n  续段更长')
    if (looseExtra[0]?.type === 'list' && looseExtraGrown[0]?.type === 'list') {
      expect(looseExtraGrown[0].items[0]?.nodes).toBe(looseExtra[0].items[0]?.nodes)
      expect(looseExtraGrown[0].items[0]?.extra?.[0]).not.toBe(looseExtra[0].items[0]?.extra?.[0])
    }
    const paraQuoteList = parseCheapProseBlocks('先说一句\n> - 一项')
    expect(paraQuoteList.map((b) => b.type)).toEqual(['p', 'quote'])
    const paraQuoteListGrown = continueCheapProseBlocks(
      '先说一句\n> - 一项',
      paraQuoteList,
      '先说一句\n> - 一项\n> - 二项'
    )
    expect(paraQuoteListGrown[0]).toBe(paraQuoteList[0])
    if (paraQuoteList[1]?.type === 'quote' && paraQuoteListGrown[1]?.type === 'quote') {
      const prevList = paraQuoteList[1].blocks[0]
      const nextList = paraQuoteListGrown[1].blocks[0]
      if (prevList?.type === 'list' && nextList?.type === 'list') {
        expect(nextList.items[0]).toBe(prevList.items[0])
        expect(nextList.items).toHaveLength(2)
      }
    }
    const paraQuoteNl = continueCheapProseBlocks(
      '先说一句\n> - 一项',
      paraQuoteList,
      '先说一句\n> - 一项\n'
    )
    const paraQuoteAfterNl = continueCheapProseBlocks(
      '先说一句\n> - 一项\n',
      paraQuoteNl,
      '先说一句\n> - 一项\n> - 二项'
    )
    expect(paraQuoteAfterNl[0]).toBe(paraQuoteList[0])
    if (paraQuoteList[1]?.type === 'quote' && paraQuoteAfterNl[1]?.type === 'quote') {
      const prevList = paraQuoteList[1].blocks[0]
      const nextList = paraQuoteAfterNl[1].blocks[0]
      if (prevList?.type === 'list' && nextList?.type === 'list') {
        expect(nextList.items[0]).toBe(prevList.items[0])
        expect(nextList.items).toHaveLength(2)
      }
    }
    const quoteHeadingNewItem = continueCheapProseBlocks(
      '> # 标题\n> - 一项',
      quoteHeadingList,
      '> # 标题\n> - 一项\n> - 二项'
    )
    if (quoteHeadingList[0]?.type === 'quote' && quoteHeadingNewItem[0]?.type === 'quote') {
      expect(quoteHeadingNewItem[0].blocks[0]).toBe(quoteHeadingList[0].blocks[0])
      if (quoteHeadingNewItem[0].blocks[1]?.type === 'list') {
        expect(quoteHeadingNewItem[0].blocks[1].items).toHaveLength(2)
      }
    }
    const quoteThenList = continueCheapProseBlocks('> foo', parseCheapProseBlocks('> foo'), '> foo\n- bar')
    expect(quoteThenList.map((b) => b.type)).toEqual(['quote', 'list'])
    expect(quoteSuffixStaysInside('> foo', ' 更长')).toBe(true)
    expect(quoteSuffixStaysInside('> foo', '\n> 续行')).toBe(true)
    expect(quoteSuffixStaysInside('> foo\n>', '\nbar')).toBe(true)
    expect(quoteSuffixStaysInside('> foo', '\n- bar')).toBe(false)
    expect(quoteSuffixStaysInside('> foo\n\n', 'bar')).toBe(false)
    const twoQuote = parseCheapProseBlocks('> 第一段\n>\n> 第二')
    const twoQuoteGrown = continueCheapProseBlocks('> 第一段\n>\n> 第二', twoQuote, '> 第一段\n>\n> 第二段更长')
    const twoQuoteWrap = continueCheapProseBlocks('> 第一段\n>\n> 第二', twoQuote, '> 第一段\n>\n> 第二\n> 续行')
    if (twoQuote[0]?.type === 'quote' && twoQuoteGrown[0]?.type === 'quote') {
      expect(twoQuoteGrown[0].blocks[0]).toBe(twoQuote[0].blocks[0])
    }
    if (twoQuote[0]?.type === 'quote' && twoQuoteWrap[0]?.type === 'quote') {
      expect(twoQuoteWrap[0].blocks[0]).toBe(twoQuote[0].blocks[0])
    }
    const manyQuote = Array.from({ length: 12 }, (_, i) => `> - q-${i}`).join('\n')
    const manyQuoteFirst = parseCheapProseBlocks(manyQuote)
    const manyQuoteGrown = continueCheapProseBlocks(manyQuote, manyQuoteFirst, `${manyQuote}\n> - q-12`)
    if (manyQuoteFirst[0]?.type === 'quote' && manyQuoteGrown[0]?.type === 'quote') {
      const firstList = manyQuoteFirst[0].blocks[0]
      const grownList = manyQuoteGrown[0].blocks[0]
      if (firstList?.type === 'list' && grownList?.type === 'list') {
        expect(grownList.items.slice(0, 12).every((item, index) => item === firstList.items[index])).toBe(true)
        expect(grownList.items).toHaveLength(13)
      }
    }
    const closedFence = '- a\n  ```\n  x\n  ```'
    const closedFenceFirst = parseCheapProseBlocks(closedFence)
    const closedFenceSuffix = continueCheapProseBlocks(
      closedFence,
      closedFenceFirst,
      `${closedFence}\n  after`
    )
    if (closedFenceFirst[0]?.type === 'list' && closedFenceSuffix[0]?.type === 'list') {
      expect(closedFenceSuffix[0].items[0]?.nodes).toBe(closedFenceFirst[0].items[0]?.nodes)
      expect(closedFenceSuffix[0].items[0]?.blocks?.[0]).toBe(closedFenceFirst[0].items[0]?.blocks?.[0])
      expect(closedFenceSuffix[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const closedFenceNl = continueCheapProseBlocks(closedFence, closedFenceFirst, `${closedFence}\n`)
    const closedFenceAfterNl = continueCheapProseBlocks(
      `${closedFence}\n`,
      closedFenceNl,
      `${closedFence}\n  after`
    )
    if (closedFenceFirst[0]?.type === 'list' && closedFenceAfterNl[0]?.type === 'list') {
      expect(closedFenceAfterNl[0].items[0]?.nodes).toBe(closedFenceFirst[0].items[0]?.nodes)
      expect(closedFenceAfterNl[0].items[0]?.blocks?.[0]).toBe(closedFenceFirst[0].items[0]?.blocks?.[0])
      expect(closedFenceAfterNl[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const closedFenceMore = continueCheapProseBlocks(
      `${closedFence}\n  after`,
      closedFenceSuffix,
      `${closedFence}\n  after more`
    )
    if (closedFenceSuffix[0]?.type === 'list' && closedFenceMore[0]?.type === 'list') {
      expect(closedFenceMore[0].items[0]?.nodes).toBe(closedFenceSuffix[0].items[0]?.nodes)
      expect(closedFenceMore[0].items[0]?.blocks?.[0]).toBe(closedFenceSuffix[0].items[0]?.blocks?.[0])
      expect(closedFenceMore[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after more' }])
    }
    const closedFenceJs = '1. item\n   ```js\n   x\n   ```'
    const closedFenceJsFirst = parseCheapProseBlocks(closedFenceJs)
    const closedFenceJsSuffix = continueCheapProseBlocks(
      closedFenceJs,
      closedFenceJsFirst,
      `${closedFenceJs}\n   after`
    )
    if (closedFenceJsFirst[0]?.type === 'list' && closedFenceJsSuffix[0]?.type === 'list') {
      expect(closedFenceJsSuffix[0].items[0]?.nodes).toBe(closedFenceJsFirst[0].items[0]?.nodes)
      expect(closedFenceJsSuffix[0].items[0]?.blocks?.[0]).toBe(closedFenceJsFirst[0].items[0]?.blocks?.[0])
      expect(closedFenceJsSuffix[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const fenceThenTable = continueCheapProseBlocks(
      closedFence,
      closedFenceFirst,
      `${closedFence}\n  | A | B |`
    )
    if (closedFenceFirst[0]?.type === 'list' && fenceThenTable[0]?.type === 'list') {
      expect(fenceThenTable[0].items[0]?.nodes).toBe(closedFenceFirst[0].items[0]?.nodes)
      expect(fenceThenTable[0].items[0]?.blocks?.[0]).toBe(closedFenceFirst[0].items[0]?.blocks?.[0])
      expect(fenceThenTable[0].items[0]?.blocks?.map((block) => block.type)).toEqual(['pre', 'table'])
    }
    const fenceThenHeading = continueCheapProseBlocks(
      closedFence,
      closedFenceFirst,
      `${closedFence}\n  # title`
    )
    if (closedFenceFirst[0]?.type === 'list' && fenceThenHeading[0]?.type === 'list') {
      expect(fenceThenHeading[0].items[0]?.blocks?.[0]).toBe(closedFenceFirst[0].items[0]?.blocks?.[0])
      expect(fenceThenHeading[0].items[0]?.blocks?.map((block) => block.type)).toEqual(['pre', 'heading'])
    }
    const fenceThenQuote = continueCheapProseBlocks(closedFence, closedFenceFirst, `${closedFence}\n  > quoted`)
    if (closedFenceFirst[0]?.type === 'list' && fenceThenQuote[0]?.type === 'list') {
      expect(fenceThenQuote[0].items[0]?.blocks?.[0]).toBe(closedFenceFirst[0].items[0]?.blocks?.[0])
      expect(fenceThenQuote[0].items[0]?.blocks?.map((block) => block.type)).toEqual(['pre', 'quote'])
    }
    const nestedClosedFence = '- a\n  - b\n    ```\n    x\n    ```'
    const nestedClosedFirst = parseCheapProseBlocks(nestedClosedFence)
    const nestedClosedSuffix = continueCheapProseBlocks(
      nestedClosedFence,
      nestedClosedFirst,
      `${nestedClosedFence}\n    after`
    )
    if (nestedClosedFirst[0]?.type === 'list' && nestedClosedSuffix[0]?.type === 'list') {
      expect(nestedClosedSuffix[0].items[0]?.nodes).toBe(nestedClosedFirst[0].items[0]?.nodes)
      expect(nestedClosedSuffix[0].items[0]?.nested?.items[0]?.nodes).toBe(
        nestedClosedFirst[0].items[0]?.nested?.items[0]?.nodes
      )
      expect(nestedClosedSuffix[0].items[0]?.nested?.items[0]?.blocks?.[0]).toBe(
        nestedClosedFirst[0].items[0]?.nested?.items[0]?.blocks?.[0]
      )
      expect(nestedClosedSuffix[0].items[0]?.nested?.items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const tableInListText = '- note\n  | A | B |\n  | --- | --- |\n  | 1 | 2'
    const tableInList = parseCheapProseBlocks(tableInListText)
    const tableInListGrown = continueCheapProseBlocks(tableInListText, tableInList, `${tableInListText}0`)
    if (tableInList[0]?.type === 'list' && tableInListGrown[0]?.type === 'list') {
      expect(tableInListGrown[0].items[0]?.nodes).toBe(tableInList[0].items[0]?.nodes)
      const prevTable = tableInList[0].items[0]?.blocks?.[0]
      const nextTable = tableInListGrown[0].items[0]?.blocks?.[0]
      if (prevTable?.type === 'table' && nextTable?.type === 'table') {
        expect(nextTable.header[0]).toBe(prevTable.header[0])
        expect(nextTable.rows[0]?.[1]).toEqual([{ type: 'text', text: '20' }])
      }
    }
    const quoteFence = '> ```\n> x\n> ```'
    const quoteFenceFirst = parseCheapProseBlocks(quoteFence)
    const quoteFenceAfter = continueCheapProseBlocks(quoteFence, quoteFenceFirst, `${quoteFence}\n> after`)
    if (quoteFenceFirst[0]?.type === 'quote' && quoteFenceAfter[0]?.type === 'quote') {
      expect(quoteFenceAfter[0].blocks[0]).toBe(quoteFenceFirst[0].blocks[0])
      expect(quoteFenceAfter[0].blocks[1]).toMatchObject({
        type: 'p',
        nodes: [{ type: 'text', text: 'after' }]
      })
    }
    const quoteAtxThenParaSrc = '> # t'
    const quoteAtxFirst = parseCheapProseBlocks(quoteAtxThenParaSrc)
    const quoteAtxThenPara = continueCheapProseBlocks(
      quoteAtxThenParaSrc,
      quoteAtxFirst,
      `${quoteAtxThenParaSrc}\n> after`
    )
    if (quoteAtxFirst[0]?.type === 'quote' && quoteAtxThenPara[0]?.type === 'quote') {
      expect(quoteAtxThenPara[0].blocks[0]).toBe(quoteAtxFirst[0].blocks[0])
      expect(quoteAtxThenPara[0].blocks.map((block) => block.type)).toEqual(['heading', 'p'])
      expect(quoteAtxThenPara[0].blocks[1]).toMatchObject({
        type: 'p',
        nodes: [{ type: 'text', text: 'after' }]
      })
    }
    const quoteAtxFenceSrc = '> # t\n> ```\n> x\n> ```'
    const quoteAtxFenceFirst = parseCheapProseBlocks(quoteAtxFenceSrc)
    const quoteAtxFenceAfter = continueCheapProseBlocks(
      quoteAtxFenceSrc,
      quoteAtxFenceFirst,
      `${quoteAtxFenceSrc}\n> after`
    )
    if (quoteAtxFenceFirst[0]?.type === 'quote' && quoteAtxFenceAfter[0]?.type === 'quote') {
      expect(quoteAtxFenceAfter[0].blocks[0]).toBe(quoteAtxFenceFirst[0].blocks[0])
      expect(quoteAtxFenceAfter[0].blocks[1]).toBe(quoteAtxFenceFirst[0].blocks[1])
      expect(quoteAtxFenceAfter[0].blocks.map((block) => block.type)).toEqual(['heading', 'pre', 'p'])
    }
    const atxThenPara = continueCheapProseBlocks('## 标题', headingOnly, '## 标题\n见 foo')
    expect(atxThenPara[0]).toBe(headingOnly[0])
    expect(atxThenPara.map((block) => block.type)).toEqual(['heading', 'p'])
    const setextOnly = parseCheapProseBlocks('Title\n===')
    const setextThenAfter = continueCheapProseBlocks('Title\n===', setextOnly, 'Title\n===\nafter')
    expect(setextThenAfter[0]).toBe(setextOnly[0])
    expect(setextThenAfter.map((block) => block.type)).toEqual(['heading', 'p'])
    const setextDash = parseCheapProseBlocks('Title\n---')
    const setextDashThenAfter = continueCheapProseBlocks('Title\n---', setextDash, 'Title\n---\nafter')
    expect(setextDashThenAfter[0]).toBe(setextDash[0])
    expect(setextDashThenAfter.map((block) => block.type)).toEqual(['heading', 'p'])
    const quoteSetextSrc = '> Title\n> ==='
    const quoteSetext = parseCheapProseBlocks(quoteSetextSrc)
    const quoteSetextGrown = continueCheapProseBlocks(
      quoteSetextSrc,
      quoteSetext,
      `${quoteSetextSrc}\n> after`
    )
    if (quoteSetext[0]?.type === 'quote' && quoteSetextGrown[0]?.type === 'quote') {
      expect(quoteSetextGrown[0].blocks[0]).toBe(quoteSetext[0].blocks[0])
      expect(quoteSetextGrown[0].blocks.map((block) => block.type)).toEqual(['heading', 'p'])
    }
    const listThenSetextSrc = '- x\n\nTitle\n==='
    const listThenSetext = parseCheapProseBlocks(listThenSetextSrc)
    const listThenSetextGrown = continueCheapProseBlocks(
      listThenSetextSrc,
      listThenSetext,
      `${listThenSetextSrc}\nafter`
    )
    expect(listThenSetextGrown[0]).toBe(listThenSetext[0])
    expect(listThenSetextGrown[1]).toBe(listThenSetext[1])
    expect(listThenSetextGrown.map((block) => block.type)).toEqual(['list', 'heading', 'p'])
    const tableThenSetextSrc = '| A |\n| --- |\n| 1 |\nTitle\n==='
    const tableThenSetext = parseCheapProseBlocks(tableThenSetextSrc)
    const tableThenSetextGrown = continueCheapProseBlocks(
      tableThenSetextSrc,
      tableThenSetext,
      `${tableThenSetextSrc}\nafter`
    )
    expect(tableThenSetextGrown[0]).toBe(tableThenSetext[0])
    expect(tableThenSetextGrown[1]).toBe(tableThenSetext[1])
    expect(tableThenSetextGrown.map((block) => block.type)).toEqual(['table', 'heading', 'p'])
    const twoQuotesSrc = '> a\n\n见 foo\n\n> b'
    const twoQuotes = parseCheapProseBlocks(twoQuotesSrc)
    const twoQuotesGrown = continueCheapProseBlocks(twoQuotesSrc, twoQuotes, `${twoQuotesSrc}\n> c`)
    expect(twoQuotesGrown[0]).toBe(twoQuotes[0])
    expect(twoQuotesGrown[1]).toBe(twoQuotes[1])
    expect(twoQuotesGrown.map((block) => block.type)).toEqual(['quote', 'p', 'quote'])
    const twoListsSrc = '- a\n\n1. b'
    const twoLists = parseCheapProseBlocks(twoListsSrc)
    const twoListsGrown = continueCheapProseBlocks(twoListsSrc, twoLists, `${twoListsSrc}\n2. c`)
    expect(twoListsGrown[0]).toBe(twoLists[0])
    if (twoLists[1]?.type === 'list' && twoListsGrown[1]?.type === 'list') {
      expect(twoListsGrown[1].items[0]).toBe(twoLists[1].items[0])
      expect(twoListsGrown[1].items).toHaveLength(2)
    }
    const twoTablesSrc = '| A |\n| --- |\n| 1 |\n\n| B |\n| --- |\n| 2 |'
    const twoTables = parseCheapProseBlocks(twoTablesSrc)
    const twoTablesGrown = continueCheapProseBlocks(twoTablesSrc, twoTables, `${twoTablesSrc}\n| 3 |`)
    expect(twoTablesGrown[0]).toBe(twoTables[0])
    if (twoTables[1]?.type === 'table' && twoTablesGrown[1]?.type === 'table') {
      expect(twoTablesGrown[1].header).toBe(twoTables[1].header)
      expect(twoTablesGrown[1].rows[0]).toBe(twoTables[1].rows[0])
      expect(twoTablesGrown[1].rows).toHaveLength(2)
    }
    const twoIndentSrc = '    const a = 1\n\n# t\n\n    const b = 2'
    const twoIndent = parseCheapProseBlocks(twoIndentSrc)
    const twoIndentGrown = continueCheapProseBlocks(twoIndentSrc, twoIndent, `${twoIndentSrc}0`)
    expect(twoIndentGrown[0]).toBe(twoIndent[0])
    expect(twoIndentGrown[1]).toBe(twoIndent[1])
    expect(twoIndentGrown.map((block) => block.type)).toEqual(['pre', 'heading', 'pre'])
    const twoFenceSrc = '```\na\n```\n\n# t\n\n```\nb\n```'
    const twoFence = parseCheapProseBlocks(twoFenceSrc)
    const twoFenceGrown = continueCheapProseBlocks(twoFenceSrc, twoFence, `${twoFenceSrc}\nc`)
    expect(twoFenceGrown[0]).toBe(twoFence[0])
    expect(twoFenceGrown[1]).toBe(twoFence[1])
    expect(twoFenceGrown.map((block) => block.type)).toEqual(['pre', 'heading', 'pre', 'p'])
    const paraOnly = parseCheapProseBlocks('见 foo')
    const paraThenList = continueCheapProseBlocks('见 foo', paraOnly, '见 foo\n- 一项')
    expect(paraThenList[0]).toBe(paraOnly[0])
    expect(paraThenList.map((block) => block.type)).toEqual(['p', 'list'])
    const paraThenHeading = continueCheapProseBlocks('见 foo', paraOnly, '见 foo\n# t')
    expect(paraThenHeading[0]).toBe(paraOnly[0])
    expect(paraThenHeading.map((block) => block.type)).toEqual(['p', 'heading'])
    const firstParaOnly = parseCheapProseBlocks('第一段')
    const paraThenBlank = continueCheapProseBlocks('第一段', firstParaOnly, '第一段\n\n第二')
    expect(paraThenBlank[0]).toBe(firstParaOnly[0])
    expect(paraThenBlank.map((block) => block.type)).toEqual(['p', 'p'])
    const quoteParaSrc = '> 见 foo'
    const quoteParaFirst = parseCheapProseBlocks(quoteParaSrc)
    const quoteParaThenList = continueCheapProseBlocks(quoteParaSrc, quoteParaFirst, `${quoteParaSrc}\n> - 一项`)
    if (quoteParaFirst[0]?.type === 'quote' && quoteParaThenList[0]?.type === 'quote') {
      expect(quoteParaThenList[0].blocks[0]).toBe(quoteParaFirst[0].blocks[0])
      expect(quoteParaThenList[0].blocks.map((block) => block.type)).toEqual(['p', 'list'])
    }
    const topTableOnly = '| A |\n| --- |\n| 1 |'
    const topTableFirst = parseCheapProseBlocks(topTableOnly)
    const topTableThenAfter = continueCheapProseBlocks(
      topTableOnly,
      topTableFirst,
      `${topTableOnly}\nafter`
    )
    expect(topTableThenAfter[0]).toBe(topTableFirst[0])
    expect(topTableThenAfter.map((block) => block.type)).toEqual(['table', 'p'])
    const topListOnly = parseCheapProseBlocks('- x')
    const topListThenAfter = continueCheapProseBlocks('- x', topListOnly, '- x\n\nafter')
    expect(topListThenAfter[0]).toBe(topListOnly[0])
    expect(topListThenAfter.map((block) => block.type)).toEqual(['list', 'p'])
    const hrOnly = parseCheapProseBlocks('***')
    const hrThenPara = continueCheapProseBlocks('***', hrOnly, '***\nafter')
    expect(hrThenPara[0]).toBe(hrOnly[0])
    expect(hrThenPara.map((block) => block.type)).toEqual(['hr', 'p'])
    const starHr = parseCheapProseBlocks('* * *')
    const starHrGrown = continueCheapProseBlocks('* * *', starHr, '* * *\n# t')
    expect(starHrGrown[0]).toBe(starHr[0])
    expect(starHrGrown.map((block) => block.type)).toEqual(['hr', 'heading'])
    const quoteHrSrc = '> ***'
    const quoteHr = parseCheapProseBlocks(quoteHrSrc)
    const quoteHrGrown = continueCheapProseBlocks(quoteHrSrc, quoteHr, `${quoteHrSrc}\n> after`)
    if (quoteHr[0]?.type === 'quote' && quoteHrGrown[0]?.type === 'quote') {
      expect(quoteHrGrown[0].blocks[0]).toBe(quoteHr[0].blocks[0])
      expect(quoteHrGrown[0].blocks.map((block) => block.type)).toEqual(['hr', 'p'])
    }
    const quoteFenceMore = continueCheapProseBlocks(
      `${quoteFence}\n> after`,
      quoteFenceAfter,
      `${quoteFence}\n> after more`
    )
    if (quoteFenceAfter[0]?.type === 'quote' && quoteFenceMore[0]?.type === 'quote') {
      expect(quoteFenceMore[0].blocks[0]).toBe(quoteFenceAfter[0].blocks[0])
      expect(quoteFenceMore[0].blocks[1]).toMatchObject({
        type: 'p',
        nodes: [{ type: 'text', text: 'after more' }]
      })
    }
    const headingSuffix = '- note\n  # title'
    const headingSuffixFirst = parseCheapProseBlocks(headingSuffix)
    const headingSuffixGrown = continueCheapProseBlocks(
      headingSuffix,
      headingSuffixFirst,
      `${headingSuffix}\n  after`
    )
    if (headingSuffixFirst[0]?.type === 'list' && headingSuffixGrown[0]?.type === 'list') {
      expect(headingSuffixGrown[0].items[0]?.nodes).toBe(headingSuffixFirst[0].items[0]?.nodes)
      expect(headingSuffixGrown[0].items[0]?.blocks?.[0]).toBe(headingSuffixFirst[0].items[0]?.blocks?.[0])
      expect(headingSuffixGrown[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const hrSuffix = '- item\n  ***'
    const hrSuffixFirst = parseCheapProseBlocks(hrSuffix)
    const hrSuffixGrown = continueCheapProseBlocks(hrSuffix, hrSuffixFirst, `${hrSuffix}\n  after`)
    if (hrSuffixFirst[0]?.type === 'list' && hrSuffixGrown[0]?.type === 'list') {
      expect(hrSuffixGrown[0].items[0]?.nodes).toBe(hrSuffixFirst[0].items[0]?.nodes)
      expect(hrSuffixGrown[0].items[0]?.blocks?.[0]).toBe(hrSuffixFirst[0].items[0]?.blocks?.[0])
      expect(hrSuffixGrown[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const closedTable = '- note\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |'
    const closedTableFirst = parseCheapProseBlocks(closedTable)
    const closedTableSuffix = continueCheapProseBlocks(
      closedTable,
      closedTableFirst,
      `${closedTable}\n  after`
    )
    if (closedTableFirst[0]?.type === 'list' && closedTableSuffix[0]?.type === 'list') {
      expect(closedTableSuffix[0].items[0]?.nodes).toBe(closedTableFirst[0].items[0]?.nodes)
      expect(closedTableSuffix[0].items[0]?.blocks?.[0]).toBe(closedTableFirst[0].items[0]?.blocks?.[0])
      expect(closedTableSuffix[0].items[0]?.suffix).toEqual([{ type: 'text', text: 'after' }])
    }
    const nestedHeadingSuffix = '- a\n  - b\n    # title'
    const nestedHeadingFirst = parseCheapProseBlocks(nestedHeadingSuffix)
    const nestedHeadingGrown = continueCheapProseBlocks(
      nestedHeadingSuffix,
      nestedHeadingFirst,
      `${nestedHeadingSuffix}\n    after`
    )
    if (nestedHeadingFirst[0]?.type === 'list' && nestedHeadingGrown[0]?.type === 'list') {
      expect(nestedHeadingGrown[0].items[0]?.nodes).toBe(nestedHeadingFirst[0].items[0]?.nodes)
      expect(nestedHeadingGrown[0].items[0]?.nested?.items[0]?.nodes).toBe(
        nestedHeadingFirst[0].items[0]?.nested?.items[0]?.nodes
      )
      expect(nestedHeadingGrown[0].items[0]?.nested?.items[0]?.blocks?.[0]).toBe(
        nestedHeadingFirst[0].items[0]?.nested?.items[0]?.blocks?.[0]
      )
      expect(nestedHeadingGrown[0].items[0]?.nested?.items[0]?.suffix).toEqual([
        { type: 'text', text: 'after' }
      ])
    }
    const headingTableText = '- note\n  # title\n  | A | B |\n  | --- | --- |\n  | 1 | 2'
    const headingTableFirst = parseCheapProseBlocks(headingTableText)
    const headingTableGrown = continueCheapProseBlocks(
      headingTableText,
      headingTableFirst,
      `${headingTableText}0`
    )
    if (headingTableFirst[0]?.type === 'list' && headingTableGrown[0]?.type === 'list') {
      expect(headingTableGrown[0].items[0]?.nodes).toBe(headingTableFirst[0].items[0]?.nodes)
      expect(headingTableGrown[0].items[0]?.blocks?.[0]).toBe(headingTableFirst[0].items[0]?.blocks?.[0])
      const prevTable = headingTableFirst[0].items[0]?.blocks?.[1]
      const nextTable = headingTableGrown[0].items[0]?.blocks?.[1]
      if (prevTable?.type === 'table' && nextTable?.type === 'table') {
        expect(nextTable.header[0]).toBe(prevTable.header[0])
        expect(nextTable.rows[0]?.[1]).toEqual([{ type: 'text', text: '20' }])
      }
    }
    const quoteTableText = '> | A | B |\n> | --- | --- |\n> | 1 | 2'
    const quoteTableFirst = parseCheapProseBlocks(quoteTableText)
    const quoteTableGrown = continueCheapProseBlocks(quoteTableText, quoteTableFirst, `${quoteTableText}0`)
    if (quoteTableFirst[0]?.type === 'quote' && quoteTableGrown[0]?.type === 'quote') {
      const prevTable = quoteTableFirst[0].blocks[0]
      const nextTable = quoteTableGrown[0].blocks[0]
      if (prevTable?.type === 'table' && nextTable?.type === 'table') {
        expect(nextTable.header[0]).toBe(prevTable.header[0])
        expect(nextTable.rows[0]?.[1]).toEqual([{ type: 'text', text: '20' }])
      }
    }
  })

  it('reuses closed inline nodes when the prose tail grows', () => {
    const firstText = '见 `foo` 与 '
    const first = parseCheapInlineMarkdown(firstText)
    expect(shouldGrowCheapInlineText('普通段落', '继续写汉字')).toBe(true)
    expect(shouldGrowCheapInlineText('普通段落', '\n续行')).toBe(true)
    expect(shouldGrowCheapInlineText('普通段落', '\n')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', '\n- 新项')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', '\n# 标题')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', '\n\n下一段')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', 'foo\nbar')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', ' **粗**')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', '*粗')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', '`code')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', '[文档]')).toBe(false)
    expect(shouldGrowCheapInlineText('普通段落', 'https://a.test')).toBe(false)
    expect(shouldGrowCheapInlineText('半截 **', '粗')).toBe(false)
    expect(shouldGrowCheapInlineText('见 http', 's://a.test')).toBe(false)
    const plain = parseCheapInlineMarkdown('普通段落开始写')
    const plainGrown = continueCheapInlineMarkdown(
      '普通段落开始写',
      plain,
      '普通段落开始写更多汉字'
    )
    expect(plainGrown).toEqual([{ type: 'text', text: '普通段落开始写更多汉字' }])
    const afterCode = parseCheapInlineMarkdown('见 `foo` 然后')
    const afterCodeGrown = continueCheapInlineMarkdown(
      '见 `foo` 然后',
      afterCode,
      '见 `foo` 然后继续'
    )
    expect(afterCodeGrown[0]).toBe(afterCode[0])
    expect(afterCodeGrown[1]).toBe(afterCode[1])
    expect(afterCodeGrown[2]).toEqual({ type: 'text', text: ' 然后继续' })
    const afterCodeKeys = cheapInlineNodeKeys(afterCodeGrown)
    const afterCodeGrown2 = continueCheapInlineMarkdown(
      '见 `foo` 然后继续',
      afterCodeGrown,
      '见 `foo` 然后继续写'
    )
    expect(afterCodeGrown2[0]).toBe(afterCode[0])
    expect(afterCodeGrown2[1]).toBe(afterCode[1])
    expect(cheapInlineNodeKeys(afterCodeGrown2)).toBe(afterCodeKeys)
    const star = parseCheapInlineMarkdown('普通')
    const starGrown = continueCheapInlineMarkdown('普通', star, '普通*粗*')
    expect(starGrown.map((n) => n.type)).toEqual(['text', 'em'])
    const tick = parseCheapInlineMarkdown('见 ')
    const tickGrown = continueCheapInlineMarkdown('见 ', tick, '见 `foo`')
    expect(tickGrown.map((n) => n.type)).toEqual(['text', 'code'])
    const bracket = parseCheapInlineMarkdown('见 ')
    const bracketGrown = continueCheapInlineMarkdown('见 ', bracket, '见 [文档](https://a.test/x)')
    expect(bracketGrown.map((n) => n.type)).toEqual(['text', 'link'])
    const auto = parseCheapInlineMarkdown('见 ')
    const autoGrown = continueCheapInlineMarkdown('见 ', auto, '见 https://a.test')
    expect(autoGrown.some((n) => n.type === 'link')).toBe(true)
    const grown = continueCheapInlineMarkdown(firstText, first, '见 `foo` 与 **bar**')
    expect(grown[0]).toBe(first[0])
    expect(grown[1]).toBe(first[1])
    expect(grown.map((n) => n.type)).toEqual(['text', 'code', 'text', 'strong'])
    const firstKeys = cheapInlineNodeKeys(first)
    const grownKeys = cheapInlineNodeKeys(grown)
    expect(grownKeys[0]).toBe(firstKeys[0])
    expect(grownKeys[1]).toBe(firstKeys[1])
    expect(grownKeys[2]).toBe(firstKeys[2])
    expect(grownKeys[3]).not.toBe(grownKeys[2])
    const imgFirst = '见图 ![示意](https://a.test/p.png) 与 '
    const imgNodes = parseCheapInlineMarkdown(imgFirst)
    const imgGrown = continueCheapInlineMarkdown(imgFirst, imgNodes, `${imgFirst}**bar**`)
    expect(imgGrown[0]).toBe(imgNodes[0])
    expect(imgGrown[1]).toBe(imgNodes[1])
    expect(imgGrown.map((n) => n.type)).toEqual(['text', 'image', 'text', 'strong'])
    const openLink = '见 [文档](https://a'
    const openNodes = parseCheapInlineMarkdown(openLink)
    expect(openNodes.map((n) => n.type)).toEqual(['text', 'link'])
    const closedLink = continueCheapInlineMarkdown(openLink, openNodes, '见 [文档](https://a.test/x)')
    expect(closedLink[0]).toBe(openNodes[0])
    expect(closedLink.map((n) => n.type)).toEqual(['text', 'link'])
    expect(closedLink[1]).toMatchObject({ type: 'link', href: 'https://a.test/x', text: '文档' })
    const openStrong = '半截 **粗'
    const openStrongNodes = parseCheapInlineMarkdown(openStrong)
    const closedStrong = continueCheapInlineMarkdown(openStrong, openStrongNodes, '半截 **粗体**')
    expect(closedStrong[0]).toBe(openStrongNodes[0])
    expect(closedStrong.map((n) => n.type)).toEqual(['text', 'strong'])
    expect(closedStrong[1]).toMatchObject({ type: 'strong', text: '粗体' })
    expect('raw' in (closedStrong[1] ?? {}) ? (closedStrong[1] as { raw?: string }).raw : undefined).toBeUndefined()
    const openCode = '见 `fo'
    const openCodeNodes = parseCheapInlineMarkdown(openCode)
    const closedCode = continueCheapInlineMarkdown(openCode, openCodeNodes, '见 `foo`')
    expect(closedCode[0]).toBe(openCodeNodes[0])
    expect(closedCode.map((n) => n.type)).toEqual(['text', 'code'])
    expect(closedCode[1]).toMatchObject({ type: 'code', text: 'foo' })
    const openAuto = '见 <https://a'
    const openAutoNodes = parseCheapInlineMarkdown(openAuto)
    const closedAuto = continueCheapInlineMarkdown(openAuto, openAutoNodes, '见 <https://a.test/x>')
    expect(closedAuto[0]).toBe(openAutoNodes[0])
    expect(closedAuto.map((n) => n.type)).toEqual(['text', 'link'])
    expect(closedAuto[1]).toMatchObject({
      type: 'link',
      text: 'https://a.test/x',
      href: 'https://a.test/x'
    })
  })

  it('reuses closed blocks when only the tail grows', () => {
    expect(shouldGrowOpenStreamingProseTail('普通段落', '继续写汉字')).toBe(true)
    expect(shouldGrowOpenStreamingProseTail('普通段落', '\n\n下一段')).toBe(false)
    expect(shouldGrowOpenStreamingProseTail('``', '`ts')).toBe(false)
    expect(shouldGrowOpenStreamingFenceTail('```js\n1', '2')).toBe(true)
    expect(shouldGrowOpenStreamingFenceTail('```js\n1', '\n2')).toBe(true)
    expect(shouldGrowOpenStreamingFenceTail('```js\n1', '\n```')).toBe(false)
    expect(shouldGrowOpenStreamingFenceTail('```js\n``', '`')).toBe(false)
    const openTail = splitStreamingMarkdown('普通段落开始写')
    expect(openTail.closedEnd).toBe(0)
    expect(openTail.blocks).toEqual([])
    const openGrown = continueStreamingMarkdown(
      openTail,
      '普通段落开始写',
      '普通段落开始写更多汉字'
    )
    expect(openGrown.blocks).toBe(openTail.blocks)
    expect(openGrown.closedEnd).toBe(0)
    expect(openGrown.tail).toBe('普通段落开始写更多汉字')
    expect(openGrown.tailKind).toBe('prose')
    const openSlots = streamingRenderSlots(openTail)
    const openGrownSlots = continueStreamingRenderSlots(openSlots, openGrown, openTail)
    expect(openGrownSlots).toHaveLength(1)
    expect(openGrownSlots[0]).toMatchObject({
      kind: 'prose',
      key: 'prose-run-0',
      text: '普通段落开始写更多汉字',
      closed: false
    })
    const openFence = continueStreamingMarkdown(openTail, '普通段落开始写', '```ts')
    expect(openFence.tailKind).toBe('fence')
    const openClosed = continueStreamingMarkdown(
      openGrown,
      '普通段落开始写更多汉字',
      '普通段落开始写更多汉字\n\n下一段'
    )
    expect(openClosed.blocks).toHaveLength(1)
    expect(openClosed.tail).toBe('下一段')
    const first = splitStreamingMarkdown('Hello world.\n\nNext')
    expect(first.closedEnd).toBe('Hello world.\n\n'.length)
    const grown = continueStreamingMarkdown(first, 'Hello world.\n\nNext', 'Hello world.\n\nNext sentence')
    expect(grown.blocks[0]).toBe(first.blocks[0])
    expect(grown.blocks).toBe(first.blocks)
    expect(grown.tail).toBe('Next sentence')
    expect(grown.closedEnd).toBe(first.closedEnd)
    expect(streamingRenderSlots(first).map((slot) => slot.key)).toEqual(['prose-md-0', 'prose-run-0'])
    expect(streamingRenderSlots(grown).map((slot) => slot.key)).toEqual(['prose-md-0', 'prose-run-0'])
    const firstSlots = streamingRenderSlots(first)
    const grownSlots = continueStreamingRenderSlots(firstSlots, grown, first)
    expect(grownSlots).not.toBe(firstSlots)
    expect(grownSlots[0]).toBe(firstSlots[0])
    expect(grownSlots[1]).not.toBe(firstSlots[1])
    const fenceMid = splitStreamingMarkdown('Intro\n\n```js\n1')
    const fenceGrown = continueStreamingMarkdown(
      fenceMid,
      'Intro\n\n```js\n1',
      'Intro\n\n```js\n12\nmore'
    )
    expect(fenceGrown.blocks).toBe(fenceMid.blocks)
    expect(fenceGrown.tailKind).toBe('fence')
    expect(fenceGrown.tail).toBe('```js\n12\nmore')
    expect(fenceGrown.closedEnd).toBe(fenceMid.closedEnd)
    const fenceDone = continueStreamingMarkdown(
      fenceMid,
      'Intro\n\n```js\n1',
      'Intro\n\n```js\n1\n```\n\nB'
    )
    const midSlots = streamingRenderSlots(fenceMid)
    const doneSlots = continueStreamingRenderSlots(midSlots, fenceDone)
    expect(doneSlots[0]).toBe(midSlots[0])
    expect(doneSlots.map((slot) => `${slot.kind}:${slot.key}`)).toEqual([
      'prose:prose-md-0',
      'fence:live-fence-0',
      'prose:prose-run-0'
    ])
    const sameDone = continueStreamingRenderSlots(doneSlots, fenceDone)
    expect(sameDone).toBe(doneSlots)
    const tableHead = 'Intro\n\n| Key | Value |\n'
    const tableHeadSplit = splitStreamingMarkdown(tableHead)
    expect(streamingRenderSlots(tableHeadSplit).map((slot) => slot.key)).toEqual([
      'prose-md-0',
      'prose-run-0'
    ])
    const tableSep = continueStreamingMarkdown(tableHeadSplit, tableHead, `${tableHead}| --- | --- |\n`)
    const tableRow = continueStreamingMarkdown(
      tableSep,
      `${tableHead}| --- | --- |\n`,
      `${tableHead}| --- | --- |\n| alpha | beta |\n`
    )
    const tableHeadSlots = streamingRenderSlots(tableHeadSplit)
    const tableRowSlots = continueStreamingRenderSlots(
      continueStreamingRenderSlots(tableHeadSlots, tableSep),
      tableRow
    )
    expect(tableRowSlots.map((slot) => slot.key)).toEqual(['prose-md-0', 'prose-run-0'])
    expect(tableRowSlots[0]).toBe(tableHeadSlots[0])
    expect(tableRow.tail).toContain('| alpha | beta |')

    const committed = continueStreamingMarkdown(
      grown,
      'Hello world.\n\nNext sentence',
      'Hello world.\n\nNext sentence\n\nMore'
    )
    expect(committed.blocks[0]).toBe(first.blocks[0])
    expect(committed.blocks).toHaveLength(2)
    expect(committed.blocks[1]?.text).toBe('Next sentence\n')
    expect(committed.tail).toBe('More')

    const finalized = finalizeStreamingMarkdownSplit(grown)
    expect(finalized.blocks[0]).toBe(grown.blocks[0])
    expect(finalized.tail).toBe('')
    expect(finalized.blocks.at(-1)).toEqual({
      id: 'md-final-1',
      text: 'Next sentence'
    })
    expect(finalizeStreamingMarkdownSplit(grown)).not.toBe(grown)
    const closedMermaid = splitStreamingMarkdown('Intro\n\n```mermaid\ngraph TD\nA-->B\n```\n')
    expect(finalizeStreamingMarkdownSplit(closedMermaid)).toBe(closedMermaid)
    expect(finalizeStreamingMarkdownSplit(closedMermaid).blocks[1]?.text).toContain('```mermaid')
  })

  it('falls back to a full split when the prefix changes', () => {
    const first = splitStreamingMarkdown('Hello world.\n\nNext')
    const edited = continueStreamingMarkdown(first, 'Hello world.\n\nNext', 'Changed.\n\nNext')
    expect(edited.blocks[0]).not.toBe(first.blocks[0])
    expect(edited.blocks[0]?.text).toBe('Changed.\n')
  })
})

describe('streaming markdown remount holds', () => {
  afterEach(() => {
    clearStreamingMarkdownHolds()
    clearCheapProseHolds()
  })

  it('seeds the same committed split and closed prose blocks on remount', () => {
    expect(shouldRememberStreamingMarkdownHold({ streaming: true })).toBe(false)
    expect(shouldRememberStreamingMarkdownHold({ streaming: false })).toBe(true)
    expect(shouldRememberCheapProseHold({ closed: false })).toBe(false)
    expect(shouldRememberCheapProseHold({ closed: true })).toBe(true)

    const text = 'Hello world.\n\nNext sentence'
    const split = splitStreamingMarkdown(text)
    const slots = streamingRenderSlots(split)
    const defs = nextLinkDefinitions(null, text)
    const stored = writeStreamingMarkdownHold({ text, split, slots, defs })
    const seeded = seedStreamingMarkdownHold(text)
    expect(seeded.split).toBe(stored.split)
    expect(seeded.slots).toBe(stored.slots)
    expect(seeded.defs).toBe(stored.defs)
    expect(continueStreamingMarkdown(seeded.split, seeded.text, text)).toBe(seeded.split)
    expect(continueStreamingRenderSlots(seeded.slots, seeded.split)).toBe(seeded.slots)
    expect(nextLinkDefinitions(seeded.defs, text)).toBe(seeded.defs)
    expect(writeStreamingMarkdownHold({ text: '', split, slots, defs: null }).text).toBe('')
    expect(seedStreamingMarkdownHold('')).toEqual(seedStreamingMarkdownHold('missing'))

    const blocks = parseCheapProseBlocks('Hello **world**')
    expect(writeCheapProseHold('Hello **world**', blocks)).toBe(blocks)
    expect(seedCheapProseHold('Hello **world**').blocks).toBe(blocks)
    expect(continueCheapProseBlocks('Hello **world**', blocks, 'Hello **world**')).toBe(blocks)
    expect(writeCheapProseHold('', blocks)).toBe(blocks)
    expect(seedCheapProseHold('').blocks).toEqual(parseCheapProseBlocks(''))

    for (let i = 0; i < STREAMING_MARKDOWN_HOLD_LIMIT + 1; i++) {
      writeStreamingMarkdownHold({
        text: `hold-${i}`,
        split,
        slots,
        defs
      })
    }
    expect(seedStreamingMarkdownHold(text).split).not.toBe(stored.split)

    const firstProse = parseCheapProseBlocks('keep')
    writeCheapProseHold('keep', firstProse)
    for (let i = 0; i < CHEAP_PROSE_HOLD_LIMIT; i++) {
      writeCheapProseHold(`prose-${i}`, parseCheapProseBlocks(`p${i}`))
    }
    expect(seedCheapProseHold('keep').blocks).not.toBe(firstProse)

    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/StreamingMarkdown.tsx'),
      'utf8'
    )
    expect(src).toContain('seedStreamingMarkdownHold')
    expect(src).toContain('writeStreamingMarkdownHold')
    expect(src).toContain('shouldRememberStreamingMarkdownHold')
    expect(src).toContain('seedCheapProseHold')
    expect(src).toContain('writeCheapProseHold')
    expect(src.includes('live-stream-slices')).toBe(false)
    const mdSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'streaming-markdown.ts'),
      'utf8'
    )
    expect(mdSrc).toContain("if (!src.includes('\\r')) return src")
    expect(mdSrc).toContain("prev.blob === '' && !raw.includes(']:')")
    expect(mdSrc).toContain('shouldGrowCheapInlineText')
    expect(mdSrc).toContain('shouldGrowOpenStreamingProseTail')
    expect(mdSrc).toContain('shouldGrowOpenStreamingFenceTail')
    expect(mdSrc).toContain('shouldGrowLastListItemInline')
    expect(mdSrc).toContain('shouldAppendStreamingListItem')
    expect(mdSrc).toContain('shouldAppendStreamingNestedListItem')
    expect(mdSrc).toContain('paragraphSuffixNewLines')
    expect(mdSrc).toContain('quoteSuffixStaysInside')
    expect(mdSrc).toContain('stripQuoteSuffix')
    expect(mdSrc).toContain('shouldGrowStreamingTableLastLine')
    expect(mdSrc).toContain('shouldGrowStreamingIndentCodeLastLine')
    expect(mdSrc).toContain('shouldGrowStreamingFencedPreLastLine')
    expect(mdSrc).toContain('lastMatchingListLineStart')
    expect(mdSrc).toContain("text.lastIndexOf('\\n', end - 1)")
    expect(mdSrc).toContain('lastCheapBlockStartHold')
    expect(mdSrc).toContain('rememberLastCheapBlockStart')
    expect(mdSrc).toContain('lineCouldStartLastBlock')
    expect(mdSrc).toContain('cheapInlineStablePrefix')
    expect(mdSrc).toContain('cheapInlineStableHold')
    expect(mdSrc).toContain("nextText.indexOf('\\n\\n', Math.max(0, prevNorm.length - 1))")
    expect(mdSrc).toContain('split.blocks === prevSplit.blocks')
    expect(src).toContain('continueStreamingRenderSlots(prevRef.current.slots, nextSplit, prevSplit)')
  })
})
