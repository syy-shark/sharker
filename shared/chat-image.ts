/**
 * 对话渲染图：导出文件名与来源判定（对标 Codex Save or copy rendered images）。
 * 工作区相对路径图走 `readFileDataUrl`，不认任意 `file://`。
 * 右键：复制/保存图片；工作区图再加打开 / Open in Finder / Copy path（对标 Codex #17591 / #40778 页内菜单）。
 * 点图开视口自适应灯箱（对标 Codex 桌面 image preview / #26851），尺寸用 CSS 像素 contain，不跟 `--ui-font-scale` 放大裁切。
 * 收束预取与重挂共用 `prefetchRemoteChatImageSize`，避免 48px 占位再跳。
 * 直播 token 中不挂 `<img>`；闭合 dest 后 effect 开工尺寸 / 工作区 data URL 写缓存，不 setState。
 * 收束后再成图（对标 KaTeX / mermaid）。
 * 右侧文件预览图同一套 contain（`filePreviewImageFit`），避免高图只露上半张。
 * @see shared/ARCH.md
 */

import { resolveCitationPath } from './file-citation'
import { filePreviewKind } from './file-preview'
import { COPY_PATH_LABEL, revealInFolderLabel, type RevealFolderPlatform } from './reveal-in-folder'

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

export type ChatImageMenuAction =
  | 'lightbox'
  | 'open'
  | 'reveal'
  | 'copy-path'
  | 'copy-image'
  | 'save'

/** 图片右键：页内复制/保存，避免官方原生 Save Image As 崩进程（#40778） */
export function chatImageMenuItems(options: {
  workspace?: boolean
  canExport?: boolean
  canLightbox?: boolean
  platform?: RevealFolderPlatform
}): Array<{ action: ChatImageMenuAction; title: string }> {
  const items: Array<{ action: ChatImageMenuAction; title: string }> = []
  if (options.canLightbox) {
    items.push({ action: 'lightbox', title: '查看大图' })
  }
  if (options.workspace) {
    items.push(
      { action: 'open', title: '打开预览' },
      { action: 'reveal', title: revealInFolderLabel(options.platform) },
      { action: 'copy-path', title: COPY_PATH_LABEL }
    )
  }
  if (options.canExport) {
    items.push({ action: 'copy-image', title: '复制图片' }, { action: 'save', title: '保存图片' })
  }
  return items
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

const imagePrefetchJobs = new Map<string, Promise<ChatImageSize | null>>()

/**
 * 同一 src 共用一次量尺寸。缓存命中立刻返回；进行中的 Promise 给收束预取与
 * ChatImage 重挂共用，避免 48px 占位再跳。
 */
export function takeChatImagePrefetchJob(
  src: string,
  start: () => Promise<ChatImageSize | null>
): Promise<ChatImageSize | null> {
  const key = imageCacheKey(src)
  if (!key) return Promise.resolve(null)
  const cached = readCachedChatImageSize(key)
  if (cached) return Promise.resolve(cached)
  const existing = imagePrefetchJobs.get(key)
  if (existing) return existing
  const job = start()
    .then((size) => {
      if (size && size.width > 0 && size.height > 0) return writeCachedChatImageSize(key, size)
      return null
    })
    .finally(() => {
      imagePrefetchJobs.delete(key)
    })
  imagePrefetchJobs.set(key, job)
  return job
}

/** data: 同步窥尺寸；http(s) 在有 `Image` 时异步解码。不在 16ms 热路径调用。 */
export function prefetchRemoteChatImageSize(src: string): Promise<ChatImageSize | null> {
  const url = src.trim()
  if (!url) return Promise.resolve(null)
  if (url.startsWith('data:image/')) {
    const peeked = peekChatImageSizeFromDataUrl(url)
    if (peeked) writeCachedChatImageSize(url, peeked)
    return Promise.resolve(peeked)
  }
  if (!/^https?:\/\//i.test(url)) return Promise.resolve(readCachedChatImageSize(url))
  if (typeof Image === 'undefined') return Promise.resolve(readCachedChatImageSize(url))
  return takeChatImagePrefetchJob(
    url,
    () =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const width = img.naturalWidth
          const height = img.naturalHeight
          resolve(width > 0 && height > 0 ? { width, height } : null)
        }
        img.onerror = () => resolve(null)
        img.src = url
      })
  )
}

