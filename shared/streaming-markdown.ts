/**
 * 流式 Markdown 拆分：已闭合块保持稳定，只重解析未完成尾部。
 * CRLF 按 LF 拆；散文尾廉价解析含闭合链接、裸 URL、文件引用、标题/列表/表格/分隔线。
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
  | { type: 'em'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'file'; text: string; path: string; line?: number; column?: number }

/** 直播散文尾的廉价块：标题 / 列表 / 引用 / 表格 / 分隔线 / 段落，避免一律 `<p>` 收束时跳一下 */
export type CheapProseBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; nodes: CheapInlineNode[] }
  | { type: 'list'; ordered: boolean; items: CheapInlineNode[][] }
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
 * 只认成对的 `code` / **bold** / *italic*、闭合 `[text](url)`、裸 http(s) 与文件引用。
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
    if (src[i] === '[') {
      const mid = src.indexOf('](', i + 1)
      if (mid === -1) {
        buf += src.slice(i)
        break
      }
      const label = src.slice(i + 1, mid)
      if (!label.includes('\n')) {
        const urlEnd = src.indexOf(')', mid + 2)
        if (urlEnd === -1) {
          buf += src.slice(i)
          break
        }
        const href = src.slice(mid + 2, urlEnd).trim()
        if (/^https?:\/\//i.test(href)) {
          flush()
          nodes.push({ type: 'link', text: label, href })
          i = urlEnd + 1
          continue
        }
        const file = parseFileCitation(href)
        if (file) {
          flush()
          nodes.push({ type: 'file', text: label, path: file.path, line: file.line, column: file.column })
          i = urlEnd + 1
          continue
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
  if (node.type === 'em') return `*${node.text}*`
  if (node.type === 'link') {
    return node.text === node.href ? node.href : `[${node.text}](${node.href})`
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
const UL_RE = /^[-+]\s+(.*)$/
const STAR_UL_RE = /^\*\s+(.*)$/
const OL_RE = /^(\d+)\.\s+(.*)$/
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
  let list: { ordered: boolean; items: string[] } | null = null
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
      items: list.items.map((item) => parseCheapInlineMarkdown(item))
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
    const ul = UL_RE.exec(line) || STAR_UL_RE.exec(line)
    if (ul) {
      flushTable()
      flushPara()
      flushQuote()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(ul[1])
      continue
    }
    const ol = OL_RE.exec(line)
    if (ol) {
      flushTable()
      flushPara()
      flushQuote()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(ol[2])
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
      flushAll()
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
