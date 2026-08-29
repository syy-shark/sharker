/**
 * 流式 Markdown 拆分：已闭合块保持稳定，只重解析未完成尾部。
 * `streamingRenderSlots` 已收散文按块成闭合槽，增长尾固定 `prose-run-0`。
 * CRLF 按 LF 拆；散文尾廉价解析含闭合链接（含空 dest / `#锚点` / 相对路径 / 危险协议清空）、引用式链接 / 引用式图片（含相对 dest 与定义 title）、HTML 实体、`<https>` / 邮箱 / `www.`、裸 URL、下划线强调、`***`/`___` 嵌套强调、`~~** **~~` 删除线套粗体、标记内混排 / 链接 / 代码、未闭合 `**` / `*` / `~~` / `~` / `` ` `` / `***` / `<https://` 先画、完整 `<!-- -->` 不画、图片 alt 去标记、脚注（含缩进续行与多段）、硬换行（含列表续行）、文件引用、ATX/Setext 标题（含行尾闭合 `#`）/列表（含 `1)` / `ol start`、缩进嵌套、续行硬换行与松散 `li>p`、项内引用 / ATX / Setext / HR / 嵌套围栏 / 围栏 / 标题 / HR / 表后后缀 / 松散项内缩进代码）/任务项/表格（含单列、无两侧 `|` 与 `\\|`）/分隔线（含 `* * *`） / 缩进代码 / 引用围栏与懒续行（未闭合围栏不吃懒续行；懒续行不抽表格）。
 * 增长列表 / 表格 / 段落 / 引用 / 标题 / 缩进代码 / 脚注只重解析最后一块；段落软换行后续写、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、闭合并栏后再起表 / 标题 / 引用、引用内围栏闭合后的后续段、引用内换行后的列表项、脚注缩进续行与段落后新起的列表或标题不整尾重扫（对标 Codex #39061 / #34045）。项内表不把无 `|` 的普通续行吃成新行；标题 / 围栏后的表行另起项内表，不进 suffix。缩进代码后面的标题 / 列表不并进 `pre` 正文。
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

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/

function parseFenceLine(line: string): { marker: string; info: string } | null {
  const match = FENCE_RE.exec(line)
  if (!match) return null
  const marker = match[1] ?? ''
  const info = match[2] ?? ''
  if (marker.startsWith('`') && info.includes('`')) return null
  return { marker, info }
}

function fenceLang(info: string): string | undefined {
  return info.trim().split(/\s+/)[0] || undefined
}

function isFenceClose(line: string, openMarker: string): boolean {
  const parsed = parseFenceLine(line)
  if (!parsed) return false
  if (parsed.marker[0] !== openMarker[0]) return false
  if (parsed.marker.length < openMarker.length) return false
  return parsed.info.trim() === ''
}

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
  let fenceMarker = ''
  let openFenceLang: string | undefined
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
    const fenceMatch = parseFenceLine(line)
    if (fenceMatch) {
      if (!inFence) {
        if (current.length > 0) flushBlock(offset)
        inFence = true
        fenceMarker = fenceMatch.marker
        openFenceLang = fenceLang(fenceMatch.info)
        current.push(line)
      } else if (isFenceClose(line, fenceMarker)) {
        current.push(line)
        inFence = false
        fenceMarker = ''
        openFenceLang = undefined
        flushBlock(lineEnd)
      } else {
        current.push(line)
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
    tailLang: inFence ? openFenceLang : undefined,
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

/**
 * 把增长尾收成稳定块，已闭合块保持同一对象。
 * 收束后的正文仍走整段 MarkdownBody（脚注等跨块语法）；本函数给测试与拆分契约用。
 */
export function finalizeStreamingMarkdownSplit(
  split: StreamingMarkdownSplit
): StreamingMarkdownSplit {
  if (!split.tail) return split
  return {
    blocks: [
      ...split.blocks,
      { id: `md-final-${split.blocks.length}`, text: split.tail }
    ],
    tail: '',
    tailKind: 'prose',
    closedEnd: split.closedEnd
  }
}

/** 未闭合围栏去掉起始 ```lang 行，供代码块直播展示 */
export function extractOpenFenceBody(tail: string): string {
  const nl = tail.indexOf('\n')
  return nl === -1 ? '' : tail.slice(nl + 1)
}

/**
 * 已闭合围栏块：抽出语言与正文（去掉开闭行）。
 * 给直播顶层围栏槽复用同一 `LiveFenceTail`，闭合时不搬进散文尾重挂。
 */
export function extractClosedFenceParts(
  text: string
): { lang?: string; body: string } | null {
  const src = normalizeStreamingText(text)
  if (!src) return null
  const lines = src.split('\n')
  const open = parseFenceLine(lines[0] ?? '')
  if (!open) return null
  let last = lines.length - 1
  while (last > 0 && lines[last] === '') last -= 1
  const closed = last > 0 && isFenceClose(lines[last]!, open.marker)
  return {
    lang: fenceLang(open.info),
    body: lines.slice(1, closed ? last : lines.length).join('\n')
  }
}

/** 顶层渲染槽：已收散文按块成闭合槽；增长尾固定 `prose-run-0`，空行收段不换尾 key */
export type StreamingRenderSlot =
  | { kind: 'prose'; key: string; text: string; closed: boolean }
  | { kind: 'fence'; key: string; lang?: string; body: string; closed: boolean }

/**
 * 已收段各自成闭合槽，增长尾单独成槽。
 * token 只重解析尾，已画段不再跟每枚 token 跑廉价树（对标 Codex #22860）。
 */
export function streamingRenderSlots(split: StreamingMarkdownSplit): StreamingRenderSlot[] {
  const slots: StreamingRenderSlot[] = []
  let fenceIndex = 0

  for (const block of split.blocks) {
    const fence = extractClosedFenceParts(block.text)
    if (fence) {
      slots.push({
        kind: 'fence',
        key: `live-fence-${fenceIndex++}`,
        lang: fence.lang,
        body: fence.body,
        closed: true
      })
    } else if (block.text) {
      slots.push({
        kind: 'prose',
        key: `prose-${block.id}`,
        text: block.text,
        closed: true
      })
    }
  }

  if (split.tailKind === 'fence') {
    slots.push({
      kind: 'fence',
      key: `live-fence-${fenceIndex}`,
      lang: split.tailLang,
      body: extractOpenFenceBody(split.tail),
      closed: false
    })
  } else if (split.tail) {
    slots.push({
      kind: 'prose',
      key: 'prose-run-0',
      text: split.tail,
      closed: false
    })
  }

  return slots
}

function sameStreamingRenderSlot(prev: StreamingRenderSlot, next: StreamingRenderSlot): boolean {
  if (prev.kind !== next.kind || prev.key !== next.key || prev.closed !== next.closed) return false
  if (prev.kind === 'prose' && next.kind === 'prose') return prev.text === next.text
  return prev.kind === 'fence' && next.kind === 'fence' && prev.lang === next.lang && prev.body === next.body
}

/**
 * 直播槽增量：已闭合围栏 / 散文 run 退回同一对象，只换增长尾。
 * 对标 Codex #22860（已画正文不跟每枚 token 换槽）。
 */
export function continueStreamingRenderSlots(
  prev: StreamingRenderSlot[] | null | undefined,
  split: StreamingMarkdownSplit
): StreamingRenderSlot[] {
  const next = streamingRenderSlots(split)
  if (!prev?.length) return next
  const prevByKey = new Map(prev.map((slot) => [slot.key, slot]))
  let allSame = prev.length === next.length
  const out = next.map((slot) => {
    const old = prevByKey.get(slot.key)
    if (old && sameStreamingRenderSlot(old, slot)) return old
    allSame = false
    return slot
  })
  return allSame ? prev : out
}

/** 直播散文：未闭合围栏之前的原文；散文模式给全文，避免每收一段就换 remark 树 */
export function streamingProseText(text: string, split: StreamingMarkdownSplit): string {
  const src = normalizeStreamingText(text)
  if (!src) return ''
  if (split.tailKind === 'fence') return src.slice(0, Math.max(0, split.closedEnd))
  return src
}

/** 收束后仍走廉价树。脚注已在廉价解析里画（定义续行 / 多段 / 无引用不画），不再换 remark 跳贴底。 */
export function needsFullRemarkMarkdown(_text: string): boolean {
  return false
}

/** 直播散文尾：廉价行内节点，避免每 token 跑 remark */
export type CheapInlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string; raw?: string }
  | { type: 'strong'; text: string; mark?: '**' | '__'; inner?: 'em' | 'del'; children?: CheapInlineNode[]; raw?: string }
  | { type: 'del'; text: string; mark?: '~' | '~~'; inner?: 'strong' | 'em'; children?: CheapInlineNode[]; raw?: string }
  | { type: 'em'; text: string; mark?: '*' | '_' | '***' | '___'; inner?: 'strong' | 'del'; children?: CheapInlineNode[]; raw?: string }
  | { type: 'link'; text: string; href: string; raw?: string; title?: string; children?: CheapInlineNode[] }
  | { type: 'image'; alt: string; href: string; title?: string; raw?: string; label?: string }
  | { type: 'file'; text: string; path: string; line?: number; column?: number }
  | { type: 'fn'; id: string; raw?: string }
  | { type: 'br' }

/** 直播列表项：可挂一层或多层嵌套列表；松散项额外段落对标 remark `li>p` */
export type CheapListItem = {
  nodes: CheapInlineNode[]
  extra?: CheapInlineNode[][]
  nested?: {
    ordered: boolean
    indent: number
    items: CheapListItem[]
    start?: number
    /** 嵌套列表自己的松散，不要把外层也收成 `li>p` */
    loose?: boolean
  }
  /** 项内表格 / 围栏 / 引用 / 标题，对标 remark `li>table` / `li>pre` / `li>blockquote` / `li>h*` */
  blocks?: CheapProseBlock[]
  /** 项内围栏/表格之后的紧随文本，对标 remark 仍画在 `pre`/`table` 后面 */
  suffix?: CheapInlineNode[]
  /** 列表标记结束列，用来认项内围栏（含 4 空格嵌套） */
  contentIndent?: number
}

/** 直播散文尾的廉价块：标题 / 列表 / 引用 / 表格 / 分隔线 / 段落，避免一律 `<p>` 收束时跳一下 */
export type CheapProseBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; nodes: CheapInlineNode[] }
  | { type: 'list'; ordered: boolean; items: CheapListItem[]; loose?: boolean; start?: number }
  | { type: 'quote'; blocks: CheapProseBlock[] }
  | { type: 'table'; header: CheapInlineNode[][]; rows: CheapInlineNode[][][]; align?: Array<'left' | 'right' | 'center' | null> }
  | { type: 'hr' }
  | { type: 'pre'; text: string; lang?: string }
  | { type: 'footnotes'; items: { id: string; paragraphs: CheapInlineNode[][] }[] }
  | { type: 'p'; nodes: CheapInlineNode[] }

const BARE_URL_RE = /^https?:\/\/[^\s<>]+/i
const WWW_RE = /^www\.[^\s<>]+/i
const BARE_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const SETEXT_RE = /^ {0,3}(?:=+|-+)\s*$/
/** 引用定义：href + 可选 title（对标 CommonMark / remark-gfm） */
export type CheapLinkDef = { href: string; title?: string }

const EMPTY_LINK_DEFS: ReadonlyMap<string, CheapLinkDef> = new Map()
const EMPTY_FOOTNOTE_DEFS: ReadonlyMap<string, string> = new Map()
const EMPTY_SKIP: ReadonlySet<number> = new Set()
const EMPTY_LINK_SCAN = { defs: EMPTY_LINK_DEFS as Map<string, CheapLinkDef>, skip: EMPTY_SKIP as Set<number> }
const EMPTY_FOOTNOTE_SCAN = { defs: EMPTY_FOOTNOTE_DEFS as Map<string, string>, skip: EMPTY_SKIP as Set<number> }

function asLinkDef(value: string | CheapLinkDef | undefined): CheapLinkDef | undefined {
  if (value == null) return undefined
  return typeof value === 'string' ? { href: value } : value
}
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bull: '\u2022',
  middot: '\u00b7',
  times: '\u00d7',
  divide: '\u00f7',
  plusmn: '\u00b1',
  deg: '\u00b0',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
  iexcl: '\u00a1',
  iquest: '\u00bf',
  laquo: '\u00ab',
  raquo: '\u00bb',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
  half: '\u00bd'
}

/** 对标 micromark / remark：直播文本先解码实体，收束时不再从 `&amp;` 跳成 `&` */
export function decodeHtmlEntities(text: string): string {
  return String(text ?? '').replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (full, body: string) => {
      if (body[0] === '#') {
        const hex = body[1] === 'x' || body[1] === 'X'
        const n = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
        if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return full
        if (n === 0) return '\uFFFD'
        return String.fromCodePoint(n)
      }
      return NAMED_HTML_ENTITIES[body] ?? NAMED_HTML_ENTITIES[body.toLowerCase()] ?? full
    }
  )
}

/** 去掉裸链接尾部标点，避免句号/括号被吃进 href */
function trimBareUrl(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/, '')
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch)
}

function canOpenUnderscore(src: string, i: number): boolean {
  return !isWordChar(src[i - 1])
}

function canCloseUnderscore(src: string, lastIndex: number): boolean {
  return !isWordChar(src[lastIndex + 1])
}

/** GFM 链接标签：去首尾空白、折叠空白、小写 */
export function normalizeLinkLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** `[^id]: 正文` 脚注定义（对标 remark-gfm / micromark-extension-gfm-footnote） */
export function parseFootnoteDefinitionLine(line: string): { id: string; text: string } | null {
  const match = /^ {0,3}\[\^([^\]]+)\]:\s?(.*)$/.exec(line)
  if (!match) return null
  const id = (match[1] ?? '').trim()
  if (!id) return null
  return { id, text: match[2] ?? '' }
}

function isFootnoteContLine(line: string): boolean {
  return /^(?:    |\t)/.test(line)
}

/** 吃掉定义后的 4 空格/tab 续行与空行分段，返回正文（段间 `\n\n`）与结束行下标 */
function consumeFootnoteRegion(
  lines: string[],
  start: number,
  firstText: string
): { body: string; end: number } {
  const paras: string[] = []
  let buf: string[] = firstText ? [firstText] : []
  const flush = () => {
    if (!buf.length) return
    paras.push(buf.join('\n'))
    buf = []
  }
  let i = start + 1
  while (i < lines.length) {
    const line = lines[i]!
    if (parseFootnoteDefinitionLine(line)) break
    if (isFootnoteContLine(line)) {
      buf.push(line.replace(/^(?:    |\t)/, ''))
      i += 1
      continue
    }
    if (line.trim() === '') {
      const next = lines[i + 1]
      if (next !== undefined && isFootnoteContLine(next)) {
        flush()
        i += 1
        continue
      }
      break
    }
    break
  }
  flush()
  return { body: paras.join('\n\n'), end: i }
}

