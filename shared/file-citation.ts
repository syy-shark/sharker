/**
 * 对话里的本地文件引用：对标 Codex TUI / 桌面端 `path:line`、`#L`、`(line N)`。
 * 拒绝尾斜杠目录与 `a\\` 假路径，避免把反斜杠硬换行收成文件芯片。
 * @see shared/ARCH.md
 */

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
  return text.replace(/\\/g, '/')
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

/** 相对路径接到工作区；绝对路径原样返回 */
export function resolveCitationPath(path: string, workspacePath: string): string {
  const rel = normalizeCitationPath(path)
  if (!rel) return ''
  if (rel.startsWith('/') || /^[A-Za-z]:\//.test(rel)) return rel
  const base = String(workspacePath || '').replace(/[\\/]+$/, '')
  if (!base) return rel
  const rest = rel.replace(/^\.\//, '')
  return `${base}/${rest}`
}
