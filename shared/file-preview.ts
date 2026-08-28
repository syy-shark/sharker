/**
 * 右侧文件预览种类：文本 / 图 / PDF；办公二进制不假装表格编辑器。
 * 对标 Codex「在同一工作区打开文档、表格、图片」。
 * @see shared/ARCH.md
 */

export type FilePreviewKind = 'text' | 'image' | 'pdf' | 'unsupported'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'])
const PDF_EXT = new Set(['pdf'])
const UNSUPPORTED_EXT = new Set([
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'wasm',
  'zip',
  'gz',
  'tar',
  '7z',
  'rar',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'mp3',
  'mp4',
  'mov',
  'wav',
  'ogg',
  'webm',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'docx',
  'doc',
  'psd',
  'ai',
  'sketch'
])

function fileExt(filePath: string): string {
  const base = String(filePath ?? '').replaceAll('\\', '/').split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** 按扩展名分流预览；无扩展名当文本 */
export function filePreviewKind(filePath: string): FilePreviewKind {
  const ext = fileExt(filePath)
  if (!ext) return 'text'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (PDF_EXT.has(ext)) return 'pdf'
  if (UNSUPPORTED_EXT.has(ext)) return 'unsupported'
  return 'text'
}

/** data URL 的 MIME；未知扩展给 octet-stream */
export function dataUrlMimeForPath(filePath: string): string {
  const ext = fileExt(filePath)
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'avif') return 'image/avif'
  if (ext === 'ico') return 'image/x-icon'
  if (ext === 'pdf') return 'application/pdf'
  return 'application/octet-stream'
}

export function filePreviewUnsupportedMessage(filePath: string): string {
  const ext = fileExt(filePath)
  if (ext === 'xlsx' || ext === 'xls') {
    return '表格文件无法在应用内预览'
  }
  if (ext === 'docx' || ext === 'doc' || ext === 'pptx' || ext === 'ppt') {
    return 'Office 文档无法在应用内预览'
  }
  return '无法在应用内预览此文件'
}