function scanFootnoteDefinitions(lines: string[]): {
  defs: Map<string, string>
  skip: Set<number>
} {
  const defs = new Map<string, string>()
  const skip = new Set<number>()
  let i = 0
  while (i < lines.length) {
    const def = parseFootnoteDefinitionLine(lines[i]!)
    if (!def) {
      i += 1
      continue
    }
    const { body, end } = consumeFootnoteRegion(lines, i, def.text)
    if (!defs.has(def.id)) defs.set(def.id, body)
    for (let j = i; j < end; j++) skip.add(j)
    i = end
  }
  return { defs, skip }
}

export function collectFootnoteDefinitions(text: string): Map<string, string> {
  return scanFootnoteDefinitions(normalizeStreamingText(text).split('\n')).defs
}

/** `[id]: https://…` / `[id]: <https://…>` / `[id]: url "title"` 定义行（对标 CommonMark / remark-gfm） */
export function parseLinkDefinitionLine(line: string): { id: string; href: string; title?: string } | null {
  const match =
    /^\s{0,3}\[([^\]]+)\]:\s*(<[^>\s]+>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/.exec(line)
  if (!match) return null
  let href = match[2] ?? ''
  if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1)
  if (!href) return null
  const title = match[3] ?? match[4] ?? match[5]
  return title
    ? { id: normalizeLinkLabel(match[1] ?? ''), href, title }
    : { id: normalizeLinkLabel(match[1] ?? ''), href }
}

/** CommonMark 允许标题写在定义下一行：`[id]: url` + 缩进 `"title"` */
export function parseLinkDefinitionTitleLine(line: string): string | null {
  const match = /^[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))\s*$/.exec(line)
  if (!match) return null
  return match[1] ?? match[2] ?? match[3] ?? ''
}

function scanLinkDefinitions(lines: string[]): {
  defs: Map<string, CheapLinkDef>
  skip: Set<number>
} {
  const defs = new Map<string, CheapLinkDef>()
  const skip = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    const def = parseLinkDefinitionLine(lines[i]!)
    if (!def) continue
    let title = def.title
    let end = i + 1
    if (title == null) {
      const next = lines[i + 1]
      if (next !== undefined) {
        const lined = parseLinkDefinitionTitleLine(next)
        if (lined != null) {
          title = lined
          end = i + 2
        }
      }
    }
    if (!defs.has(def.id)) {
      defs.set(def.id, title ? { href: def.href, title } : { href: def.href })
    }
    for (let j = i; j < end; j++) skip.add(j)
    i = end - 1
  }
  return { defs, skip }
}

/** 链接标签里成对 `[]`（`[![alt](img)](url)`）对标 CommonMark；单行换行当空白，空行打断 */
function findMatchingCloseBracket(src: string, from: number): number {
  let depth = 1
  let i = from
  while (i < src.length) {
    const ch = src[i]!
    if (ch === '\n') {
      if (src[i + 1] === '\n') return -1
      i += 1
      continue
    }
    if (ch === '\\') {
      i += src[i + 1] ? 2 : 1
      continue
    }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  return -1
}

/** CommonMark 行内代码：开闭同样长度的 `` ` ``，内容可含更短反引号 */
function readInlineCodeSpan(src: string, start: number): { text: string; end: number } | null {
  let n = 0
  while (src[start + n] === '`') n += 1
  if (n === 0) return null
  let i = start + n
  while (i < src.length) {
    if (src[i] === '`') {
      let m = 0
      while (src[i + m] === '`') m += 1
      if (m === n) {
        let text = src.slice(start + n, i)
        if (text.startsWith(' ') && text.endsWith(' ') && text.trim() !== '') {
          text = text.slice(1, -1)
        }
        return { text, end: i + n }
      }
      i += m
      continue
    }
    i += 1
  }
  return null
}

function wrapInlineCode(text: string): string {
  let n = 1
  while (text.includes('`'.repeat(n))) n += 1
  const ticks = '`'.repeat(n)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${ticks}${pad}${text}${pad}${ticks}`
}

/**
 * 找到 `[text](dest)` / `![alt](dest)` 的闭合 `)`。
 * dest 里成对括号（`https://a.test/x(1)`）不算结束，对标 CommonMark / micromark。
 */
function findInlineLinkCloser(src: string, destStart: number): number {
  let i = destStart
  if (i >= src.length) return -1
  if (src[i] === '<') {
    const gt = src.indexOf('>', i + 1)
    if (gt === -1 || src.slice(i, gt + 1).includes('\n')) return -1
    i = gt + 1
  } else {
    let depth = 0
    while (i < src.length) {
      const ch = src[i]!
      if (ch === '\n') return -1
      if (ch === '\\') {
        i += src[i + 1] ? 2 : 1
        continue
      }
      if (ch === '(') {
        depth += 1
        i += 1
        continue
      }
      if (ch === ')') {
        if (depth === 0) return i
        depth -= 1
        i += 1
        continue
      }
      if ((ch === ' ' || ch === '\t') && depth === 0) break
      i += 1
    }
  }
  while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i += 1
  const quote = src[i]
  if (quote === '"' || quote === "'" || quote === '(') {
    const endQ = quote === '(' ? ')' : quote
    i += 1
    while (i < src.length && src[i] !== endQ && src[i] !== '\n') {
      if (src[i] === '\\') i += src[i + 1] ? 2 : 1
      else i += 1
    }
    if (src[i] !== endQ) return -1
    i += 1
    while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i += 1
  }
  return src[i] === ')' ? i : -1
}

/** 对标 micromark：`javascript:` / `vbscript:` / `data:` 画成空 href，避免收束跳协议 */
function sanitizeCheapHref(href: string): string {
  return /^(?:javascript|vbscript|data):/i.test(href.trim()) ? '' : href
}

/** CommonMark dest：`url` / `<url>`，可选 `"title"` / `'title'` / `(title)` */
function parseLinkDestination(dest: string): { href: string; title?: string } | null {
  const trimmed = dest.trim()
  if (!trimmed) return null
  let href = ''
  let rest = ''
  if (trimmed.startsWith('<')) {
    const close = trimmed.indexOf('>')
    if (close === -1) {
      href = trimmed.slice(1)
      rest = ''
    } else {
      href = trimmed.slice(1, close)
      rest = trimmed.slice(close + 1).trim()
    }
  } else {
    const match = /^(\S+)(?:\s+(.*))?$/.exec(trimmed)
    if (!match) return null
    href = match[1] ?? ''
    rest = (match[2] ?? '').trim()
  }
  if (!href && trimmed !== '<') return null
  href = sanitizeCheapHref(href)
  let title: string | undefined
  const quoted = /^(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))$/.exec(rest)
  if (quoted) title = quoted[1] ?? quoted[2] ?? quoted[3]
  return title ? { href, title } : { href }
}

/** 从全文收集引用定义，供直播尾与已闭合块共用 */
export function collectLinkDefinitions(text: string): Map<string, CheapLinkDef> {
  const src = normalizeStreamingText(text)
  if (!src.includes(']:')) return new Map()
  return scanLinkDefinitions(src.split('\n')).defs
}

/** 把定义行拼回 Markdown，挂到已闭合块上让 remark 也能解析引用 */
export function linkDefinitionBlob(text: string): string {
  const src = normalizeStreamingText(text)
  if (!src.includes(']:')) return ''
  const lines = src.split('\n')
  const { skip } = scanLinkDefinitions(lines)
  return lines.filter((_, index) => skip.has(index)).join('\n')
}

/** 引用定义快照：blob 没变就退回同一 Map，已闭合 LiveProseTail 不跟 token 换 defs */
export type LinkDefinitionState = {
  blob: string
  defs: Map<string, CheapLinkDef>
}

export function nextLinkDefinitions(
  prev: LinkDefinitionState | null | undefined,
  text: string
): LinkDefinitionState {
  const blob = linkDefinitionBlob(text)
  if (prev && prev.blob === blob) return prev
  return { blob, defs: collectLinkDefinitions(text) }
}

/**
 * 增长散文里已闭合块：对象没变就退回 prev，给 memo 子树当稳定 props。
 * 单块增长（一段 / 一表 / 一列表）时 closed 为空，尾块自己画。
 */
export function nextCheapProseClosed(
  prev: CheapProseBlock[] | null | undefined,
  blocks: CheapProseBlock[]
): CheapProseBlock[] {
  const next = blocks.length > 1 ? blocks.slice(0, -1) : []
  if (prev && prev.length === next.length && next.every((block, index) => block === prev[index])) {
    return prev
  }
  return next
}

/** remark 无 rehype-raw：完整 HTML 注释不进画面，避免直播闪一下再消失 */
function stripCompleteHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

function isBlankAfterHtmlComments(text: string): boolean {
  return !stripCompleteHtmlComments(text).trim()
}

/** 整段只有引用定义时不要画成段落（remark 会吃掉，直播也不画） */
export function isOnlyLinkDefinitions(text: string): boolean {
  const src = normalizeStreamingText(text)
  if (!src.includes(']:')) return false
  const lines = src.split('\n')
  const { skip } = scanLinkDefinitions(lines)
  const nonempty = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() !== '')
  return nonempty.length > 0 && nonempty.every(({ index }) => skip.has(index))
}

export function markdownBlockWithDefs(blockText: string, defsBlob: string): string {
  if (!defsBlob || !blockText.includes('[')) return blockText
  return `${blockText.replace(/\s+$/, '')}\n\n${defsBlob}`
}

/**
 * 只认成对的 `code` / **bold** / __bold__ / *italic* / _italic_、闭合或未闭合 `[text](url` /
 * `[text][id]` / `![alt](url)` / `![alt][id]` / `[![alt](img)](url)`、dest 内成对括号、标签内强调/代码、多反引号行内代码、HTML 实体、`<https>` / 邮箱、裸 http(s)、文件引用。
 * 未闭合 `**` / `*` / `~~` / `~` / `` ` `` / `***` / `<https://` 先画标记（空 opener 仍留原文）；`[` 对不上 `](` 时不再吞掉后面的标记。
 */
/** 图片 alt 对标 micromark：标签里的强调/代码只留纯文本，避免收束改 alt */
function flattenCheapInlineText(nodes: CheapInlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'br') return '\n'
      if (node.type === 'fn') return `[^${node.id}]`
      if (node.type === 'link') return node.children ? flattenCheapInlineText(node.children) : node.text
      if (node.type === 'strong' || node.type === 'em' || node.type === 'del') {
        return node.children ? flattenCheapInlineText(node.children) : node.text
      }
      if (node.type === 'image') return node.alt
      if (node.type === 'file') return node.text
      if ('text' in node) return node.text
      return ''
    })
    .join('')
}

function imageAltFromLabel(label: string): string {
  return flattenCheapInlineText(parseCheapInlineMarkdown(label, EMPTY_LINK_DEFS, false))
}

function cheapImage(
  label: string,
  href: string,
  extra?: { title?: string; raw?: string }
): Extract<CheapInlineNode, { type: 'image' }> {
  const alt = imageAltFromLabel(label)
  const node: Extract<CheapInlineNode, { type: 'image' }> = {
    type: 'image',
    alt,
    href: sanitizeCheapHref(href)
  }
  if (extra?.title) node.title = extra.title
  if (extra?.raw) node.raw = extra.raw
  if (alt !== label) node.label = label
  return node
}

/**
 * 标记内部再解析：整段套一层用 `inner`，混排 / 链接 / 代码用 `children`。
 * 对标 remark `strong>del` 与 `strong>foo <del>bar</del>`。
 */
function parseMarkedInner(inner: string): {
  text: string
  inner?: 'em' | 'strong' | 'del'
  children?: CheapInlineNode[]
} {
  const nodes = parseCheapInlineMarkdown(inner, EMPTY_LINK_DEFS, false)
  if (!nodes.length) return { text: decodeHtmlEntities(inner) }
  if (nodes.length === 1) {
    const node = nodes[0]!
    if (node.type === 'strong' || node.type === 'em' || node.type === 'del') {
      return node.children?.length
        ? { text: flattenCheapInlineText(nodes), children: nodes }
        : { text: node.text, inner: node.type }
    }
    if (node.type === 'text') return { text: node.text }
    return { text: flattenCheapInlineText(nodes), children: nodes }
  }
  if (nodes.some((node) => node.type !== 'text')) {
    return { text: flattenCheapInlineText(nodes), children: nodes }
  }
  return { text: flattenCheapInlineText(nodes) }
}

function nestInner<T extends 'em' | 'strong' | 'del'>(
  peeled: { text: string; inner?: 'em' | 'strong' | 'del' },
  allowed: readonly T[]
): T | undefined {
  return peeled.inner && (allowed as readonly string[]).includes(peeled.inner)
    ? (peeled.inner as T)
    : undefined
}

function applyMarkedInner<
  T extends { text: string; inner?: 'em' | 'strong' | 'del'; children?: CheapInlineNode[]; raw?: string }
>(node: T, marked: ReturnType<typeof parseMarkedInner>, allowed: readonly ('em' | 'strong' | 'del')[]): T {
  node.text = marked.text
  if (marked.children?.length) {
    node.children = marked.children
    return node
  }
  const inner = nestInner(marked, allowed)
  if (inner) node.inner = inner as T['inner']
  return node
}

/** 未闭合标记必须留下原文，避免 `continueCheapInline` / 列表续行拼出假闭合符 */
function withInlineRaw<T extends { raw?: string }>(node: T, raw: string): T {
  node.raw = raw
  return node
}

/** 链接标签里的 `**` / `*` / `` ` `` / `~~` 直播就画，避免收束从纯文本跳成 <a><strong> */
function linkWithLabel(
  label: string,
  href: string,
  opts?: { title?: string; raw?: string }
): Extract<CheapInlineNode, { type: 'link' }> {
  const children = parseCheapInlineMarkdown(label, EMPTY_LINK_DEFS, false)
  const node: Extract<CheapInlineNode, { type: 'link' }> = {
    type: 'link',
    text: decodeHtmlEntities(label),
    href: sanitizeCheapHref(href)
  }
  if (opts?.title) node.title = opts.title
  if (opts?.raw) node.raw = opts.raw
  if (children.some((child) => child.type !== 'text')) node.children = children
  return node
}

