/**
 * `/copy`：复制最近一条已完成的助手正文（对标 Codex /copy · Ctrl+O）。
 * 有围栏或引用时列出可选目标（对标 Codex /copy picker：整段 / 代码块 / 引用）。
 * @see shared/ARCH.md
 */

/** 从后往前找非空助手消息 */
export function lastCompletedAssistantText(
  messages: Array<{ role: string; content: string }>
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const text = (m.content || '').trim()
    if (text) return text
  }
  return ''
}

/** `/copy` 可选目标 */
export type CopyOutputTarget = {
  id: string
  kind: 'full' | 'code' | 'quote'
  label: string
  text: string
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/

function normalizeCopyText(text: string): string {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function previewSnippet(text: string, max = 42): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

function fenceLineMask(lines: string[]): boolean[] {
  const skip = Array.from({ length: lines.length }, () => false)
  let i = 0
  while (i < lines.length) {
    const open = FENCE_RE.exec(lines[i]!)
    if (!open) {
      i += 1
      continue
    }
    const marker = open[1] ?? ''
    if (marker.startsWith('`') && (open[2] ?? '').includes('`')) {
      i += 1
      continue
    }
    const start = i
    i += 1
    let closed = false
    while (i < lines.length) {
      const close = FENCE_RE.exec(lines[i]!)
      if (
        close &&
        (close[1] ?? '')[0] === marker[0] &&
        (close[1] ?? '').length >= marker.length &&
        !(close[2] ?? '').trim()
      ) {
        for (let j = start; j <= i; j++) skip[j] = true
        i += 1
        closed = true
        break
      }
      i += 1
    }
    if (!closed) {
      for (let j = start; j < lines.length; j++) skip[j] = true
    }
  }
  return skip
}

function extractFencedBlocks(text: string): Array<{ lang?: string; text: string }> {
  const lines = normalizeCopyText(text).split('\n')
  const out: Array<{ lang?: string; text: string }> = []
  let i = 0
  while (i < lines.length) {
    const open = FENCE_RE.exec(lines[i]!)
    if (!open) {
      i += 1
      continue
    }
    const marker = open[1] ?? ''
    if (marker.startsWith('`') && (open[2] ?? '').includes('`')) {
      i += 1
      continue
    }
    const lang = (open[2] ?? '').trim().split(/\s+/)[0] || undefined
    const body: string[] = []
    i += 1
    while (i < lines.length) {
      const close = FENCE_RE.exec(lines[i]!)
      if (
        close &&
        (close[1] ?? '')[0] === marker[0] &&
        (close[1] ?? '').length >= marker.length &&
        !(close[2] ?? '').trim()
      ) {
        out.push({ lang, text: body.join('\n') })
        i += 1
        break
      }
      body.push(lines[i]!)
      i += 1
    }
  }
  return out
}

function extractBlockquotes(text: string): string[] {
  const lines = normalizeCopyText(text).split('\n')
  const skip = fenceLineMask(lines)
  const quotes: string[] = []
  let buf: string[] = []
  const flush = () => {
    if (!buf.length) return
    const body = buf
      .map((line) => line.replace(/^ {0,3}>\s?/, ''))
      .join('\n')
      .trim()
    if (body) quotes.push(body)
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    if (skip[i]) {
      flush()
      continue
    }
    if (/^ {0,3}>/.test(lines[i]!)) buf.push(lines[i]!)
    else flush()
  }
  flush()
  return quotes
}

/** 最近一条回复里可复制的整段 / 代码块 / 引用；只有全文时长度为 1 */
export function listCopyOutputTargets(markdown: string): CopyOutputTarget[] {
  const src = normalizeCopyText(markdown).trim()
  if (!src) return []
  const targets: CopyOutputTarget[] = [
    { id: 'full', kind: 'full', label: '整段回答', text: src }
  ]
  extractFencedBlocks(src).forEach((block, index) => {
    const snippet = previewSnippet(block.text)
    targets.push({
      id: `code-${index}`,
      kind: 'code',
      label: block.lang ? `代码 · ${block.lang}` : snippet ? `代码 · ${snippet}` : '代码块',
      text: block.text
    })
  })
  extractBlockquotes(src).forEach((quote, index) => {
    const snippet = previewSnippet(quote)
    targets.push({
      id: `quote-${index}`,
      kind: 'quote',
      label: snippet ? `引用 · ${snippet}` : '引用',
      text: quote
    })
  })
  return targets
}
