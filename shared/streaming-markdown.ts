/**
 * 流式 Markdown 拆分：已闭合块保持稳定，只重解析未完成尾部。
 * CRLF 按 LF 拆；散文尾廉价解析含闭合链接、`<https>`、裸 URL、文件引用、标题/列表（含缩进嵌套与续行）/任务项/表格/分隔线。
 * @see shared/ARCH.md
 */
import { matchFileCitationAt, parseFileCitation } from './file-citation'

/** 已闭合、可用稳定 key 渲染的 Markdown 块 */
export type StreamingMarkdownBlock = {
  id: string
  text: string
}

/** 围栏未闭合时的尾部信息 */
export type StreamingMarkdownTailKind = 'prose' | 'fence'

/** 拆分结果：稳定块 + 正在增长的尾部 */
export type StreamingMarkdownSplit = {
  blocks: StreamingMarkdownBlock[]
  tail: string
  tailKind: StreamingMarkdownTailKind
  tailLang?: string
  /** 已闭合前缀在原文中的结束下标；后续增量只解析 slice(closedEnd) */
  closedEnd: number
}

const EMPTY_SPLIT: StreamingMarkdownSplit = {
  blocks: [],
  tail: '',
  tailKind: 'prose',
  closedEnd: 0
}

const FENCE_RE = /^(```|~~~)(.*)$/

/** 对标 Codex 0.150：CRLF 粘贴按 LF 拆，避免围栏/段落对不齐 */
export function normalizeStreamingText(text: string): string {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 把流式文本拆成不会再变的块，与仍在增长的尾部。
 * 尾部是未闭合围栏，或最后一个尚未空行收束的段落。
 */
export function splitStreamingMarkdown(text: string): StreamingMarkdownSplit {
  const src = normalizeStreamingText(text)
  if (!src) return EMPTY_SPLIT

  const lines = src.split('\n')
  const blocks: StreamingMarkdownBlock[] = []
  let current: string[] = []
  let inFence = false
  let fenceLang: string | undefined
  let blockIndex = 0
  let offset = 0
  let closedEnd = 0

  const flushBlock = (endOffset: number) => {
    const chunk = current.join('\n')
    current = []
    if (!chunk) return
    blocks.push({ id: `md-${blockIndex++}`, text: chunk })
    closedEnd = endOffset
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineEnd = offset + line.length + (i < lines.length - 1 ? 1 : 0)
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      if (!inFence) {
        if (current.length > 0) flushBlock(offset)
        inFence = true
        fenceLang = fenceMatch[2].trim().split(/\s+/)[0] || undefined
        current.push(line)
      } else {
        current.push(line)
        inFence = false
        fenceLang = undefined
        flushBlock(lineEnd)
      }
      offset = lineEnd
      continue
    }

    if (inFence) {
      current.push(line)
      offset = lineEnd
      continue
    }

    if (line.trim() === '') {
      if (current.length > 0) {
        current.push(line)
        flushBlock(lineEnd)
      }
      offset = lineEnd
      continue
    }
    current.push(line)
    offset = lineEnd
  }

  return {
    blocks,
    tail: current.join('\n'),
    tailKind: inFence ? 'fence' : 'prose',
    tailLang: inFence ? fenceLang : undefined,
    closedEnd
  }
}

/**
 * 直播增量拆分：已闭合块复用同一对象，只重扫新增后缀。
 * 文本缩短或前缀对不上时回退全量拆分。
 */
export function continueStreamingMarkdown(
  prev: StreamingMarkdownSplit | null | undefined,
  prevText: string,
  text: string
): StreamingMarkdownSplit {
  const nextText = normalizeStreamingText(text)
  const prevNorm = normalizeStreamingText(prevText)
  if (!nextText) return EMPTY_SPLIT
  if (prev && nextText === prevNorm) return prev
  const closedEnd = prev?.closedEnd ?? 0
  if (!prev || closedEnd <= 0 || !nextText.startsWith(prevNorm.slice(0, closedEnd))) {
    return splitStreamingMarkdown(nextText)
  }
  const rest = nextText.slice(closedEnd)
  const restSplit = splitStreamingMarkdown(rest)
  if (restSplit.blocks.length === 0) {
    if (
      restSplit.tail === prev.tail &&
      restSplit.tailKind === prev.tailKind &&
      restSplit.tailLang === prev.tailLang
    ) {
      return prev
    }
    return {
      blocks: prev.blocks,
      tail: restSplit.tail,
      tailKind: restSplit.tailKind,
      tailLang: restSplit.tailLang,
      closedEnd
    }
  }
  const start = prev.blocks.length
  return {
    blocks: [
      ...prev.blocks,
      ...restSplit.blocks.map((block, i) => ({ id: `md-${start + i}`, text: block.text }))
    ],
    tail: restSplit.tail,
    tailKind: restSplit.tailKind,
    tailLang: restSplit.tailLang,
    closedEnd: closedEnd + restSplit.closedEnd
  }
}

/** 未闭合围栏去掉起始 ```lang 行，供代码块直播展示 */
export function extractOpenFenceBody(tail: string): string {
  const nl = tail.indexOf('\n')
  return nl === -1 ? '' : tail.slice(nl + 1)
}

/** 直播散文尾：廉价行内节点，避免每 token 跑 remark */
export type CheapInlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'del'; text: string }
  | { type: 'em'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'image'; alt: string; href: string }
  | { type: 'file'; text: string; path: string; line?: number; column?: number }

