/**
 * 对话渲染图：导出文件名与来源判定（对标 Codex Save or copy rendered images）。
 * 工作区相对路径图走 `readFileDataUrl`，不认任意 `file://`。
 * @see shared/ARCH.md
 */

import { resolveCitationPath } from './file-citation'
import { filePreviewKind } from './file-preview'

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

/** http(s) 或 data:image，可直接当 <img src> */
export function isRemoteChatImageSrc(src?: string): boolean {
  const value = src?.trim() ?? ''
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value)
}

/** 工作区 / 相对路径图；拒绝 file:// 与脚本协议 */
export function isWorkspaceChatImageSrc(src?: string): boolean {
  const value = src?.trim() ?? ''
  if (!value || isRemoteChatImageSrc(value)) return false
  if (/^(?:javascript|vbscript|data|mailto|sharker):/i.test(value)) return false
  if (value.startsWith('file://')) return false
  return filePreviewKind(value) === 'image'
}

/**
 * 相对路径接到工作区（含附加根）；未解析成绝对路径则空串，避免拿相对名去读盘。
 */
export function resolveWorkspaceChatImagePath(
  src: string,
  workspacePath: string,
  extraRoots: string[] = []
): string {
  if (!isWorkspaceChatImageSrc(src)) return ''
  const abs = resolveCitationPath(src, workspacePath, extraRoots)
  if (!abs) return ''
  if (abs.startsWith('/') || /^[A-Za-z]:\//.test(abs)) return abs
  return ''
}

/** 只允许附件路径、http(s) 图或 data:image，避免任意 file:// */
export function canExportChatImage(input: ChatImageExportInput): boolean {
  if (input.filePath?.trim()) return true
  return isRemoteChatImageSrc(input.src)
}

/** 已测到的渲染图固有尺寸，直播重挂时首帧就占位，避免从 0 高撑开贴底 */
export type ChatImageSize = { width: number; height: number }

const imageSizeCache = new Map<string, ChatImageSize>()
const workspaceDataUrlCache = new Map<string, string>()

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

export function readCachedWorkspaceImageDataUrl(absPath?: string): string | null {
  const key = imageCacheKey(absPath)
  if (!key) return null
  return workspaceDataUrlCache.get(key) ?? null
}

export function writeCachedWorkspaceImageDataUrl(
  absPath: string | undefined,
  dataUrl: string
): string {
  const key = imageCacheKey(absPath)
  const url = dataUrl.trim()
  if (key && url.startsWith('data:image/')) workspaceDataUrlCache.set(key, url)
  return url
}
