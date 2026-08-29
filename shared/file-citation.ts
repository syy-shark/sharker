/**
 * 对话里的本地文件引用：对标 Codex TUI / 桌面端 `path:line`、`#L`、`(line N)`。
 * 拒绝尾斜杠目录与 `a\\` 假路径，避免把反斜杠硬换行收成文件芯片。
 * 百分号路径先解一层再打开 / 揭示 / 复制（对标 Codex #13123）。
 * 右键：打开预览 / 在访达中显示 / 复制路径；不接自定义 Open with。
 * @see shared/ARCH.md
 */

import { revealInFolderLabel, type RevealFolderPlatform } from './reveal-in-folder'

/** 常见源码扩展名，无斜杠时也认作路径 */
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|md|json|css|scss|less|html|vue|svelte|c|cc|cpp|h|hpp|m|mm|rb|php|sh|bash|zsh|toml|ya?ml|xml|sql|graphql|proto)$/i

/** 解析后的工作区文件位置 */
export type FileCitation = {
  path: string
  line?: number
  endLine?: number
  column?: number
}

/** 官方 #13123：打开 / 复制前把 `%E4…` / `%20` 解成原生路径，只解一层 */
export function decodeCitationFilesystemPath(raw: string): string {
  const text = String(raw || '')
  if (!/%[0-9A-Fa-f]{2}/.test(text)) return text
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** 复制到剪贴板的本机路径；Windows 还原反斜杠 */
export function formatCitationClipboardPath(
  abs: string,
  platform: RevealFolderPlatform = 'linux'
): string {
  const path = String(abs || '').trim()
  if (!path) return ''
  if (platform === 'win32') return path.replace(/\//g, '\\')
  return path
}

export type FileCitationMenuAction = 'open' | 'reveal' | 'copy'

/** 引用右键（对标 Codex file citation Open / Open in Finder / Copy path） */
export function fileCitationMenuItems(
  platform: RevealFolderPlatform = 'linux'
): Array<{ action: FileCitationMenuAction; title: string }> {
  return [
    { action: 'open', title: '打开预览' },
    { action: 'reveal', title: revealInFolderLabel(platform) },
    { action: 'copy', title: '复制路径' }
  ]
}

/** 规范化分隔符，去掉一层包裹反引号 */
export function normalizeCitationPath(raw: string): string {
  let text = String(raw || '').trim()
  if (text.startsWith('`') && text.endsWith('`') && text.length > 2) {
    text = text.slice(1, -1).trim()
  }
  if (text.startsWith('file://')) {
    try {
      text = decodeURIComponent(text.slice('file://'.length))
    } catch {
      text = text.slice('file://'.length)
    }
  }
  return decodeCitationFilesystemPath(text).replace(/\\/g, '/')
}

/** 看起来像本地文件路径，而不是 URL / 时间 / 普通词 */
export function looksLikeFilePath(path: string): boolean {
  const text = String(path || '').trim()
  if (!text || text.length > 260) return false
  if (/^(https?|mailto|sharker):/i.test(text)) return false
  if (/^www\./i.test(text)) return false
  if (text.startsWith('<')) return false
  if (text.includes('://')) return false
  if (/\s/.test(text)) return false
  if (text.startsWith('-')) return false
  // `a\` 归一成 `a/`，不能当成路径，否则 `a\` + 换行会被吃掉、硬换行画不成
  if (text.endsWith('/')) return false
  return text.includes('/') || CODE_EXT.test(text)
}

/** 把 `path:12` / `#L12` / `(line 12)` 拆成路径与行号 */
export function parseFileCitation(raw: string): FileCitation | null {
  let text = normalizeCitationPath(raw)
  if (!text) return null

  const lineParen = /^(.*)\s+\(line\s+(\d+)\)$/i.exec(text)
  if (lineParen && looksLikeFilePath(lineParen[1])) {
    return { path: lineParen[1], line: Number(lineParen[2]) }
  }

  const hash = /^(.*)#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/i.exec(text)
  if (hash && looksLikeFilePath(hash[1])) {
    return {
      path: hash[1],
      line: Number(hash[2]),
      endLine: hash[3] ? Number(hash[3]) : undefined
    }
  }

  const colon = /^(.*?):(\d+)(?::(\d+))?$/.exec(text)
  if (colon && looksLikeFilePath(colon[1]) && !/^[A-Za-z]$/.test(colon[1])) {
    return {
      path: colon[1],
      line: Number(colon[2]),
      column: colon[3] ? Number(colon[3]) : undefined
    }
  }

  if (!looksLikeFilePath(text)) return null
  return { path: text }
}

function isBoundary(ch: string | undefined): boolean {
  return !ch || /[\s([{<"']/.test(ch)
}

/** 从下标起匹配一段文件引用；尾部标点留给后面的文本 */
export function matchFileCitationAt(
  src: string,
  index: number
): { end: number; citation: FileCitation; text: string } | null {
  if (index < 0 || index >= src.length) return null
  if (!isBoundary(src[index - 1])) return null
  if (src.startsWith('http://', index) || src.startsWith('https://', index)) return null
  if (/^www\./i.test(src.slice(index))) return null
  if (src.startsWith('</', index) || src[index] === '<') return null
  if (src[index] === '/' && src[index - 1] === '<') return null

  let end = index
  while (end < src.length && !/[\s`)\]>]/.test(src[end])) end += 1
  let raw = src.slice(index, end)
  const punct = /[.,;:!?]+$/.exec(raw)
  if (punct) {
    raw = raw.slice(0, -punct[0].length)
    end -= punct[0].length
  }
  const anno = /^\s+\(line\s+\d+\)/i.exec(src.slice(end))
  if (anno) {
    raw = src.slice(index, end + anno[0].length)
    end += anno[0].length
  }
  const citation = parseFileCitation(raw)
  if (!citation) return null
  return { end, citation, text: raw }
}

/** 相对路径接到工作区；绝对路径原样返回。附加根用目录名做前缀（与 `@` 搜索一致）。 */
export function resolveCitationPath(
  filePath: string,
  workspacePath: string,
  extraRoots: string[] = []
): string {
  const rel = normalizeCitationPath(filePath)
  if (!rel) return ''
  if (rel.startsWith('/') || /^[A-Za-z]:\//.test(rel)) return rel
  const rest = rel.replace(/^\.\//, '')
  const first = rest.split('/')[0]
  for (const extra of extraRoots) {
    const extraBase = String(extra || '').replace(/[\\/]+$/, '')
    if (!extraBase) continue
    const name = extraBase.split('/').pop() || ''
    if (name && first === name) {
      const nested = rest.slice(name.length).replace(/^\//, '')
      return nested ? `${extraBase}/${nested}` : extraBase
    }
  }
  const base = String(workspacePath || '').replace(/[\\/]+$/, '')
  if (!base) return rest
  return `${base}/${rest}`
}