export function parseCheapInlineMarkdown(
  text: string,
  defs: ReadonlyMap<string, string | CheapLinkDef> = EMPTY_LINK_DEFS,
  allowOpen = true
): CheapInlineNode[] {
  const src = normalizeStreamingText(text)
  if (!src) return []
  const nodes: CheapInlineNode[] = []
  let i = 0
  let buf = ''
  const flush = () => {
    if (!buf) return
    nodes.push({ type: 'text', text: decodeHtmlEntities(buf) })
    buf = ''
  }
  while (i < src.length) {
    if (src[i] === '\\' && i + 1 < src.length && /[\\`*_{}[\]()#+\-.!<>~|]/.test(src[i + 1]!)) {
      buf += src[i + 1]
      i += 2
      continue
    }
    if (src[i] === '`') {
      const codeSpan = readInlineCodeSpan(src, i)
      if (codeSpan) {
        flush()
        const file = parseFileCitation(codeSpan.text)
        if (file) {
          nodes.push({
            type: 'file',
            text: codeSpan.text,
            path: file.path,
            line: file.line,
            column: file.column
          })
        } else nodes.push({ type: 'code', text: codeSpan.text })
        i = codeSpan.end
        continue
      }
      if (allowOpen) {
        let ticks = 0
        while (src[i + ticks] === '`') ticks += 1
        const openCode = src.slice(i + ticks)
        if (openCode) {
          flush()
          nodes.push({ type: 'code', text: openCode, raw: src.slice(i) })
          break
        }
      }
      buf += src.slice(i)
      break
    }
    // `***foo***` / `___foo___` / `**_foo_**` / `*__foo__*` 对标 remark em+strong，避免收束跳标签
    if (src.startsWith('***', i)) {
      const end = src.indexOf('***', i + 3)
      if (end !== -1 && end > i + 3) {
        flush()
        nodes.push({ type: 'em', text: decodeHtmlEntities(src.slice(i + 3, end)), mark: '***', inner: 'strong' })
        i = end + 3
        continue
      }
      if (allowOpen) {
        const openInner = src.slice(i + 3)
        if (openInner) {
          flush()
          nodes.push(
            withInlineRaw(
              { type: 'em', text: decodeHtmlEntities(openInner), mark: '***', inner: 'strong' },
              src.slice(i)
            )
          )
          break
        }
      }
      buf += src.slice(i)
      break
    }
    if (src.startsWith('___', i) && canOpenUnderscore(src, i)) {
      const end = src.indexOf('___', i + 3)
      if (end !== -1 && end > i + 3 && canCloseUnderscore(src, end + 2)) {
        flush()
        nodes.push({ type: 'em', text: decodeHtmlEntities(src.slice(i + 3, end)), mark: '___', inner: 'strong' })
        i = end + 3
        continue
      }
      if (end === -1) {
        if (allowOpen) {
          const openInner = src.slice(i + 3)
          if (openInner) {
            flush()
            nodes.push(
              withInlineRaw(
                { type: 'em', text: decodeHtmlEntities(openInner), mark: '___', inner: 'strong' },
                src.slice(i)
              )
            )
            break
          }
        }
        buf += src.slice(i)
        break
      }
    }
    if (src.startsWith('**_', i)) {
      const end = src.indexOf('_**', i + 3)
      if (end !== -1 && end > i + 3) {
        flush()
        nodes.push({ type: 'strong', text: decodeHtmlEntities(src.slice(i + 3, end)), inner: 'em' })
        i = end + 3
        continue
      }
      if (allowOpen) {
        const openInner = src.slice(i + 3)
        if (openInner) {
          flush()
          nodes.push(withInlineRaw({ type: 'strong', text: decodeHtmlEntities(openInner), inner: 'em' }, src.slice(i)))
          break
        }
      }
      buf += src.slice(i)
      break
    }
    if (src.startsWith('*__', i)) {
      const end = src.indexOf('__*', i + 3)
      if (end !== -1 && end > i + 3) {
        flush()
        nodes.push({ type: 'em', text: decodeHtmlEntities(src.slice(i + 3, end)), inner: 'strong' })
        i = end + 3
        continue
      }
      if (allowOpen) {
        const openInner = src.slice(i + 3)
        if (openInner) {
          flush()
          nodes.push(withInlineRaw({ type: 'em', text: decodeHtmlEntities(openInner), inner: 'strong' }, src.slice(i)))
          break
        }
      }
      buf += src.slice(i)
      break
    }
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2)
      if (end === -1) {
        if (allowOpen) {
          const openInner = src.slice(i + 2)
          if (openInner) {
            flush()
            nodes.push(
              withInlineRaw(
                applyMarkedInner({ type: 'strong', text: '' }, parseMarkedInner(openInner), ['em', 'del']),
                src.slice(i)
              )
            )
            break
          }
        }
        buf += src.slice(i)
        break
      }
      flush()
      nodes.push(applyMarkedInner({ type: 'strong', text: '' }, parseMarkedInner(src.slice(i + 2, end)), ['em', 'del']))
      i = end + 2
      continue
    }
    if (src.startsWith('__', i) && canOpenUnderscore(src, i)) {
      const end = src.indexOf('__', i + 2)
      if (end !== -1 && end > i + 2 && canCloseUnderscore(src, end + 1)) {
        flush()
        nodes.push(
          applyMarkedInner(
            { type: 'strong', text: '', mark: '__' },
            parseMarkedInner(src.slice(i + 2, end)),
            ['em', 'del']
          )
        )
        i = end + 2
        continue
      }
      if (end === -1) {
        if (allowOpen) {
          const openInner = src.slice(i + 2)
          if (openInner) {
            flush()
            nodes.push(
              withInlineRaw(
                applyMarkedInner({ type: 'strong', text: '', mark: '__' }, parseMarkedInner(openInner), ['em', 'del']),
                src.slice(i)
              )
            )
            break
          }
        }
      }
    }
    if (src.startsWith('~~', i)) {
      const end = src.indexOf('~~', i + 2)
      if (end === -1) {
        if (allowOpen) {
          const openInner = src.slice(i + 2)
          if (openInner && !/^[ \t]/.test(openInner)) {
            flush()
            nodes.push(
              withInlineRaw(
                applyMarkedInner({ type: 'del', text: '' }, parseMarkedInner(openInner), ['strong', 'em']),
                src.slice(i)
              )
            )
            break
          }
        }
        buf += src.slice(i)
        break
      }
      const inner = src.slice(i + 2, end)
      if (inner && !/^[ \t]/.test(inner) && !/[ \t]$/.test(inner)) {
        flush()
        nodes.push(applyMarkedInner({ type: 'del', text: '' }, parseMarkedInner(inner), ['strong', 'em']))
        i = end + 2
        continue
      }
    }
    if (src[i] === '~') {
      const end = src.indexOf('~', i + 1)
      if (end === -1) {
        if (allowOpen) {
          const openInner = src.slice(i + 1)
          if (openInner && !/^[ \t]/.test(openInner)) {
            flush()
            nodes.push(
              withInlineRaw(
                applyMarkedInner({ type: 'del', text: '', mark: '~' }, parseMarkedInner(openInner), ['strong', 'em']),
                src.slice(i)
              )
            )
            break
          }
        }
        buf += src.slice(i)
        break
      }
      const inner = src.slice(i + 1, end)
      if (inner && !/^[ \t]/.test(inner) && !/[ \t]$/.test(inner)) {
        flush()
        nodes.push(
          applyMarkedInner({ type: 'del', text: '', mark: '~' }, parseMarkedInner(inner), ['strong', 'em'])
        )
        i = end + 1
        continue
      }
    }
    if (src[i] === '*') {
      const end = src.indexOf('*', i + 1)
      if (end === -1) {
        if (allowOpen) {
          const openInner = src.slice(i + 1)
          if (openInner) {
            flush()
            nodes.push(
              withInlineRaw(
                applyMarkedInner({ type: 'em', text: '' }, parseMarkedInner(openInner), ['strong', 'del']),
                src.slice(i)
              )
            )
            break
          }
        }
        buf += src.slice(i)
        break
      }
      flush()
      nodes.push(applyMarkedInner({ type: 'em', text: '' }, parseMarkedInner(src.slice(i + 1, end)), ['strong', 'del']))
      i = end + 1
      continue
    }
    if (src[i] === '_' && canOpenUnderscore(src, i)) {
      let from = i + 1
      let matched = false
      while (from < src.length) {
        const end = src.indexOf('_', from)
        if (end === -1) break
        if (end > i + 1 && canCloseUnderscore(src, end)) {
          flush()
          nodes.push(
            applyMarkedInner(
              { type: 'em', text: '', mark: '_' },
              parseMarkedInner(src.slice(i + 1, end)),
              ['strong', 'del']
            )
          )
          i = end + 1
          matched = true
          break
        }
        from = end + 1
      }
      if (matched) continue
      if (allowOpen) {
        const openInner = src.slice(i + 1)
        if (openInner && !openInner.includes('_')) {
          flush()
          nodes.push(
            withInlineRaw(
              applyMarkedInner({ type: 'em', text: '', mark: '_' }, parseMarkedInner(openInner), ['strong', 'del']),
              src.slice(i)
            )
          )
          break
        }
      }
    }
    if (src[i] === '<') {
      const end = src.indexOf('>', i + 1)
      if (end !== -1) {
        const inner = src.slice(i + 1, end).trim()
        if (/^https?:\/\/\S+$/i.test(inner)) {
          flush()
          nodes.push({ type: 'link', text: inner, href: inner })
          i = end + 1
          continue
        }
        if (BARE_EMAIL_RE.test(inner) && inner === (BARE_EMAIL_RE.exec(inner)?.[0] ?? '')) {
          flush()
          nodes.push({ type: 'link', text: inner, href: `mailto:${inner}`, raw: `<${inner}>` })
          i = end + 1
          continue
        }
      } else if (allowOpen) {
        const rest = src.slice(i + 1)
        if (!rest.includes('\n') && /^https?:\/\/\S+$/i.test(rest)) {
          flush()
          nodes.push({ type: 'link', text: rest, href: rest, raw: src.slice(i) })
          break
        }
        if (!rest.includes('\n') && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$/.test(rest) && rest.includes('.')) {
          flush()
          nodes.push({ type: 'link', text: rest, href: `mailto:${rest}`, raw: src.slice(i) })
          break
        }
      }
    }
    if (src.startsWith('[^', i)) {
      const end = src.indexOf(']', i + 2)
      if (end === -1) {
        if (allowOpen) {
          const id = src.slice(i + 2)
          if (id && !id.includes('\n')) {
            flush()
            nodes.push({ type: 'fn', id, raw: src.slice(i) })
            break
          }
        }
        buf += src.slice(i)
        break
      }
      const id = src.slice(i + 2, end)
      if (id && !id.includes('\n')) {
        flush()
        nodes.push({ type: 'fn', id })
        i = end + 1
        continue
      }
    }
    if (src.startsWith('![', i) || src[i] === '[') {
      const image = src.startsWith('![', i)
      const labelStart = i + (image ? 2 : 1)
      const labelEnd = findMatchingCloseBracket(src, labelStart)
      if (labelEnd === -1) {
        buf += src.slice(i)
        break
      }
      const rawLabel = src.slice(labelStart, labelEnd)
      const label = rawLabel.replace(/[ \t]*\n[ \t]*/g, ' ')
      if (!rawLabel.includes('\n\n')) {
        if (src[labelEnd + 1] === '(') {
          const urlEnd = findInlineLinkCloser(src, labelEnd + 2)
          const openDest = urlEnd === -1
          if (openDest && src.slice(labelEnd + 2).includes('\n')) {
            buf += src.slice(i)
            break
          }
          const rawDest = src.slice(labelEnd + 2, openDest ? undefined : urlEnd)
          const dest = parseLinkDestination(rawDest)
          const emptyDest = rawDest.trim() === '' || rawDest.trim() === '<'
          const href = dest?.href ?? ''
          const title = dest?.title
          const wrapRaw = openDest || rawLabel.includes('\n') ? src.slice(i, openDest ? undefined : urlEnd + 1) : undefined
          if (image && (dest || emptyDest)) {
            flush()
            nodes.push(
              cheapImage(label, href, {
                ...(title ? { title: decodeHtmlEntities(title) } : {}),
                ...(wrapRaw ? { raw: wrapRaw } : {})
              })
            )
            if (openDest) break
            i = urlEnd + 1
            continue
          }
          if (!image && (dest || emptyDest)) {
            flush()
            nodes.push(
              linkWithLabel(label, href, {
                ...(title ? { title: decodeHtmlEntities(title) } : {}),
                ...(wrapRaw ? { raw: wrapRaw } : {})
              })
            )
            if (openDest) break
            i = urlEnd + 1
            continue
          }
          if (!image) {
            const file = parseFileCitation(href)
            if (file) {
              flush()
              nodes.push({
                type: 'file',
                text: label,
                path: file.path,
                line: file.line,
                column: file.column
              })
              i = urlEnd + 1
              continue
            }
          }
        } else if (src[labelEnd + 1] === '[') {
          const idEnd = src.indexOf(']', labelEnd + 2)
          if (idEnd !== -1 && !src.slice(labelEnd + 2, idEnd).includes('\n')) {
            const id = src.slice(labelEnd + 2, idEnd)
            const def = asLinkDef(defs.get(normalizeLinkLabel(id || label)))
            if (def) {
              flush()
              nodes.push(
                image
                  ? cheapImage(label, def.href, {
                      raw: src.slice(i, idEnd + 1),
                      title: def.title
                    })
                  : linkWithLabel(label, def.href, {
                      raw: src.slice(i, idEnd + 1),
                      title: def.title
                    })
              )
              i = idEnd + 1
              continue
            }
          }
        } else if (image) {
          const def = asLinkDef(defs.get(normalizeLinkLabel(label)))
          if (def) {
            flush()
            nodes.push(
              cheapImage(label, def.href, { raw: src.slice(i, labelEnd + 1), title: def.title })
            )
            i = labelEnd + 1
            continue
          }
        } else {
          const def = asLinkDef(defs.get(normalizeLinkLabel(label)))
          if (def?.href) {
            flush()
            nodes.push(
              linkWithLabel(label, def.href, { raw: src.slice(i, labelEnd + 1), title: def.title })
            )
            i = labelEnd + 1
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
    if (!isWordChar(src[i - 1])) {
      const wwwMatch = WWW_RE.exec(src.slice(i))
      if (wwwMatch) {
        const raw = trimBareUrl(wwwMatch[0])
        if (raw.length > 'www.a'.length) {
          flush()
          nodes.push({ type: 'link', text: raw, href: `http://${raw}`, raw })
          i += raw.length
          continue
        }
      }
    }
    if (src[i] === '\n') {
      if (buf.endsWith('\\')) {
        buf = buf.slice(0, -1)
        flush()
        nodes.push({ type: 'br' })
        i += 1
        continue
      }
      if (buf.endsWith('  ')) {
        buf = buf.slice(0, -2)
        flush()
        nodes.push({ type: 'br' })
        i += 1
        continue
      }
    }
    if (!isWordChar(src[i - 1])) {
      const emailMatch = BARE_EMAIL_RE.exec(src.slice(i))
      if (emailMatch) {
        const email = emailMatch[0].replace(/[.,;:!?)]+$/, '')
        if (email.includes('.') && email.length > 5) {
          flush()
          nodes.push({ type: 'link', text: email, href: `mailto:${email}`, raw: email })
          i += email.length
          continue
        }
      }
    }
    buf += src[i]
    i += 1
  }
  flush()
  return nodes
}

function cheapInlineSource(node: CheapInlineNode): string {
  if ('raw' in node && node.raw) return node.raw
  if (node.type === 'br') return '  \n'
  if (node.type === 'fn') return `[^${node.id}]`
  if (node.type === 'code') return wrapInlineCode(node.text)
  if (node.type === 'strong') {
    const mark = node.mark ?? '**'
    if (node.children?.length) return `${mark}${cheapInlineSourceAll(node.children)}${mark}`
    if (node.inner === 'em') return `**_${node.text}_**`
    if (node.inner === 'del') return `${mark}~~${node.text}~~${mark}`
    return `${mark}${node.text}${mark}`
  }
  if (node.type === 'del') {
    const mark = node.mark ?? '~~'
    if (node.children?.length) return `${mark}${cheapInlineSourceAll(node.children)}${mark}`
    if (node.inner === 'strong') return `${mark}**${node.text}**${mark}`
    if (node.inner === 'em') return `${mark}*${node.text}*${mark}`
    return `${mark}${node.text}${mark}`
  }
  if (node.type === 'em') {
    if (node.children?.length) return `${node.mark ?? '*'}${cheapInlineSourceAll(node.children)}${node.mark ?? '*'}`
    if (node.inner === 'strong') {
      if (node.mark === '___') return `___${node.text}___`
      if (node.mark === '***') return `***${node.text}***`
      return `*__${node.text}__*`
    }
    if (node.inner === 'del') return `${node.mark ?? '*'}~~${node.text}~~${node.mark ?? '*'}`
    const mark = node.mark ?? '*'
    return `${mark}${node.text}${mark}`
  }
  if (node.type === 'link') {
    if (node.raw) return node.raw
    const dest = node.title ? `${node.href} "${node.title}"` : node.href
    const inner = node.children ? cheapInlineSourceAll(node.children) : node.text
    return inner === node.href && !node.title ? node.href : `[${inner}](${dest})`
  }
  if (node.type === 'image') {
    if (node.raw) return node.raw
    const dest = node.title ? `${node.href} "${node.title}"` : node.href
    return `![${node.label ?? node.alt}](${dest})`
  }
  if (node.type === 'file') {
    return node.text
  }
  return node.text
}

function cheapInlineSourceAll(nodes: CheapInlineNode[]): string {
  return nodes.map(cheapInlineSource).join('')
}

/** 直播块 key：按类型计数，中间块改类型时后面已画块不换下标 */
export function cheapProseBlockKeys(blocks: CheapProseBlock[]): string[] {
  const counts = new Map<string, number>()
  return blocks.map((block) => {
    const kind =
      block.type === 'heading'
        ? `h${block.level}`
        : block.type === 'list'
          ? block.ordered
            ? 'ol'
            : 'ul'
          : block.type
    const n = counts.get(kind) ?? 0
    counts.set(kind, n + 1)
    return `${kind}:${n}`
  })
}

/**
 * 直播任务勾选：写完 `[x] ` 才算正式项；`[x` / `[ ]` 先占 checkbox，
 * 避免勾选框突然插入把已画文字挤开。`[x](url)` 仍当链接，不认任务。
 */
export function matchLiveTaskMarker(text: string): { checked: boolean; rest: string } | null {
  const done = /^\[([ xX])\]\s+(.*)$/.exec(text)
  if (done) return { checked: done[1] !== ' ', rest: done[2] }
  const closed = /^\[([ xX])\]\s*$/.exec(text)
  if (closed) return { checked: closed[1] !== ' ', rest: '' }
  const open = /^\[([ xX])$/.exec(text)
  if (open) return { checked: open[1] !== ' ', rest: '' }
  return null
}

/** 直播行内 key：用类型 + 前缀长度，闭合标记时已画节点不换下标 */
export function cheapInlineNodeKeys(nodes: CheapInlineNode[]): string[] {
  const keys: string[] = []
  let prefix = 0
  for (const node of nodes) {
    keys.push(`${node.type}:${prefix}`)
    prefix += cheapInlineSource(node).length
  }
  return keys
}

/**
 * 直播散文尾增量解析：复用已闭合的行内节点，只重扫最后一段增长文本。
 */
export function continueCheapInlineMarkdown(
  prevText: string,
  prevNodes: CheapInlineNode[],
  text: string,
  defs: ReadonlyMap<string, string | CheapLinkDef> = EMPTY_LINK_DEFS
): CheapInlineNode[] {
  const nextText = normalizeStreamingText(text)
  const prevNorm = normalizeStreamingText(prevText)
  if (!nextText) return []
  if (nextText === prevNorm && prevNodes.length) return prevNodes
  if (!prevNodes.length) return parseCheapInlineMarkdown(nextText, defs)
  const stable = prevNodes.slice(0, -1)
  const prefix = cheapInlineSourceAll(stable)
  if (!nextText.startsWith(prefix)) return parseCheapInlineMarkdown(nextText, defs)
  const rest = parseCheapInlineMarkdown(nextText.slice(prefix.length), defs)
  return stable.length ? [...stable, ...rest] : rest
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*)$/

/** CommonMark：标题行尾的 ` #` 闭合标记不进入正文 */
function stripAtxClosingHashes(text: string): string {
  return text.replace(/[ \t]+#+[ \t]*$/, '')
}
const LIST_LINE_RE = /^(\s*)(?:[-+]|\*|\d+[.)])\s+(.*)$/

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

/** 解析列表行：缩进 + 有序/无序 + 正文；有序记下起始号（对标 GFM `1)` / `ol start`） */
function parseListLine(
  line: string
): { indent: number; ordered: boolean; text: string; start?: number; contentIndent: number } | null {
  const marker = /^(\s*(?:[-+]|\*|\d+[.)])\s+)/.exec(line)
  if (!marker || !LIST_LINE_RE.test(line)) return null
  const indent = leadingIndent(line)
  const rest = line.trimStart()
  const contentIndent = marker[1]!.length
  const ul = /^[-+]\s+(.*)$/.exec(rest) || /^\*\s+(.*)$/.exec(rest)
  if (ul) return { indent, ordered: false, text: ul[1] ?? '', contentIndent }
  const ol = /^(\d+)[.)]\s+(.*)$/.exec(rest)
  if (!ol) return null
  const start = Number.parseInt(ol[1] ?? '1', 10)
  return { indent, ordered: true, text: ol[2] ?? '', start: Number.isFinite(start) ? start : 1, contentIndent }
}

/** 把更缩进的列表项挂到当前项的嵌套列表 */
function appendNestedListItem(
  item: CheapListItem,
  ordered: boolean,
  indent: number,
  text: string,
  defs: ReadonlyMap<string, string | CheapLinkDef>,
  start?: number,
  contentIndent?: number
): CheapListItem {
  const listStart = ordered && start && start !== 1 ? start : undefined
  if (!item.nested) {
    item.nested = { ordered, indent, items: [], start: listStart }
  } else if (indent > item.nested.indent && item.nested.items.length) {
    return appendNestedListItem(
      item.nested.items[item.nested.items.length - 1]!,
      ordered,
      indent,
      text,
      defs,
      start,
      contentIndent
    )
  } else if (item.nested.ordered !== ordered && indent <= item.nested.indent) {
    item.nested = { ordered, indent, items: [], start: listStart }
  }
  const nested: CheapListItem = {
    nodes: parseCheapInlineMarkdown(text, defs),
    contentIndent
  }
  item.nested.items.push(nested)
  return nested
}

/** 列表项续行：缩进或 CommonMark lazy continuation；空行后另起一段，对标松散 `li>p` */
function appendListContinuation(
  item: CheapListItem,
  indent: number,
  text: string,
  opts?: { newParagraph?: boolean; defs?: ReadonlyMap<string, string | CheapLinkDef> }
): void {
  if (item.nested && indent > item.nested.indent && item.nested.items.length) {
    appendListContinuation(item.nested.items[item.nested.items.length - 1]!, indent, text, opts)
    return
  }
  const defs = opts?.defs
  const joinSoftBreak = (nodes: CheapInlineNode[]) =>
    parseCheapInlineMarkdown(`${cheapInlineSourceAll(nodes)}\n${text}`, defs)
  if (item.blocks?.length) {
    if (item.suffix?.length) {
      item.suffix = joinSoftBreak(item.suffix)
      return
    }
    item.suffix = parseCheapInlineMarkdown(text, defs)
    return
  }
  if (opts?.newParagraph) {
    item.extra = [...(item.extra ?? []), parseCheapInlineMarkdown(text, defs)]
    return
  }
  if (item.extra?.length) {
    const last = item.extra[item.extra.length - 1]!
    item.extra = [...item.extra.slice(0, -1), joinSoftBreak(last)]
    return
  }
  item.nodes = joinSoftBreak(item.nodes)
}

type QuotePart = { text: string; lazy?: boolean }

const QUOTE_RE = /^ {0,3}>\s?(.*)$/

function parseQuoteLine(line: string, baseIndent = 0): string | null {
  const stripped = baseIndent ? dedentLine(line, baseIndent) : line
  const match = QUOTE_RE.exec(stripped)
  return match ? (match[1] ?? '') : null
}

function parseHeadingLine(
  line: string,
  baseIndent = 0
): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | null {
  const stripped = baseIndent ? dedentLine(line, baseIndent) : line
  const heading = HEADING_RE.exec(stripped)
  if (!heading) return null
  return {
    level: Math.min(6, heading[1]!.length) as 1 | 2 | 3 | 4 | 5 | 6,
    text: stripAtxClosingHashes(heading[2] ?? '')
  }
}

function parseFenceLineAt(line: string, baseIndent = 0): { marker: string; info: string } | null {
  const stripped = baseIndent ? dedentLine(line, baseIndent) : line
  return parseFenceLine(stripped)
}

function deepestItemForIndent(items: CheapListItem[], indent: number): CheapListItem | null {
  if (!items.length) return null
  let item = items[items.length - 1]!
  while (item.nested && indent > item.nested.indent && item.nested.items.length) {
    item = item.nested.items[item.nested.items.length - 1]!
  }
  return item
}

function nestedListContaining(
  items: CheapListItem[],
  target: CheapListItem
): NonNullable<CheapListItem['nested']> | null {
  for (const item of items) {
    if (!item.nested) continue
    if (item.nested.items.includes(target)) return item.nested
    const deeper = nestedListContaining(item.nested.items, target)
    if (deeper) return deeper
  }
  return null
}

/** 空行后的项内块只松它所在的那一层，避免外层 `li` 无故套 `p` */
function markItemListLoose(list: { items: CheapListItem[]; loose: boolean }, item: CheapListItem): void {
  if (list.items.includes(item)) {
    list.loose = true
    return
  }
  const nested = nestedListContaining(list.items, item)
  if (nested) nested.loose = true
  else list.loose = true
}

function quotePartsHaveOpenFence(parts: QuotePart[]): boolean {
  let marker: string | null = null
  for (const part of parts) {
    if (marker) {
      if (isFenceClose(part.text, marker)) marker = null
    } else {
      const open = parseFenceLine(part.text)
      if (open) marker = open.marker
    }
  }
  return marker != null
}

function quotePartsToBlocks(
  parts: QuotePart[],
  defs: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] {
  const chunks: CheapProseBlock[] = []
  let marked: string[] = []
  const flushMarked = () => {
    if (!marked.length) return
    chunks.push(...parseCheapProseBlocks(marked.join('\n'), defs))
    marked = []
  }
  for (const part of parts) {
    if (part.lazy) {
      flushMarked()
      const last = chunks[chunks.length - 1]
      if (last?.type === 'p') {
        last.nodes = parseCheapInlineMarkdown(
          stripCompleteHtmlComments(`${cheapInlineSourceAll(last.nodes)}\n${part.text}`),
          defs
        )
      } else if (!isBlankAfterHtmlComments(part.text)) {
        chunks.push({
          type: 'p',
          nodes: parseCheapInlineMarkdown(stripCompleteHtmlComments(part.text), defs)
        })
      }
    } else {
      marked.push(part.text)
    }
  }
  flushMarked()
  return chunks
}

function isItemFenceClose(line: string, fence: { marker: string; indent: number }): boolean {
  const stripped = dedentLine(line, fence.indent)
  if (isFenceClose(stripped, fence.marker)) return true
  return leadingIndent(line) <= 3 && isFenceClose(line, fence.marker)
}

function stealItemSetext(
  item: CheapListItem,
  line: string,
  inline: (chunk: string) => CheapInlineNode[]
): boolean {
  const trimmed = line.trim()
  const marker = trimmed[0]
  if (marker !== '=' && marker !== '-') return false
  if (!/^(?:=+|-+)$/.test(trimmed)) return false
  if (item.extra?.length || item.blocks?.length) return false
  const src = cheapInlineSourceAll(item.nodes)
  const title = src.split('\n').pop() ?? ''
  if (!title) return false
  if (isPendingSetextUnderline(line)) return false
  if (marker === '-' && looksLikeGfmTableCells(title)) return false
  if (src === title) item.nodes = []
  else item.nodes = inline(src.slice(0, -(title.length + 1)))
  appendItemBlock(item, {
    type: 'heading',
    level: marker === '=' ? 1 : 2,
    nodes: inline(title)
  })
  return true
}
/** CommonMark thematic break：`---` / `* * *` / `- - -`（标记之间可空） */
const HR_RE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})[ \t]*$/

