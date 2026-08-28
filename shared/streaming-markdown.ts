/**
 * 流式 Markdown 拆分：已闭合块保持稳定，只重解析未完成尾部。
 * CRLF 按 LF 拆；散文尾廉价解析含闭合链接、引用式链接、`<https>` / 邮箱 / `www.`、裸 URL、下划线强调、`***`/`___` 嵌套强调、脚注（含缩进续行与多段）、硬换行、文件引用、ATX/Setext 标题/列表（含缩进嵌套、续行与松散 `li>p`）/任务项/表格/分隔线 / 缩进代码 / 引用围栏与懒续行。
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

const FENCE_RE = /^ {0,3}(```|~~~)(.*)$/

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
  | { type: 'strong'; text: string; mark?: '**' | '__'; inner?: 'em' }
  | { type: 'del'; text: string }
  | { type: 'em'; text: string; mark?: '*' | '_' | '***' | '___'; inner?: 'strong' }
  | { type: 'link'; text: string; href: string; raw?: string; title?: string }
  | { type: 'image'; alt: string; href: string; title?: string }
  | { type: 'file'; text: string; path: string; line?: number; column?: number }
  | { type: 'fn'; id: string }
  | { type: 'br' }

/** 直播列表项：可挂一层或多层嵌套列表；松散项额外段落对标 remark `li>p` */
export type CheapListItem = {
  nodes: CheapInlineNode[]
  extra?: CheapInlineNode[][]
  nested?: { ordered: boolean; indent: number; items: CheapListItem[] }
}

/** 直播散文尾的廉价块：标题 / 列表 / 引用 / 表格 / 分隔线 / 段落，避免一律 `<p>` 收束时跳一下 */
export type CheapProseBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; nodes: CheapInlineNode[] }
  | { type: 'list'; ordered: boolean; items: CheapListItem[]; loose?: boolean }
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
const EMPTY_LINK_DEFS: ReadonlyMap<string, string> = new Map()

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

/** `[id]: https://…` / `[id]: <https://…>` 定义行（对标 CommonMark / remark-gfm） */
export function parseLinkDefinitionLine(line: string): { id: string; href: string } | null {
  const match =
    /^\s{0,3}\[([^\]]+)\]:\s*(<[^>\s]+>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/.exec(line)
  if (!match) return null
  let href = match[2] ?? ''
  if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1)
  if (!/^https?:\/\//i.test(href) && !href.startsWith('mailto:')) return null
  return { id: normalizeLinkLabel(match[1] ?? ''), href }
}

/** CommonMark dest：`url` / `<url>`，可选 `"title"` / `'title'` / `(title)` */
function parseLinkDestination(dest: string): { href: string; title?: string } | null {
  const trimmed = dest.trim()
  if (!trimmed) return null
  let href = ''
  let rest = ''
  if (trimmed.startsWith('<')) {
    const close = trimmed.indexOf('>')
    if (close === -1) return null
    href = trimmed.slice(1, close)
    rest = trimmed.slice(close + 1).trim()
  } else {
    const match = /^(\S+)(?:\s+(.*))?$/.exec(trimmed)
    if (!match) return null
    href = match[1] ?? ''
    rest = (match[2] ?? '').trim()
  }
  if (!href) return null
  let title: string | undefined
  const quoted = /^(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))$/.exec(rest)
  if (quoted) title = quoted[1] ?? quoted[2] ?? quoted[3]
  return title ? { href, title } : { href }
}

/** 从全文收集引用定义，供直播尾与已闭合块共用 */
export function collectLinkDefinitions(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of normalizeStreamingText(text).split('\n')) {
    const def = parseLinkDefinitionLine(line)
    if (def && !map.has(def.id)) map.set(def.id, def.href)
  }
  return map
}

/** 把定义行拼回 Markdown，挂到已闭合块上让 remark 也能解析引用 */
export function linkDefinitionBlob(text: string): string {
  return normalizeStreamingText(text)
    .split('\n')
    .filter((line) => parseLinkDefinitionLine(line))
    .join('\n')
}

