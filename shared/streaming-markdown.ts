/**
 * 流式 Markdown 拆分：已闭合块保持稳定，只重解析未完成尾部。
 * `streamingRenderSlots` 已收散文按块成闭合槽，增长尾固定 `prose-run-0`。
 * CRLF 按 LF 拆；散文尾廉价解析含闭合链接（含空 dest / `#锚点` / 相对路径 / 危险协议清空）、引用式链接 / 引用式图片（含相对 dest 与定义 title）、HTML 实体、`<https>` / 邮箱 / `www.`、裸 URL、下划线强调、`***`/`___` 嵌套强调、`~~** **~~` 删除线套粗体、标记内混排 / 链接 / 代码、未闭合 `**` / `*` / `~~` / `~` / `` ` `` / `***` / `<https://` 先画、完整 `<!-- -->` 不画、图片 alt 去标记、脚注（含缩进续行与多段）、硬换行（含列表续行）、文件引用、ATX/Setext 标题（含行尾闭合 `#`）/列表（含 `1)` / `ol start`、缩进嵌套、续行硬换行与松散 `li>p`、项内引用 / ATX / Setext / HR / 嵌套围栏 / 围栏 / 标题 / HR / 表后后缀 / 松散项内缩进代码）/任务项/表格（含单列、无两侧 `|` 与 `\\|`）/分隔线（含 `* * *`） / 缩进代码 / 引用围栏与懒续行（未闭合围栏不吃懒续行；懒续行不抽表格）。
 * 增长列表 / 表格 / 段落 / 引用 / 标题 / 分隔线 / 缩进代码 / 脚注只重解析最后一块；新表行不换已画表头 / 旧行的 cells 数组引用（对标 Codex #22860）；缩进代码 / 项内围栏 / 引用内围栏最后一行或新正文行（可多行）只改 last line，单独换行保持同一 `pre`，闭合标记只认后缀（`streamingFenceCloseAfter` / `lastFenceOpenHold`），已画正文不重拆；新同级 / 嵌套列表项只追加（一次冲洗可多行，`streamingSuffixLines` 不 split 已画正文）、不重解析已画项；松散项续段只改最后一段（`growLastListItemExtra`：同行 / 软换行 / 空行后新段，单独换行保持同一 extra）；段落软换行只扫后缀新行，不 split 已画正文；单行软换行只加长最后一段 text，不重扫行内；引用只扫后缀新行并增量剥 `>`，不 split 已画引用；单块引用不再 `lastSingleBlockStart`，多块记下 `lastQuoteInnerStartHold`；一段变多块时记下最后一块起点，后续 token 不再 `lastSingleBlockStart`；全量回退 / 首拆多块后也 `rememberLastCheapBlockStart`；`lastSingleBlockStart` 从文末 `lastIndexOf` 往前找，不 split 全文；段落软换行后续写、嵌套项内引用 / 围栏（`lastItemInnerStartHold` 记下项内块起点，不每 token `firstMatchingLineStart`；`lastItemInnerStripHold` 记下已剥缩进窗口，同一行 / 新行只剥后缀）、围栏 / 标题 / HR / 表闭合后的项后缀（`suffixOpensNewCheapBlock` / `closedAfterSiblingStart` / `streamingFirstLine` 只扫 after 新行，不 split 全文；Setext 下划线窗 `lastIndexOf`）、闭合并栏后再起表 / 标题 / 引用、闭合并栏后再起的后续段、引用内围栏 / 标题 / 分隔线 / 缩进代码闭合后再起的后续段、引用内换行后的列表项、脚注末项最后一段 / 缩进续行只改 last line（`shouldGrowStreamingFootnoteLastLine`，一次冲洗可多行）、空行后新段只追加（`shouldAppendStreamingFootnoteParagraph`）、新引用定义只追加（`shouldAppendStreamingFootnoteItem`，一次冲洗可多项）、段落后首次开已引用脚注块（`shouldOpenStreamingFootnotesAfterParagraph`）不重解析引用段、段落后新起的列表或标题、闭合段落 / 表 / 列表 / 分隔线 / 缩进代码 / Setext 标题后再起的后续块（列表 / 表后的 Setext 用正文+下划线定位；前面已有同型引用 / 列表 / 表 / 围栏 / 缩进代码时从文末量最后一块）、以及围栏 / 表 / 列表 / 引用 / 段落后的增长段不整尾重扫；未收束散文软换行只换 tail（`shouldGrowOpenStreamingProseTail` / `streamingOpenProseTail`），空行收段 / 围栏开标仍全量拆（对标 Codex #39061 / #34045 / #22860）。项内表不把无 `|` 的普通续行吃成新行；标题 / 围栏后的表行另起项内表，不进 suffix。缩进代码后面的标题 / 列表不并进 `pre` 正文。闭合并栏后的段落 / 标题 / 列表不再被增量路径丢掉。引用内 `grown.length > 1` 时前面的引用子块保持同一引用。段落闭合后再起列表 / 标题 / 围栏时段落对象不变（Setext / HR / 表分隔仍退回全量）。
 * @see shared/ARCH.md
 */
import { chatMathSource, readChatMath } from './chat-math'
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

/** 对标 Codex 0.150：CRLF 粘贴按 LF 拆，避免围栏/段落对不齐。无 \\r 退回同一字符串，直播 token 不扫两遍。 */
export function normalizeStreamingText(text: string): string {
  const src = String(text ?? '')
  if (!src.includes('\r')) return src
  return src.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 把流式文本拆成不会再变的块，与仍在增长的尾部。
 * 尾部是未闭合围栏，或最后一个尚未空行收束的段落。文末单独的换行不当空行，避免表的每一行被拆成独立闭合槽。
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
      // 文末单独的 `\n` 只是最后一行的行终止，不是空行收束（对标 Codex #34045 表行仍留在增长尾）
      if (i === lines.length - 1) {
        offset = lineEnd
        continue
      }
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
 * 首段尚未空行收束时：同一行或软换行只换 tail，不整段重拆（对标 Codex #22860）。
 * 空行收段、接缝 `\n\n`、或新行 / 行尾长成围栏开标仍走全量拆分。
 */
export function shouldGrowOpenStreamingProseTail(prevNorm: string, suffix: string): boolean {
  if (!suffix) return true
  if (prevNorm.endsWith('\n') && suffix.startsWith('\n')) return false
  if (suffix.includes('\n\n')) return false
  if (!suffix.includes('\n')) {
    const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1) + suffix
    return !parseFenceLine(lastLine)
  }
  const firstNl = suffix.indexOf('\n')
  const completedLast =
    (prevNorm.endsWith('\n') ? '' : prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)) +
    suffix.slice(0, firstNl)
  if (parseFenceLine(completedLast)) return false
  let offset = firstNl + 1
  while (offset <= suffix.length) {
    const end = suffix.indexOf('\n', offset)
    const lineEnd = end < 0 ? suffix.length : end
    if (parseFenceLine(suffix.slice(offset, lineEnd))) return false
    if (end < 0) break
    offset = end + 1
  }
  return true
}

/** 未收束散文尾与 `splitStreamingMarkdown` 对齐：文末单独换行不进 tail */
function streamingOpenProseTail(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text
}

/**
 * 已有闭合前缀后的未闭合围栏：同一行或新正文行增长不整段重拆。
 * 新行或行尾长成闭合标记时退回全量拆分。
 */
export function shouldGrowOpenStreamingFenceTail(prevTail: string, suffix: string): boolean {
  if (!suffix) return true
  const nl = prevTail.indexOf('\n')
  const open = parseFenceLine(nl === -1 ? prevTail : prevTail.slice(0, nl))
  if (!open) return false
  if (!suffix.includes('\n')) {
    if (nl === -1) return true
    const lastLine = prevTail.slice(prevTail.lastIndexOf('\n') + 1) + suffix
    return !isFenceClose(lastLine, open.marker)
  }
  const lastPrev = prevTail.endsWith('\n') ? '' : prevTail.slice(prevTail.lastIndexOf('\n') + 1)
  const firstNl = suffix.indexOf('\n')
  if (isFenceClose(lastPrev + suffix.slice(0, firstNl), open.marker)) return false
  for (const line of suffix.slice(firstNl + 1).split('\n')) {
    if (isFenceClose(line, open.marker)) return false
  }
  return true
}

/**
 * 直播增量拆分：已闭合块复用同一对象，只重扫新增后缀。
 * 文本缩短或前缀对不上时回退全量拆分。未收束散文同一行 / 软换行、或围栏正文增长只换 tail。
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
  if (!prev) return splitStreamingMarkdown(nextText)
  if (closedEnd <= 0) {
    if (!nextText.startsWith(prevNorm)) return splitStreamingMarkdown(nextText)
    const suffix = nextText.slice(prevNorm.length)
    if (shouldGrowOpenStreamingProseTail(prevNorm, suffix)) {
      const tail = streamingOpenProseTail(nextText)
      if (prev.tail === tail && prev.tailKind === 'prose' && prev.blocks.length === 0) {
        return prev
      }
      return {
        blocks: prev.blocks,
        tail,
        tailKind: 'prose',
        closedEnd: 0
      }
    }
    return splitStreamingMarkdown(nextText)
  }
  if (!nextText.startsWith(prevNorm.slice(0, closedEnd))) {
    return splitStreamingMarkdown(nextText)
  }
  const rest = nextText.slice(closedEnd)
  if (prev.tailKind === 'prose' && rest.startsWith(prev.tail)) {
    const suffix = rest.slice(prev.tail.length)
    if (shouldGrowOpenStreamingProseTail(prev.tail, suffix)) {
      const tail = streamingOpenProseTail(rest)
      if (tail === prev.tail) return prev
      return {
        blocks: prev.blocks,
        tail,
        tailKind: 'prose',
        closedEnd
      }
    }
  } else if (prev.tailKind === 'fence' && rest.startsWith(prev.tail)) {
    const suffix = rest.slice(prev.tail.length)
    if (shouldGrowOpenStreamingFenceTail(prev.tail, suffix)) {
      if (rest === prev.tail) return prev
      return {
        blocks: prev.blocks,
        tail: rest,
        tailKind: 'fence',
        tailLang: prev.tailLang,
        closedEnd
      }
    }
  }
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

function streamingTailSlot(
  split: StreamingMarkdownSplit,
  fenceIndex: number
): StreamingRenderSlot | null {
  if (split.tailKind === 'fence') {
    return {
      kind: 'fence',
      key: `live-fence-${fenceIndex}`,
      lang: split.tailLang,
      body: extractOpenFenceBody(split.tail),
      closed: false
    }
  }
  if (!split.tail) return null
  return { kind: 'prose', key: 'prose-run-0', text: split.tail, closed: false }
}

function closedFenceSlotCount(slots: readonly StreamingRenderSlot[]): number {
  let n = 0
  for (const slot of slots) {
    if (slot.kind === 'fence' && slot.closed) n += 1
  }
  return n
}

/**
 * 直播槽增量：已闭合围栏 / 散文 run 退回同一对象，只换增长尾。
 * `split.blocks` 与上一帧同一数组时不重拆已收段（对标 Codex #22860）。
 */
