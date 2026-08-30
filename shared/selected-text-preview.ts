/**
 * Composer 划选预览（对标 Codex selected-text previews / composerSelectedTextAttachments）。
 * 划选进芯片，不灌进输入框；发送时收成官方 `# Selected text:` 块。
 * 对话柱只画请求 + annotation 芯片，长划选不撑开贴底（对标 Codex #20294 transcript strip / #22670）。
 * 芯片可加备注（对标 Codex response annotation comments / #33763），不发明 #22677 划选跟帖气泡。
 * 已发送芯片按摘录回跳原文（对标 Codex #41391），不把 message id 写进 submit 块。
 * @see shared/ARCH.md
 */

import { normalizeTranscriptSelection, type SideChatSource } from './side-chat-quote'

export type SelectedTextPreview = {
  id: string
  text: string
  source: SideChatSource
  comment?: string
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

function normalizeSelectionComment(raw?: string): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

/** 从划选做预览；空串返回 null */
export function createSelectedTextPreview(
  selection: string,
  source: SideChatSource = 'transcript',
  id?: string,
  comment?: string
): SelectedTextPreview | null {
  const text = normalizeTranscriptSelection(selection)
  if (!text) return null
  selectedTextSeq += 1
  const note = normalizeSelectionComment(comment)
  return {
    id: id || `sel-${selectedTextSeq}`,
    text,
    source,
    ...(note ? { comment: note } : {})
  }
}

function selectionSubmitBlock(selection: SelectedTextPreview, index: number): string {
  const body = String(selection.text || '').trim()
  const note = normalizeSelectionComment(selection.comment)
  const head = `## ${selectedTextTitle(index)}\n${body}`
  return note ? `${head}\n\nComment: ${note}` : head
}

/**
 * 发送正文：官方桌面 #22670
 * `# Selected text:` + `## Selection N` + 可选 `Comment:` + 可选 `## My request for Codex:`
 */
export function formatSelectedTextSubmit(
  selections: readonly SelectedTextPreview[],
  request = ''
): string {
  const blocks: string[] = []
  for (const selection of selections) {
    const body = String(selection.text || '').trim()
    if (!body) continue
    blocks.push(selectionSubmitBlock(selection, blocks.length))
  }
  const ask = String(request || '').trim()
  if (!blocks.length) return ask
  const head = `# Selected text:\n\n${blocks.join('\n\n')}`
  if (!ask) return head
  return `${head}\n\n## My request for Codex:\n${ask}`
}

const SELECTED_TEXT_HEAD = '# Selected text:'
const REQUEST_TITLE = 'My request for Codex:'
const SELECTION_TITLE_RE = /^Selection \d+$/
const COMMENT_TAIL_RE = /\n\nComment: (.+)$/

/** 从官方 submit 块拆回划选与请求；不是该格式则 null */
export function parseSelectedTextSubmit(markdown: string): {
  selections: SelectedTextPreview[]
  request: string
} | null {
  const src = String(markdown ?? '').replace(/\r\n/g, '\n').trim()
  if (!src.startsWith(SELECTED_TEXT_HEAD)) return null
  const rest = src.slice(SELECTED_TEXT_HEAD.length).replace(/^\n+/, '')
  if (!rest.includes('## Selection ')) return null
  const chunks = rest.split(/^## /m).filter(Boolean)
  const selections: SelectedTextPreview[] = []
  let request = ''
  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n')
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim()
    const body = (nl === -1 ? '' : chunk.slice(nl + 1)).replace(/\s+$/, '')
    if (title === REQUEST_TITLE) {
      request = body.trim()
      continue
    }
    if (!SELECTION_TITLE_RE.test(title)) return null
    const commentHit = COMMENT_TAIL_RE.exec(body)
    const text = (commentHit ? body.slice(0, commentHit.index) : body).trim()
    const preview = createSelectedTextPreview(
      text,
      'transcript',
      `sel-hist-${selections.length}`,
      commentHit?.[1]
    )
    if (preview) selections.push(preview)
  }
  if (!selections.length) return null
  return { selections, request }
}

/** 对话柱只露请求，长划选留给 annotation 芯片（对标 Codex #20294） */
export function userFacingSelectedTextRequest(markdown: string): string {
  const parsed = parseSelectedTextSubmit(markdown)
  return parsed ? parsed.request : String(markdown ?? '')
}

function flattenForSelectionMatch(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

/** 正文（含用户气泡只露的请求）是否含该划选 */
export function messageContainsSelectedText(content: string, excerpt: string): boolean {
  const needle = flattenForSelectionMatch(excerpt)
  if (!needle) return false
  const visible = userFacingSelectedTextRequest(content)
  const hay = flattenForSelectionMatch(visible || content)
  return hay.includes(needle)
}

/**
 * 从标注气泡之前往回找原文所在消息（对标 Codex #41391 划选回跳）。
 * 不写进 submit 块，只按摘录匹配；找不到则 null。
 */
export function findSelectedTextSourceMessageId(
  messages: Array<{ id: string; content: string }>,
  excerpt: string,
  beforeId?: string
): string | null {
  if (!flattenForSelectionMatch(excerpt)) return null
  const end = beforeId ? messages.findIndex((m) => m.id === beforeId) : messages.length
  const last = end < 0 ? messages.length : end
  for (let i = last - 1; i >= 0; i--) {
    const row = messages[i]
    if (!row || row.id === beforeId) continue
    if (messageContainsSelectedText(row.content, excerpt)) return row.id
  }
  return null
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
      rec.source === 'terminal' || rec.source === 'file' || rec.source === 'browser'
        ? rec.source
        : 'transcript',
      typeof rec.id === 'string' && rec.id.trim() ? rec.id : undefined,
      typeof rec.comment === 'string' ? rec.comment : undefined
    )
    if (preview) out.push(preview)
  }
  return out.slice(0, 8)
}