/** 直播列表项：可挂一层或多层嵌套列表，收束时少跳 */
export type CheapListItem = {
  nodes: CheapInlineNode[]
  nested?: { ordered: boolean; indent: number; items: CheapListItem[] }
}

/** 直播散文尾的廉价块：标题 / 列表 / 引用 / 表格 / 分隔线 / 段落，避免一律 `<p>` 收束时跳一下 */
export type CheapProseBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; nodes: CheapInlineNode[] }
  | { type: 'list'; ordered: boolean; items: CheapListItem[] }
  | { type: 'quote'; nodes: CheapInlineNode[] }
  | { type: 'table'; header: CheapInlineNode[][]; rows: CheapInlineNode[][][] }
  | { type: 'hr' }
  | { type: 'p'; nodes: CheapInlineNode[] }

const BARE_URL_RE = /^https?:\/\/[^\s<>]+/i

/** 去掉裸链接尾部标点，避免句号/括号被吃进 href */
function trimBareUrl(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/, '')
}

/**
 * 只认成对的 `code` / **bold** / *italic*、闭合 `[text](url)` / `![alt](url)`、裸 http(s) 与文件引用。
 * 未闭合标记留在原文，避免直播时闪烁。
 */
export function parseCheapInlineMarkdown(text: string): CheapInlineNode[] {
  const src = normalizeStreamingText(text)
  if (!src) return []
  const nodes: CheapInlineNode[] = []
  let i = 0
  let buf = ''
  const flush = () => {
    if (!buf) return
    nodes.push({ type: 'text', text: buf })
    buf = ''
  }
  while (i < src.length) {
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1)
      if (end === -1) {
        buf += src.slice(i)
        break
      }
      flush()
      const code = src.slice(i + 1, end)
      const file = parseFileCitation(code)
      if (file) nodes.push({ type: 'file', text: code, path: file.path, line: file.line, column: file.column })
      else nodes.push({ type: 'code', text: code })
      i = end + 1
      continue
    }
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2)
      if (end === -1) {
        buf += src.slice(i)
        break
      }
      flush()
      nodes.push({ type: 'strong', text: src.slice(i + 2, end) })
      i = end + 2
      continue
    }
    if (src.startsWith('~~', i)) {
      const end = src.indexOf('~~', i + 2)
      if (end === -1) {
        buf += src.slice(i)
        break
      }
      flush()
      nodes.push({ type: 'del', text: src.slice(i + 2, end) })
      i = end + 2
      continue
    }
    if (src[i] === '*') {
      const end = src.indexOf('*', i + 1)
      if (end === -1) {
        buf += src.slice(i)
        break
      }
      flush()
      nodes.push({ type: 'em', text: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (src[i] === '<' && /^https?:\/\//i.test(src.slice(i + 1, i + 9))) {
      const end = src.indexOf('>', i + 1)
      if (end !== -1) {
        const href = src.slice(i + 1, end).trim()
        if (/^https?:\/\/\S+$/i.test(href)) {
          flush()
          nodes.push({ type: 'link', text: href, href })
          i = end + 1
          continue
        }
      }
    }
    if (src.startsWith('![', i) || src[i] === '[') {
      const image = src.startsWith('![', i)
      const labelStart = i + (image ? 2 : 1)
      const mid = src.indexOf('](', labelStart)
      if (mid === -1) {
        buf += src.slice(i)
        break
      }
      const label = src.slice(labelStart, mid)
      if (!label.includes('\n')) {
        const urlEnd = src.indexOf(')', mid + 2)
        if (urlEnd === -1) {
          buf += src.slice(i)
          break
        }
        const href = src.slice(mid + 2, urlEnd).trim()
        if (image && /^https?:\/\//i.test(href)) {
          flush()
          nodes.push({ type: 'image', alt: label, href })
          i = urlEnd + 1
          continue
        }
        if (!image && /^https?:\/\//i.test(href)) {
          flush()
          nodes.push({ type: 'link', text: label, href })
          i = urlEnd + 1
          continue
        }
        if (!image) {
          const file = parseFileCitation(href)
          if (file) {
            flush()
            nodes.push({ type: 'file', text: label, path: file.path, line: file.line, column: file.column })
            i = urlEnd + 1
            continue
          }
        }
      }
    }
    const fileHit = matchFileCitationAt(src, i)
    if (fileHit) {
      flush()
      nodes.push({
        type: 'file',
        text: fileHit.text,
        path: fileHit.citation.path,
        line: fileHit.citation.line,
        column: fileHit.citation.column
      })
      i = fileHit.end
      continue
    }
    const urlMatch = BARE_URL_RE.exec(src.slice(i))
    if (urlMatch) {
      const href = trimBareUrl(urlMatch[0])
      if (href.length > 'http://a'.length) {
        flush()
        nodes.push({ type: 'link', text: href, href })
        i += href.length
        continue
      }
    }
    buf += src[i]
    i += 1
  }
  flush()
  return nodes
}

function cheapInlineSource(node: CheapInlineNode): string {
  if (node.type === 'code') return `\`${node.text}\``
  if (node.type === 'strong') return `**${node.text}**`
  if (node.type === 'del') return `~~${node.text}~~`
  if (node.type === 'em') return `*${node.text}*`
  if (node.type === 'link') {
    return node.text === node.href ? node.href : `[${node.text}](${node.href})`
  }
  if (node.type === 'image') {
    return `![${node.alt}](${node.href})`
  }
  if (node.type === 'file') {
    return node.text
  }
  return node.text
}

function cheapInlineSourceAll(nodes: CheapInlineNode[]): string {
  return nodes.map(cheapInlineSource).join('')
}

/**
 * 直播散文尾增量解析：复用已闭合的行内节点，只重扫最后一段增长文本。
 */
export function continueCheapInlineMarkdown(
  prevText: string,
  prevNodes: CheapInlineNode[],
  text: string
): CheapInlineNode[] {
  const nextText = normalizeStreamingText(text)
  const prevNorm = normalizeStreamingText(prevText)
  if (!nextText) return []
  if (nextText === prevNorm && prevNodes.length) return prevNodes
  if (!prevNodes.length) return parseCheapInlineMarkdown(nextText)
  const stable = prevNodes.slice(0, -1)
  const prefix = cheapInlineSourceAll(stable)
  if (!nextText.startsWith(prefix)) return parseCheapInlineMarkdown(nextText)
  const rest = parseCheapInlineMarkdown(nextText.slice(prefix.length))
  return stable.length ? [...stable, ...rest] : rest
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const LIST_LINE_RE = /^(\s*)(?:[-+]|\*|\d+\.)\s+(.*)$/

/** 行首空白：tab 按 2 空格算，用来判断列表嵌套 */
function leadingIndent(line: string): number {
  let n = 0
  for (const ch of line) {
    if (ch === ' ') n += 1
    else if (ch === '\t') n += 2
    else break
  }
  return n
}

/** 解析列表行：缩进 + 有序/无序 + 正文 */
function parseListLine(line: string): { indent: number; ordered: boolean; text: string } | null {
  if (!LIST_LINE_RE.test(line)) return null
  const indent = leadingIndent(line)
  const rest = line.trimStart()
  const ul = /^[-+]\s+(.*)$/.exec(rest) || /^\*\s+(.*)$/.exec(rest)
  if (ul) return { indent, ordered: false, text: ul[1] ?? '' }
  const ol = /^(\d+)\.\s+(.*)$/.exec(rest)
  if (!ol) return null
  return { indent, ordered: true, text: ol[2] ?? '' }
}

/** 把更缩进的列表项挂到当前项的嵌套列表 */
function appendNestedListItem(item: CheapListItem, ordered: boolean, indent: number, text: string): void {
  if (!item.nested) {
    item.nested = { ordered, indent, items: [] }
  } else if (indent > item.nested.indent && item.nested.items.length) {
    appendNestedListItem(item.nested.items[item.nested.items.length - 1]!, ordered, indent, text)
    return
  } else if (item.nested.ordered !== ordered && indent <= item.nested.indent) {
    item.nested = { ordered, indent, items: [] }
  }
  item.nested.items.push({ nodes: parseCheapInlineMarkdown(text) })
}

/** 列表项续行：缩进或 CommonMark lazy continuation，避免收束时从段落跳回 li */
function appendListContinuation(item: CheapListItem, indent: number, text: string): void {
  if (item.nested && indent > item.nested.indent && item.nested.items.length) {
    appendListContinuation(item.nested.items[item.nested.items.length - 1]!, indent, text)
    return
  }
  item.nodes = [...item.nodes, { type: 'text', text: `\n${text}` }]
}

const QUOTE_RE = /^>\s?(.*)$/
const HR_RE = /^(?:[-*_]){3,}\s*$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/

function isGfmTableSep(line: string): boolean {
  return TABLE_SEP_RE.test(line)
}

function isGfmTableRow(line: string): boolean {
  return TABLE_ROW_RE.test(line) || isGfmTableSep(line)
}

function splitGfmTableCells(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map((cell) => cell.trim())
}

/** 把散文尾拆成标题 / 列表 / 引用 / 段落，直播时用对应标签减少收束跳动 */
export function parseCheapProseBlocks(text: string): CheapProseBlock[] {
  const src = normalizeStreamingText(text)
  if (!src) return []
  const lines = src.split('\n')
  const blocks: CheapProseBlock[] = []
  let para: string[] = []
  let list: { ordered: boolean; indent: number; items: CheapListItem[]; afterBlank: boolean } | null =
    null
  let quote: string[] = []
  let table: string[] | null = null

  const flushPara = () => {
    if (!para.length) return
    blocks.push({ type: 'p', nodes: parseCheapInlineMarkdown(para.join('\n')) })
    para = []
  }
  const flushList = () => {
    if (!list) return
    blocks.push({
      type: 'list',
      ordered: list.ordered,
      items: list.items
    })
    list = null
  }
  const flushQuote = () => {
    if (!quote.length) return
    blocks.push({ type: 'quote', nodes: parseCheapInlineMarkdown(quote.join('\n')) })
    quote = []
  }
  const flushTable = () => {
    if (!table) return
    const raw = table
    table = null
    const sepIdx = raw.findIndex(isGfmTableSep)
    if (sepIdx <= 0) {
      for (const line of raw) {
        if (!isGfmTableSep(line)) para.push(line)
      }
      flushPara()
      return
    }
    for (const line of raw.slice(0, sepIdx - 1)) {
      if (!isGfmTableSep(line)) {
        blocks.push({ type: 'p', nodes: parseCheapInlineMarkdown(line) })
      }
    }
    const header = splitGfmTableCells(raw[sepIdx - 1] ?? '').map((cell) =>
      parseCheapInlineMarkdown(cell)
    )
    const rows = raw
      .slice(sepIdx + 1)
      .filter((line) => !isGfmTableSep(line))
      .map((line) => splitGfmTableCells(line).map((cell) => parseCheapInlineMarkdown(cell)))
    blocks.push({ type: 'table', header, rows })
  }
  const flushAll = () => {
    flushTable()
    flushPara()
    flushList()
    flushQuote()
  }

  for (const line of lines) {
    if (isGfmTableRow(line)) {
      flushPara()
      flushList()
      flushQuote()
      if (!table) table = []
      table.push(line)
      continue
    }
    if (HR_RE.test(line)) {
      flushAll()
      blocks.push({ type: 'hr' })
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushAll()
      const level = Math.min(6, heading[1].length) as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ type: 'heading', level, nodes: parseCheapInlineMarkdown(heading[2]) })
      continue
    }
    const listLine = parseListLine(line)
    if (listLine) {
      flushTable()
      flushPara()
      flushQuote()
      if (list && listLine.indent > list.indent && list.items.length) {
        appendNestedListItem(
          list.items[list.items.length - 1]!,
          listLine.ordered,
          listLine.indent,
          listLine.text
        )
        list.afterBlank = false
        continue
      }
      if (!list || list.ordered !== listLine.ordered || listLine.indent < list.indent) {
        flushList()
        list = { ordered: listLine.ordered, indent: listLine.indent, items: [], afterBlank: false }
      }
      list.items.push({ nodes: parseCheapInlineMarkdown(listLine.text) })
      list.afterBlank = false
      continue
    }
    if (
      list &&
      list.items.length &&
      line.trim() !== '' &&
      !QUOTE_RE.test(line) &&
      !FENCE_RE.test(line) &&
      (!list.afterBlank || leadingIndent(line) > list.indent)
    ) {
      appendListContinuation(list.items[list.items.length - 1]!, leadingIndent(line), line.trimStart())
      list.afterBlank = false
      continue
    }
    const q = QUOTE_RE.exec(line)
    if (q) {
      flushTable()
      flushPara()
      flushList()
      quote.push(q[1])
      continue
    }
    if (line.trim() === '') {
      flushTable()
      flushPara()
      flushQuote()
      if (list) list.afterBlank = true
      else flushList()
      continue
    }
    flushTable()
    flushList()
    flushQuote()
    para.push(line)
  }
  flushAll()
  return blocks
}

