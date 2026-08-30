/**
 * Composer 粘贴决策：文本优先于图片，超长正文可收成附件。
 * 对标 Codex 桌面端「有 text/plain 就不要吃 Office 图片层」的预期，并避开其 Word/PPT 已知坑。
 * @see shared/ARCH.md
 */

/** Official ChatGPT paste: longer than 10,000 characters become attachments. */
export const PASTE_TEXT_ATTACHMENT_THRESHOLD = 10_001

/** Codex 桌面端超长粘贴附件名 */
export const PASTED_TEXT_ATTACHMENT_NAME = 'Pasted text.txt'

/** Official paste-attachment control (learn.chatgpt.com/docs/whats-new). */
export const SHOW_IN_TEXT_FIELD_LABEL = 'Show in text field'

/** 粘贴决策：插入正文 / 收成文本附件 / 收文件 / 收图片 / 交给浏览器 */
export type ClipboardPasteDecision =
  | { action: 'insert_text'; text: string }
  | { action: 'attach_text'; text: string; name: string }
  | { action: 'attach_files' }
  | { action: 'attach_images' }
  | { action: 'browser_default' }

/** 官方桌面端可粘贴/拖入的源码与文档扩展名（对标 Codex non-image file pasting） */
const TEXT_FILE_EXT = new Set([
  'astro',
  'bash',
  'c',
  'cc',
  'cfg',
  'cjs',
  'cmake',
  'conf',
  'cpp',
  'cs',
  'css',
  'csv',
  'cxx',
  'diff',
  'env',
  'fish',
  'go',
  'gradle',
  'graphql',
  'h',
  'hpp',
  'htm',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsonc',
  'jsx',
  'kt',
  'kts',
  'less',
  'lock',
  'log',
  'lua',
  'm',
  'makefile',
  'md',
  'mdx',
  'mjs',
  'mm',
  'patch',
  'php',
  'properties',
  'proto',
  'ps1',
  'py',
  'r',
  'rb',
  'rs',
  'sass',
  'scss',
  'sh',
  'sql',
  'svelte',
  'svg',
  'swift',
  'toml',
  'ts',
  'tsv',
  'tsx',
  'txt',
  'vim',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zsh'
])

const IMAGE_FILE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'])

const TEXT_BASENAMES = new Set([
  'changelog',
  'dockerfile',
  'gemfile',
  'license',
  'licence',
  'makefile',
  'procfile',
  'readme',
  'vagrantfile'
])

const TEXT_MIME = new Set([
  'application/javascript',
  'application/json',
  'application/sql',
  'application/toml',
  'application/typescript',
  'application/xml',
  'application/x-sh',
  'application/x-yaml',
  'application/yaml',
  'text/css',
  'text/csv',
  'text/html',
  'text/javascript',
  'text/markdown',
  'text/plain',
  'text/tab-separated-values',
  'text/xml',
  'text/yaml'
])

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

export type ClassifiedPastedAttachment =
  | { kind: 'image'; mimeType: string; ext: string }
  | { kind: 'text'; mimeType: string; ext: string }
  | { kind: 'reject'; reason: string }

