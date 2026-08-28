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
    expect(parseCheapProseBlocks('<!-- comment -->').map((b) => b.type)).toEqual([])
    expect(parseCheapProseBlocks('foo <!-- x --> bar')).toEqual([
      { type: 'p', nodes: [{ type: 'text', text: 'foo  bar' }] }
    ])
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