function parseHrLine(line: string, baseIndent = 0): boolean {
  const stripped = baseIndent ? dedentLine(line, baseIndent) : line
  return HR_RE.test(stripped)
}

const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/

function isGfmTableSep(line: string): boolean {
  if (!TABLE_SEP_RE.test(line)) return false
  const cells = splitGfmTableCells(line)
  if (cells.length >= 2) return true
  // 单列必须带 `|`，否则 `---` 会跟 HR / Setext 抢
  return /^\s*\|/.test(line) && /^:?-+:?$/.test(cells[0] ?? '')
}

function isGfmTableRow(line: string): boolean {
  return TABLE_ROW_RE.test(line) || isGfmTableSep(line)
}

/** GFM 允许不写两侧 `|`：`Name | Value` / `--- | ---`；单列必须带 `|` */
function looksLikeGfmTableCells(line: string): boolean {
  if (isGfmTableSep(line)) return true
  if (!line.includes('|')) return false
  const cells = splitGfmTableCells(line)
  if (cells.length >= 2) return true
  return /^\s*\|/.test(line) && cells.length === 1
}

/**
 * 分隔行还在 `|` / `| -` 前缀时先不当数据行，避免 tbody 先挂一行再拆掉跳贴底。
 * `| 1 |` 这种已有非分隔内容的行仍立刻画。
 */
