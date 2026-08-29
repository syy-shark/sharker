/**
 * 右侧文件预览种类：文本 / 图 / PDF；办公二进制不假装表格编辑器。
 * 工作区 HTML 无行号时改走内置浏览器 file://（对标 Codex file-backed previews / #32773）。
 * 对标 Codex「在同一工作区打开文档、表格、图片」。
 * @see shared/ARCH.md
 */

import { resolveCitationPath } from './file-citation'

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

/** 去掉 #锚点 / ?query，避免 `index.html#ok` 被当成未知扩展 */
export function stripPreviewHrefSuffix(raw: string): { path: string; suffix: string } {
  const text = String(raw ?? '').trim()
  const cut = text.search(/[#?]/)
  if (cut < 0) return { path: text, suffix: '' }
  return { path: text.slice(0, cut), suffix: text.slice(cut) }
}

/** 工作区 HTML 预览（对标 Codex conversation .html → 右侧 IAB file://） */
export function isHtmlPreviewPath(filePath: string): boolean {
  const ext = fileExt(stripPreviewHrefSuffix(filePath).path)
  return ext === 'html' || ext === 'htm'
}

/** 带行号的 HTML 仍走源码预览；无行号才进内置浏览器 */
export function shouldOpenHtmlInAppBrowser(filePath: string, line?: number): boolean {
  if (line != null && Number.isFinite(line) && line > 0) return false
  return isHtmlPreviewPath(filePath)
}

function collapseDotSegments(raw: string): string {
  const text = String(raw || '').replaceAll('\\', '/')
  const windows = /^[A-Za-z]:/.test(text)
  const parts = text.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '.' || (part === '' && out.length > 0)) continue
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '' && out[out.length - 1] !== '..') {
        out.pop()
      }
      continue
    }
    out.push(part)
  }
  if (windows && out.length && out[0] === '') out.shift()
  return out.join('/') || (text.startsWith('/') ? '/' : '')
}

function normScopedPath(raw: string): string {
  return collapseDotSegments(String(raw || '').replaceAll('\\', '/')).replace(/\/$/, '')
}

/** 绝对路径是否落在根目录内（含根自身） */
export function isPathInsideRoot(absPath: string, root: string): boolean {
  const abs = normScopedPath(absPath)
  const base = normScopedPath(root)
  if (!abs || !base) return false
  return abs === base || abs.startsWith(`${base}/`)
}

/** 本机路径 → file://，空格等走 encodeURI */
export function toBrowserFileUrl(absPath: string): string {
  const raw = collapseDotSegments(String(absPath || '').trim().replaceAll('\\', '/'))
  if (!raw) return ''
  const windows = /^[A-Za-z]:\//.test(raw)
  const pathname = windows ? `/${raw}` : raw.startsWith('/') ? raw : ''
  if (!pathname) return ''
  return `file://${encodeURI(pathname)}`
}

/**
 * 对话 / 文件树里的工作区 HTML → 内置浏览器 file://。
 * 普通代码与带行号引用仍走文件预览；不发明 Browser Use 打开 file://。
 */
export function resolveWorkspaceHtmlFileUrl(
  hrefOrPath: string,
  workspacePath: string,
  extraRoots: readonly string[] = []
): string {
  const raw = String(hrefOrPath || '').trim()
  if (!raw || /^(https?:|mailto:|javascript:|data:|blob:|about:)/i.test(raw)) return ''
  const { path, suffix } = stripPreviewHrefSuffix(raw)
  if (!isHtmlPreviewPath(path)) return ''
  const abs = collapseDotSegments(resolveCitationPath(path, workspacePath, [...extraRoots]))
  if (!abs) return ''
  const roots = [workspacePath, ...extraRoots].map((root) => String(root || '').trim()).filter(Boolean)
  if (roots.length === 0 || !roots.some((root) => isPathInsideRoot(abs, root))) return ''
  const url = toBrowserFileUrl(abs)
  return url ? `${url}${suffix}` : ''
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

/** 文件预览 ⌘L 跳行：只收正整数，超出夹到最后一行 */
export function parseGoToLineInput(raw: string, lineCount: number): number | null {
  const n = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(n, Math.max(1, lineCount))
}

/** 审查 diff 跳行上限：取新旧行号里较大的那个 */
export function maxDiffGotoLine(
  lines: Array<{ newLine?: number | null; oldLine?: number | null }> | undefined
): number {
  let max = 0
  for (const line of lines ?? []) {
    const n = Number(line.newLine ?? line.oldLine ?? 0)
    if (Number.isFinite(n) && n > max) max = n
  }
  return Math.max(1, max)
}

function normPreviewPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/$/, '')
}

/** 文件树为何重拉：换工作区要清预览并折回根；写盘/回前台只换节点，保住预览与展开 */
export type FileTreeReloadReason = 'workspace' | 'focus' | 'revision'

export function fileTreeReloadMode(reason: FileTreeReloadReason): {
  clearPreview: boolean
  resetExpanded: boolean
  showLoading: boolean
} {
  if (reason === 'workspace') {
    return { clearPreview: true, resetExpanded: true, showLoading: true }
  }
  return { clearPreview: false, resetExpanded: false, showLoading: false }
}

/**
 * 写盘 revision / 回前台时在文件树内重读已打开预览，不抬 App（对标 Codex 打开文档跟着改）。
 * 换工作区会清预览，不必再读。
 */
export function shouldRereadOpenPreviewOnReload(reason: FileTreeReloadReason): boolean {
  return reason === 'revision' || reason === 'focus'
}

/** 写盘静默重拉后不再播进入动画，避免文件树/侧栏跟着直播抖（对标 Codex sidebar jitter） */
export function shouldAnimateFileTreeInsert(settled: boolean): boolean {
  return !settled
}

/** 打开的预览是否被本轮写盘碰到。 */
export function previewPathTouchedByWrites(
  previewPath: string,
  writtenRelPaths: readonly string[],
  workspacePath: string,
  extraRoots: readonly string[] = []
): boolean {
  const extras = [...extraRoots]
  const preview = normPreviewPath(
    resolveCitationPath(previewPath, workspacePath, extras) || previewPath
  )
  if (!preview) return false
  for (const rel of writtenRelPaths) {
    const raw = String(rel ?? '').trim()
    if (!raw) continue
    const written = normPreviewPath(resolveCitationPath(raw, workspacePath, extras) || raw)
    if (!written) continue
    if (written === preview) return true
    if (preview.endsWith(`/${written}`) || written.endsWith(`/${preview}`)) return true
  }
  return false
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