function fileExtension(name: string): string {
  const base = String(name || '').trim().split(/[/\\]/).pop() || ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

function normalizeMime(mimeType: string): string {
  return String(mimeType || '').trim().toLowerCase().split(';')[0] || ''
}

function isImageMime(mimeType: string): boolean {
  const mime = normalizeMime(mimeType)
  return mime.startsWith('image/') && mime !== 'image/svg+xml'
}

function isTextMime(mimeType: string): boolean {
  const mime = normalizeMime(mimeType)
  if (!mime) return false
  if (mime === 'image/svg+xml') return true
  return mime.startsWith('text/') || TEXT_MIME.has(mime)
}

/** Finder / Explorer 剪贴板常见：纯路径列表，不是正文 */
export function looksLikeFilePathList(text: string): boolean {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return false
  return lines.every((line) => {
    if (/^file:\/\//i.test(line)) return true
    if (/^[A-Za-z]:[\\/]/.test(line)) return true
    if (line.startsWith('\\\\')) return true
    if (line.startsWith('/')) return true
    return false
  })
}

/** 按文件名与 MIME 判断官方 composer 能否收这份附件 */
export function classifyPastedAttachment(
  name: string,
  mimeType: string
): ClassifiedPastedAttachment {
  const mime = normalizeMime(mimeType)
  const ext = fileExtension(name)
  if (isImageMime(mime) || IMAGE_FILE_EXT.has(ext)) {
    const imageExt = IMAGE_MIME_TO_EXT[mime] || (IMAGE_FILE_EXT.has(ext) ? ext.replace('jpeg', 'jpg') : '')
    if (!imageExt || imageExt === 'bmp' || imageExt === 'avif') {
      return { kind: 'reject', reason: '暂不支持该图片格式' }
    }
    return {
      kind: 'image',
      mimeType: mime && isImageMime(mime) ? mime : `image/${imageExt === 'jpg' ? 'jpeg' : imageExt}`,
      ext: imageExt
    }
  }
  const base = String(name || '')
    .trim()
    .split(/[/\\]/)
    .pop()
    ?.toLowerCase() || ''
  const baseStem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
  if (isTextMime(mime) || TEXT_FILE_EXT.has(ext) || TEXT_BASENAMES.has(base) || TEXT_BASENAMES.has(baseStem)) {
    return {
      kind: 'text',
      mimeType: mime && isTextMime(mime) ? mime : 'text/plain',
      ext: ext || 'txt'
    }
  }
  return {
    kind: 'reject',
    reason: '暂不支持该文件类型，请粘贴文本或图片，或用 @ 引用工作区文件'
  }
}

/** 官方超长粘贴附件名（Pasted text.txt / Pasted text 2.txt） */
export function isPastedTextAttachmentName(name: string): boolean {
  return /^Pasted text(?: \d+)?\.txt$/i.test(String(name || '').trim())
}

/** 列表里是否有官方可收的非图片文件 */
export function hasAttachableNonImageFiles(
  files: Array<{ name?: string; type?: string }>
): boolean {
  return files.some((file) => classifyPastedAttachment(file.name || '', file.type || '').kind === 'text')
}

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
  return decodeHtmlEntities(stripped).replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 从剪贴板取可用文本：优先 text/plain，否则剥 HTML */
export function clipboardPlainText(getData: (type: string) => string): string {
  const plain = String(getData('text/plain') || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (plain.trim()) return plain
  const html = String(getData('text/html') || '')
  if (!html.trim()) return ''
  return htmlToPlainText(html)
}

/**
 * 粘贴优先级：⇧V 强制内联；Finder/Explorer 文件条目（含路径层）先收附件；
 * 其余有可用文本就走文本（避开 Office 图片层）；最后才收截图。
 * 超长正文收成 Pasted text.txt。
 */
export function decideClipboardPaste(input: {
  getData: (type: string) => string
  hasImageFiles: boolean
  hasNonImageFiles?: boolean
  forcePlainText?: boolean
}): ClipboardPasteDecision {
  const text = clipboardPlainText(input.getData)
  const uriList = String(input.getData('text/uri-list') || '').trim()
  const fileDrop =
    input.hasNonImageFiles === true ||
    Boolean(uriList) ||
    (input.hasImageFiles && looksLikeFilePathList(text))
  if (input.forcePlainText && text.trim()) {
    return { action: 'insert_text', text }
  }
  if (fileDrop && input.hasNonImageFiles) return { action: 'attach_files' }
  if (fileDrop && input.hasImageFiles) return { action: 'attach_images' }
  if (text.trim()) {
    if (text.length < PASTE_TEXT_ATTACHMENT_THRESHOLD) {
      return { action: 'insert_text', text }
    }
    return { action: 'attach_text', text, name: PASTED_TEXT_ATTACHMENT_NAME }
  }
  if (input.hasImageFiles) return { action: 'attach_images' }
  return { action: 'browser_default' }
}

/** 空输入只带附件时的占位 prompt（对标 Codex attachment-only send） */
export function composerEmptyAttachmentPrompt(
  attachments: Array<{ kind: string }>
): string {
  const images = attachments.some((a) => a.kind === 'image')
  const texts = attachments.some((a) => a.kind === 'text')
  if (images && !texts) return '请看这张图片。'
  if (attachments.length) return '请看这些附件。'
  return ''
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
 * 空输入或「只有斜杠命令、没有参数」时，把官方 Pasted text.txt 折进正文。
 * 从 Finder 拖入的源码附件保持附件，不当作整段 prompt。
 */
export function materializeComposerInput<T extends PasteAttachmentLike & { name?: string }>(
  input: string,
  attachments: T[]
): { text: string; attachments: T[] } {
  const pasted = attachments.filter(
    (a) =>
      a.kind === 'text' &&
      String(a.text || '') &&
      isPastedTextAttachmentName(String(a.name || PASTED_TEXT_ATTACHMENT_NAME))
  )
  if (!pasted.length) return { text: input, attachments }
  const folded = pasted.map((a) => String(a.text)).join('\n\n')
  const rest = attachments.filter((a) => !pasted.includes(a))
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