/** 整段只有引用定义时不要画成段落（remark 会吃掉，直播也不画） */
export function isOnlyLinkDefinitions(text: string): boolean {
  const lines = normalizeStreamingText(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
  return lines.length > 0 && lines.every((line) => parseLinkDefinitionLine(line))
}

export function markdownBlockWithDefs(blockText: string, defsBlob: string): string {
  if (!defsBlob || !blockText.includes('[')) return blockText
  return `${blockText.replace(/\s+$/, '')}\n\n${defsBlob}`
}

/**
 * 只认成对的 `code` / **bold** / __bold__ / *italic* / _italic_、闭合 `[text](url)` /
 * `[text][id]` / `![alt](url)`、`<https>` / 邮箱、裸 http(s)、文件引用。
 * 未闭合标记留在原文；`[` 对不上 `](` 时不再吞掉后面的标记。
 */
export function parseCheapInlineMarkdown(
  text: string,
  defs: ReadonlyMap<string, string> = EMPTY_LINK_DEFS
): CheapInlineNode[] {
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
    // `***foo***` / `___foo___` / `**_foo_**` / `*__foo__*` 对标 remark em+strong，避免收束跳标签
    if (src.startsWith('***', i)) {
      const end = src.indexOf('***', i + 3)
      if (end !== -1 && end > i + 3) {
        flush()
        nodes.push({ type: 'em', text: src.slice(i + 3, end), mark: '***', inner: 'strong' })
        i = end + 3
        continue
      }
    }
    if (src.startsWith('___', i) && canOpenUnderscore(src, i)) {
      const end = src.indexOf('___', i + 3)
      if (end !== -1 && end > i + 3 && canCloseUnderscore(src, end + 2)) {
        flush()
        nodes.push({ type: 'em', text: src.slice(i + 3, end), mark: '___', inner: 'strong' })
        i = end + 3
        continue
      }
    }
    if (src.startsWith('**_', i)) {
      const end = src.indexOf('_**', i + 3)
      if (end !== -1 && end > i + 3) {
        flush()
        nodes.push({ type: 'strong', text: src.slice(i + 3, end), inner: 'em' })
        i = end + 3
        continue
      }
    }
    if (src.startsWith('*__', i)) {
      const end = src.indexOf('__*', i + 3)
      if (end !== -1 && end > i + 3) {
        flush()
        nodes.push({ type: 'em', text: src.slice(i + 3, end), inner: 'strong' })
        i = end + 3
        continue
      }
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
    if (src.startsWith('__', i) && canOpenUnderscore(src, i)) {
      const end = src.indexOf('__', i + 2)
      if (end !== -1 && end > i + 2 && canCloseUnderscore(src, end + 1)) {
        flush()
        nodes.push({ type: 'strong', text: src.slice(i + 2, end), mark: '__' })
        i = end + 2
        continue
      }
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
    if (src[i] === '_' && canOpenUnderscore(src, i)) {
      let from = i + 1
      let matched = false
      while (from < src.length) {
        const end = src.indexOf('_', from)
        if (end === -1) break
        if (end > i + 1 && canCloseUnderscore(src, end)) {
          flush()
          nodes.push({ type: 'em', text: src.slice(i + 1, end), mark: '_' })
          i = end + 1
          matched = true
          break
        }
        from = end + 1
      }
      if (matched) continue
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
      }
    }
    if (src.startsWith('[^', i)) {
      const end = src.indexOf(']', i + 2)
      if (end === -1) {
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
      const labelEnd = src.indexOf(']', labelStart)
      if (labelEnd === -1) {
        buf += src.slice(i)
        break
      }
      const label = src.slice(labelStart, labelEnd)
      if (!label.includes('\n')) {
        if (src[labelEnd + 1] === '(') {
          const urlEnd = src.indexOf(')', labelEnd + 2)
          if (urlEnd === -1) {
            buf += src.slice(i)
            break
          }
          const dest = parseLinkDestination(src.slice(labelEnd + 2, urlEnd))
          const href = dest?.href ?? ''
          const title = dest?.title
          if (image && /^https?:\/\//i.test(href)) {
            flush()
            nodes.push(title ? { type: 'image', alt: label, href, title } : { type: 'image', alt: label, href })
            i = urlEnd + 1
            continue
          }
          if (!image && (/^https?:\/\//i.test(href) || href.startsWith('mailto:'))) {
            flush()
            nodes.push(
              title
                ? { type: 'link', text: label, href, title }
                : { type: 'link', text: label, href }
            )
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
        } else if (!image && src[labelEnd + 1] === '[') {
          const idEnd = src.indexOf(']', labelEnd + 2)
          if (idEnd !== -1 && !src.slice(labelEnd + 2, idEnd).includes('\n')) {
            const id = src.slice(labelEnd + 2, idEnd)
            const href = defs.get(normalizeLinkLabel(id || label))
            if (href) {
              flush()
              nodes.push({
                type: 'link',
                text: label,
                href,
                raw: `${src.slice(i, idEnd + 1)}`
              })
              i = idEnd + 1
              continue
            }
          }
        } else if (!image) {
          const href = defs.get(normalizeLinkLabel(label))
          if (href) {
            flush()
            nodes.push({ type: 'link', text: label, href, raw: src.slice(i, labelEnd + 1) })
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
  if (node.type === 'br') return '  \n'
  if (node.type === 'fn') return `[^${node.id}]`
  if (node.type === 'code') return `\`${node.text}\``
  if (node.type === 'strong') {
    if (node.inner === 'em') return `**_${node.text}_**`
    const mark = node.mark ?? '**'
    return `${mark}${node.text}${mark}`
  }
  if (node.type === 'del') return `~~${node.text}~~`
  if (node.type === 'em') {
    if (node.inner === 'strong') {
      if (node.mark === '___') return `___${node.text}___`
      if (node.mark === '***') return `***${node.text}***`
      return `*__${node.text}__*`
    }
    const mark = node.mark ?? '*'
    return `${mark}${node.text}${mark}`
  }
  if (node.type === 'link') {
    if (node.raw) return node.raw
    const dest = node.title ? `${node.href} "${node.title}"` : node.href
    return node.text === node.href && !node.title ? node.href : `[${node.text}](${dest})`
  }
  if (node.type === 'image') {
    const dest = node.title ? `${node.href} "${node.title}"` : node.href
    return `![${node.alt}](${dest})`
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
  text: string,
  defs: ReadonlyMap<string, string> = EMPTY_LINK_DEFS
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
function appendNestedListItem(
  item: CheapListItem,
  ordered: boolean,
  indent: number,
  text: string,
  defs: ReadonlyMap<string, string>
): void {
  if (!item.nested) {
    item.nested = { ordered, indent, items: [] }
  } else if (indent > item.nested.indent && item.nested.items.length) {
    appendNestedListItem(item.nested.items[item.nested.items.length - 1]!, ordered, indent, text, defs)
    return
  } else if (item.nested.ordered !== ordered && indent <= item.nested.indent) {
    item.nested = { ordered, indent, items: [] }
  }
  item.nested.items.push({ nodes: parseCheapInlineMarkdown(text, defs) })
}

/** 列表项续行：缩进或 CommonMark lazy continuation；空行后另起一段，对标松散 `li>p` */
function appendListContinuation(
  item: CheapListItem,
  indent: number,
  text: string,
  opts?: { newParagraph?: boolean; defs?: ReadonlyMap<string, string> }
): void {
  if (item.nested && indent > item.nested.indent && item.nested.items.length) {
    appendListContinuation(item.nested.items[item.nested.items.length - 1]!, indent, text, opts)
    return
  }
  if (opts?.newParagraph) {
    item.extra = [...(item.extra ?? []), parseCheapInlineMarkdown(text, opts.defs)]
    return
  }
  if (item.extra?.length) {
    const last = item.extra[item.extra.length - 1]!
    item.extra = [...item.extra.slice(0, -1), [...last, { type: 'text', text: `\n${text}` }]]
    return
  }
  item.nodes = [...item.nodes, { type: 'text', text: `\n${text}` }]
}

const QUOTE_RE = /^ {0,3}>\s?(.*)$/
const HR_RE = /^ {0,3}(?:[-*_]){3,}\s*$/
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
  return /^(?:    |\t)/.test(line) && !parseListLine(line) && !parseLinkDefinitionLine(line)
}

/** 把散文尾拆成标题 / 列表 / 引用 / 段落，直播时用对应标签减少收束跳动 */
export function parseCheapProseBlocks(
  text: string,
  defs?: ReadonlyMap<string, string>
): CheapProseBlock[] {
  const src = normalizeStreamingText(text)
  if (!src) return []
  const linkDefs = defs ?? collectLinkDefinitions(src)
  const lines = src.split('\n')
  const footnoteScan = scanFootnoteDefinitions(lines)
  const footnoteDefs = footnoteScan.defs
  const blocks: CheapProseBlock[] = []
  let para: string[] = []
  let list: {
    ordered: boolean
    indent: number
    items: CheapListItem[]
    afterBlank: boolean
    loose: boolean
  } | null = null
  let quote: string[] = []
  let table: string[] | null = null
  let pre: string[] | null = null
  let fence: { marker: string; lang?: string; lines: string[] } | null = null

  const inline = (chunk: string) => parseCheapInlineMarkdown(chunk, linkDefs)

  const flushPara = () => {
    if (!para.length) return
    blocks.push({ type: 'p', nodes: inline(para.join('\n')) })
    para = []
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
    if (!list) return
    const loose = list.loose || list.items.some((item) => Boolean(item.extra?.length))
    blocks.push({
      type: 'list',
      ordered: list.ordered,
      items: list.items,
      loose: loose || undefined
    })
    list = null
  }
  const flushQuote = () => {
    if (!quote.length) return
    // Lines already had one `>` stripped when collected. Recurse so `> > inner`
    // becomes quote > quote, matching remark-gfm's nested <blockquote>.
    blocks.push({
      type: 'quote',
      blocks: parseCheapProseBlocks(quote.join('\n'), linkDefs)
    })
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
        blocks.push({ type: 'p', nodes: inline(line) })
      }
    }
    const header = splitGfmTableCells(raw[sepIdx - 1] ?? '').map((cell) => inline(cell))
    const rows = raw
      .slice(sepIdx + 1)
      .filter((line) => !isGfmTableSep(line))
      .map((line) => splitGfmTableCells(line).map((cell) => inline(cell)))
    const align = parseGfmTableAlign(raw[sepIdx] ?? '')
    blocks.push({ type: 'table', header, rows, align })
  }
  const flushAll = () => {
    flushFence()
    flushTable()
    flushPre()
    flushPara()
    flushList()
    flushQuote()
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!
    if (fence) {
      const close = FENCE_RE.exec(line)
      if (close && close[1] === fence.marker) {
        flushFence()
        continue
      }
      fence.lines.push(line)
      continue
    }
    if (footnoteScan.skip.has(lineIndex) || parseLinkDefinitionLine(line)) {
      flushAll()
      continue
    }
    if (quote.length && isQuoteLazyLine(line)) {
      quote.push(line.trimStart())
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
    if (isGfmTableRow(line)) {
      flushPre()
      flushPara()
      flushList()
      flushQuote()
      if (!table) table = []
      table.push(line)
      continue
    }
    if (para.length && !list && !quote.length && !table && !pre && SETEXT_RE.test(line)) {
      const marker = line.trim()[0]
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
    if (HR_RE.test(line)) {
      flushAll()
      blocks.push({ type: 'hr' })
      continue
    }
    const fenceOpen = FENCE_RE.exec(line)
    if (fenceOpen) {
      flushTable()
      flushPre()
      flushPara()
      flushList()
      flushQuote()
      fence = {
        marker: fenceOpen[1] ?? '```',
        lang: fenceOpen[2].trim().split(/\s+/)[0] || undefined,
        lines: []
      }
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushAll()
      const level = Math.min(6, heading[1].length) as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ type: 'heading', level, nodes: inline(heading[2]) })
      continue
    }
    const listLine = parseListLine(line)
    if (listLine) {
      flushTable()
      flushPre()
      flushPara()
      flushQuote()
      if (list && listLine.indent > list.indent && list.items.length) {
        appendNestedListItem(
          list.items[list.items.length - 1]!,
          listLine.ordered,
          listLine.indent,
          listLine.text,
          linkDefs
        )
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
          loose: false
        }
      }
      if (list.afterBlank && list.items.length) list.loose = true
      list.items.push({ nodes: inline(listLine.text) })
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
      if (list.afterBlank) list.loose = true
      appendListContinuation(list.items[list.items.length - 1]!, leadingIndent(line), line.trimStart(), {
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
      quote.push(q[1])
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
    blocks.push({
      type: 'footnotes',
      items: [...footnoteDefs].map(([id, body]) => ({
        id,
        paragraphs: body.split(/\n\n/).map((paraText) => inline(paraText))
      }))
    })
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
        nestedItems.every((item, index) => item === prevItem.nested!.items[index])
      nested = nestedSame
        ? prevItem.nested
        : { ordered: nextItem.nested.ordered, indent: nextItem.nested.indent, items: nestedItems }
    }
    const extra = reuseInlineLists(prevItem.extra ?? [], nextItem.extra ?? [])
    const extraSame =
      extra.length === (prevItem.extra?.length ?? 0) &&
      extra.every((para, index) => para === prevItem.extra?.[index]) &&
      extra.length === (nextItem.extra?.length ?? 0)
    if (nodes === prevItem.nodes && nested === prevItem.nested && extraSame) out.push(prevItem)
    else out.push({ nodes, extra: extra.length ? extra : undefined, nested })
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
      prev.loose === next.loose
    return same ? prev : { type: 'list', ordered: prev.ordered, items, loose: next.loose }
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

/**
 * 直播散文尾增量：已闭合块 / 列表项 / 表格行保持同一对象，只重解析增长段。
 */
export function continueCheapProseBlocks(
  prevText: string,
  prevBlocks: CheapProseBlock[],
  text: string,
  defs?: ReadonlyMap<string, string>
): CheapProseBlock[] {
  const nextText = normalizeStreamingText(text)
  const prevNorm = normalizeStreamingText(prevText)
  if (!nextText) return []
  if (nextText === prevNorm && prevBlocks.length) return prevBlocks
  const parsed = parseCheapProseBlocks(nextText, defs)
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