export function continueStreamingRenderSlots(
  prev: StreamingRenderSlot[] | null | undefined,
  split: StreamingMarkdownSplit,
  prevSplit?: StreamingMarkdownSplit | null
): StreamingRenderSlot[] {
  if (prev && prevSplit && split.blocks === prevSplit.blocks) {
    const last = prev[prev.length - 1]
    const prefix = last && !last.closed ? prev.slice(0, -1) : prev
    const tail = streamingTailSlot(split, closedFenceSlotCount(prefix))
    if (!tail) return last && !last.closed ? prefix : prev
    if (last && !last.closed) {
      if (sameStreamingRenderSlot(last, tail)) return prev
      return prefix.length ? [...prefix, tail] : [tail]
    }
    return prev.length ? [...prev, tail] : [tail]
  }
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

/** 收束后的正文拆分 / 槽 / 引用定义，给历史重挂跳过全量拆分 */
export type StreamingMarkdownHold = {
  text: string
  split: StreamingMarkdownSplit
  slots: StreamingRenderSlot[]
  defs: LinkDefinitionState | null
}

export const STREAMING_MARKDOWN_HOLD_LIMIT = 32

const streamingMarkdownHolds = new Map<string, StreamingMarkdownHold>()

export function shouldRememberStreamingMarkdownHold(input: { streaming?: boolean }): boolean {
  return !input.streaming
}

export function emptyStreamingMarkdownHold(): StreamingMarkdownHold {
  const split = splitStreamingMarkdown('')
  return {
    text: '',
    split,
    slots: continueStreamingRenderSlots(null, split),
    defs: null
  }
}

export function readStreamingMarkdownHold(text: string): StreamingMarkdownHold | undefined {
  const key = normalizeStreamingText(text)
  if (!key) return undefined
  const hit = streamingMarkdownHolds.get(key)
  if (!hit) return undefined
  streamingMarkdownHolds.delete(key)
  streamingMarkdownHolds.set(key, hit)
  return hit
}

export function writeStreamingMarkdownHold(hold: StreamingMarkdownHold): StreamingMarkdownHold {
  const key = normalizeStreamingText(hold.text)
  if (!key) return hold
  const stored = { ...hold, text: key }
  streamingMarkdownHolds.delete(key)
  streamingMarkdownHolds.set(key, stored)
  while (streamingMarkdownHolds.size > STREAMING_MARKDOWN_HOLD_LIMIT) {
    const oldest = streamingMarkdownHolds.keys().next().value
    if (oldest === undefined) break
    streamingMarkdownHolds.delete(oldest)
  }
  return stored
}

export function seedStreamingMarkdownHold(text: string): StreamingMarkdownHold {
  return readStreamingMarkdownHold(text) ?? emptyStreamingMarkdownHold()
}

export function clearStreamingMarkdownHolds(): void {
  streamingMarkdownHolds.clear()
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
  | { type: 'math'; tex: string; display: boolean; fence: '$$' | 'square' | 'paren' }
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

/** 正文里的 `[^id]` 引用（跳过定义行与缩进续行，不 split 全文） */
export function collectCitedFootnoteIds(text: string): Set<string> {
  const cited = new Set<string>()
  let offset = 0
  let skipRegion = false
  while (offset <= text.length) {
    const nl = text.indexOf('\n', offset)
    const end = nl < 0 ? text.length : nl
    const line = text.slice(offset, end)
    if (parseFootnoteDefinitionLine(line)) {
      skipRegion = true
    } else if (skipRegion) {
      if (isFootnoteContLine(line)) {
        /* stay in definition region */
      } else if (line.trim() === '') {
        const nextStart = nl < 0 ? text.length : nl + 1
        const nextNl = text.indexOf('\n', nextStart)
        const nextEnd = nextNl < 0 ? text.length : nextNl
        const next = text.slice(nextStart, nextEnd)
        if (!(next && isFootnoteContLine(next))) skipRegion = false
      } else {
        skipRegion = false
      }
    }
    if (!skipRegion && line.includes('[^')) {
      let i = 0
      while (i < line.length) {
        const start = line.indexOf('[^', i)
        if (start < 0) break
        const close = line.indexOf(']', start + 2)
        if (close < 0) break
        const id = line.slice(start + 2, close)
        if (id) cited.add(id)
        i = close + 1
      }
    }
    if (nl < 0) break
    offset = nl + 1
  }
  return cited
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

/** `javascript:` / `vbscript:` / 非栅格 `data:` 画成空 href；`data:image/png|jpeg|gif|webp|bmp|avif` 留给 ChatImage 占位。 */
function sanitizeCheapHref(href: string): string {
  const value = href.trim()
  if (/^(?:javascript|vbscript):/i.test(value)) return ''
  if (/^data:/i.test(value)) {
    return /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif)[;,]/i.test(value) ? href : ''
  }
  return href
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
  const raw = String(text ?? '')
  if (prev && prev.blob === '' && !raw.includes(']:')) return prev
  const blob = linkDefinitionBlob(raw)
  if (prev && prev.blob === blob) return prev
  return { blob, defs: collectLinkDefinitions(raw) }
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
      if (node.type === 'math') return node.tex
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
    const math = readChatMath(src, i)
    if (math) {
      flush()
      nodes.push({ type: 'math', tex: math.tex, display: math.display, fence: math.fence })
      i = math.end
      continue
    }
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
  if (node.type === 'math') {
    return chatMathSource(node.tex, node.fence)
  }
  return node.text
}

function cheapInlineSourceAll(nodes: CheapInlineNode[]): string {
  return nodes.map(cheapInlineSource).join('')
}

/** 闭合行内前缀：同一 lastStable 再增长不 join 已画节点（对标 Codex #22860） */
let cheapInlineStableHold: {
  lastStable: CheapInlineNode | undefined
  length: number
  prefix: string
} | null = null

function cheapInlineStablePrefix(stable: CheapInlineNode[]): string {
  const lastStable = stable[stable.length - 1]
  if (
    cheapInlineStableHold &&
    cheapInlineStableHold.length === stable.length &&
    cheapInlineStableHold.lastStable === lastStable
  ) {
    return cheapInlineStableHold.prefix
  }
  const prefix = cheapInlineSourceAll(stable)
  cheapInlineStableHold = { lastStable, length: stable.length, prefix }
  return prefix
}

let cheapInlineKeyHold: {
  lastStable: CheapInlineNode | undefined
  lastType: CheapInlineNode['type'] | undefined
  length: number
  keys: string[]
} | null = null

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
  const last = nodes[nodes.length - 1]
  const lastStable = nodes[nodes.length - 2]
  if (
    cheapInlineKeyHold &&
    cheapInlineKeyHold.length === nodes.length &&
    cheapInlineKeyHold.lastStable === lastStable &&
    cheapInlineKeyHold.lastType === last?.type
  ) {
    return cheapInlineKeyHold.keys
  }
  const keys: string[] = []
  let prefix = 0
  for (const node of nodes) {
    keys.push(`${node.type}:${prefix}`)
    prefix += cheapInlineSource(node).length
  }
  cheapInlineKeyHold = {
    lastStable,
    lastType: last?.type,
    length: nodes.length,
    keys
  }
  return keys
}

/** 增长尾不含行内标记时只加长最后一段 text，不重扫整段（对标 Codex #22860） */
const CHEAP_INLINE_GROW_TRIGGER = /[*_`~[\]()<>\\!&$^#/:@]|https?:|www\./i

export function shouldGrowCheapInlineText(lastText: string, add: string): boolean {
  if (!add) return true
  let rest = add
  if (rest.includes('\n')) {
    if (!rest.startsWith('\n') || rest.slice(1).includes('\n')) return false
    rest = rest.slice(1)
    if (!rest || lineOpensNewCheapBlock(rest)) return false
  }
  if (CHEAP_INLINE_GROW_TRIGGER.test(rest)) return false
  if (/[*_`~[\]()<>\\!&$^#/:@]$/.test(lastText)) return false
  const lastWord = lastText.split(/\s+/).pop() ?? ''
  return !/^(?:https?|www)$/i.test(lastWord)
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
  const prefix = cheapInlineStablePrefix(stable)
  if (!nextText.startsWith(prefix)) return parseCheapInlineMarkdown(nextText, defs)
  const last = prevNodes[prevNodes.length - 1]
  if (last?.type === 'text') {
    const lastSrc = last.text
    if (nextText.startsWith(prefix + lastSrc)) {
      const add = nextText.slice(prefix.length + lastSrc.length)
      if (shouldGrowCheapInlineText(lastSrc, add)) {
        const grown: CheapInlineNode = { type: 'text', text: lastSrc + add }
        return stable.length ? [...stable, grown] : [grown]
      }
    }
  }
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
  const shared = Math.min(prev.length, next.length)
  const out: CheapInlineNode[][] = []
  let prefixSame = shared === prev.length
  for (let i = 0; i < shared; i++) {
    const reused = reuseInlineNodes(prev[i]!, next[i]!)
    out.push(reused)
    if (reused !== prev[i]) prefixSame = false
  }
  if (next.length === prev.length && prefixSame) return prev
  if (next.length > prev.length && prefixSame) return [...prev, ...next.slice(prev.length)]
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

/**
 * 从文末往前找最后一项匹配的列表标记，不 split 全文。
 * 顶层列表 indent 为 0 时不可能有更浅标记，找到最后一项即可停。
 */
function lastMatchingListLineStart(
  text: string,
  indent: number,
  ordered: boolean,
  scanAllForShallower = false
): number | null {
  let end = text.length
  let found: number | null = null
  while (end > 0) {
    const nl = text.lastIndexOf('\n', end - 1)
    const lineStart = nl < 0 ? 0 : nl + 1
    const parsed = parseListLine(text.slice(lineStart, end))
    if (parsed) {
      if (parsed.indent === indent && parsed.ordered === ordered) {
        if (found == null) found = lineStart
        if (!scanAllForShallower) return found
      } else if (parsed.indent < indent) {
        return null
      }
    }
    if (nl < 0) break
    end = nl
  }
  return found
}

/** 顶层列表最后一项在原文中的起点；嵌套项不算 */
function lastTopLevelListItemStart(text: string): number | null {
  const nl = text.indexOf('\n')
  const first = parseListLine(nl < 0 ? text : text.slice(0, nl))
  if (!first) return null
  return lastMatchingListLineStart(text, first.indent, first.ordered, first.indent > 0)
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

/**
 * 松散项续段只改正文：同一行、软换行、或空行后新起一段。
 * 单独换行保持同一 extra；新列表项 / 项内块仍走整项窗口。
 */
function growLastListItemExtra(
  item: CheapListItem,
  itemPrev: string,
  suffix: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapListItem | null {
  if (!item.extra?.length || item.blocks?.length || item.suffix?.length) return null
  if (!suffix || suffix.includes(']:')) return null
  if (suffix === '\n') return item
  const lastPara = item.extra[item.extra.length - 1]!
  if (!suffix.includes('\n') && !itemPrev.endsWith('\n')) {
    const prevSrc = cheapInlineSourceAll(lastPara)
    const nodes = continueCheapInlineMarkdown(prevSrc, lastPara, prevSrc + suffix, defs)
    if (nodes === lastPara) return item
    return { ...item, extra: [...item.extra.slice(0, -1), nodes] }
  }
  const continued = itemPrev.endsWith('\n')
    ? suffix
    : suffix.startsWith('\n')
      ? suffix.slice(1)
      : null
  if (continued == null || !continued) return null
  if (continued.startsWith('\n')) {
    const after = continued.slice(1)
    if (!after) return item
    if (after.includes('\n\n')) return null
    const nl = after.indexOf('\n')
    const first = nl < 0 ? after : after.slice(0, nl)
    if (!first.trim() || parseListLine(first) || lineOpensNewCheapBlock(first.trimStart())) return null
    if (leadingIndent(first) === 0) return null
    const text = after
      .split('\n')
      .map((line) => line.trimStart())
      .join('\n')
    if (!text) return item
    return { ...item, extra: [...item.extra, parseCheapInlineMarkdown(text, defs)] }
  }
  if (continued.includes('\n\n')) return null
  let add = ''
  let offset = 0
  while (offset <= continued.length) {
    const nl = continued.indexOf('\n', offset)
    const end = nl < 0 ? continued.length : nl
    const line = continued.slice(offset, end)
    if (line) {
      if (parseListLine(line) || lineOpensNewCheapBlock(line.trimStart()) || lastLineNeedsFullProseParse(line)) {
        return null
      }
      add += `\n${line.trimStart()}`
    } else if (nl >= 0) {
      return null
    }
    if (nl < 0) break
    offset = nl + 1
  }
  if (!add) return item
  const prevSrc = cheapInlineSourceAll(lastPara)
  const nodes = continueCheapInlineMarkdown(prevSrc, lastPara, prevSrc + add, defs)
  if (nodes === lastPara) return item
  return { ...item, extra: [...item.extra.slice(0, -1), nodes] }
}

/** 指定缩进的最后一项起点；缩进更浅的列表标记说明已离开这一层 */
function lastMatchingListItemStart(text: string, indent: number, ordered: boolean): number | null {
  return lastMatchingListLineStart(text, indent, ordered, indent > 0)
}

/** 项内最后一块起点：同一项再增长时不再 `firstMatchingLineStart` 全量扫（对标 Codex #22860） */
const lastItemInnerStartHold = new WeakMap<object, number>()

function rememberItemInnerStart(item: object, start: number): void {
  lastItemInnerStartHold.set(item, start)
}

function readItemInnerStart(item: object, itemPrev: string): number | null {
  const held = lastItemInnerStartHold.get(item)
  if (held == null || held < 0 || held > itemPrev.length) return null
  if (held === itemPrev.length && held > 0) return null
  return held
}

/** 项内窗口已剥缩进的正文：同一项再增长时不重剥已画前缀 */
const lastItemInnerStripHold = new WeakMap<object, { start: number; raw: string; stripped: string }>()

function rememberItemInnerStrip(item: object, start: number, raw: string, stripped: string): void {
  lastItemInnerStripHold.set(item, { start, raw, stripped })
}

function readItemInnerStrip(item: object, start: number, raw: string): string | null {
  const held = lastItemInnerStripHold.get(item)
  if (!held || held.start !== start || held.raw !== raw) return null
  return held.stripped
}

/**
 * 已剥缩进的项内窗口只剥后缀：同一行直接拼接，新行才 `dedentLine`。
 * 多行 token 从后缀逐行剥；对不上则退回全量剥。
 */
function growStrippedItemInnerWindow(
  held: string,
  rawPrev: string,
  rawNext: string,
  indent: number
): string | null {
  if (!rawNext.startsWith(rawPrev)) return null
  const extra = rawNext.slice(rawPrev.length)
  if (!extra) return held
  if (!extra.includes('\n') && !rawPrev.endsWith('\n')) return held + extra
  if (extra === '\n') return `${held}\n`
  if (extra.startsWith('\n') && !extra.slice(1).includes('\n')) {
    return `${held}\n${dedentLine(extra.slice(1), indent)}`
  }
  if (rawPrev.endsWith('\n') && !extra.includes('\n')) {
    return held.endsWith('\n') ? held + dedentLine(extra, indent) : `${held}\n${dedentLine(extra, indent)}`
  }
  let out = held
  let offset = 0
  if (!rawPrev.endsWith('\n')) {
    const nl = extra.indexOf('\n')
    if (nl < 0) return null
    out += extra.slice(0, nl)
    offset = nl
  }
  while (offset < extra.length) {
    if (extra[offset] !== '\n') return null
    const next = extra.indexOf('\n', offset + 1)
    const end = next < 0 ? extra.length : next
    out += `\n${dedentLine(extra.slice(offset + 1, end), indent)}`
    if (next < 0) break
    offset = next
  }
  return out
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

/** 第一行；`indexOf`，不 split 全文 */
function streamingFirstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl < 0 ? text : text.slice(0, nl)
}

/**
 * 闭合块后的后缀里有没有另起廉价块的行。
 * `indexOf` 往前走，不 split 已画 after（对标 Codex #22860）。
 */
export function suffixOpensNewCheapBlock(after: string): boolean {
  if (!after) return false
  let offset = 0
  while (offset <= after.length) {
    const nl = after.indexOf('\n', offset)
    const end = nl < 0 ? after.length : nl
    if (lineOpensNewCheapBlock(after.slice(offset, end))) return true
    if (nl < 0) break
    offset = nl + 1
  }
  return false
}

/** 后缀里第一行另起块的起点；没有则返回全文长度 */
function closedAfterSiblingStart(after: string): number {
  let offset = 0
  while (offset <= after.length) {
    const nl = after.indexOf('\n', offset)
    const end = nl < 0 ? after.length : nl
    if (lineOpensNewCheapBlock(after.slice(offset, end))) return offset
    if (nl < 0) break
    offset = nl + 1
  }
  return after.length
}

/** 已闭合单行项内块（ATX / HR / Setext 下划线窗）后面的后缀 */
function suffixAfterClosedSingleLineBlock(prevNorm: string, nextText: string): string | null {
  const first = streamingFirstLine(prevNorm)
  if (!nextText.startsWith(first)) return null
  if (nextText === first) return ''
  if (!nextText.startsWith(`${first}\n`)) return null
  const after = nextText.slice(first.length + 1)
  if (suffixOpensNewCheapBlock(after)) return null
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
  const first = streamingFirstLine(after)
  if (isGfmTableRow(first) || looksLikeGfmTableCells(first) || isGfmTableSep(first)) return null
  if (suffixOpensNewCheapBlock(after)) return null
  return after
}

/** 围栏闭合行后面的原文；`indexOf` 往前走，不 split 全文 */
function textAfterFenceCloser(text: string): string | null {
  const nl = text.indexOf('\n')
  if (nl < 0) return null
  const open = parseFenceLine(text.slice(0, nl))
  if (!open) return null
  let offset = nl + 1
  while (offset <= text.length) {
    const end = text.indexOf('\n', offset)
    const lineEnd = end < 0 ? text.length : end
    if (isFenceClose(text.slice(offset, lineEnd), open.marker)) {
      return end < 0 ? '' : text.slice(end + 1)
    }
    if (end < 0) break
    offset = end + 1
  }
  return null
}

/**
 * 未闭合围栏的后缀是闭合标记（可带后续块）。
 * 已画正文保持 `prev.text`，不重拆围栏窗口（对标 Codex #22860）。
 */
function streamingFenceCloseAfter(prevNorm: string, suffix: string, marker: string): string | null {
  if (!suffix || suffix.includes(']:')) return null
  if (isFenceClose(lastCompleteStreamingLine(prevNorm), marker)) return null
  let closeLine: string
  let after: string
  if (suffix.startsWith('\n')) {
    const rest = suffix.slice(1)
    const nl = rest.indexOf('\n')
    closeLine = nl < 0 ? rest : rest.slice(0, nl)
    after = nl < 0 ? '' : rest.slice(nl + 1)
  } else if (prevNorm.endsWith('\n')) {
    const nl = suffix.indexOf('\n')
    closeLine = nl < 0 ? suffix : suffix.slice(0, nl)
    after = nl < 0 ? '' : suffix.slice(nl + 1)
  } else {
    return null
  }
  if (!isFenceClose(closeLine, marker)) return null
  return after
}

/** 已画围栏窗口仍未闭合时记下原文，再增长只看后缀有没有闭合标记 */
const lastFenceOpenHold = new WeakMap<object, string>()

function rememberFenceOpen(block: object, window: string): void {
  lastFenceOpenHold.set(block, window)
}

function readFenceOpen(block: object, window: string): boolean {
  return lastFenceOpenHold.get(block) === window
}

/** 已闭合项内围栏后面的原文（含另起的表 / 标题 / 引用） */
function textAfterClosedFence(
  prevNorm: string,
  nextText: string,
  prevOpen?: boolean
): string | null {
  const marker = streamingFenceOpenMarker(prevNorm) ?? streamingFenceOpenMarker(nextText)
  if (!marker) return null
  const extra = nextText.slice(prevNorm.length)
  if (prevOpen) return extra ? streamingFenceCloseAfter(prevNorm, extra, marker) : null
  if (!isFenceClose(lastCompleteStreamingLine(prevNorm), marker)) {
    const fromExtra = extra ? streamingFenceCloseAfter(prevNorm, extra, marker) : null
    if (fromExtra != null) return fromExtra
    if (textAfterFenceCloser(prevNorm) == null) return null
  }
  return textAfterFenceCloser(nextText)
}

/** 闭合块后的续行：先当 suffix，遇到新块再另起项内块 */
function splitSuffixAndSiblingBlocks(
  after: string,
  prevSuffix: CheapInlineNode[] | undefined,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): { suffix?: CheapInlineNode[]; blocks: CheapProseBlock[] } | null {
  const splitAt = closedAfterSiblingStart(after)
  const suffixSrc =
    splitAt < after.length && splitAt > 0 && after[splitAt - 1] === '\n'
      ? after.slice(0, splitAt - 1)
      : after.slice(0, splitAt)
  const rest = after.slice(splitAt)
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
  const grownExtra = growLastListItemExtra(item, itemPrev, suffix, defs)
  if (grownExtra) return grownExtra
  if (!item.blocks?.length) return null
  const last = item.blocks[item.blocks.length - 1]!
  const firstLine = itemPrev.slice(0, itemPrev.indexOf('\n') === -1 ? itemPrev.length : itemPrev.indexOf('\n'))
  const indent = item.contentIndent ?? parseListLine(firstLine)?.contentIndent ?? 0
  let start = readItemInnerStart(item, itemPrev)
  if (start == null) start = lastItemInnerBlockStart(itemPrev, last, indent)
  if (start == null) return null
  const stripItemIndent = (text: string) => {
    if (!indent) return text
    let out = ''
    let offset = 0
    while (offset <= text.length) {
      const nl = text.indexOf('\n', offset)
      const end = nl < 0 ? text.length : nl
      if (out) out += '\n'
      out += dedentLine(text.slice(offset, end), indent)
      if (nl < 0) break
      offset = nl + 1
    }
    return out
  }
  const rawPrev = itemPrev.slice(start)
  const rawNext = itemNext.slice(start)
  const heldStrip = indent ? readItemInnerStrip(item, start, rawPrev) : null
  const grownStrip =
    heldStrip != null ? growStrippedItemInnerWindow(heldStrip, rawPrev, rawNext, indent) : null
  const prevWindow = heldStrip ?? stripItemIndent(rawPrev)
  const nextWindow = grownStrip ?? stripItemIndent(rawNext)
  const stampItemInnerHold = (nextItem: CheapListItem, keepStart: boolean) => {
    if (!keepStart) return
    rememberItemInnerStart(nextItem, start)
    if (indent) rememberItemInnerStrip(nextItem, start, rawNext, nextWindow)
  }
  const grown = continueLastBlockOfType(last, prevWindow, nextWindow, defs)
  const afterClosed =
    last.type === 'pre'
      ? textAfterClosedFence(prevWindow, nextWindow, readFenceOpen(last, prevWindow))
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
      if (nextBlocks === item.blocks) {
        stampItemInnerHold(item, true)
        return item
      }
      const nextItem = { ...item, blocks: nextBlocks }
      stampItemInnerHold(nextItem, true)
      return nextItem
    }
    const split = splitSuffixAndSiblingBlocks(afterClosed, item.suffix, defs)
    if (!split) return null
    const blocks = split.blocks.length ? [...nextBlocks, ...split.blocks] : nextBlocks
    if (split.suffix === item.suffix && blocks === nextBlocks && nextBlocks === item.blocks) {
      stampItemInnerHold(item, !split.blocks.length)
      return item
    }
    const nextItem = { ...item, blocks, suffix: split.suffix }
    stampItemInnerHold(nextItem, !split.blocks.length)
    return nextItem
  }
  if (!grown || grown.length !== 1) return null
  if (grown[0] === last) {
    stampItemInnerHold(item, true)
    if (last.type === 'pre') rememberFenceOpen(last, nextWindow)
    return item
  }
  const nextItem = { ...item, blocks: [...item.blocks.slice(0, -1), grown[0]!] }
  stampItemInnerHold(nextItem, true)
  if (grown[0]!.type === 'pre') rememberFenceOpen(grown[0]!, nextWindow)
  return nextItem
}

/**
 * 换行后的后缀行（可多行）。单独换行 / 空行收束 / 定义行没有。
 * `indexOf` 往前走，不 split 已画正文（对标 Codex #22860）。
 */
function streamingSuffixLines(prevNorm: string, suffix: string): string[] | null {
  if (!suffix || suffix.includes(']:') || suffix.includes('\n\n')) return null
  const rest = suffix.startsWith('\n') ? suffix.slice(1) : prevNorm.endsWith('\n') ? suffix : null
  if (!rest) return null
  const lines: string[] = []
  let offset = 0
  while (offset <= rest.length) {
    const nl = rest.indexOf('\n', offset)
    const end = nl < 0 ? rest.length : nl
    lines.push(rest.slice(offset, end))
    if (nl < 0) break
    offset = nl + 1
  }
  return lines
}

function streamingListTopLevel(prevNorm: string) {
  const firstNl = prevNorm.indexOf('\n')
  return parseListLine(firstNl < 0 ? prevNorm : prevNorm.slice(0, firstNl))
}

function eachStreamingSuffixLine(
  lines: string[],
  visit: (line: string) => boolean
): boolean {
  let saw = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!line) {
      if (i !== lines.length - 1) return false
      continue
    }
    if (!visit(line)) return false
    saw = true
  }
  return saw
}