function isPendingGfmTableSepLine(line: string): boolean {
  if (isGfmTableSep(line) || !line.includes('|')) return false
  const cells = splitGfmTableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-*:?$/.test(cell))
}

/** 下一项只打了 `-` / `1.`，还没到 GFM 要求的空格：先不并进当前项 */
function isPendingListMarkerLine(line: string): boolean {
  return /^\s*(?:[-+*]|\d+[.)])\s*$/.test(line)
}

/** Setext 下划线还不到三连时先当段落，避免第一个 `=` / `-` 就把 `<p>` 换成标题跳贴底 */
function isPendingSetextUnderline(line: string): boolean {
  const trimmed = line.trim()
  return /^(?:=+|-+)$/.test(trimmed) && trimmed.length < 3
}

function endsWithUnescapedPipe(text: string): boolean {
  if (!text.endsWith('|')) return false
  let slashes = 0
  for (let i = text.length - 2; i >= 0 && text[i] === '\\'; i--) slashes += 1
  return slashes % 2 === 0
}

/** GFM 表格：`\|` 是单元格里的竖线，不拆列 */
function splitGfmTableCells(line: string): string[] {
  const text = line.trim()
  let start = text.startsWith('|') ? 1 : 0
  let end = text.length
  if (end > start && endsWithUnescapedPipe(text)) end -= 1
  const cells: string[] = []
  let cur = ''
  for (let i = start; i < end; i++) {
    const ch = text[i]!
    if (ch === '\\' && i + 1 < end) {
      cur += text[i + 1]
      i += 1
      continue
    }
    if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells
}

function parseGfmTableAlign(sepLine: string): Array<'left' | 'right' | 'center' | null> {
  return splitGfmTableCells(sepLine).map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

function dedentLine(line: string, indent: number): string {
  let n = 0
  let i = 0
  while (i < line.length && n < indent) {
    if (line[i] === ' ') {
      n += 1
      i += 1
    } else if (line[i] === '\t') {
      n += 2
      i += 1
    } else break
  }
  return line.slice(i)
}

function appendItemBlock(item: CheapListItem, block: CheapProseBlock): void {
  item.blocks = [...(item.blocks ?? []), block]
}

function tableBlockFromLines(
  raw: string[],
  inline: (chunk: string) => CheapInlineNode[]
): Extract<CheapProseBlock, { type: 'table' }> | null {
  const sepIdx = raw.findIndex(isGfmTableSep)
  if (sepIdx <= 0) {
    // 直播时分隔行还没到：左侧 `|` 的行先画成表，避免先段落再跳成 table
    const cellLine = (line: string) => isGfmTableRow(line) || looksLikeGfmTableCells(line)
    if (!raw.length || !raw.some(cellLine)) return null
    if (!raw.every(cellLine)) return null
    return {
      type: 'table',
      header: splitGfmTableCells(raw[0] ?? '').map((cell) => inline(cell)),
      rows: raw
        .slice(1)
        .filter((line) => !isPendingGfmTableSepLine(line))
        .map((line) => splitGfmTableCells(line).map((cell) => inline(cell)))
    }
  }
  const header = splitGfmTableCells(raw[sepIdx - 1] ?? '').map((cell) => inline(cell))
  const rows = raw
    .slice(sepIdx + 1)
    .filter((line) => !isGfmTableSep(line))
    .map((line) => splitGfmTableCells(line).map((cell) => inline(cell)))
  return { type: 'table', header, rows, align: parseGfmTableAlign(raw[sepIdx] ?? '') }
}

function stripQuoteMarker(line: string): string {
  const match = QUOTE_RE.exec(line)
  return match ? (match[1] ?? '') : line
}

/** CommonMark lazy continuation：引用段落后一行可以没有 `>`，列表/标题/HR/围栏会打断 */
function isQuoteLazyLine(line: string): boolean {
  if (line.trim() === '') return false
  if (QUOTE_RE.test(line)) return false
  if (FENCE_RE.test(line)) return false
  if (HEADING_RE.test(line)) return false
  if (HR_RE.test(line)) return false
  if (parseListLine(line)) return false
  return true
}

function isIndentCodeLine(line: string): boolean {
  return (
    /^(?:    |\t)/.test(line) &&
    !parseListLine(line) &&
    !parseLinkDefinitionLine(line) &&
    parseLinkDefinitionTitleLine(line) == null
  )
}

/** 把散文尾拆成标题 / 列表 / 引用 / 段落，直播时用对应标签减少收束跳动 */
export function parseCheapProseBlocks(
  text: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] {
  const src = normalizeStreamingText(text)
  if (!src) return []
  const lines = src.split('\n')
  const linkDefScan = src.includes(']:') ? scanLinkDefinitions(lines) : EMPTY_LINK_SCAN
  const linkDefs = defs ?? linkDefScan.defs
  const footnoteScan = src.includes('[^') ? scanFootnoteDefinitions(lines) : EMPTY_FOOTNOTE_SCAN
  const footnoteDefs = footnoteScan.defs
  const blocks: CheapProseBlock[] = []
  let para: string[] = []
  let list: {
    ordered: boolean
    indent: number
    items: CheapListItem[]
    afterBlank: boolean
    loose: boolean
    start?: number
  } | null = null
  let quote: QuotePart[] = []
  let table: string[] | null = null
  let pre: string[] | null = null
  let fence: { marker: string; lang?: string; lines: string[] } | null = null
  let itemFence: {
    marker: string
    lang?: string
    indent: number
    lines: string[]
    item: CheapListItem
  } | null = null
  let itemTable: { lines: string[]; item: CheapListItem } | null = null
  let itemQuote: { parts: QuotePart[]; item: CheapListItem } | null = null
  let itemCode: { indent: number; lines: string[]; item: CheapListItem } | null = null

  const inline = (chunk: string) => parseCheapInlineMarkdown(stripCompleteHtmlComments(chunk), linkDefs)
  const currentItem = () => (list && list.items.length ? list.items[list.items.length - 1]! : null)
  const flushItemFence = () => {
    if (!itemFence) return
    appendItemBlock(itemFence.item, { type: 'pre', text: itemFence.lines.join('\n'), lang: itemFence.lang })
    itemFence = null
  }
  const flushItemTable = () => {
    if (!itemTable) return
    const block = tableBlockFromLines(itemTable.lines, inline)
    const item = itemTable.item
    itemTable = null
    if (item && block) appendItemBlock(item, block)
  }
  const flushItemQuote = () => {
    if (!itemQuote) return
    const parts = itemQuote.parts
    const item = itemQuote.item
    itemQuote = null
    if (parts.length) appendItemBlock(item, { type: 'quote', blocks: quotePartsToBlocks(parts, linkDefs) })
  }
  const flushItemCode = () => {
    if (!itemCode) return
    appendItemBlock(itemCode.item, { type: 'pre', text: itemCode.lines.join('\n') })
    itemCode = null
  }
  const startItemOpener = (item: CheapListItem, text: string, contentIndent: number) => {
    const fenceOpen = parseFenceLine(text)
    if (fenceOpen) {
      item.nodes = []
      itemFence = {
        marker: fenceOpen.marker,
        lang: fenceLang(fenceOpen.info),
        indent: contentIndent,
        lines: [],
        item
      }
      return
    }
    const heading = parseHeadingLine(text, 0)
    if (heading && /^ {0,3}#{1,6}\s+/.test(text)) {
      item.nodes = []
      appendItemBlock(item, { type: 'heading', level: heading.level, nodes: inline(heading.text) })
      return
    }
    const quoted = parseQuoteLine(text, 0)
    if (quoted !== null && /^ {0,3}>/.test(text)) {
      item.nodes = []
      itemQuote = { parts: [{ text: quoted }], item }
      return
    }
    if (isGfmTableRow(text) || looksLikeGfmTableCells(text)) {
      item.nodes = []
      itemTable = { lines: [text.trim()], item }
    }
  }

  const flushPara = () => {
    if (!para.length) return
    const text = para.join('\n')
    para = []
    if (isBlankAfterHtmlComments(text)) return
    blocks.push({ type: 'p', nodes: inline(text) })
  }
  const flushPre = () => {
    if (!pre) return
    blocks.push({ type: 'pre', text: pre.map((line) => line.replace(/^(?:    |\t)/, '')).join('\n') })
    pre = null
  }
  const flushFence = () => {
    if (!fence) return
    blocks.push({
      type: 'pre',
      text: fence.lines.join('\n'),
      lang: fence.lang
    })
    fence = null
  }
  const flushList = () => {
    flushItemFence()
    flushItemTable()
    flushItemQuote()
    flushItemCode()
    if (!list) return
    const loose = list.loose || list.items.some((item) => Boolean(item.extra?.length))
    blocks.push({
      type: 'list',
      ordered: list.ordered,
      items: list.items,
      loose: loose || undefined,
      start: list.ordered && list.start && list.start !== 1 ? list.start : undefined
    })
    list = null
  }
  const flushQuote = () => {
    if (!quote.length) return
    // Marked lines already had one `>` stripped. Recurse so `> > inner`
    // becomes quote > quote. Lazy lines stay in the last paragraph so
    // GFM tables / fences cannot start on a continuation without `>`.
    blocks.push({
      type: 'quote',
      blocks: quotePartsToBlocks(quote, linkDefs)
    })
    quote = []
  }
  const flushTable = () => {
    if (!table) return
    const raw = table
    table = null
    const sepIdx = raw.findIndex(isGfmTableSep)
    if (sepIdx <= 0) {
      const tentative = tableBlockFromLines(raw, inline)
      if (tentative) {
        blocks.push(tentative)
        return
      }
      for (const line of raw) {
        if (!isGfmTableSep(line)) para.push(line)
      }
      flushPara()
      return
    }
    for (const line of raw.slice(0, sepIdx - 1)) {
      if (!isGfmTableSep(line) && !isBlankAfterHtmlComments(line)) {
        blocks.push({ type: 'p', nodes: inline(line) })
      }
    }
    const block = tableBlockFromLines(raw.slice(sepIdx - 1), inline)
    if (block) blocks.push(block)
  }
  const flushAll = () => {
    flushFence()
    flushItemFence()
    flushItemTable()
    flushItemQuote()
    flushItemCode()
    flushTable()
    flushPre()
    flushPara()
    flushList()
    flushQuote()
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!
    if (fence) {
      if (isFenceClose(line, fence.marker)) {
        flushFence()
        continue
      }
      fence.lines.push(line)
      continue
    }
    if (itemFence) {
      if (isItemFenceClose(line, itemFence)) {
        flushItemFence()
        continue
      }
      if (line.trim() === '' || leadingIndent(line) >= itemFence.indent) {
        itemFence.lines.push(dedentLine(line, itemFence.indent))
        continue
      }
      flushItemFence()
      if (list && leadingIndent(line) <= list.indent) flushList()
    }
    if (itemCode) {
      if (line.trim() === '' || leadingIndent(line) >= itemCode.indent) {
        itemCode.lines.push(line.trim() === '' ? '' : dedentLine(line, itemCode.indent))
        continue
      }
      flushItemCode()
    }
    if (itemQuote) {
      const quoteBase = itemQuote.item.contentIndent ?? list?.indent ?? 0
      const quoted =
        parseQuoteLine(line, quoteBase) ??
        parseQuoteLine(line, list?.indent ?? 0) ??
        (leadingIndent(line) <= 3 ? parseQuoteLine(line, 0) : null)
      const indented = !list || leadingIndent(line) > list.indent
      if (quoted !== null && indented) {
        itemQuote.parts.push({ text: quoted })
        continue
      }
      if (isQuoteLazyLine(line) && !quotePartsHaveOpenFence(itemQuote.parts) && indented) {
        itemQuote.parts.push({ text: line.trimStart(), lazy: true })
        continue
      }
      flushItemQuote()
    }
    if (footnoteScan.skip.has(lineIndex) || linkDefScan.skip.has(lineIndex)) {
      flushAll()
      continue
    }
    if (quote.length && isQuoteLazyLine(line) && !quotePartsHaveOpenFence(quote)) {
      quote.push({ text: line.trimStart(), lazy: true })
      continue
    }
    if (pre && !isIndentCodeLine(line)) {
      flushPre()
    }
    if (!para.length && !list && !quote.length && !table && isIndentCodeLine(line)) {
      if (!pre) pre = []
      pre.push(line)
      continue
    }
    if (itemTable) {
      if (isGfmTableRow(line) || looksLikeGfmTableCells(line)) {
        itemTable.lines.push(line.trim())
        continue
      }
      flushItemTable()
    }
    if (
      list &&
      list.items.length &&
      isGfmTableSep(line) &&
      leadingIndent(line) > list.indent
    ) {
      const item = deepestItemForIndent(list.items, leadingIndent(line)) ?? currentItem()!
      const src = cheapInlineSourceAll(item.nodes)
      const header = src.split('\n').pop() ?? ''
      if (header && looksLikeGfmTableCells(header)) {
        if (src === header) item.nodes = []
        else item.nodes = inline(src.slice(0, -(header.length + 1)))
        itemTable = { lines: [header, line.trim()], item }
        continue
      }
    }
    if (isGfmTableSep(line) && !table && para.length === 1 && looksLikeGfmTableCells(para[0]!)) {
      flushPre()
      flushList()
      flushQuote()
      table = [para[0]!, line]
      para = []
      continue
    }
    if (
      (isGfmTableRow(line) && !(isGfmTableSep(line) && !table)) ||
      (looksLikeGfmTableCells(line) &&
        (Boolean(table) || /^\s*\|/.test(line)) &&
        !(isGfmTableSep(line) && !table))
    ) {
      if (!(list && list.items.length && leadingIndent(line) > list.indent && !table)) {
        flushPre()
        flushPara()
        flushList()
        flushQuote()
        if (!table) table = []
        table.push(line)
        continue
      }
    }
    if (
      table &&
      table.length &&
      !/^\s*\|/.test(table[0] ?? '') &&
      line.trim() !== '' &&
      !parseListLine(line) &&
      !parseHeadingLine(line) &&
      !FENCE_RE.test(line) &&
      !HR_RE.test(line) &&
      !QUOTE_RE.test(line)
    ) {
      table.push(line)
      continue
    }
    if (para.length && !list && !quote.length && !table && !pre && SETEXT_RE.test(line)) {
      const marker = line.trim()[0]
      if (isPendingSetextUnderline(line)) {
        continue
      }
      if (
        marker === '-' &&
        para.length === 1 &&
        looksLikeGfmTableCells(para[0]!)
      ) {
        continue
      }
      if (marker === '=' || marker === '-') {
        const title = para.join('\n')
        para = []
        blocks.push({
          type: 'heading',
          level: marker === '=' ? 1 : 2,
          nodes: inline(title)
        })
        continue
      }
    }
    if (list && list.items.length && leadingIndent(line) > list.indent && SETEXT_RE.test(line)) {
      if (isPendingSetextUnderline(line)) {
        continue
      }
      const item = deepestItemForIndent(list.items, leadingIndent(line))
      if (item && stealItemSetext(item, line, inline)) {
        list.afterBlank = false
        continue
      }
    }
    if (list && list.items.length && leadingIndent(line) > list.indent) {
      const item = deepestItemForIndent(list.items, leadingIndent(line)) ?? currentItem()!
      const base = item.contentIndent ?? list.indent
      if (parseHrLine(line, base) || HR_RE.test(line)) {
        if (list.afterBlank) markItemListLoose(list, item)
        appendItemBlock(item, { type: 'hr' })
        list.afterBlank = false
        continue
      }
    }
    if (HR_RE.test(line)) {
      flushAll()
      blocks.push({ type: 'hr' })
      continue
    }
    if (list && list.items.length && leadingIndent(line) > list.indent) {
      const item = deepestItemForIndent(list.items, leadingIndent(line)) ?? currentItem()!
      const base = item.contentIndent ?? list.indent
      const itemFenceOpen = parseFenceLineAt(line, base) ?? parseFenceLine(line)
      if (itemFenceOpen) {
        if (list.afterBlank) markItemListLoose(list, item)
        itemFence = {
          marker: itemFenceOpen.marker,
          lang: fenceLang(itemFenceOpen.info),
          indent: leadingIndent(line),
          lines: [],
          item
        }
        list.afterBlank = false
        continue
      }
      const itemHeading = parseHeadingLine(line, base) ?? parseHeadingLine(line, 0)
      if (itemHeading) {
        if (list.afterBlank) markItemListLoose(list, item)
        appendItemBlock(item, {
          type: 'heading',
          level: itemHeading.level,
          nodes: inline(itemHeading.text)
        })
        list.afterBlank = false
        continue
      }
      const itemQuoted =
        parseQuoteLine(line, base) ?? parseQuoteLine(line, list.indent) ?? parseQuoteLine(line, 0)
      if (itemQuoted !== null) {
        if (list.afterBlank) markItemListLoose(list, item)
        itemQuote = { parts: [{ text: itemQuoted }], item }
        list.afterBlank = false
        continue
      }
      if (isGfmTableRow(line) || looksLikeGfmTableCells(line)) {
        if (list.afterBlank) markItemListLoose(list, item)
        itemTable = { lines: [line.trim()], item }
        list.afterBlank = false
        continue
      }
    }
    if (list && list.items.length && list.afterBlank && line.trim() !== '') {
      const item = deepestItemForIndent(list.items, leadingIndent(line)) ?? currentItem()!
      const base = item.contentIndent ?? list.indent
      if (leadingIndent(line) >= base + 4) {
        markItemListLoose(list, item)
        itemCode = {
          indent: base + 4,
          lines: [dedentLine(line, base + 4)],
          item
        }
        list.afterBlank = false
        continue
      }
    }
    const fenceOpen = parseFenceLine(line)
    if (fenceOpen) {
      flushTable()
      flushPre()
      flushPara()
      flushList()
      flushQuote()
      fence = {
        marker: fenceOpen.marker,
        lang: fenceLang(fenceOpen.info),
        lines: []
      }
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushAll()
      const level = Math.min(6, heading[1].length) as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ type: 'heading', level, nodes: inline(stripAtxClosingHashes(heading[2] ?? '')) })
      continue
    }
    const listLine = parseListLine(line)
    if (listLine) {
      flushItemFence()
      flushItemTable()
      flushItemQuote()
      flushItemCode()
      flushTable()
      flushPre()
      flushPara()
      flushQuote()
      if (list && listLine.indent > list.indent && list.items.length) {
        const parent = list.items[list.items.length - 1]!
        if (list.afterBlank) {
          if (parent.nested?.items.length) parent.nested.loose = true
          else list.loose = true
        }
        const nested = appendNestedListItem(
          parent,
          listLine.ordered,
          listLine.indent,
          listLine.text,
          linkDefs,
          listLine.start,
          listLine.contentIndent
        )
        startItemOpener(nested, listLine.text, listLine.contentIndent)
        list.afterBlank = false
        continue
      }
      if (!list || list.ordered !== listLine.ordered || listLine.indent < list.indent) {
        flushList()
        list = {
          ordered: listLine.ordered,
          indent: listLine.indent,
          items: [],
          afterBlank: false,
          loose: false,
          start: listLine.start
        }
      }
      if (list.afterBlank && list.items.length) list.loose = true
      const item: CheapListItem = {
        nodes: inline(listLine.text),
        contentIndent: listLine.contentIndent
      }
      list.items.push(item)
      startItemOpener(item, listLine.text, listLine.contentIndent)
      list.afterBlank = false
      continue
    }
    if (list && isPendingListMarkerLine(line)) {
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
      const item = deepestItemForIndent(list.items, leadingIndent(line)) ?? currentItem()!
      if (list.afterBlank) markItemListLoose(list, item)
      appendListContinuation(item, leadingIndent(line), line.trimStart(), {
        newParagraph: list.afterBlank,
        defs: linkDefs
      })
      list.afterBlank = false
      continue
    }
    const q = QUOTE_RE.exec(line)
    if (q) {
      flushTable()
      flushPre()
      flushPara()
      flushList()
      quote.push({ text: q[1] ?? '' })
      continue
    }
    if (line.trim() === '') {
      flushTable()
      flushPre()
      flushPara()
      flushQuote()
      if (list) list.afterBlank = true
      else flushList()
      continue
    }
    flushTable()
    flushPre()
    flushList()
    flushQuote()
    para.push(line)
  }
  flushAll()
  if (footnoteDefs.size) {
    const footnoteRefs = new Set<string>()
    const refRe = /\[\^([^\]\n]+)\]/g
    for (let i = 0; i < lines.length; i++) {
      if (footnoteScan.skip.has(i)) continue
      const line = lines[i]!
      refRe.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = refRe.exec(line))) footnoteRefs.add(match[1]!)
    }
    const items = [...footnoteDefs]
      .filter(([id]) => footnoteRefs.has(id))
      .map(([id, body]) => ({
        id,
        paragraphs: body.split(/\n\n/).map((paraText) => inline(paraText))
      }))
    if (items.length) blocks.push({ type: 'footnotes', items })
  }
  return blocks
}