function reuseInlineNodes(prev: CheapInlineNode[], next: CheapInlineNode[]): CheapInlineNode[] {
  const prevSrc = cheapInlineSourceAll(prev)
  const nextSrc = cheapInlineSourceAll(next)
  if (prevSrc === nextSrc) return prev
  if (nextSrc.startsWith(prevSrc)) return continueCheapInlineMarkdown(prevSrc, prev, nextSrc)
  return next
}

function reuseInlineLists(prev: CheapInlineNode[][], next: CheapInlineNode[][]): CheapInlineNode[][] {
  const out: CheapInlineNode[][] = []
  const shared = Math.min(prev.length, next.length)
  for (let i = 0; i < shared; i++) out.push(reuseInlineNodes(prev[i]!, next[i]!))
  if (next.length > prev.length) out.push(...next.slice(prev.length))
  return out
}

/** 复用已闭合列表项（含嵌套），只重扫增长项 */
function reuseListItems(prev: CheapListItem[], next: CheapListItem[]): CheapListItem[] {
  const out: CheapListItem[] = []
  const shared = Math.min(prev.length, next.length)
  for (let i = 0; i < shared; i++) {
    const prevItem = prev[i]!
    const nextItem = next[i]!
    const nodes = reuseInlineNodes(prevItem.nodes, nextItem.nodes)
    let nested = nextItem.nested
    if (prevItem.nested && nextItem.nested && prevItem.nested.ordered === nextItem.nested.ordered) {
      const nestedItems = reuseListItems(prevItem.nested.items, nextItem.nested.items)
      const nestedSame =
        nestedItems.length === prevItem.nested.items.length &&
        nestedItems.every((item, index) => item === prevItem.nested!.items[index])
      nested = nestedSame
        ? prevItem.nested
        : { ordered: nextItem.nested.ordered, indent: nextItem.nested.indent, items: nestedItems }
    }
    if (nodes === prevItem.nodes && nested === prevItem.nested) out.push(prevItem)
    else out.push({ nodes, nested })
  }
  if (next.length > prev.length) out.push(...next.slice(prev.length))
  return out
}