/**
 * 列表后缀只追加同级新项：换行后的一项或多项，不重解析已画项。
 * 单独换行、未写完标记、嵌套缩进、换列表类型、项内围栏 / 标题仍走整项窗口。
 */
export function shouldAppendStreamingListItem(opts: {
  prevNorm: string
  suffix: string
  ordered: boolean
}): boolean {
  const { prevNorm, suffix, ordered } = opts
  const lines = streamingSuffixLines(prevNorm, suffix)
  if (!lines) return false
  const first = streamingListTopLevel(prevNorm)
  if (!first) return false
  return eachStreamingSuffixLine(lines, (line) => {
    if (isPendingListMarkerLine(line)) return false
    const parsed = parseListLine(line)
    return Boolean(
      parsed &&
        parsed.ordered === ordered &&
        parsed.indent === first.indent &&
        !lastLineNeedsFullProseParse(parsed.text)
    )
  })
}

/**
 * 列表后缀只开 / 追加嵌套项：比顶层更深的一项或多项，不重解析已画父项。
 * 换列表类型、项内围栏 / 标题、未写完标记仍走整项窗口。
 */
export function shouldAppendStreamingNestedListItem(opts: {
  prevNorm: string
  suffix: string
}): boolean {
  const { prevNorm, suffix } = opts
  const lines = streamingSuffixLines(prevNorm, suffix)
  if (!lines) return false
  const first = streamingListTopLevel(prevNorm)
  if (!first) return false
  return eachStreamingSuffixLine(lines, (line) => {
    if (isPendingListMarkerLine(line)) return false
    const parsed = parseListLine(line)
    return Boolean(parsed && parsed.indent > first.indent && !lastLineNeedsFullProseParse(parsed.text))
  })
}