function sameInlineShape(prev: CheapInlineNode[], next: CheapInlineNode[]): boolean {
  if (prev.length !== next.length) return false
  return prev.every((node, i) => {
    const other = next[i]
    if (!other || node.type !== other.type) return false
    if (node.type === 'link' && other.type === 'link') return node.href === other.href
    return true
  })
}

function reuseInlineNodes(prev: CheapInlineNode[], next: CheapInlineNode[]): CheapInlineNode[] {
  const prevSrc = cheapInlineSourceAll(prev)
  const nextSrc = cheapInlineSourceAll(next)
  if (prevSrc === nextSrc) return sameInlineShape(prev, next) ? prev : next
  if (nextSrc.startsWith(prevSrc)) {
    const grown = continueCheapInlineMarkdown(prevSrc, prev, nextSrc)
    return sameInlineShape(grown, next) ? grown : next
  }
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
        nestedItems.every((item, index) => item === prevItem.nested!.items[index]) &&
        prevItem.nested.loose === nextItem.nested.loose &&
        prevItem.nested.start === nextItem.nested.start
      nested = nestedSame
        ? prevItem.nested
        : {
            ordered: nextItem.nested.ordered,
            indent: nextItem.nested.indent,
            items: nestedItems,
            start: nextItem.nested.start,
            loose: nextItem.nested.loose
          }
    }
    const extra = reuseInlineLists(prevItem.extra ?? [], nextItem.extra ?? [])
    const extraSame =
      extra.length === (prevItem.extra?.length ?? 0) &&
      extra.every((para, index) => para === prevItem.extra?.[index]) &&
      extra.length === (nextItem.extra?.length ?? 0)
    const suffix = reuseInlineNodes(prevItem.suffix ?? [], nextItem.suffix ?? [])
    const suffixSame =
      suffix.length === (prevItem.suffix?.length ?? 0) &&
      suffix.every((node, index) => node === prevItem.suffix?.[index]) &&
      suffix.length === (nextItem.suffix?.length ?? 0)
    const prevBlocks = prevItem.blocks ?? []
    const nextBlocks = nextItem.blocks ?? []
    const blocks = nextBlocks.map((block, index) => {
      const prevBlock = prevBlocks[index]
      return prevBlock ? reuseCheapProseBlock(prevBlock, block) ?? block : block
    })
    const blocksSame =
      blocks.length === prevBlocks.length &&
      blocks.length === nextBlocks.length &&
      blocks.every((block, index) => block === prevBlocks[index])
    if (nodes === prevItem.nodes && nested === prevItem.nested && extraSame && suffixSame && blocksSame) {
      out.push(prevItem)
    } else {
      out.push({
        nodes,
        extra: extra.length ? extra : undefined,
        suffix: suffix.length ? suffix : undefined,
        nested,
        blocks: blocks.length ? blocks : undefined,
        contentIndent: nextItem.contentIndent ?? prevItem.contentIndent
      })
    }
  }
  if (next.length > prev.length) out.push(...next.slice(prev.length))
  return out
}

function reuseCheapProseBlock(prev: CheapProseBlock, next: CheapProseBlock): CheapProseBlock | null {
  if (prev.type !== next.type) return null
  if (prev.type === 'hr' && next.type === 'hr') return prev
  if (prev.type === 'pre' && next.type === 'pre') {
    return prev.text === next.text && prev.lang === next.lang ? prev : next
  }
  if (prev.type === 'footnotes' && next.type === 'footnotes') {
    const items = next.items.map((item, i) => {
      const prevItem = prev.items[i]
      if (!prevItem || prevItem.id !== item.id) return item
      const paragraphs = reuseInlineLists(prevItem.paragraphs, item.paragraphs)
      const sameParas =
        paragraphs.length === prevItem.paragraphs.length &&
        paragraphs.every((para, index) => para === prevItem.paragraphs[index])
      return sameParas ? prevItem : { id: item.id, paragraphs }
    })
    const same =
      items.length === prev.items.length && items.every((item, i) => item === prev.items[i])
    return same ? prev : { type: 'footnotes', items }
  }
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
    const childBlocks = next.blocks.map((block, i) => {
      const reused = prev.blocks[i] ? reuseCheapProseBlock(prev.blocks[i]!, block) : null
      return reused ?? block
    })
    const same =
      childBlocks.length === prev.blocks.length &&
      childBlocks.every((block, i) => block === prev.blocks[i])
    return same ? prev : { type: 'quote', blocks: childBlocks }
  }
  if (prev.type === 'list' && next.type === 'list') {
    if (prev.ordered !== next.ordered) return null
    const items = reuseListItems(prev.items, next.items)
    const same =
      items.length === prev.items.length &&
      items.every((item, i) => item === prev.items[i]) &&
      prev.loose === next.loose &&
      prev.start === next.start
    return same
      ? prev
      : { type: 'list', ordered: prev.ordered, items, loose: next.loose, start: next.start }
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
    const align = next.align ?? prev.align
    return headerSame && rowsSame ? prev : { type: 'table', header, rows, align }
  }
  return null
}

/** 增长尾里的表数据行（含无两侧 `|`），分隔行不当数据 */
function isLiveTableDataLine(line: string): boolean {
  if (isGfmTableSep(line) || isPendingGfmTableSepLine(line)) return false
  return isGfmTableRow(line) || looksLikeGfmTableCells(line)
}

/** 末行还可能改块类型时不要只续行内（Setext / 待写列表标记 / 表分隔） */
function lastLineNeedsFullProseParse(line: string): boolean {
  if (isPendingListMarkerLine(line)) return true
  if (isPendingSetextUnderline(line) || SETEXT_RE.test(line) || parseHrLine(line)) return true
  if (isGfmTableSep(line) || isPendingGfmTableSepLine(line) || looksLikeGfmTableCells(line)) return true
  if (parseFenceLine(line) || parseHeadingLine(line)) return true
  return false
}

/** 顶层列表最后一项在原文中的起点；嵌套项不算 */
function lastTopLevelListItemStart(text: string): number | null {
  const lines = text.split('\n')
  const first = parseListLine(lines[0] ?? '')
  if (!first) return null
  const topIndent = first.indent
  let start = 0
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const parsed = parseListLine(line)
    if (parsed && parsed.indent === topIndent && parsed.ordered === first.ordered) {
      start = offset
    } else if (parsed && parsed.indent < topIndent) {
      return null
    }
    offset += line.length + (i < lines.length - 1 ? 1 : 0)
  }
  return start
}

/** 只续最后一项的行内（无换行、无项内块），已画项保持同一引用 */
function growLastListItemInline(
  item: CheapListItem,
  suffix: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapListItem | null {
  if (item.nested?.items.length) {
    const nestedItems = item.nested.items
    const lastNested = nestedItems[nestedItems.length - 1]
    if (!lastNested) return null
    const grownNested = growLastListItemInline(lastNested, suffix, defs)
    if (!grownNested) return null
    if (grownNested === lastNested) return item
    return {
      nodes: item.nodes,
      extra: item.extra,
      suffix: item.suffix,
      blocks: item.blocks,
      contentIndent: item.contentIndent,
      nested: {
        ordered: item.nested.ordered,
        indent: item.nested.indent,
        items: [...nestedItems.slice(0, -1), grownNested],
        start: item.nested.start,
        loose: item.nested.loose
      }
    }
  }
  if (item.extra?.length || item.blocks?.length || item.suffix?.length) return null
  const prevSrc = cheapInlineSourceAll(item.nodes)
  const nodes = continueCheapInlineMarkdown(prevSrc, item.nodes, prevSrc + suffix, defs)
  return nodes === item.nodes ? item : { ...item, nodes }
}

/** 指定缩进的最后一项起点；缩进更浅的列表标记说明已离开这一层 */
function lastMatchingListItemStart(text: string, indent: number, ordered: boolean): number | null {
  const lines = text.split('\n')
  let start: number | null = null
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const parsed = parseListLine(line)
    if (parsed && parsed.indent === indent && parsed.ordered === ordered) start = offset
    else if (parsed && parsed.indent < indent) return null
    offset += line.length + (i < lines.length - 1 ? 1 : 0)
  }
  return start
}

