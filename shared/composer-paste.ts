/**
 * Composer 粘贴决策：文本优先于图片，超长正文可收成附件。
 * 对标 Codex 桌面端「有 text/plain 就不要吃 Office 图片层」的预期，并避开其 Word/PPT 已知坑。
 * @see shared/ARCH.md
 */

/** 超过该长度的粘贴收成 `Pasted text.txt`，避免撑爆输入框与上下文 */
export const PASTE_TEXT_ATTACHMENT_THRESHOLD = 16_000

/** Codex 桌面端超长粘贴附件名 */
export const PASTED_TEXT_ATTACHMENT_NAME = 'Pasted text.txt'

/** 粘贴决策：插入正文 / 收成文本附件 / 收图片 / 交给浏览器 */
export type ClipboardPasteDecision =
  | { action: 'insert_text'; text: string }
  | { action: 'attach_text'; text: string; name: string }
  | { action: 'attach_images' }
  | { action: 'browser_default' }

/** 供 materialize 使用的最小附件形状 */
export interface PasteAttachmentLike {
  kind: string
  text?: string
}

/** HTML → 纯文本（Office / 浏览器 HTML 层回退） */
export function htmlToPlainText(html: string): string {
  const stripped = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeHtmlEntities(stripped).replace(/\u00a0/g, ' ')
}

/** 从剪贴板取可用文本：优先 text/plain，否则剥 HTML */
export function clipboardPlainText(getData: (type: string) => string): string {
  const plain = String(getData('text/plain') || '')
  if (plain.trim()) return plain
  const html = String(getData('text/html') || '')
  if (!html.trim()) return ''
  return htmlToPlainText(html)
}

/**
 * 粘贴优先级：有可用文本就走文本（⇧V 强制内联）；
 * 仅当完全没有文本时才收图片。超长正文收成 Pasted text.txt。
 */
export function decideClipboardPaste(input: {
  getData: (type: string) => string
  hasImageFiles: boolean
  forcePlainText?: boolean
}): ClipboardPasteDecision {
  const text = clipboardPlainText(input.getData)
  if (text.trim()) {
    if (input.forcePlainText || text.length < PASTE_TEXT_ATTACHMENT_THRESHOLD) {
      return { action: 'insert_text', text }
    }
    return { action: 'attach_text', text, name: PASTED_TEXT_ATTACHMENT_NAME }
  }
  if (input.hasImageFiles) return { action: 'attach_images' }
  return { action: 'browser_default' }
}

/** 第 n 个粘贴文本附件的显示名 */
export function pastedTextAttachmentName(existingTextCount: number): string {
  if (existingTextCount <= 0) return PASTED_TEXT_ATTACHMENT_NAME
  return `Pasted text ${existingTextCount + 1}.txt`
}

/** 解析行首 `/name args`（空输入返回 null） */
export function parseLeadingSlash(input: string): { name: string; args: string } | null {
  const t = String(input || '').trim()
  if (!t.startsWith('/')) return null
  const body = t.slice(1)
  const space = body.search(/\s/)
  const name = (space >= 0 ? body.slice(0, space) : body).toLowerCase()
  if (!name || /[^a-z0-9_-]/.test(name)) return null
  const args = space >= 0 ? body.slice(space + 1).trim() : ''
  return { name, args }
}

/**
 * 空输入或「只有斜杠命令、没有参数」时，把粘贴文本附件折进正文。
 * 修复 Codex `/goal` 只看输入框、忽略 Pasted text.txt 的问题。
 */
export function materializeComposerInput<T extends PasteAttachmentLike>(
  input: string,
  attachments: T[]
): { text: string; attachments: T[] } {
  const pasted = attachments.filter((a) => a.kind === 'text' && String(a.text || ''))
  if (!pasted.length) return { text: input, attachments }
  const folded = pasted.map((a) => String(a.text)).join('\n\n')
  const rest = attachments.filter((a) => a.kind !== 'text')
  const slash = parseLeadingSlash(input)
  if (slash && !slash.args.trim()) {
    return { text: `/${slash.name} ${folded}`.trimEnd(), attachments: rest }
  }
  if (!String(input || '').trim()) {
    return { text: folded, attachments: rest }
  }
  return { text: input, attachments }
}

/** UTF-8 文本 → data URL 用的 base64（主进程 saveAttachment） */
export function utf8ToBase64(text: string): string {
  const value = String(text ?? '')
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64')
  }
  const bytes = new TextEncoder().encode(value)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}
