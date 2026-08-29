/**
 * 对话文件引用打开目标（对标 Codex `file_opener` / Settings → General where files open）。
 * 不接 `desktop.custom_file_handlers`。
 * @see shared/ARCH.md
 */

/** 官方 `file_opener`；`none` 走应用内预览（桌面 View Code） */
export type FileOpener = 'vscode' | 'vscode-insiders' | 'windsurf' | 'cursor' | 'none'

const FILE_OPENERS = new Set<FileOpener>([
  'vscode',
  'vscode-insiders',
  'windsurf',
  'cursor',
  'none'
])

/** 规范化设置值；缺省或非法为 none（应用内预览） */
export function parseFileOpener(raw: unknown): FileOpener {
  return typeof raw === 'string' && FILE_OPENERS.has(raw as FileOpener)
    ? (raw as FileOpener)
    : 'none'
}

/** 相对/Windows 路径收成 `vscode://file` 用的绝对 POSIX 段 */
export function fileOpenerPathSegment(absPath: string): string {
  const normalized = String(absPath || '').trim().replace(/\\/g, '/')
  if (!normalized) return ''
  if (/^[A-Za-z]:\//.test(normalized)) return `/${normalized}`
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

/**
 * 官方 citation URI：`{scheme}://file{absPath}[:line[:column]]`。
 * `none` 或空路径返回 null，交给应用内预览。
 */
export function fileOpenerUri(
  opener: FileOpener,
  absPath: string,
  line?: number,
  column?: number
): string | null {
  if (opener === 'none') return null
  const segment = fileOpenerPathSegment(absPath)
  if (!segment) return null
  const lineNo = Number(line)
  const colNo = Number(column)
  let loc = ''
  if (Number.isInteger(lineNo) && lineNo > 0) {
    loc = `:${lineNo}`
    if (Number.isInteger(colNo) && colNo > 0) loc += `:${colNo}`
  }
  return `${opener}://file${segment}${loc}`
}

/** 官方 none：引用仍可点，但只开应用内预览 */
export function shouldOpenCitationInApp(opener: unknown): boolean {
  return parseFileOpener(opener) === 'none'
}