/** 项内最后一块在该项原文中的起点（含写在列表标记同一行的围栏 / 标题 / 引用） */
function lastItemInnerBlockStart(
  itemPrev: string,
  last: CheapProseBlock,
  indent: number
): number | null {
  const fromBody =
    last.type === 'pre'
      ? firstMatchingLineStart(
          itemPrev,
          (line) =>
            Boolean(
              parseFenceLine(line) ||
                parseFenceLineAt(line, indent) ||
                (!last.lang && isIndentCodeLine(line))
            )
        )
      : lastBlockSourceStart(itemPrev, last)
  if (fromBody != null && fromBody > 0) return fromBody
  const nl = itemPrev.indexOf('\n')
  const firstLine = nl < 0 ? itemPrev : itemPrev.slice(0, nl)
  const parsed = parseListLine(firstLine)
  if (!parsed) return fromBody
  const openerAt = firstLine.length - parsed.text.length
  const content = parsed.text
  const matches =
    (last.type === 'pre' && Boolean(parseFenceLine(content))) ||
    (last.type === 'pre' && !last.lang && isIndentCodeLine(content)) ||
    (last.type === 'heading' && Boolean(parseHeadingLine(content))) ||
    (last.type === 'quote' && parseQuoteLine(content) !== null) ||
    (last.type === 'table' && (isGfmTableRow(content) || looksLikeGfmTableCells(content))) ||
    (last.type === 'hr' && parseHrLine(content))
  return matches ? openerAt : fromBody
}

/** 已闭合单行项内块（ATX / HR / Setext 下划线窗）后面的后缀 */
function suffixAfterClosedSingleLineBlock(prevNorm: string, nextText: string): string | null {
  const nl = prevNorm.indexOf('\n')
  const first = nl < 0 ? prevNorm : prevNorm.slice(0, nl)
  if (!nextText.startsWith(first)) return null
  if (nextText === first) return ''
  if (!nextText.startsWith(`${first}\n`)) return null
  const after = nextText.slice(first.length + 1)
  if (after.split('\n').some((line) => lineOpensNewCheapBlock(line))) return null
  return after
}

/** 已闭合项内表后面的非表续行；还在长表行 / 新表行时留给表增量 */
function suffixAfterClosedTable(prevNorm: string, nextText: string): string | null {
  if (!nextText.startsWith(prevNorm)) return null
  const extra = nextText.slice(prevNorm.length)
  if (!extra) return ''
  if (!extra.startsWith('\n')) return null
  const after = extra.slice(1)
  if (!after) return ''
  const first = after.split('\n')[0] ?? ''
  if (isGfmTableRow(first) || looksLikeGfmTableCells(first) || isGfmTableSep(first)) return null
  if (after.split('\n').some((line) => lineOpensNewCheapBlock(line))) return null
  return after
}

/** 已闭合项内围栏后面的原文（含另起的表 / 标题 / 引用） */
function textAfterClosedFence(prevNorm: string, nextText: string): string | null {
  const prevLines = prevNorm.split('\n')
  const nextLines = nextText.split('\n')
  const open = parseFenceLine(prevLines[0] ?? '') ?? parseFenceLine(nextLines[0] ?? '')
  if (!open) return null
  const closerAt = (lines: string[]) => {
    for (let i = 1; i < lines.length; i++) {
      if (isFenceClose(lines[i]!, open.marker)) return i
    }
    return -1
  }
  if (closerAt(prevLines) < 0) return null
  const closer = closerAt(nextLines)
  if (closer < 0) return null
  return nextLines.slice(closer + 1).join('\n')
}

/** 闭合块后的续行：先当 suffix，遇到新块再另起项内块 */
function splitSuffixAndSiblingBlocks(
  after: string,
  prevSuffix: CheapInlineNode[] | undefined,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): { suffix?: CheapInlineNode[]; blocks: CheapProseBlock[] } | null {
  const lines = after.split('\n')
  let split = 0
  while (split < lines.length && !lineOpensNewCheapBlock(lines[split]!)) split++
  const suffixSrc = lines.slice(0, split).join('\n')
  const rest = lines.slice(split).join('\n')
  const blocks = rest ? parseCheapProseBlocks(rest, defs) : []
  if (rest && !blocks.length) return null
  const suffix = suffixSrc
    ? continueCheapInlineMarkdown(cheapInlineSourceAll(prevSuffix ?? []), prevSuffix ?? [], suffixSrc, defs)
    : undefined
  return { suffix, blocks }
}

/** 只续最后一项的最后一块（含嵌套项内引用 / 围栏），已画外层项与嵌套项标题保持同一引用 */
function growLastListItemInnerBlocks(
  item: CheapListItem,
  itemPrev: string,
  itemNext: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapListItem | null {
  if (!itemNext.startsWith(itemPrev)) return null
  if (item.nested?.items.length) {
    const lastNested = item.nested.items[item.nested.items.length - 1]
    if (!lastNested) return null
    const nestedStart = lastMatchingListItemStart(itemPrev, item.nested.indent, item.nested.ordered)
    if (nestedStart == null) return null
    const grownNested = growLastListItemInnerBlocks(
      lastNested,
      itemPrev.slice(nestedStart),
      itemNext.slice(nestedStart),
      defs
    )
    if (!grownNested) return null
    if (grownNested === lastNested) return item
    return {
      nodes: item.nodes,
      extra: item.extra,
      suffix: item.suffix,
      blocks: item.blocks,
      contentIndent: item.contentIndent,
      nested: {
        ordered: item.nested.ordered,
        indent: item.nested.indent,
        items: [...item.nested.items.slice(0, -1), grownNested],
        start: item.nested.start,
        loose: item.nested.loose
      }
    }
  }
  const suffix = itemNext.slice(itemPrev.length)
  if (
    item.extra?.length &&
    !item.blocks?.length &&
    !item.suffix?.length &&
    suffix &&
    !suffix.includes('\n') &&
    !suffix.includes(']:') &&
    !itemPrev.endsWith('\n')
  ) {
    const lastPara = item.extra[item.extra.length - 1]!
    const prevSrc = cheapInlineSourceAll(lastPara)
    const nodes = continueCheapInlineMarkdown(prevSrc, lastPara, prevSrc + suffix, defs)
    if (nodes === lastPara) return item
    return { ...item, extra: [...item.extra.slice(0, -1), nodes] }
  }
  if (!item.blocks?.length) return null
  const last = item.blocks[item.blocks.length - 1]!
  const firstLine = itemPrev.slice(0, itemPrev.indexOf('\n') === -1 ? itemPrev.length : itemPrev.indexOf('\n'))
  const indent = item.contentIndent ?? parseListLine(firstLine)?.contentIndent ?? 0
  const start = lastItemInnerBlockStart(itemPrev, last, indent)
  if (start == null) return null
  const stripItemIndent = (text: string) =>
    indent ? text.split('\n').map((line) => dedentLine(line, indent)).join('\n') : text
  const prevWindow = stripItemIndent(itemPrev.slice(start))
  const nextWindow = stripItemIndent(itemNext.slice(start))
  const grown = continueLastBlockOfType(last, prevWindow, nextWindow, defs)
  const afterClosed =
    last.type === 'pre'
      ? textAfterClosedFence(prevWindow, nextWindow)
      : last.type === 'heading' || last.type === 'hr'
        ? suffixAfterClosedSingleLineBlock(prevWindow, nextWindow)
        : last.type === 'table'
          ? suffixAfterClosedTable(prevWindow, nextWindow)
          : null
  if (afterClosed != null) {
    if (afterClosed.includes(']:')) return null
    const nextBlocks =
      grown && grown.length === 1 && grown[0] !== last
        ? [...item.blocks.slice(0, -1), grown[0]!]
        : item.blocks
    if (!afterClosed) {
      return nextBlocks === item.blocks ? item : { ...item, blocks: nextBlocks }
    }
    const split = splitSuffixAndSiblingBlocks(afterClosed, item.suffix, defs)
    if (!split) return null
    const blocks = split.blocks.length ? [...nextBlocks, ...split.blocks] : nextBlocks
    if (split.suffix === item.suffix && blocks === nextBlocks && nextBlocks === item.blocks) {
      return item
    }
    return { ...item, blocks, suffix: split.suffix }
  }
  if (!grown || grown.length !== 1) return null
  if (grown[0] === last) return item
  return { ...item, blocks: [...item.blocks.slice(0, -1), grown[0]!] }
}

function continueLastListBlock(
  prev: Extract<CheapProseBlock, { type: 'list' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix.includes('\n') && !suffix.includes(']:') && !prevNorm.endsWith('\n')) {
    const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
    if (!lastLineNeedsFullProseParse(lastLine) && prev.items.length) {
      const lastItem = prev.items[prev.items.length - 1]!
      const grown = growLastListItemInline(lastItem, suffix, defs)
      if (grown) {
        if (grown === lastItem) return [prev]
        return [
          {
            type: 'list',
            ordered: prev.ordered,
            items: [...prev.items.slice(0, -1), grown],
            loose: prev.loose,
            start: prev.start
          }
        ]
      }
    }
  }
  const start = lastTopLevelListItemStart(prevNorm)
  if (start == null) return null
  const lastItem = prev.items[prev.items.length - 1]
  if (lastItem && !suffix.includes(']:') && (lastItem.blocks?.length || lastItem.nested?.items.length || lastItem.extra?.length)) {
    const grownItem = growLastListItemInnerBlocks(lastItem, prevNorm.slice(start), nextText.slice(start), defs)
    if (grownItem) {
      if (grownItem === lastItem) return [prev]
      return [
        {
          type: 'list',
          ordered: prev.ordered,
          items: [...prev.items.slice(0, -1), grownItem],
          loose: prev.loose,
          start: prev.start
        }
      ]
    }
  }
  const parsedPrev = parseCheapProseBlocks(prevNorm.slice(start), defs)
  const parsedNext = parseCheapProseBlocks(nextText.slice(start), defs)
  if (parsedPrev.length !== 1 || parsedNext.length !== 1) return null
  const prevWindow = parsedPrev[0]
  const nextWindow = parsedNext[0]
  if (prevWindow?.type !== 'list' || nextWindow?.type !== 'list') return null
  if (prevWindow.items.length !== 1 || nextWindow.ordered !== prev.ordered) return null
  if (prevWindow.ordered !== prev.ordered) return null
  const keep = prev.items.slice(0, -1)
  const tail = reuseListItems(prev.items.slice(-1), nextWindow.items)
  const items = [...keep, ...tail]
  const loose = prev.loose || nextWindow.loose || items.some((item) => Boolean(item.extra?.length))
  const same =
    items.length === prev.items.length &&
    items.every((item, index) => item === prev.items[index]) &&
    prev.loose === loose &&
    prev.start === nextWindow.start
  return same
    ? [prev]
    : [{ type: 'list', ordered: prev.ordered, items, loose: loose || undefined, start: prev.start }]
}

function growLastTableCellsInline(
  prev: Extract<CheapProseBlock, { type: 'table' }>,
  suffix: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  if (!suffix || suffix.includes('|') || suffix.includes('\n') || suffix.includes(']:')) return null
  const growCells = (cells: CheapInlineNode[][]): CheapInlineNode[][] | null => {
    if (!cells.length) return null
    const last = cells[cells.length - 1]!
    const prevSrc = cheapInlineSourceAll(last)
    const next = continueCheapInlineMarkdown(prevSrc, last, prevSrc + suffix, defs)
    return next === last ? cells : [...cells.slice(0, -1), next]
  }
  if (prev.rows.length) {
    const lastRow = prev.rows[prev.rows.length - 1]!
    const grown = growCells(lastRow)
    if (!grown) return null
    if (grown === lastRow) return [prev]
    return [{ type: 'table', header: prev.header, rows: [...prev.rows.slice(0, -1), grown], align: prev.align }]
  }
  const grownHeader = growCells(prev.header)
  if (!grownHeader) return null
  if (grownHeader === prev.header) return [prev]
  return [{ type: 'table', header: grownHeader, rows: prev.rows, align: prev.align }]
}

function continueLastTableBlock(
  prev: Extract<CheapProseBlock, { type: 'table' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
  if (isLiveTableDataLine(lastLine) || (!prev.rows.length && looksLikeGfmTableCells(lastLine) && !isGfmTableSep(lastLine))) {
    const inline = growLastTableCellsInline(prev, nextText.slice(prevNorm.length), defs)
    if (inline) return inline
  }
  if (!prev.rows.length) return null
  const prevLines = prevNorm.split('\n')
  const sepIdx = prevLines.findIndex(isGfmTableSep)
  if (sepIdx <= 0) return null
  let lastRowIdx = -1
  for (let i = prevLines.length - 1; i > sepIdx; i--) {
    if (isLiveTableDataLine(prevLines[i]!)) {
      lastRowIdx = i
      break
    }
  }
  if (lastRowIdx < 0) return null
  const nextLines = nextText.split('\n')
  if (nextLines.length <= lastRowIdx) return null
  if (nextLines.findIndex(isGfmTableSep) !== sepIdx) return null
  const windowText = [...nextLines.slice(0, sepIdx + 1), ...nextLines.slice(lastRowIdx)].join('\n')
  const parsed = parseCheapProseBlocks(windowText, defs)
  if (parsed.length !== 1 || parsed[0]?.type !== 'table') return null
  const nextTable = parsed[0]
  if (nextTable.header.length !== prev.header.length || nextTable.rows.length < 1) return null
  const header = reuseInlineLists(prev.header, nextTable.header)
  const lastPrevRow = prev.rows[prev.rows.length - 1]!
  const grownRows = nextTable.rows.map((row, index) =>
    index === 0 ? reuseInlineLists(lastPrevRow, row) : row
  )
  const rows = [...prev.rows.slice(0, -1), ...grownRows]
  const headerSame = header.length === prev.header.length && header.every((cell, index) => cell === prev.header[index])
  const rowsSame =
    rows.length === prev.rows.length &&
    rows.every(
      (row, index) =>
        row.length === prev.rows[index]?.length && row.every((cell, col) => cell === prev.rows[index]?.[col])
    )
  const align = nextTable.align ?? prev.align
  return headerSame && rowsSame ? [prev] : [{ type: 'table', header, rows, align }]
}

/** 新行会另起列表 / 标题 / 引用 / 表等时不要并进当前段落 */
function lineOpensNewCheapBlock(line: string): boolean {
  if (!line) return false
  if (lastLineNeedsFullProseParse(line)) return true
  if (parseListLine(line) || parseQuoteLine(line) !== null || isIndentCodeLine(line)) return true
  return Boolean(parseFootnoteDefinitionLine(line))
}

/** 续段落（含软换行后续写）：已画行内保持同一引用（对标 Codex #22860 / #34045） */
function continueLastParagraphBlock(
  prev: Extract<CheapProseBlock, { type: 'p' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || suffix.includes(']:') || nextText.includes('\n\n')) return null
  const lines = nextText.split('\n')
  for (let i = 1; i < lines.length; i++) {
    if (lineOpensNewCheapBlock(lines[i]!)) return null
  }
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n')) {
    const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
    if (lastLineNeedsFullProseParse(lastLine)) return null
  }
  const nodes = continueCheapInlineMarkdown(prevNorm, prev.nodes, nextText, defs)
  return nodes === prev.nodes ? [prev] : [{ type: 'p', nodes }]
}

/** 剥一层 `>`，给引用内最后一块走与顶层相同的增量 */
function stripOuterQuotePrefixes(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const inner = parseQuoteLine(line)
      return inner !== null ? inner : line
    })
    .join('\n')
}

