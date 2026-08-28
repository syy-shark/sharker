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
}

const FENCE_RE = /^(```|~~~)(.*)$/

/**
 * 把流式文本拆成不会再变的块，与仍在增长的尾部。
 * 尾部是未闭合围栏，或最后一个尚未空行收束的段落。
 */
export function splitStreamingMarkdown(text: string): StreamingMarkdownSplit {
  if (!text) return { blocks: [], tail: '', tailKind: 'prose' }

  const lines = text.split('\n')
  const blocks: StreamingMarkdownBlock[] = []
  let current: string[] = []
  let inFence = false
  let fenceLang: string | undefined
  let blockIndex = 0

  const flushBlock = () => {
    const chunk = current.join('\n')
    current = []
    if (!chunk) return
    blocks.push({ id: `md-${blockIndex++}`, text: chunk })
  }

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      if (!inFence) {
        if (current.length > 0) flushBlock()
        inFence = true
        fenceLang = fenceMatch[2].trim().split(/\s+/)[0] || undefined
        current.push(line)
      } else {
        current.push(line)
        inFence = false
        fenceLang = undefined
        flushBlock()
      }
      continue
    }

    if (inFence) {
      current.push(line)
      continue
    }

    if (line.trim() === '') {
      if (current.length > 0) {
        current.push(line)
        flushBlock()
      }
      continue
    }
    current.push(line)
  }

  return {
    blocks,
    tail: current.join('\n'),
    tailKind: inFence ? 'fence' : 'prose',
    tailLang: inFence ? fenceLang : undefined
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