function reuseCheapProseBlock(prev: CheapProseBlock, next: CheapProseBlock): CheapProseBlock | null {
  if (prev.type !== next.type) return null
  if (prev.type === 'hr' && next.type === 'hr') return prev
  if (prev.type === 'heading' && next.type === 'heading') {
    if (prev.level !== next.level) return null
    const nodes = reuseInlineNodes(prev.nodes, next.nodes)
    return nodes === prev.nodes ? prev : { type: 'heading', level: prev.level, nodes }
  }
  if (prev.type === 'p' && next.type === 'p') {
    const nodes = reuseInlineNodes(prev.nodes, next.nodes)
    return nodes === prev.nodes ? prev : { type: 'p', nodes }
  }
  if (prev.type === 'quote' && next.type === 'quote') {
    const nodes = reuseInlineNodes(prev.nodes, next.nodes)
    return nodes === prev.nodes ? prev : { type: 'quote', nodes }
  }
  if (prev.type === 'list' && next.type === 'list') {
    if (prev.ordered !== next.ordered) return null
    const items = reuseListItems(prev.items, next.items)
    const same =
      items.length === prev.items.length && items.every((item, i) => item === prev.items[i])
    return same ? prev : { type: 'list', ordered: prev.ordered, items }
  }
  if (prev.type === 'table' && next.type === 'table') {
    const header = reuseInlineLists(prev.header, next.header)
    const rows = next.rows.map((row, i) => {
      const prevRow = prev.rows[i]
      return prevRow ? reuseInlineLists(prevRow, row) : row
    })
    const headerSame = header.length === prev.header.length && header.every((c, i) => c === prev.header[i])
    const rowsSame =
      rows.length === prev.rows.length &&
      rows.every(
        (row, i) =>
          row.length === prev.rows[i]?.length && row.every((cell, c) => cell === prev.rows[i]?.[c])
      )
    return headerSame && rowsSame ? prev : { type: 'table', header, rows }
  }
  return null
}

/**
 * 直播散文尾增量：已闭合块 / 列表项 / 表格行保持同一对象，只重解析增长段。
 */
export function continueCheapProseBlocks(
  prevText: string,
  prevBlocks: CheapProseBlock[],
  text: string
): CheapProseBlock[] {
  const nextText = normalizeStreamingText(text)
  const prevNorm = normalizeStreamingText(prevText)
  if (!nextText) return []
  if (nextText === prevNorm && prevBlocks.length) return prevBlocks
  const parsed = parseCheapProseBlocks(nextText)
  if (!prevBlocks.length) return parsed
  const out: CheapProseBlock[] = []
  const shared = Math.min(prevBlocks.length, parsed.length)
  for (let i = 0; i < shared; i++) {
    const reused = reuseCheapProseBlock(prevBlocks[i]!, parsed[i]!)
    if (!reused) return [...out, ...parsed.slice(i)]
    out.push(reused)
  }
  if (parsed.length > prevBlocks.length) out.push(...parsed.slice(prevBlocks.length))
  return out
}