/** 新行仍在引用内（`>` / 懒续行）；空行后的非引用行或顶层列表 / 标题留给全量解析 */
function quoteGrowthStaysInside(nextText: string): boolean {
  let sawBlank = false
  for (const line of nextText.split('\n')) {
    if (parseQuoteLine(line) !== null) {
      sawBlank = false
      continue
    }
    if (line.trim() === '') {
      sawBlank = true
      continue
    }
    if (sawBlank) return false
    if (
      parseListLine(line) ||
      parseHeadingLine(line) ||
      parseFenceLine(line) ||
      parseHrLine(line) ||
      isIndentCodeLine(line) ||
      parseFootnoteDefinitionLine(line) ||
      isGfmTableRow(line) ||
      looksLikeGfmTableCells(line)
    ) {
      return false
    }
  }
  return true
}

/** 引用里最后一块增长（含换行后新列表项）：前面的引用子块保持同一引用 */
function continueLastQuoteBlock(
  prev: Extract<CheapProseBlock, { type: 'quote' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || suffix.includes(']:')) return null
  if (!quoteGrowthStaysInside(nextText)) return null
  const last = prev.blocks[prev.blocks.length - 1]
  if (!last) return null
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n') && last.type === 'p') {
    const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
    const innerLast = lastLine.replace(/^ {0,3}> ?/, '')
    if (lastLineNeedsFullProseParse(innerLast)) return null
    const prevSrc = cheapInlineSourceAll(last.nodes)
    const nodes = continueCheapInlineMarkdown(prevSrc, last.nodes, prevSrc + suffix, defs)
    if (nodes === last.nodes) return [prev]
    return [{ type: 'quote', blocks: [...prev.blocks.slice(0, -1), { type: 'p', nodes }] }]
  }
  const innerPrev = stripOuterQuotePrefixes(prevNorm)
  const innerNext = stripOuterQuotePrefixes(nextText)
  if (!innerNext.startsWith(innerPrev)) return null
  const closed = prev.blocks.slice(0, -1)
  let start = consumeClosedSingleLinePrefix(innerPrev, closed)
  if (start == null || start <= 0) start = lastBlockSourceStart(innerPrev, last)
  const grown =
    start != null && start > 0
      ? continueLastBlockOfType(last, innerPrev.slice(start), innerNext.slice(start), defs)
      : continueLastBlockOfType(last, innerPrev, innerNext, defs)
  if (grown?.length === 1 && grown[0] !== last) {
    return [{ type: 'quote', blocks: [...closed, grown[0]!] }]
  }
  if (grown?.length === 1 && grown[0] === last && innerNext.length === innerPrev.length) {
    return [prev]
  }
  const parsed = parseCheapProseBlocks(innerNext, defs)
  if (!parsed.length) return null
  const out = parsed.map((block, index) => {
    const prevBlock = prev.blocks[index]
    return prevBlock ? reuseCheapProseBlock(prevBlock, block) ?? block : block
  })
  const same =
    out.length === prev.blocks.length && out.every((block, index) => block === prev.blocks[index])
  return same ? [prev] : [{ type: 'quote', blocks: out }]
}

/** 脚注窗口最后一项的正文（定义行 + 缩进续行）；窗口里有杂行则放弃 */
function lastFootnoteItemBody(text: string): { id: string; body: string } | null {
  const lines = text.split('\n')
  let last: { id: string; body: string } | null = null
  let i = 0
  while (i < lines.length) {
    const def = parseFootnoteDefinitionLine(lines[i]!)
    if (!def) {
      if (lines[i]!.trim() === '' && i === lines.length - 1) break
      return null
    }
    const { body, end } = consumeFootnoteRegion(lines, i, def.text)
    last = { id: def.id, body }
    i = end
  }
  return last
}

/** 续脚注末项（含缩进续行 / 新段）：已画项 / 前段保持同一引用（对标 Codex #34045） */
function continueLastFootnotesBlock(
  prev: Extract<CheapProseBlock, { type: 'footnotes' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || suffix.includes(']:') || !prev.items.length) return null
  const lastItem = prev.items[prev.items.length - 1]!
  const prevLast = lastFootnoteItemBody(prevNorm)
  const nextLast = lastFootnoteItemBody(nextText)
  if (!prevLast || !nextLast || nextLast.id !== lastItem.id || prevLast.id !== lastItem.id) return null
  if (!nextLast.body.startsWith(prevLast.body)) return null
  const prevParts = prevLast.body ? prevLast.body.split(/\n\n/) : ['']
  const nextParts = nextLast.body ? nextLast.body.split(/\n\n/) : ['']
  const prevParas = lastItem.paragraphs.length ? lastItem.paragraphs : [[]]
  if (nextParts.length < prevParas.length || prevParts.length !== prevParas.length) return null
  const lastIdx = prevParas.length - 1
  const grownLast = continueCheapInlineMarkdown(
    prevParts[lastIdx] ?? '',
    prevParas[lastIdx] ?? [],
    nextParts[lastIdx] ?? '',
    defs
  )
  const extra = nextParts
    .slice(prevParas.length)
    .map((part) => parseCheapInlineMarkdown(part, defs))
  const paragraphs = [...prevParas.slice(0, -1), grownLast, ...extra]
  const same =
    extra.length === 0 &&
    paragraphs.length === lastItem.paragraphs.length &&
    paragraphs.every((para, index) => para === lastItem.paragraphs[index])
  if (same) return [prev]
  return [
    {
      type: 'footnotes',
      items: [...prev.items.slice(0, -1), { id: lastItem.id, paragraphs }]
    }
  ]
}

/** 无换行续 ATX 标题：已画行内保持同一引用（对标 Codex #34045） */
function continueLastHeadingBlock(
  prev: Extract<CheapProseBlock, { type: 'heading' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || suffix.includes('\n') || suffix.includes(']:') || suffix.includes('#') || prevNorm.endsWith('\n')) {
    return null
  }
  const prevH = parseHeadingLine(prevNorm)
  const nextH = parseHeadingLine(nextText)
  if (!prevH || !nextH || prevH.level !== nextH.level || prevH.level !== prev.level) return null
  const nodes = continueCheapInlineMarkdown(prevH.text, prev.nodes, nextH.text, defs)
  return nodes === prev.nodes ? [prev] : [{ type: 'heading', level: prev.level, nodes }]
}

/** 围栏窗口正文（去掉开闭行），给项内 / 引用内围栏增量用 */
function fencedPreBody(text: string): string | null {
  const lines = text.split('\n')
  const open = parseFenceLine(lines[0] ?? '')
  if (!open) return null
  const body: string[] = []
  for (let i = 1; i < lines.length; i++) {
    if (isFenceClose(lines[i]!, open.marker)) break
    body.push(lines[i]!)
  }
  return body.join('\n')
}

/** 缩进代码 / 项内围栏尾只改正文，不重扫块结构（对标 Codex #39061 / #34045） */
function continueLastPreBlock(
  prev: Extract<CheapProseBlock, { type: 'pre' }>,
  prevNorm: string,
  nextText: string
): CheapProseBlock[] | null {
  if (nextText.slice(prevNorm.length).includes(']:')) return null
  const first = prevNorm.split('\n')[0] ?? ''
  if (prev.lang || parseFenceLine(first)) {
    const nextBody = fencedPreBody(nextText)
    if (nextBody == null || !nextBody.startsWith(prev.text)) return null
    return nextBody === prev.text ? [prev] : [{ type: 'pre', text: nextBody, lang: prev.lang }]
  }
  const nextLines = nextText.split('\n')
  if (nextLines.some((line) => line.trim() !== '' && !isIndentCodeLine(line))) return null
  const stripIndent = (text: string) =>
    text.split('\n').map((line) => line.replace(/^(?:    |\t)/, '')).join('\n')
  const nextBody = stripIndent(nextText)
  if (nextBody === prev.text) return [prev]
  if (!nextBody.startsWith(prev.text)) return null
  return [{ type: 'pre', text: nextBody }]
}

function continueLastBlockOfType(
  last: CheapProseBlock,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  if (last.type === 'list') return continueLastListBlock(last, prevNorm, nextText, defs)
  if (last.type === 'table') return continueLastTableBlock(last, prevNorm, nextText, defs)
  if (last.type === 'p') return continueLastParagraphBlock(last, prevNorm, nextText, defs)
  if (last.type === 'quote') return continueLastQuoteBlock(last, prevNorm, nextText, defs)
  if (last.type === 'heading') return continueLastHeadingBlock(last, prevNorm, nextText, defs)
  if (last.type === 'pre') return continueLastPreBlock(last, prevNorm, nextText)
  if (last.type === 'footnotes') return continueLastFootnotesBlock(last, prevNorm, nextText, defs)
  return null
}

/** 第一行满足条件的起点 */
function firstMatchingLineStart(text: string, match: (line: string) => boolean): number | null {
  const lines = text.split('\n')
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (match(line)) return offset
    offset += line.length + (i < lines.length - 1 ? 1 : 0)
  }
  return null
}

/**
 * 最后一块在原文中的起点：段落后面新起的列表 / 标题 / 引用 / 表 / 脚注不必整尾重扫。
 */
function lastBlockSourceStart(text: string, last: CheapProseBlock): number | null {
  if (last.type === 'heading' || last.type === 'hr') {
    const nl = text.lastIndexOf('\n')
    return nl < 0 ? 0 : nl + 1
  }
  if (last.type === 'list') {
    return firstMatchingLineStart(text, (line) => Boolean(parseListLine(line)))
  }
  if (last.type === 'quote') {
    return firstMatchingLineStart(text, (line) => /^ {0,3}>/.test(line))
  }
  if (last.type === 'table') {
    return firstMatchingLineStart(text, (line) => isGfmTableRow(line) && !isGfmTableSep(line))
  }
  if (last.type === 'pre') {
    const fenceAt = firstMatchingLineStart(text, (line) => Boolean(parseFenceLine(line)))
    if (fenceAt != null) return fenceAt
    return firstMatchingLineStart(text, (line) => isIndentCodeLine(line))
  }
  if (last.type === 'footnotes') {
    return firstMatchingLineStart(text, (line) => Boolean(parseFootnoteDefinitionLine(line)))
  }
  return null
}

/**
 * 前面已收的单行标题 / 分隔线：量出最后一块起点，避免 `# 标题\\n段落` 每 token 整尾重扫。
 */
function consumeClosedSingleLinePrefix(text: string, closed: CheapProseBlock[]): number | null {
  if (!closed.length) return 0
  let offset = 0
  for (const block of closed) {
    const rest = text.slice(offset)
    if (!rest) return null
    const nl = rest.indexOf('\n')
    const line = nl < 0 ? rest : rest.slice(0, nl)
    const ok =
      (block.type === 'heading' && Boolean(parseHeadingLine(line))) ||
      (block.type === 'hr' && parseHrLine(line))
    if (!ok || nl < 0) return null
    offset += nl + 1
  }
  return offset
}

/**
 * 增长列表 / 表格 / 段落 / 引用 / 标题 / 脚注：只重解析最后一块（对标 Codex #39061 / #34045）。
 * 段落软换行后续写、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、引用内围栏闭合后的后续段、引用内换行后新列表项、脚注缩进续行也走增长段。多块尾跳过已收前缀（单行标题 / HR，或段落后新起的列表 / 标题 / 引用 / 表 / 脚注）。定义行或前缀对不上时退回全量解析。
 */
function tryContinueLastCheapProseBlock(
  prevNorm: string,
  prevBlocks: CheapProseBlock[],
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  if (!prevBlocks.length || !nextText.startsWith(prevNorm)) return null
  const suffix = nextText.slice(prevNorm.length)
  if (suffix.includes(']:')) return null
  if (prevBlocks.length === 1) {
    return continueLastBlockOfType(prevBlocks[0]!, prevNorm, nextText, defs)
  }
  const closed = prevBlocks.slice(0, -1)
  const last = prevBlocks[prevBlocks.length - 1]!
  let start = consumeClosedSingleLinePrefix(prevNorm, closed)
  if (start == null || start <= 0) start = lastBlockSourceStart(prevNorm, last)
  if (start == null || start <= 0) return null
  const grown = continueLastBlockOfType(last, prevNorm.slice(start), nextText.slice(start), defs)
  if (!grown || grown.length !== 1) return null
  return [...closed, ...grown]
}

/**
 * 直播散文尾增量：已闭合块 / 列表项 / 表格行保持同一对象，只重解析增长段。
 * 最后一块（含段落软换行、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、引用内围栏闭合后的后续段、缩进代码 / 脚注续行 / 引用内换行后的子块）先走增长段；前面的标题 / 段落等保持同一引用（对标 Codex #39061 / #34045）。
 * 中间块类型变了也不把后面已闭合块整段丢掉（对标直播贴底不跳）。
 */
export function continueCheapProseBlocks(
  prevText: string,
  prevBlocks: CheapProseBlock[],
  text: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] {
  const nextText = normalizeStreamingText(text)
  const prevNorm = normalizeStreamingText(prevText)
  if (!nextText) return []
  if (nextText === prevNorm && prevBlocks.length) return prevBlocks
  const incremental = tryContinueLastCheapProseBlock(prevNorm, prevBlocks, nextText, defs)
  if (incremental) return incremental
  const parsed = parseCheapProseBlocks(nextText, defs)
  if (!prevBlocks.length) return parsed
  const out: CheapProseBlock[] = []
  let pi = 0
  let ni = 0
  while (pi < prevBlocks.length && ni < parsed.length) {
    const reused = reuseCheapProseBlock(prevBlocks[pi]!, parsed[ni]!)
    if (reused) {
      out.push(reused)
      pi += 1
      ni += 1
      continue
    }
    if (pi + 1 < prevBlocks.length) {
      const skipPrev = reuseCheapProseBlock(prevBlocks[pi + 1]!, parsed[ni]!)
      if (skipPrev) {
        out.push(skipPrev)
        pi += 2
        ni += 1
        continue
      }
    }
    if (ni + 1 < parsed.length) {
      const skipParsed = reuseCheapProseBlock(prevBlocks[pi]!, parsed[ni + 1]!)
      if (skipParsed) {
        out.push(parsed[ni]!)
        out.push(skipParsed)
        pi += 1
        ni += 2
        continue
      }
    }
    out.push(parsed[ni]!)
    pi += 1
    ni += 1
  }
  if (ni < parsed.length) out.push(...parsed.slice(ni))
  return out
}