/**
 * 收束后写入 data: 尺寸，并在有 `document` 时开工 http(s) 解码。
 * 不 await，以免卡住 prefetch microtask。
 */
export function prefetchChatImageSizes(srcs: readonly string[]): number {
  let n = 0
  for (const src of srcs) {
    const url = src.trim()
    if (!url) continue
    n += 1
    if (url.startsWith('data:image/')) {
      const peeked = peekChatImageSizeFromDataUrl(url)
      if (peeked) writeCachedChatImageSize(url, peeked)
      continue
    }
    if (typeof document !== 'undefined' && /^https?:\/\//i.test(url)) {
      void prefetchRemoteChatImageSize(url).catch(() => undefined)
    }
  }
  return n
}

function be16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! << 24) |
    (bytes[offset + 1]! << 16) |
    (bytes[offset + 2]! << 8) |
    bytes[offset + 3]!
  ) >>> 0
}

function le16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function le24(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

function decodeDataUrlPrefix(dataUrl: string): Uint8Array | null {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  try {
    const bin = atob(match[1].replace(/\s+/g, ''))
    const n = Math.min(bin.length, 128)
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function sizeFromPng(bytes: Uint8Array): ChatImageSize | null {
  if (bytes.length < 24) return null
  if (ascii(bytes, 1, 3) !== 'PNG' || ascii(bytes, 12, 4) !== 'IHDR') return null
  const width = be32(bytes, 16)
  const height = be32(bytes, 20)
  return width > 0 && height > 0 ? { width, height } : null
}

function sizeFromGif(bytes: Uint8Array): ChatImageSize | null {
  if (bytes.length < 10) return null
  const head = ascii(bytes, 0, 6)
  if (head !== 'GIF87a' && head !== 'GIF89a') return null
  const width = le16(bytes, 6)
  const height = le16(bytes, 8)
  return width > 0 && height > 0 ? { width, height } : null
}

function le32s(bytes: Uint8Array, offset: number): number {
  const u =
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  return u | 0
}

function sizeFromBmp(bytes: Uint8Array): ChatImageSize | null {
  if (bytes.length < 26 || ascii(bytes, 0, 2) !== 'BM') return null
  const widthAbs = Math.abs(le32s(bytes, 18))
  const heightAbs = Math.abs(le32s(bytes, 22))
  return widthAbs > 0 && heightAbs > 0 ? { width: widthAbs, height: heightAbs } : null
}

function sizeFromJpeg(bytes: Uint8Array): ChatImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = bytes[i + 1]!
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    const len = be16(bytes, i + 2)
    if (len < 2) return null
    if (marker >= 0xc0 && marker <= 0xc3 && i + 8 < bytes.length) {
      const height = be16(bytes, i + 5)
      const width = be16(bytes, i + 7)
      return width > 0 && height > 0 ? { width, height } : null
    }
    i += 2 + len
  }
  return null
}

function sizeFromWebp(bytes: Uint8Array): ChatImageSize | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null
  }
  const fourcc = ascii(bytes, 12, 4)
  if (fourcc === 'VP8X' && bytes.length >= 30) {
    const width = le24(bytes, 24) + 1
    const height = le24(bytes, 27) + 1
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (fourcc === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = le16(bytes, 26) & 0x3fff
    const height = le16(bytes, 28) & 0x3fff
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (fourcc === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits =
      bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1
    return width > 0 && height > 0 ? { width, height } : null
  }
  return null
}

/** 从 data:image 文件头读固有宽高，直播首帧就能占位，不必等 <img> onLoad 再从 8rem 塌/涨 */
export function peekChatImageSizeFromDataUrl(dataUrl?: string): ChatImageSize | null {
  const bytes = dataUrl ? decodeDataUrlPrefix(dataUrl) : null
  if (!bytes) return null
  return (
    sizeFromPng(bytes) ??
    sizeFromGif(bytes) ??
    sizeFromJpeg(bytes) ??
    sizeFromWebp(bytes) ??
    sizeFromBmp(bytes)
  )
}

/** 直播 token 中即使 dest 已闭合也不挂 `<img>`，收束后再成图。 */
export function shouldRenderLiveChatImage(options: { streaming?: boolean }): boolean {
  return !options.streaming
}

/**
 * dest 已闭合但仍在直播 token：effect 里开工尺寸 / 工作区 data URL 写缓存，不 setState / 不成图。
 * 收束帧更常命中缓存，不必先闪 48px 再跳。
 */
export function shouldWarmLiveChatImage(options: { streaming?: boolean }): boolean {
  return Boolean(options.streaming)
}

/** 收束后才把 src 交给 `<img>`；直播中空串，槽位仍按缓存 / data: 头占高。 */
export function resolveLiveChatImageSrc(options: { paint: boolean; src: string }): string {
  if (!options.paint) return ''
  return options.src.trim()
}

/** 未测到尺寸前的占位高；成图后高水位只升不降，避免 8rem 占位在小图上塌贴底 */
export const CHAT_IMAGE_PENDING_MIN_PX = 48

export function chatImageSlotMinHeight(
  known: ChatImageSize | null | undefined,
  pending: boolean
): number {
  if (known && known.width > 0 && known.height > 0) return 0
  return pending ? CHAT_IMAGE_PENDING_MIN_PX : 0
}

/** 直播图槽：记住 pending 高，成图后只升不降，避免 48px 占位在小图上塌贴底 */
export function liveChatImageMinHeight(
  floorPx: number,
  known: ChatImageSize | null | undefined,
  pending: boolean
): number {
  return Math.max(Math.max(0, floorPx), chatImageSlotMinHeight(known, pending))
}

/** 灯箱四周留白（px），避开窗口红绿灯 / 关闭钮（对标 Codex #25196 / #26851） */
export const CHAT_IMAGE_LIGHTBOX_PAD_PX = 48

export type ChatImageLightboxFit = {
  width: number
  height: number
  scale: number
}

/**
 * 灯箱默认 fit-to-window：按视口 CSS 像素 contain，且不超过固有尺寸。
 * 不乘 `--ui-font-scale`，避免官方 #26851 / #31112 那种放大后裁切。
 */
export function chatImageLightboxFit(
  image: ChatImageSize | null | undefined,
  viewport: { width: number; height: number },
  padPx = CHAT_IMAGE_LIGHTBOX_PAD_PX
): ChatImageLightboxFit {
  const availW = Math.max(0, Math.floor(viewport.width) - padPx * 2)
  const availH = Math.max(0, Math.floor(viewport.height) - padPx * 2)
  const iw = image?.width ?? 0
  const ih = image?.height ?? 0
  if (iw <= 0 || ih <= 0 || availW <= 0 || availH <= 0) {
    return { width: 0, height: 0, scale: 0 }
  }
  const scale = Math.min(1, availW / iw, availH / ih)
  return {
    width: Math.max(1, Math.round(iw * scale)),
    height: Math.max(1, Math.round(ih * scale)),
    scale
  }
}

/** 右侧文件预览图内边距，与 `.file-tree-viewer-media` 一致 */
export const FILE_PREVIEW_IMAGE_PAD_PX = 12

/**
 * 文件预览窗 fit-to-pane：按预览区 CSS 像素 contain，不乘界面字号。
 * 对标 Codex 打开的 image preview / #26851 / #31112，不发明画布或缩放条。
 */
export function filePreviewImageFit(
  image: ChatImageSize | null | undefined,
  pane: { width: number; height: number }
): ChatImageLightboxFit {
  return chatImageLightboxFit(image, pane, FILE_PREVIEW_IMAGE_PAD_PX)
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
  if (key && url.startsWith('data:image/')) {
    workspaceDataUrlCache.set(key, url)
    const peeked = peekChatImageSizeFromDataUrl(url)
    if (peeked) {
      writeCachedChatImageSize(absPath, peeked)
      writeCachedChatImageSize(url, peeked)
    }
  }
  return url
}