function appendStreamingNestedListItem(
  item: CheapListItem,
  parsed: {
    indent: number
    ordered: boolean
    text: string
    contentIndent: number
    start?: number
  },
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapListItem | null {
  const nextItem: CheapListItem = {
    nodes: parseCheapInlineMarkdown(parsed.text, defs),
    contentIndent: parsed.contentIndent
  }
  if (item.nested?.items.length) {
    if (parsed.indent === item.nested.indent && parsed.ordered === item.nested.ordered) {
      return {
        ...item,
        nested: {
          ...item.nested,
          items: [...item.nested.items, nextItem]
        }
      }
    }
    if (parsed.indent > item.nested.indent) {
      const lastNested = item.nested.items[item.nested.items.length - 1]
      if (!lastNested) return null
      const grown = appendStreamingNestedListItem(lastNested, parsed, defs)
      if (!grown) return null
      return {
        ...item,
        nested: {
          ...item.nested,
          items: [...item.nested.items.slice(0, -1), grown]
        }
      }
    }
    return null
  }
  if (item.blocks?.length || item.extra?.length || item.suffix?.length) return null
  return {
    ...item,
    nested: {
      ordered: parsed.ordered,
      indent: parsed.indent,
      items: [nextItem],
      start: parsed.ordered && parsed.start && parsed.start !== 1 ? parsed.start : undefined
    }
  }
}

/**
 * 列表后缀只续最后一项行内：同行增长，或换行后续行不另起项 / 块。
 * 新列表项、空行后的兄弟段、嵌套标记仍走整项窗口。
 */
export function shouldGrowLastListItemInline(opts: {
  prevNorm: string
  suffix: string
}): boolean {
  const { prevNorm, suffix } = opts
  if (!suffix || suffix.includes(']:')) return false
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n')) {
    const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
    return !lastLineNeedsFullProseParse(lastLine)
  }
  const continued = prevNorm.endsWith('\n')
    ? suffix
    : suffix.startsWith('\n')
      ? suffix.slice(1)
      : null
  if (continued == null) return false
  if (!continued) return false
  if (continued.startsWith('\n') || continued.includes('\n\n')) return false
  const lastPrev = prevNorm.endsWith('\n')
    ? prevNorm.slice(0, -1).slice(prevNorm.slice(0, -1).lastIndexOf('\n') + 1)
    : prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
  if (lastLineNeedsFullProseParse(lastPrev)) return false
  for (const line of continued.split('\n')) {
    if (!line) continue
    if (parseListLine(line) || lineOpensNewCheapBlock(line) || lastLineNeedsFullProseParse(line)) {
      return false
    }
  }
  return true
}

