/**
 * Composer 划选预览（对标 Codex selected-text previews / composerSelectedTextAttachments）。
 * 划选进芯片，不灌进输入框；发送时收成官方 `# Selected text:` 块。
 * @see shared/ARCH.md
 */

import { normalizeTranscriptSelection, type SideChatSource } from './side-chat-quote'

export type SelectedTextPreview = {
  id: string
  text: string
  source: SideChatSource
}

let selectedTextSeq = 0

/** 官方 composer 里 Selection 1 / Selection 2 */
export function selectedTextTitle(index: number): string {
  const n = Math.max(0, Math.floor(index)) + 1
  return `Selection ${n}`
}

/** 芯片上一行摘录，避免把长划选撑开输入区 */
export function selectedTextChipLabel(text: string, max = 48): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(1, max - 1))}…`
}

/** 从划选做预览；空串返回 null */
export function createSelectedTextPreview(
  selection: string,
  source: SideChatSource = 'transcript',
  id?: string
): SelectedTextPreview | null {
  const text = normalizeTranscriptSelection(selection)
  if (!text) return null
  selectedTextSeq += 1
  return {
    id: id || `sel-${selectedTextSeq}`,
    text,
    source
  }
}

/**
 * 发送正文：官方桌面 #22670
 * `# Selected text:` + `## Selection N` + 可选 `## My request for Codex:`
 */
export function formatSelectedTextSubmit(
  selections: readonly SelectedTextPreview[],
  request = ''
): string {
  const blocks: string[] = []
  for (let i = 0; i < selections.length; i += 1) {
    const body = String(selections[i]?.text || '').trim()
    if (!body) continue
    blocks.push(`## ${selectedTextTitle(blocks.length)}\n${body}`)
  }
  const ask = String(request || '').trim()
  if (!blocks.length) return ask
  const head = `# Selected text:\n\n${blocks.join('\n\n')}`
  if (!ask) return head
  return `${head}\n\n## My request for Codex:\n${ask}`
}

/** 草稿里只留有正文的划选 */
export function normalizeSelectedTextDraft(
  raw: unknown
): SelectedTextPreview[] {
  if (!Array.isArray(raw)) return []
  const out: SelectedTextPreview[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Partial<SelectedTextPreview>
    const preview = createSelectedTextPreview(
      String(rec.text || ''),
      rec.source === 'terminal' || rec.source === 'file' ? rec.source : 'transcript',
      typeof rec.id === 'string' && rec.id.trim() ? rec.id : undefined
    )
    if (preview) out.push(preview)
  }
  return out.slice(0, 8)
}
