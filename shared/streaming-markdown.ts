/**
 * 流式 Markdown 拆分：已闭合块保持稳定，只重解析未完成尾部。
 * @see shared/ARCH.md
 */

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

/**
 * 把流式文本拆成不会再变的块，与仍在增长的尾部。
 * 尾部是未闭合围栏，或最后一个尚未空行收束的段落。
 */
export function splitStreamingMarkdown(text: string): StreamingMarkdownSplit {
  if (!text) return EMPTY_SPLIT

  const lines = text.split('\n')
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
  if (!text) return EMPTY_SPLIT
  if (prev && text === prevText) return prev
  const closedEnd = prev?.closedEnd ?? 0
  if (!prev || closedEnd <= 0 || !text.startsWith(prevText.slice(0, closedEnd))) {
    return splitStreamingMarkdown(text)
  }
  const rest = text.slice(closedEnd)
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

/**
 * 只认成对的 `code` / **bold** / *italic*。
 * 未闭合标记留在原文，避免直播时闪烁。
 */
export function parseCheapInlineMarkdown(text: string): CheapInlineNode[] {
  const src = String(text ?? '')
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
      nodes.push({ type: 'code', text: src.slice(i + 1, end) })
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
  if (!text) return []
  if (text === prevText && prevNodes.length) return prevNodes
  if (!prevNodes.length) return parseCheapInlineMarkdown(text)
  const stable = prevNodes.slice(0, -1)
  const prefix = cheapInlineSourceAll(stable)
  if (!text.startsWith(prefix)) return parseCheapInlineMarkdown(text)
  const rest = parseCheapInlineMarkdown(text.slice(prefix.length))
  return stable.length ? [...stable, ...rest] : rest
}
