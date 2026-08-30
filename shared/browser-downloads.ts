/**
 * 内置浏览器下载路径（对标 Codex Settings → Browser downloads）。
 * 默认系统 Downloads；可改目录或每次询问。不发明下载列表 / @Browser。
 * @see shared/ARCH.md
 */
import path from 'path'

/** Official Settings → Browser toggle (learn.chatgpt.com/docs/browser). */
export const ASK_WHERE_TO_SAVE_DOWNLOADS_LABEL = 'Ask where to save downloads'

/** 去掉穿越；空串表示系统下载文件夹 */
export function parseBrowserDownloadPath(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.split(/[/\\]+/).includes('..')) return ''
  return trimmed
}

/** 官方默认关：不弹另存为 */
export function parseBrowserAskWhereToSave(raw: unknown): boolean {
  return raw === true
}

/** 自定义目录优先，否则系统 Downloads */
export function resolveBrowserDownloadDir(customPath: unknown, systemDownloads: string): string {
  return parseBrowserDownloadPath(customPath) || systemDownloads
}

/** 只留文件名，去掉路径与非法字符 */
export function sanitizeBrowserDownloadName(name: string): string {
  const base = path.basename(String(name || '').replace(/\\/g, '/'))
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'download'
  return cleaned.slice(0, 200)
}

/** 已存在则 `name (1).ext`，对标 Chromium 默认下载命名 */
export function uniqueBrowserDownloadPath(
  destDir: string,
  filename: string,
  exists: (abs: string) => boolean
): string {
  const safe = sanitizeBrowserDownloadName(filename)
  const ext = path.extname(safe)
  const stem = ext ? safe.slice(0, -ext.length) : safe
  let n = 0
  while (n < 10_000) {
    const candidate = path.join(destDir, n === 0 ? safe : `${stem} (${n})${ext}`)
    if (!exists(candidate)) return candidate
    n += 1
  }
  return path.join(destDir, `${stem}-${Date.now()}${ext}`)
}
