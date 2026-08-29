/**
 * 闭合代码围栏与文件预览着色（对标 Codex 桌面 highlight.js / #18966）。
 * 未闭合直播围栏不着色，避免每枚 token 重高亮卡顿。
 * @see shared/ARCH.md
 */
import hljs from 'highlight.js/lib/common'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import powershell from 'highlight.js/lib/languages/powershell'

hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('powershell', powershell)

/** 超过此长度或行数则保持纯文本，以免大文件卡预览 */
export const SYNTAX_HIGHLIGHT_MAX_CHARS = 120_000
export const SYNTAX_HIGHLIGHT_MAX_LINES = 6_000

const HIGHLIGHT_CACHE_LIMIT = 48
const highlightCache = new Map<string, string[] | null>()

const FILE_EXT_LANG: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cxx: 'cpp',
  dockerfile: 'dockerfile',
  go: 'go',
  gql: 'graphql',
  graphql: 'graphql',
  h: 'c',
  hpp: 'cpp',
  htm: 'xml',
  html: 'xml',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  m: 'objectivec',
  markdown: 'markdown',
  md: 'markdown',
  mjs: 'javascript',
  mk: 'makefile',
  mm: 'objectivec',
  php: 'php',
  pl: 'perl',
  ps1: 'powershell',
  psm1: 'powershell',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  swift: 'swift',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash'
}

const LANG_ALIASES: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  console: 'bash',
  cpp: 'cpp',
  csharp: 'csharp',
  cs: 'csharp',
  css: 'css',
  diff: 'diff',
  dockerfile: 'dockerfile',
  go: 'go',
  golang: 'go',
  graphql: 'graphql',
  html: 'xml',
  ini: 'ini',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  kotlin: 'kotlin',
  less: 'less',
  lua: 'lua',
  makefile: 'makefile',
  markdown: 'markdown',
  md: 'markdown',
  objectivec: 'objectivec',
  perl: 'perl',
  php: 'php',
  powershell: 'powershell',
  ps1: 'powershell',
  py: 'python',
  python: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  ruby: 'ruby',
  rust: 'rust',
  scss: 'scss',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  swift: 'swift',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash'
}

/**
 * 把 highlight.js 跨行 span 拆成每行可独立挂载的 HTML。
 * 行末补上未闭合 `</span>`，下一行再打开，避免行组件切断标记。
 */
export function splitHighlightedHtmlLines(html: string): string[] {
  const rawLines = html.split('\n')
  const out: string[] = []
  const stack: string[] = []
  const tagRe = /<\/?span\b[^>]*>/gi
  for (const raw of rawLines) {
    let line = stack.join('') + raw
    tagRe.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = tagRe.exec(raw))) {
      const tag = match[0]
      if (tag.startsWith('</')) stack.pop()
      else stack.push(tag)
    }
    if (stack.length) line += '</span>'.repeat(stack.length)
    out.push(line)
  }
  return out
}

/** 围栏语言别名 → highlight.js 已注册语言；未知或纯文本返回空 */
export function resolveHighlightLanguage(language?: string | null): string | undefined {
  const raw = String(language || '')
    .trim()
    .toLowerCase()
    .replace(/^language-/, '')
  if (!raw || raw === 'text' || raw === 'plain' || raw === 'plaintext' || raw === 'txt') {
    return undefined
  }
  const aliased = LANG_ALIASES[raw] ?? raw
  return hljs.getLanguage(aliased) ? aliased : undefined
}

/** 文件预览按扩展名 / Dockerfile / Makefile 选语言；不发明 .tex 语法 */
export function fileHighlightLanguage(filePath: string): string | undefined {
  const base = String(filePath || '')
    .split(/[/\\]/)
    .pop()
    ?.trim()
  if (!base) return undefined
  if (/^dockerfile$/i.test(base)) return 'dockerfile'
  if (/^makefile$/i.test(base)) return 'makefile'
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return undefined
  return FILE_EXT_LANG[base.slice(dot + 1).toLowerCase()]
}

function cacheGet(key: string): string[] | null | undefined {
  if (!highlightCache.has(key)) return undefined
  const hit = highlightCache.get(key)
  highlightCache.delete(key)
  highlightCache.set(key, hit ?? null)
  return hit ?? null
}

function cacheSet(key: string, value: string[] | null): string[] | null {
  highlightCache.set(key, value)
  while (highlightCache.size > HIGHLIGHT_CACHE_LIMIT) {
    const first = highlightCache.keys().next().value
    if (first == null) break
    highlightCache.delete(first)
  }
  return value
}

/**
 * 闭合围栏 / 文件预览着色。过大、未知语言或失败返回 null（保持纯文本）。
 * 同一段源码复用同一行数组引用，便于行组件 memo。
 */
export function highlightFenceLines(
  code: string,
  language?: string | null
): string[] | null {
  const lang = resolveHighlightLanguage(language)
  if (!lang) return null
  const source = String(code ?? '')
  if (!source || source.length > SYNTAX_HIGHLIGHT_MAX_CHARS) return null
  const lineCount = source.split('\n').length
  if (lineCount > SYNTAX_HIGHLIGHT_MAX_LINES) return null
  const key = `${lang}\n${source}`
  const cached = cacheGet(key)
  if (cached !== undefined) return cached
  try {
    const endsWithNl = source.endsWith('\n')
    const body = endsWithNl ? source.slice(0, -1) : source
    const html = hljs.highlight(body, { language: lang, ignoreIllegals: true }).value
    const lines = splitHighlightedHtmlLines(html)
    const expected = body.split('\n')
    if (lines.length !== expected.length) return cacheSet(key, null)
    if (endsWithNl) lines.push('')
    return cacheSet(key, lines)
  } catch {
    return cacheSet(key, null)
  }
}