function continueLastListBlock(
  prev: Extract<CheapProseBlock, { type: 'list' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (shouldGrowLastListItemInline({ prevNorm, suffix }) && prev.items.length) {
    const lastItem = prev.items[prev.items.length - 1]!
    if (!lastItem.extra?.length && !lastItem.blocks?.length && !lastItem.suffix?.length) {
      const inlineSuffix =
        prevNorm.endsWith('\n') && !suffix.startsWith('\n') ? `\n${suffix}` : suffix
      const grown = growLastListItemInline(lastItem, inlineSuffix, defs)
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
  if (shouldAppendStreamingListItem({ prevNorm, suffix, ordered: prev.ordered }) && prev.items.length) {
    const lines = streamingSuffixLines(prevNorm, suffix)
    const added: CheapListItem[] = []
    if (lines) {
      for (const line of lines) {
        if (!line) continue
        const parsed = parseListLine(line)
        if (!parsed) return null
        added.push({
          nodes: parseCheapInlineMarkdown(parsed.text, defs),
          contentIndent: parsed.contentIndent
        })
      }
    }
    if (added.length) {
      return [
        {
          type: 'list',
          ordered: prev.ordered,
          items: [...prev.items, ...added],
          loose: prev.loose,
          start: prev.start
        }
      ]
    }
  }
  if (shouldAppendStreamingNestedListItem({ prevNorm, suffix }) && prev.items.length) {
    const lines = streamingSuffixLines(prevNorm, suffix)
    const lastItem = prev.items[prev.items.length - 1]
    if (lines && lastItem) {
      let grown: CheapListItem | null = lastItem
      for (const line of lines) {
        if (!line) continue
        const parsed = parseListLine(line)
        if (!parsed || !grown) return null
        grown = appendStreamingNestedListItem(grown, parsed, defs)
        if (!grown) return null
      }
      if (grown && grown !== lastItem) {
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
  const extra = nextText.startsWith(prevNorm) ? nextText.slice(prevNorm.length) : ''
  if (extra.startsWith('\n\n')) {
    const after = extra.slice(2)
    const first = streamingFirstLine(after)
    if (after && leadingIndent(first) === 0 && !parseListLine(first) && first.trim() !== '') {
      const siblings = parseCheapProseBlocks(after, defs)
      if (siblings.length && siblings[0]?.type !== 'list') return [prev, ...siblings]
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

function lastStreamingLine(text: string): string {
  if (text.endsWith('\n')) return ''
  return text.slice(text.lastIndexOf('\n') + 1)
}

function stripIndentCodeLine(line: string): string {
  return line.replace(/^(?:    |\t)/, '')
}

/**
 * 缩进代码后缀只改正文最后一行：新缩进行（可多行），或同一行里补字符。
 * 单独换行、空行后的兄弟段 / 标题 / 列表仍走整块窗口。
 */
export function shouldGrowStreamingIndentCodeLastLine(opts: {
  prevNorm: string
  suffix: string
}): boolean {
  const { prevNorm, suffix } = opts
  if (!suffix || suffix.includes(']:')) return false
  if (suffix === '\n') return false
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n')) {
    return isIndentCodeLine(lastStreamingLine(prevNorm))
  }
  const lines = streamingSuffixLines(prevNorm, suffix)
  if (!lines) return false
  return eachStreamingSuffixLine(lines, (line) => isIndentCodeLine(line))
}

function lastCompleteStreamingLine(text: string): string {
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text
  return trimmed.slice(trimmed.lastIndexOf('\n') + 1)
}

function parseStreamingTableRowLine(
  line: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapInlineNode[][] | null {
  if (!isLiveTableDataLine(line)) return null
  return splitGfmTableCells(line).map((cell) => parseCheapInlineMarkdown(cell, defs))
}

/**
 * 表后缀只改正文最后一行：新数据行（可多行），或同一行里补 `|`。
 * 单独换行、分隔行、空行后的兄弟段仍走整表窗口。
 */
export function shouldGrowStreamingTableLastLine(opts: {
  prevNorm: string
  suffix: string
}): boolean {
  const { prevNorm, suffix } = opts
  if (!suffix || suffix.includes(']:')) return false
  if (suffix === '\n') return false
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n')) {
    if (!suffix.includes('|')) return false
    return isLiveTableDataLine(lastStreamingLine(prevNorm + suffix))
  }
  const lines = streamingSuffixLines(prevNorm, suffix)
  if (!lines) return false
  return eachStreamingSuffixLine(lines, (line) => isLiveTableDataLine(line))
}

function growStreamingTableLastLine(
  prev: Extract<CheapProseBlock, { type: 'table' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!shouldGrowStreamingTableLastLine({ prevNorm, suffix })) return null
  const appending = suffix.startsWith('\n') || prevNorm.endsWith('\n')
  if (appending && !prev.rows.length && !isGfmTableSep(lastCompleteStreamingLine(prevNorm))) {
    return null
  }
  if (appending) {
    const lines = streamingSuffixLines(prevNorm, suffix)
    if (!lines) return null
    const added: CheapInlineNode[][] = []
    for (const line of lines) {
      if (!line) continue
      const row = parseStreamingTableRowLine(line, defs)
      if (!row) return null
      added.push(row)
    }
    if (!added.length) return [prev]
    return [{ type: 'table', header: prev.header, rows: [...prev.rows, ...added], align: prev.align }]
  }
  const line = lastStreamingLine(nextText)
  const row = parseStreamingTableRowLine(line, defs)
  if (!row) return null
  if (!prev.rows.length) return null
  const lastRow = prev.rows[prev.rows.length - 1]!
  const reused = reuseInlineLists(lastRow, row)
  if (reused === lastRow) return [prev]
  return [{ type: 'table', header: prev.header, rows: [...prev.rows.slice(0, -1), reused], align: prev.align }]
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
  const lastLineGrow = growStreamingTableLastLine(prev, prevNorm, nextText, defs)
  if (lastLineGrow) return lastLineGrow
  if (nextText.startsWith(prevNorm) && prev.rows.length) {
    const extra = nextText.slice(prevNorm.length)
    if (extra.startsWith('\n')) {
      const after = extra.slice(1)
      const first = streamingFirstLine(after)
      if (
        after &&
        !isLiveTableDataLine(first) &&
        !isGfmTableSep(first) &&
        !looksLikeGfmTableCells(first) &&
        !isPendingGfmTableSepLine(first)
      ) {
        const siblings = parseCheapProseBlocks(after, defs)
        if (after.trim() !== '' && !siblings.length) return null
        return siblings.length ? [prev, ...siblings] : [prev]
      }
    }
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

/** 段落后可另起的块（不含 Setext / HR / 表分隔，那些会改当前段） */
function lineStartsSiblingAfterParagraph(line: string): boolean {
  if (!line) return false
  if (isPendingSetextUnderline(line) || SETEXT_RE.test(line) || parseHrLine(line)) return false
  if (isGfmTableSep(line) || isPendingGfmTableSepLine(line) || looksLikeGfmTableCells(line)) return false
  if (isPendingListMarkerLine(line)) return false
  if (parseListLine(line) || parseHeadingLine(line) || parseFenceLine(line)) return true
  if (parseQuoteLine(line) !== null || isIndentCodeLine(line)) return true
  return Boolean(parseFootnoteDefinitionLine(line))
}

/** 只改正文前缀：已画段落对象在没变时保持同一引用 */
function continueParagraphPrefix(
  prev: Extract<CheapProseBlock, { type: 'p' }>,
  prevNorm: string,
  paraText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const prevTrim = prevNorm.replace(/\n+$/, '')
  const nextTrim = paraText.replace(/\n+$/, '')
  if (nextTrim === prevTrim) return [prev]
  if (!nextTrim.startsWith(prevTrim)) return null
  const lastLine = nextTrim.slice(nextTrim.lastIndexOf('\n') + 1)
  if (!nextTrim.includes('\n') && lastLineNeedsFullProseParse(lastLine)) return null
  const nodes = continueCheapInlineMarkdown(prevTrim, prev.nodes, nextTrim, defs)
  return nodes === prev.nodes ? [prev] : [{ type: 'p', nodes }]
}

/**
 * 段落软换行后只扫后缀新行，不 split 已画正文（对标 Codex #22860）。
 * 无新行时返回 null，交给同行增长。
 */
export function paragraphSuffixNewLines(prevNorm: string, suffix: string): string[] | null {
  if (!suffix) return null
  if (suffix.startsWith('\n')) return suffix.slice(1).split('\n')
  if (prevNorm.endsWith('\n')) return suffix.split('\n')
  const nl = suffix.indexOf('\n')
  if (nl < 0) return null
  return suffix.slice(nl + 1).split('\n')
}

/** 后缀新行在 nextText 中的起点；与 paragraphSuffixNewLines 对齐 */
function paragraphSuffixScanStart(prevNorm: string, suffix: string): number | null {
  if (!suffix) return null
  if (suffix.startsWith('\n')) return prevNorm.length + 1
  if (prevNorm.endsWith('\n')) return prevNorm.length
  const nl = suffix.indexOf('\n')
  if (nl < 0) return null
  return prevNorm.length + nl + 1
}

/** 后缀是否另起脚注定义（含空行后再起）；链接定义 `[id]:` 不算 */
function suffixOpensFootnoteDefinition(prevNorm: string, suffix: string): boolean {
  if (!suffix) return false
  let rest = suffix.startsWith('\n') ? suffix.slice(1) : prevNorm.endsWith('\n') ? suffix : null
  if (rest == null) return false
  while (rest.startsWith('\n')) rest = rest.slice(1)
  return Boolean(parseFootnoteDefinitionLine(streamingFirstLine(rest)))
}

/**
 * 段落后只开已引用的脚注块：引用段保持同一对象，不把 after 当全文重扫。
 * 未引用、链接定义、同行 `]:` 仍走整段窗口。
 */
export function shouldOpenStreamingFootnotesAfterParagraph(opts: {
  prevNorm: string
  suffix: string
  citedIds: ReadonlySet<string>
}): boolean {
  return Boolean(opts.citedIds.size && suffixOpensFootnoteDefinition(opts.prevNorm, opts.suffix))
}

function footnotesBlockFromCitedSuffix(
  after: string,
  citedIds: ReadonlySet<string> | undefined,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): Extract<CheapProseBlock, { type: 'footnotes' }> | null {
  if (!citedIds?.size || !after) return null
  const items = streamingFootnoteSuffixItems('', after.startsWith('\n') ? after : `\n${after}`)
  if (!items) return null
  const kept = items.filter((item) => citedIds.has(item.id))
  if (!kept.length) return null
  return {
    type: 'footnotes',
    items: kept.map((item) => ({
      id: item.id,
      paragraphs: (item.body ? item.body.split(/\n\n/) : ['']).map((part) =>
        parseCheapInlineMarkdown(part, defs)
      )
    }))
  }
}

function continueAfterParagraphWithCitedFootnotes(
  para: CheapProseBlock[],
  after: string,
  citedIds: ReadonlySet<string> | undefined,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  if (!parseFootnoteDefinitionLine(streamingFirstLine(after))) return null
  const notes = footnotesBlockFromCitedSuffix(after, citedIds, defs)
  if (notes) return [...para, notes]
  if (streamingFootnoteSuffixItems('', after.startsWith('\n') ? after : `\n${after}`)) return para
  return null
}

/** 续段落（含软换行后续写）；闭合后再起列表 / 标题 / 围栏 / 已引用脚注时段落不动（对标 Codex #34045） */
function continueLastParagraphBlock(
  prev: Extract<CheapProseBlock, { type: 'p' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>,
  citedIds?: ReadonlySet<string>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix) return null
  if (suffix.includes(']:') && !suffixOpensFootnoteDefinition(prevNorm, suffix)) return null
  const cites = citedIds ?? (suffix.includes(']:') ? collectCitedFootnoteIds(nextText) : undefined)
  const blank = nextText.indexOf('\n\n', Math.max(0, prevNorm.length - 1))
  if (blank >= 0) {
    const paraText = nextText.slice(0, blank)
    const after = nextText.slice(blank + 2)
    const afterFirst = streamingFirstLine(after)
    if (isPendingSetextUnderline(afterFirst) || SETEXT_RE.test(afterFirst)) return null
    const para = continueParagraphPrefix(prev, prevNorm, paraText, defs)
    if (!para) return null
    if (!after) return para
    const notes = continueAfterParagraphWithCitedFootnotes(para, after, cites, defs)
    if (notes) return notes
    const siblings = parseCheapProseBlocks(after, defs)
    if (after.trim() !== '' && !siblings.length) return null
    return siblings.length ? [...para, ...siblings] : para
  }
  if (suffix.includes('\n') || prevNorm.endsWith('\n')) {
    const newLines = paragraphSuffixNewLines(prevNorm, suffix)
    let offset = paragraphSuffixScanStart(prevNorm, suffix)
    if (newLines && offset != null) {
      for (const line of newLines) {
        if (lineStartsSiblingAfterParagraph(line)) {
          const paraText = nextText.slice(0, offset)
          const after = nextText.slice(offset)
          const para = continueParagraphPrefix(prev, prevNorm, paraText, defs)
          if (!para) return null
          const notes = continueAfterParagraphWithCitedFootnotes(para, after, cites, defs)
          if (notes) return notes
          const siblings = parseCheapProseBlocks(after, defs)
          if (after.trim() !== '' && !siblings.length) return null
          return siblings.length ? [...para, ...siblings] : para
        }
        if (lineOpensNewCheapBlock(line)) return null
        offset += line.length + 1
      }
    }
  }
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n')) {
    const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
    if (lastLineNeedsFullProseParse(lastLine)) return null
  }
  const nodes = continueCheapInlineMarkdown(prevNorm, prev.nodes, nextText, defs)
  return nodes === prev.nodes ? [prev] : [{ type: 'p', nodes }]
}

/** 剥一层 `>`；同一原文再问时退回上次结果，直播 token 不整段 split */
let quoteStripHold: { raw: string; inner: string } | null = null

function stripOuterQuotePrefixes(text: string): string {
  if (quoteStripHold?.raw === text) return quoteStripHold.inner
  const inner = text
    .split('\n')
    .map((line) => {
      const parsed = parseQuoteLine(line)
      return parsed !== null ? parsed : line
    })
    .join('\n')
  quoteStripHold = { raw: text, inner }
  return inner
}

/** 只剥后缀里的 `>`；同行续写不再 split 已画引用 */
function stripQuoteSuffix(suffix: string): string {
  if (!suffix) return ''
  return suffix
    .split('\n')
    .map((line, i) => {
      if (i === 0 && line && parseQuoteLine(line) === null) return line
      const parsed = parseQuoteLine(line)
      return parsed !== null ? parsed : line
    })
    .join('\n')
}

function quoteLineOpensOutside(line: string): boolean {
  return Boolean(
    parseListLine(line) ||
      parseHeadingLine(line) ||
      parseFenceLine(line) ||
      parseHrLine(line) ||
      isIndentCodeLine(line) ||
      parseFootnoteDefinitionLine(line) ||
      isGfmTableRow(line) ||
      looksLikeGfmTableCells(line)
  )
}

/** 处理完 prev 后，空行标记只跟最后一行走（引用行含空 `>` 会清掉） */
function quotePrevEndedBlank(prevNorm: string): boolean {
  const last = prevNorm.endsWith('\n')
    ? prevNorm.slice(0, -1).slice(prevNorm.slice(0, -1).lastIndexOf('\n') + 1)
    : prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
  if (parseQuoteLine(last) !== null) return false
  return last.trim() === ''
}

/**
 * 引用软换行后只扫后缀新行：已画行不必再 split 整段（对标 Codex #22860）。
 * 同行增长无法离开引用。
 */
export function quoteSuffixStaysInside(prevNorm: string, suffix: string): boolean {
  const newLines = paragraphSuffixNewLines(prevNorm, suffix)
  if (newLines == null) return true
  let sawBlank = quotePrevEndedBlank(prevNorm)
  for (const line of newLines) {
    if (parseQuoteLine(line) !== null) {
      sawBlank = false
      continue
    }
    if (line.trim() === '') {
      sawBlank = true
      continue
    }
    if (sawBlank) return false
    if (quoteLineOpensOutside(line)) return false
  }
  return true
}

/** 引用内最后一块起点：同一引用再增长时不再 `lastSingleBlockStart` 全量扫（对标 Codex #22860） */
const lastQuoteInnerStartHold = new WeakMap<object, number>()

function rememberQuoteInnerStart(quote: object, start: number): void {
  lastQuoteInnerStartHold.set(quote, start)
}

function readQuoteInnerStart(quote: object, innerPrev: string): number | null {
  const held = lastQuoteInnerStartHold.get(quote)
  if (held == null || held < 0 || held > innerPrev.length) return null
  if (held === innerPrev.length && held > 0) return null
  return held
}

/** 引用里最后一块增长（含换行后新列表项 / 围栏或标题闭合后再起的后续块）：前面的引用子块保持同一引用 */
function continueLastQuoteBlock(
  prev: Extract<CheapProseBlock, { type: 'quote' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || suffix.includes(']:')) return null
  if (!quoteSuffixStaysInside(prevNorm, suffix)) return null
  const last = prev.blocks[prev.blocks.length - 1]
  if (!last) return null
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n') && last.type === 'p') {
    const lastLine = prevNorm.slice(prevNorm.lastIndexOf('\n') + 1)
    const innerLast = lastLine.replace(/^ {0,3}> ?/, '')
    if (lastLineNeedsFullProseParse(innerLast)) return null
    const prevSrc = cheapInlineSourceAll(last.nodes)
    const nodes = continueCheapInlineMarkdown(prevSrc, last.nodes, prevSrc + suffix, defs)
    if (nodes === last.nodes) return [prev]
    const nextQuote = { type: 'quote' as const, blocks: [...prev.blocks.slice(0, -1), { type: 'p' as const, nodes }] }
    rememberQuoteInnerStart(nextQuote, 0)
    return [nextQuote]
  }
  const innerPrev = stripOuterQuotePrefixes(prevNorm)
  const innerNext = innerPrev + stripQuoteSuffix(suffix)
  quoteStripHold = { raw: nextText, inner: innerNext }
  if (!innerNext.startsWith(innerPrev)) return null
  const closed = prev.blocks.slice(0, -1)
  let start = closed.length ? readQuoteInnerStart(prev, innerPrev) : 0
  if (start == null) {
    start = consumeClosedSingleLinePrefix(innerPrev, closed)
    if (start == null || start <= 0) start = lastBlockSourceStart(innerPrev, last)
  }
  const grown =
    start != null && start > 0
      ? continueLastBlockOfType(last, innerPrev.slice(start), innerNext.slice(start), defs)
      : continueLastBlockOfType(last, innerPrev, innerNext, defs)
  const stampQuoteInner = (quote: Extract<CheapProseBlock, { type: 'quote' }>, keepStart: boolean) => {
    if (keepStart && start != null) rememberQuoteInnerStart(quote, start)
  }
  if (grown && grown.length > 1) {
    const nextQuote = { type: 'quote' as const, blocks: [...closed, ...grown] }
    return [nextQuote]
  }
  if (grown?.length === 1 && grown[0] !== last) {
    const nextQuote = { type: 'quote' as const, blocks: [...closed, grown[0]!] }
    stampQuoteInner(nextQuote, true)
    return [nextQuote]
  }
  if (grown?.length === 1 && grown[0] === last && innerNext.length === innerPrev.length) {
    stampQuoteInner(prev, true)
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
  if (same) {
    stampQuoteInner(prev, true)
    return [prev]
  }
  const nextQuote = { type: 'quote' as const, blocks: out }
  stampQuoteInner(nextQuote, out.length === prev.blocks.length)
  return [nextQuote]
}

/**
 * 脚注末项空行后只追加一段：缩进续行另起段落，不重扫已画项。
 * 新定义、无缩进、段间再空行仍走整块窗口。
 */
export function shouldAppendStreamingFootnoteParagraph(opts: {
  prevNorm: string
  suffix: string
}): boolean {
  const { prevNorm, suffix } = opts
  if (!suffix || suffix.includes(']:')) return false
  const after = suffix.startsWith('\n\n')
    ? suffix.slice(2)
    : prevNorm.endsWith('\n') && suffix.startsWith('\n')
      ? suffix.slice(1)
      : null
  if (!after || after.includes('\n\n')) return false
  let offset = 0
  let saw = false
  while (offset <= after.length) {
    const nl = after.indexOf('\n', offset)
    const end = nl < 0 ? after.length : nl
    const line = after.slice(offset, end)
    if (line) {
      if (!isFootnoteContLine(line)) return false
      saw = true
    } else if (nl >= 0) {
      return false
    }
    if (nl < 0) break
    offset = nl + 1
  }
  return saw
}

/**
 * 脚注末项后缀只改正文最后一段：同一行补字符，或换行后的缩进续行（可多行）。
 * 单独换行仍走整块窗口；空行后新段走 `shouldAppendStreamingFootnoteParagraph`；
 * 新定义走 `shouldAppendStreamingFootnoteItem`。
 */
export function shouldGrowStreamingFootnoteLastLine(opts: {
  prevNorm: string
  suffix: string
  lastId?: string
}): boolean {
  const { prevNorm, suffix, lastId } = opts
  if (!suffix || suffix.includes(']:')) return false
  if (suffix === '\n') return false
  if (!suffix.includes('\n') && !prevNorm.endsWith('\n')) {
    const last = lastStreamingLine(prevNorm)
    const def = parseFootnoteDefinitionLine(last)
    if (def) return !lastId || def.id === lastId
    return isFootnoteContLine(last)
  }
  const lines = streamingSuffixLines(prevNorm, suffix)
  if (!lines) return false
  return eachStreamingSuffixLine(lines, (line) => isFootnoteContLine(line))
}

function growStreamingFootnoteLastLine(
  prev: Extract<CheapProseBlock, { type: 'footnotes' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  const lastItem = prev.items[prev.items.length - 1]
  if (!lastItem) return null
  if (!shouldGrowStreamingFootnoteLastLine({ prevNorm, suffix, lastId: lastItem.id })) return null
  const paras = lastItem.paragraphs.length ? lastItem.paragraphs : [[]]
  const lastPara = paras[paras.length - 1] ?? []
  const prevSrc = cheapInlineSourceAll(lastPara)
  const appending = suffix.startsWith('\n') || prevNorm.endsWith('\n')
  let add = suffix
  if (appending) {
    const lines = streamingSuffixLines(prevNorm, suffix)
    if (!lines) return null
    add = ''
    for (const line of lines) {
      if (!line) continue
      add += `\n${line.replace(/^(?:    |\t)/, '')}`
    }
    if (!add) return [prev]
  }
  const nodes = continueCheapInlineMarkdown(prevSrc, lastPara, prevSrc + add, defs)
  if (nodes === lastPara) return [prev]
  return [
    {
      type: 'footnotes',
      items: [...prev.items.slice(0, -1), { id: lastItem.id, paragraphs: [...paras.slice(0, -1), nodes] }]
    }
  ]
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

/**
 * 脚注后缀只追加已引用的新定义：换行后的一项或多项，不重解析已画项 / 引用段。
 * 未引用、重复 id、空行后再起、非定义行仍走整块窗口。
 */
export function shouldAppendStreamingFootnoteItem(opts: {
  prevNorm: string
  suffix: string
  existingIds: readonly string[]
  citedIds: ReadonlySet<string>
}): boolean {
  const { prevNorm, suffix, existingIds, citedIds } = opts
  if (!citedIds.size) return false
  const items = streamingFootnoteSuffixItems(prevNorm, suffix)
  if (!items) return false
  const seen = new Set(existingIds)
  for (const item of items) {
    if (seen.has(item.id) || !citedIds.has(item.id)) return false
    seen.add(item.id)
  }
  return true
}

/** 后缀里的新脚注定义（与 `streamingSuffixLines` 同一 rest 规则，但不拒 `]:`） */
function streamingFootnoteSuffixItems(
  prevNorm: string,
  suffix: string
): { id: string; body: string }[] | null {
  if (!suffix || suffix.includes('\n\n')) return null
  const rest = suffix.startsWith('\n') ? suffix.slice(1) : prevNorm.endsWith('\n') ? suffix : null
  if (!rest) return null
  const lines: string[] = []
  let offset = 0
  while (offset <= rest.length) {
    const nl = rest.indexOf('\n', offset)
    const end = nl < 0 ? rest.length : nl
    lines.push(rest.slice(offset, end))
    if (nl < 0) break
    offset = nl + 1
  }
  if (!lines.length || !parseFootnoteDefinitionLine(lines[0]!)) return null
  const items: { id: string; body: string }[] = []
  let i = 0
  while (i < lines.length) {
    const def = parseFootnoteDefinitionLine(lines[i]!)
    if (!def) {
      if (lines[i]!.trim() === '' && i === lines.length - 1) break
      return null
    }
    const { body, end } = consumeFootnoteRegion(lines, i, def.text)
    items.push({ id: def.id, body })
    i = end
  }
  return items.length ? items : null
}

function appendStreamingFootnoteItems(
  prev: Extract<CheapProseBlock, { type: 'footnotes' }>,
  prevNorm: string,
  suffix: string,
  citedIds: ReadonlySet<string>,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  if (
    !shouldAppendStreamingFootnoteItem({
      prevNorm,
      suffix,
      existingIds: prev.items.map((item) => item.id),
      citedIds
    })
  ) {
    return null
  }
  const extra = streamingFootnoteSuffixItems(prevNorm, suffix)
  if (!extra) return null
  return [
    {
      type: 'footnotes',
      items: [
        ...prev.items,
        ...extra.map((item) => ({
          id: item.id,
          paragraphs: (item.body ? item.body.split(/\n\n/) : ['']).map((part) =>
            parseCheapInlineMarkdown(part, defs)
          )
        }))
      ]
    }
  ]
}

/** 续脚注末项（含缩进续行 / 新段 / 新引用定义）：已画项 / 前段保持同一引用（对标 Codex #34045） */
function continueLastFootnotesBlock(
  prev: Extract<CheapProseBlock, { type: 'footnotes' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>,
  citedIds?: ReadonlySet<string>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || !prev.items.length) return null
  if (suffix === '\n') return [prev]
  const lastLineGrow = growStreamingFootnoteLastLine(prev, prevNorm, nextText, defs)
  if (lastLineGrow) return lastLineGrow
  const lastItem = prev.items[prev.items.length - 1]!
  if (shouldAppendStreamingFootnoteParagraph({ prevNorm, suffix })) {
    const after = suffix.startsWith('\n\n') ? suffix.slice(2) : suffix.slice(1)
    let text = ''
    let offset = 0
    while (offset <= after.length) {
      const nl = after.indexOf('\n', offset)
      const end = nl < 0 ? after.length : nl
      const line = after.slice(offset, end)
      if (line) {
        if (text) text += '\n'
        text += line.replace(/^(?:    |\t)/, '')
      }
      if (nl < 0) break
      offset = nl + 1
    }
    if (!text) return [prev]
    return [
      {
        type: 'footnotes',
        items: [
          ...prev.items.slice(0, -1),
          {
            id: lastItem.id,
            paragraphs: [...(lastItem.paragraphs.length ? lastItem.paragraphs : [[]]), parseCheapInlineMarkdown(text, defs)]
          }
        ]
      }
    ]
  }
  if (citedIds) {
    const appended = appendStreamingFootnoteItems(prev, prevNorm, suffix, citedIds, defs)
    if (appended) return appended
  }
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

/** 已闭合 Setext 标题后再起后续块：标题保持同一引用（对标 Codex #34045） */
function continueLastSetextHeadingBlock(
  prev: Extract<CheapProseBlock, { type: 'heading' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  if (prevNorm.indexOf('\n') < 0) return null
  let scanEnd = prevNorm.length
  let underlineEnd = -1
  while (scanEnd > 0) {
    const nl = prevNorm.lastIndexOf('\n', scanEnd - 1)
    const start = nl < 0 ? 0 : nl + 1
    const line = prevNorm.slice(start, scanEnd)
    if (line.trim() === '') {
      if (nl < 0) break
      scanEnd = nl
      continue
    }
    if (start === 0) return null
    if (!SETEXT_RE.test(line) || isPendingSetextUnderline(line)) return null
    const marker = line.trim()[0]
    const level = marker === '=' ? 1 : 2
    if (level !== prev.level) return null
    underlineEnd = scanEnd
    break
  }
  if (underlineEnd < 1) return null
  const prefix = prevNorm.slice(0, underlineEnd)
  if (!nextText.startsWith(prefix)) return null
  if (nextText === prefix) return [prev]
  if (!nextText.startsWith(`${prefix}\n`)) return null
  const after = nextText.slice(prefix.length + 1)
  if (!after) return [prev]
  const siblings = parseCheapProseBlocks(after, defs)
  if (after.trim() !== '' && !siblings.length) return null
  return siblings.length ? [prev, ...siblings] : [prev]
}

/** 续 ATX / Setext 标题：无换行只改正文；闭合后把后续块接到后面（对标 Codex #34045） */
function continueLastHeadingBlock(
  prev: Extract<CheapProseBlock, { type: 'heading' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || suffix.includes(']:')) return null
  if (!suffix.includes('\n') && !suffix.includes('#') && !prevNorm.endsWith('\n')) {
    const prevH = parseHeadingLine(prevNorm)
    const nextH = parseHeadingLine(nextText)
    if (!prevH || !nextH || prevH.level !== nextH.level || prevH.level !== prev.level) return null
    const nodes = continueCheapInlineMarkdown(prevH.text, prev.nodes, nextH.text, defs)
    return nodes === prev.nodes ? [prev] : [{ type: 'heading', level: prev.level, nodes }]
  }
  const first = streamingFirstLine(prevNorm)
  const prevH = parseHeadingLine(first)
  if (prevH && prevH.level === prev.level) {
    if (!nextText.startsWith(first)) return null
    if (nextText === first) return [prev]
    if (!nextText.startsWith(`${first}\n`)) return null
    const after = nextText.slice(first.length + 1)
    const afterFirst = streamingFirstLine(after)
    if (isPendingSetextUnderline(afterFirst) || SETEXT_RE.test(afterFirst)) return null
    if (!after) return [prev]
    const siblings = parseCheapProseBlocks(after, defs)
    if (after.trim() !== '' && !siblings.length) return null
    return siblings.length ? [prev, ...siblings] : [prev]
  }
  return continueLastSetextHeadingBlock(prev, prevNorm, nextText, defs)
}

/** 已闭合分隔线后再起后续块：分隔线保持同一引用（对标 Codex #34045） */
function continueLastHrBlock(
  prev: Extract<CheapProseBlock, { type: 'hr' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!suffix || suffix.includes(']:')) return null
  const first = streamingFirstLine(prevNorm)
  if (!parseHrLine(first)) return null
  if (!nextText.startsWith(first)) return null
  if (nextText === first) return [prev]
  if (!nextText.startsWith(`${first}\n`)) return null
  const after = nextText.slice(first.length + 1)
  if (!after) return [prev]
  const siblings = parseCheapProseBlocks(after, defs)
  if (after.trim() !== '' && !siblings.length) return null
  return siblings.length ? [prev, ...siblings] : [prev]
}

/** 围栏窗口正文（去掉开闭行），`indexOf` 往前走，不 split 全文 */
function fencedPreBody(text: string): string | null {
  const nl = text.indexOf('\n')
  if (nl < 0) return parseFenceLine(text) ? '' : null
  const open = parseFenceLine(text.slice(0, nl))
  if (!open) return null
  let offset = nl + 1
  let body = ''
  while (offset <= text.length) {
    const end = text.indexOf('\n', offset)
    const lineEnd = end < 0 ? text.length : end
    const line = text.slice(offset, lineEnd)
    if (isFenceClose(line, open.marker)) return body
    if (body) body += '\n'
    body += line
    if (end < 0) break
    offset = end + 1
  }
  return body
}

function streamingFenceOpenMarker(text: string): string | null {
  const nl = text.indexOf('\n')
  const first = nl < 0 ? text : text.slice(0, nl)
  return parseFenceLine(first)?.marker ?? null
}

/**
 * 项内 / 引用内 / 廉价围栏后缀只改正文最后一行：新正文行，或同一行里补字符。
 * 单独换行、已闭合围栏、闭合后的 suffix、闭合标记仍走整块窗口。
 */
export function shouldGrowStreamingFencedPreLastLine(opts: {
  prevNorm: string
  suffix: string
  body?: string
}): boolean {
  const { prevNorm, suffix, body } = opts
  if (!suffix || suffix.includes(']:')) return false
  if (suffix === '\n') return false
  const marker = streamingFenceOpenMarker(prevNorm)
  if (!marker) return false
  if (isFenceClose(lastCompleteStreamingLine(prevNorm), marker)) return false
  if (!shouldGrowOpenStreamingFenceTail(prevNorm, suffix)) return false
  if (body == null) return true
  const lastSrc = lastStreamingLine(prevNorm)
  const lastBody = lastStreamingLine(body)
  if (suffix.startsWith('\n') || prevNorm.endsWith('\n')) {
    const complete = lastCompleteStreamingLine(prevNorm)
    if (!body) return Boolean(parseFenceLine(complete)) || complete === ''
    return complete === lastCompleteStreamingLine(body) || complete === lastBody
  }
  return lastSrc === lastBody || (Boolean(lastBody) && lastSrc.endsWith(lastBody))
}

function growStreamingFencedPreLastLine(
  prev: Extract<CheapProseBlock, { type: 'pre' }>,
  prevNorm: string,
  nextText: string
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!shouldGrowStreamingFencedPreLastLine({ prevNorm, suffix, body: prev.text })) return null
  const openerNl = prevNorm.indexOf('\n')
  if (openerNl < 0) {
    if (!suffix.includes('\n')) return [prev]
    const line = lastStreamingLine(nextText)
    if (!line) return [prev]
    return [{ type: 'pre', text: line, lang: prev.lang }]
  }
  const appending = suffix.startsWith('\n') || prevNorm.endsWith('\n')
  if (appending) {
    const line = lastStreamingLine(nextText)
    const nextBody = prev.text ? `${prev.text}\n${line}` : line
    return nextBody === prev.text ? [prev] : [{ type: 'pre', text: nextBody, lang: prev.lang }]
  }
  const nextBody = `${prev.text}${suffix}`
  return nextBody === prev.text ? [prev] : [{ type: 'pre', text: nextBody, lang: prev.lang }]
}

function growStreamingIndentCodeLastLine(
  prev: Extract<CheapProseBlock, { type: 'pre' }>,
  prevNorm: string,
  nextText: string
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (!shouldGrowStreamingIndentCodeLastLine({ prevNorm, suffix })) return null
  const appending = suffix.startsWith('\n') || prevNorm.endsWith('\n')
  if (appending) {
    const lines = streamingSuffixLines(prevNorm, suffix)
    if (!lines) return null
    let nextBody = prev.text
    for (const line of lines) {
      if (!line) continue
      const stripped = stripIndentCodeLine(line)
      nextBody = nextBody ? `${nextBody}\n${stripped}` : stripped
    }
    return nextBody === prev.text ? [prev] : [{ type: 'pre', text: nextBody }]
  }
  const nextBody = `${prev.text}${suffix}`
  return nextBody === prev.text ? [prev] : [{ type: 'pre', text: nextBody }]
}

/** 缩进代码 / 项内围栏尾只改正文；闭合后再起的后续块接到后面（对标 Codex #39061 / #34045） */
function continueLastPreBlock(
  prev: Extract<CheapProseBlock, { type: 'pre' }>,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  const suffix = nextText.slice(prevNorm.length)
  if (suffix.includes(']:')) return null
  const nl = prevNorm.indexOf('\n')
  const first = nl < 0 ? prevNorm : prevNorm.slice(0, nl)
  if (prev.lang || parseFenceLine(first)) {
    const marker = parseFenceLine(first)?.marker
    if (suffix === '\n') {
      rememberFenceOpen(prev, nextText)
      return [prev]
    }
    const lastLineGrow = growStreamingFencedPreLastLine(prev, prevNorm, nextText)
    if (lastLineGrow) {
      const block = lastLineGrow[0]
      if (block?.type === 'pre') rememberFenceOpen(block, nextText)
      return lastLineGrow
    }
    if (marker) {
      const afterClose = streamingFenceCloseAfter(prevNorm, suffix, marker)
      if (afterClose != null) {
        if (!afterClose) return [prev]
        const siblings = parseCheapProseBlocks(afterClose, defs)
        if (afterClose.trim() !== '' && !siblings.length) return null
        return siblings.length ? [prev, ...siblings] : [prev]
      }
    }
    const nextBody = fencedPreBody(nextText)
    if (nextBody == null || !nextBody.startsWith(prev.text)) return null
    const pre: CheapProseBlock =
      nextBody === prev.text ? prev : { type: 'pre', text: nextBody, lang: prev.lang }
    const after = textAfterFenceCloser(nextText)
    if (after) {
      const siblings = parseCheapProseBlocks(after, defs)
      if (after.trim() !== '' && !siblings.length) return null
      return siblings.length ? [pre, ...siblings] : [pre]
    }
    rememberFenceOpen(pre, nextText)
    return [pre]
  }
  if (suffix === '\n') return [prev]
  const lastLineGrow = growStreamingIndentCodeLastLine(prev, prevNorm, nextText)
  if (lastLineGrow) return lastLineGrow
  const nextLines = nextText.split('\n')
  let end = 0
  for (let i = 0; i < nextLines.length; i++) {
    const line = nextLines[i]!
    if (isIndentCodeLine(line)) {
      end = i + 1
      continue
    }
    if (line === '' && i === nextLines.length - 1 && nextText.endsWith('\n')) {
      end = i + 1
      continue
    }
    break
  }
  if (end === 0) return null
  const stripIndent = (text: string) =>
    text.split('\n').map((line) => line.replace(/^(?:    |\t)/, '')).join('\n')
  if (end === nextLines.length) {
    const nextBody = stripIndent(nextText)
    if (nextBody === prev.text) return [prev]
    if (!nextBody.startsWith(prev.text)) return null
    return [{ type: 'pre', text: nextBody }]
  }
  const prefix = nextLines.slice(0, end).join('\n')
  if (!nextText.startsWith(`${prefix}\n`)) return null
  const nextBody = stripIndent(prefix)
  if (nextBody !== prev.text && !nextBody.startsWith(prev.text)) return null
  const pre: CheapProseBlock = nextBody === prev.text ? prev : { type: 'pre', text: nextBody }
  const after = nextText.slice(prefix.length + 1)
  if (!after) return [pre]
  const siblings = parseCheapProseBlocks(after, defs)
  if (after.trim() !== '' && !siblings.length) return null
  return siblings.length ? [pre, ...siblings] : [pre]
}

function continueLastBlockOfType(
  last: CheapProseBlock,
  prevNorm: string,
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>,
  citedIds?: ReadonlySet<string>
): CheapProseBlock[] | null {
  if (last.type === 'list') return continueLastListBlock(last, prevNorm, nextText, defs)
  if (last.type === 'table') return continueLastTableBlock(last, prevNorm, nextText, defs)
  if (last.type === 'p') return continueLastParagraphBlock(last, prevNorm, nextText, defs, citedIds)
  if (last.type === 'quote') return continueLastQuoteBlock(last, prevNorm, nextText, defs)
  if (last.type === 'heading') return continueLastHeadingBlock(last, prevNorm, nextText, defs)
  if (last.type === 'hr') return continueLastHrBlock(last, prevNorm, nextText, defs)
  if (last.type === 'pre') return continueLastPreBlock(last, prevNorm, nextText, defs)
  if (last.type === 'footnotes') return continueLastFootnotesBlock(last, prevNorm, nextText, defs, citedIds)
  return null
}

/** 第一行满足条件的起点；`indexOf` 往前走，不 split 全文 */
function firstMatchingLineStart(text: string, match: (line: string) => boolean): number | null {
  let offset = 0
  while (offset <= text.length) {
    const nl = text.indexOf('\n', offset)
    const end = nl < 0 ? text.length : nl
    if (match(text.slice(offset, end))) return offset
    if (nl < 0) break
    offset = nl + 1
  }
  return null
}

function lineCouldStartLastBlock(line: string, type: CheapProseBlock['type']): boolean {
  if (type === 'list') return Boolean(parseListLine(line))
  if (type === 'quote') return parseQuoteLine(line) !== null
  if (type === 'table') return isGfmTableRow(line) || looksLikeGfmTableCells(line)
  if (type === 'pre') return Boolean(parseFenceLine(line)) || isIndentCodeLine(line)
  return true
}

/**
 * 最后一块窗口：从文末往前扩，取仍只解析成一块且类型对得上的最长后缀
 * （前面已有同型引用 / 列表 / 表 / 围栏时不要指到第一处）。
 * 从文末 `lastIndexOf` 往前找，不 split 全文；只在可能开块的行上 `parseCheapProseBlocks`，续行不扫（对标 Codex #22860）。
 */
function lastSingleBlockStart(text: string, last: CheapProseBlock): number | null {
  let found: number | null = null
  let end = text.length
  while (end > 0) {
    const nl = text.lastIndexOf('\n', end - 1)
    const start = nl < 0 ? 0 : nl + 1
    const line = text.slice(start, end)
    if (lineCouldStartLastBlock(line, last.type)) {
      const suffix = text.slice(start)
      if (suffix) {
        const parsed = parseCheapProseBlocks(suffix)
        if (parsed.length === 1 && parsed[0]!.type === last.type) {
          found = start
        } else if (found != null) {
          break
        }
      }
    }
    if (nl < 0) break
    end = nl
  }
  return found
}

/**
 * 最后一块在原文中的起点：段落后面新起的列表 / 标题 / 引用 / 表 / 脚注 / 围栏，
 * Setext 标题用正文+下划线定位（不只指到 `===` / `---` 行），
 * 列表 / 引用 / 表 / 围栏 / 缩进代码从文末量最后一块窗口（前面已有同型块时不指到第一处），
 * 以及围栏 / 表 / 列表 / 引用 / 段落后的增长段，不必整尾重扫。
 */
function lastBlockSourceStart(text: string, last: CheapProseBlock): number | null {
  if (last.type === 'p') {
    const src = cheapInlineSourceAll(last.nodes)
    if (src && text.endsWith(src)) {
      const start = text.length - src.length
      if (start > 0 && text[start - 1] === '\n') return start
    }
    if (src.includes('\n')) return null
    const nl = text.lastIndexOf('\n')
    if (nl < 0) return null
    const lastLine = text.slice(nl + 1)
    if (!lastLine || lineOpensNewCheapBlock(lastLine)) return null
    return nl + 1
  }
  if (last.type === 'hr') {
    const nl = text.lastIndexOf('\n')
    return nl < 0 ? 0 : nl + 1
  }
  if (last.type === 'heading') {
    const src = cheapInlineSourceAll(last.nodes)
    let end = text.endsWith('\n') ? text.length - 1 : text.length
    const lastNl = text.lastIndexOf('\n', end - 1)
    let underline = lastNl < 0 ? text.slice(0, end) : text.slice(lastNl + 1, end)
    if (src && underline.trim() === '' && lastNl >= 0) {
      end = lastNl
      const prevNl = text.lastIndexOf('\n', end - 1)
      underline = prevNl < 0 ? text.slice(0, end) : text.slice(prevNl + 1, end)
    }
    if (src && SETEXT_RE.test(underline) && !isPendingSetextUnderline(underline)) {
      const marker = underline.trim()[0]
      const level = marker === '=' ? 1 : 2
      if (level === last.level) {
        const needle = `${src}\n${underline}`
        if (text.endsWith(needle) || text.endsWith(`${needle}\n`)) {
          const start = text.lastIndexOf(needle)
          if (start >= 0) return start
        }
      }
    }
    const nl = text.lastIndexOf('\n')
    return nl < 0 ? 0 : nl + 1
  }
  if (last.type === 'list' || last.type === 'quote' || last.type === 'table' || last.type === 'pre') {
    return lastSingleBlockStart(text, last)
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
 * 增长列表 / 表格 / 段落 / 引用 / 标题 / 分隔线 / 缩进代码 / 脚注：只重解析最后一块（对标 Codex #39061 / #34045）。
 * 段落软换行后续写、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、引用内围栏 / 标题 / 分隔线 / 缩进代码闭合后再起的后续段、闭合并栏后再起的后续段、引用内换行后新列表项、脚注缩进续行、闭合段落 / 表 / 列表 / 分隔线 / 缩进代码 / Setext 标题后再起的后续块（列表 / 表后的 Setext 用正文+下划线定位；前面已有同型引用 / 列表 / 表 / 围栏 / 缩进代码时从文末量最后一块）也走增长段。多块尾跳过已收前缀（单行标题 / HR，或最后一段原文起点，或段落后新起的列表 / 标题 / 引用 / 表 / 脚注 / 围栏）。定义行或前缀对不上时退回全量解析。
 */
/** 多块尾最后一块起点：同一数组再增长时不再 `lastSingleBlockStart` 全量解析（对标 Codex #22860） */
const lastCheapBlockStartHold = new WeakMap<readonly CheapProseBlock[], number>()

function tryContinueLastCheapProseBlock(
  prevNorm: string,
  prevBlocks: CheapProseBlock[],
  nextText: string,
  defs?: ReadonlyMap<string, string | CheapLinkDef>
): CheapProseBlock[] | null {
  if (!prevBlocks.length || !nextText.startsWith(prevNorm)) return null
  const suffix = nextText.slice(prevNorm.length)
  const lastBlock = prevBlocks[prevBlocks.length - 1]!
  if (
    suffix.includes(']:') &&
    lastBlock.type !== 'footnotes' &&
    !(lastBlock.type === 'p' && suffixOpensFootnoteDefinition(prevNorm, suffix))
  ) {
    return null
  }
  const citedIds =
    suffix.includes(']:') && (lastBlock.type === 'footnotes' || lastBlock.type === 'p')
      ? collectCitedFootnoteIds(nextText)
      : undefined
  if (prevBlocks.length === 1) {
    const grown = continueLastBlockOfType(prevBlocks[0]!, prevNorm, nextText, defs, citedIds)
    if (grown && grown.length > 1) rememberLastCheapBlockStart(grown, nextText)
    return grown
  }
  const closed = prevBlocks.slice(0, -1)
  const last = lastBlock
  let start = lastCheapBlockStartHold.get(prevBlocks)
  if (start == null || start <= 0) {
    start = consumeClosedSingleLinePrefix(prevNorm, closed)
    if (start == null || start <= 0) start = lastBlockSourceStart(prevNorm, last)
    if (start == null || start <= 0) return null
  }
  const grown = continueLastBlockOfType(last, prevNorm.slice(start), nextText.slice(start), defs, citedIds)
  if (!grown?.length) return null
  const out = [...closed, ...grown]
  if (grown.length === 1) lastCheapBlockStartHold.set(out, start)
  else rememberLastCheapBlockStart(out, nextText)
  return out
}

/** 一段变多块或末块后又开兄弟时，记下最后一块起点，下一枚 token 不再 `lastSingleBlockStart` */
function rememberLastCheapBlockStart(blocks: CheapProseBlock[], text: string): void {
  const last = blocks[blocks.length - 1]
  if (!last) return
  const start = lastBlockSourceStart(text, last)
  if (start != null && start > 0) lastCheapBlockStartHold.set(blocks, start)
}

/**
 * 直播散文尾增量：已闭合块 / 列表项 / 表格行保持同一对象，只重解析增长段。
 * 最后一块（含段落软换行、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、引用内围栏 / 标题 / 分隔线 / 缩进代码闭合后再起的后续段、闭合段落 / 表 / 列表 / 分隔线 / 缩进代码 / Setext 标题后再起的后续块（列表 / 表后的 Setext 用正文+下划线定位；前面已有同型引用 / 列表 / 表 / 围栏 / 缩进代码时从文末量最后一块）、缩进代码 / 脚注续行 / 引用内换行后的子块、围栏 / 表 / 列表 / 引用 / 段落后的增长段）先走增长段；前面的标题 / 段落等保持同一引用（对标 Codex #39061 / #34045）。
 * 中间块类型变了也不把后面已闭合块整段丢掉（对标直播贴底不跳）。
 */
export const CHEAP_PROSE_HOLD_LIMIT = 64

const cheapProseHolds = new Map<string, CheapProseBlock[]>()

export function shouldRememberCheapProseHold(input: { closed?: boolean }): boolean {
  return Boolean(input.closed)
}

export function readCheapProseHold(text: string): CheapProseBlock[] | undefined {
  const key = normalizeStreamingText(text)
  if (!key) return undefined
  const hit = cheapProseHolds.get(key)
  if (!hit) return undefined
  cheapProseHolds.delete(key)
  cheapProseHolds.set(key, hit)
  return hit
}

export function writeCheapProseHold(text: string, blocks: CheapProseBlock[]): CheapProseBlock[] {
  const key = normalizeStreamingText(text)
  if (!key || !blocks.length) return blocks
  cheapProseHolds.delete(key)
  cheapProseHolds.set(key, blocks)
  while (cheapProseHolds.size > CHEAP_PROSE_HOLD_LIMIT) {
    const oldest = cheapProseHolds.keys().next().value
    if (oldest === undefined) break
    cheapProseHolds.delete(oldest)
  }
  return blocks
}

export function seedCheapProseHold(text: string): { text: string; blocks: CheapProseBlock[] } {
  const key = normalizeStreamingText(text)
  const held = readCheapProseHold(key)
  if (held) return { text: key, blocks: held }
  return { text: '', blocks: parseCheapProseBlocks('') }
}

export function clearCheapProseHolds(): void {
  cheapProseHolds.clear()
  cheapInlineStableHold = null
  cheapInlineKeyHold = null
  quoteStripHold = null
}

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
  if (!prevBlocks.length) {
    if (parsed.length > 1) rememberLastCheapBlockStart(parsed, nextText)
    return parsed
  }
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
  if (out.length > 1) rememberLastCheapBlockStart(out, nextText)
  return out
}
