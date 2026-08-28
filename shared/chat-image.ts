/**
 * 对话渲染图：导出文件名与来源判定（对标 Codex Save or copy rendered images）。
 * @see shared/ARCH.md
 */

export type ChatImageExportInput = {
  src?: string
  filePath?: string
  name?: string
  alt?: string
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i

function sanitizeImageBasename(raw?: string): string {
  if (!raw) return ''
  let name = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  name = name.replace(/[?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
  if (!name || name === '.' || name === '..') return ''
  return name.length > 80 ? name.slice(0, 80) : name
}

function extFromSrc(src?: string): string {
  if (!src) return ''
  if (src.startsWith('data:image/')) {
    const subtype = /^data:image\/([a-zA-Z0-9.+-]+)/i.exec(src)?.[1]?.toLowerCase() ?? ''
    if (subtype === 'jpeg') return '.jpg'
    if (subtype && IMAGE_EXT_RE.test(`.${subtype}`)) return `.${subtype}`
    return '.png'
  }
  const match = IMAGE_EXT_RE.exec(src)
  return match ? match[0].toLowerCase().replace('.jpeg', '.jpg') : ''
}

function basenameFromSrc(src?: string): string {
  if (!src || src.startsWith('data:')) return ''
  try {
    const url = new URL(src)
    return sanitizeImageBasename(decodeURIComponent(url.pathname.split('/').pop() ?? ''))
  } catch {
    return sanitizeImageBasename(src)
  }
}

function ensureImageExt(name: string, src?: string): string {
  if (IMAGE_EXT_RE.test(name)) return name.replace(/\.jpeg$/i, '.jpg')
  return `${name}${extFromSrc(src) || '.png'}`
}

/** 附件名 / alt / URL 末段 → 保存对话框默认文件名 */
export function suggestedImageFilename(input: ChatImageExportInput): string {
  const fromName = sanitizeImageBasename(input.name)
  if (fromName) return ensureImageExt(fromName, input.src)
  const fromAlt = sanitizeImageBasename(input.alt)
  if (fromAlt) return ensureImageExt(fromAlt, input.src)
  const fromSrc = basenameFromSrc(input.src)
  if (fromSrc) return ensureImageExt(fromSrc, input.src)
  const ext = extFromSrc(input.src)
  return ext ? `image${ext}` : 'image.png'
}

/** 只允许附件路径、http(s) 图或 data:image，避免任意 file:// */
export function canExportChatImage(input: ChatImageExportInput): boolean {
  if (input.filePath?.trim()) return true
  const src = input.src?.trim() ?? ''
  return /^https?:\/\//i.test(src) || /^data:image\//i.test(src)
}

/** 已测到的渲染图固有尺寸，直播重挂时首帧就占位，避免从 0 高撑开贴底 */
export type ChatImageSize = { width: number; height: number }

const imageSizeCache = new Map<string, ChatImageSize>()

function imageCacheKey(src?: string): string {
  return (src ?? '').trim()
}

export function readCachedChatImageSize(src?: string): ChatImageSize | null {
  const key = imageCacheKey(src)
  if (!key) return null
  return imageSizeCache.get(key) ?? null
}

export function writeCachedChatImageSize(
  src: string | undefined,
  size: ChatImageSize
): ChatImageSize {
  const key = imageCacheKey(src)
  if (key && size.width > 0 && size.height > 0) imageSizeCache.set(key, size)
  return size
}

export function chatImageAspectStyle(
  size: ChatImageSize | null | undefined
): { aspectRatio: string } | undefined {
  if (!size || size.width <= 0 || size.height <= 0) return undefined
  return { aspectRatio: `${size.width} / ${size.height}` }
}
