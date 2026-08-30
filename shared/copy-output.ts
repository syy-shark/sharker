/**
 * `/copy`：复制最近一条已完成的助手正文（对标 Codex /copy · Ctrl+O）。
 * 直播中跳过进行中预留行；斜杠确认 / 本机备注不当成模型输出。
 * 有围栏或引用时列出可选目标（对标 Codex /copy picker：整段 / 代码块 / 引用）。
 * @see shared/ARCH.md
 */

type CopyableMessage = {
  id?: string
  role: string
  content: string
  meta?: {
    outcome?: string
    model?: string
    durationSec?: number
    hadThinking?: boolean
    thinkingPreview?: string
    segments?: unknown[]
    activities?: unknown[]
    changedFiles?: unknown[]
  } | null
}

/** 模型回合留下的助手行（有过程 / 结果），不是 `/copy` 确认或本机备注 */
export function isCompletedAssistantTurn(message: CopyableMessage): boolean {
  if (message.role !== 'assistant') return false
  const meta = message.meta
  if (!meta) return false
  if (meta.outcome || meta.model || meta.hadThinking) return true
  if (meta.durationSec != null && meta.durationSec > 0) return true
  if (Array.isArray(meta.segments) && meta.segments.length > 0) return true
  if (Array.isArray(meta.activities) && meta.activities.length > 0) return true
  if (String(meta.thinkingPreview || '').trim()) return true
  if (Array.isArray(meta.changedFiles) && meta.changedFiles.length > 0) return true
  return false
}

/** 直播未收束时不要把预留行当成已完成输出 */
export function copySkipLiveMessageId(input: {
  liveAssistantId?: string | null
  turnInFlight?: boolean
}): string | null {
  if (!input.turnInFlight) return null
  return input.liveAssistantId ?? null
}

/** 从后往前找最近一条已完成助手正文 */
export function lastCompletedAssistantText(
  messages: Array<CopyableMessage>,
  options?: { skipMessageId?: string | null }
): string {
  const skip = options?.skipMessageId || null
  let fallback = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    if (skip && m.id === skip) continue
    const text = (m.content || '').trim()
    if (!text) continue
    if (!fallback) fallback = text
    if (isCompletedAssistantTurn(m)) return text
  }
  return fallback
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
