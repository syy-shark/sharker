/**
 * 内联可视化：根据文件路径判断产物类型。
 */

export type InlineArtifactKind =
  | 'html'
  | 'svg'
  | 'markdown'
  | 'image'
  | 'code'
  | 'json'
  | 'unknown'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif'])
const CODE_EXT = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'less',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'swift',
  'sh',
  'bash',
  'zsh',
  'sql',
  'yaml',
  'yml',
  'toml',
  'xml',
  'vue',
  'svelte',
  'html' // 纯代码视图时也用
])

export function extOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path
  const i = base.lastIndexOf('.')
  if (i <= 0) return ''
  return base.slice(i + 1).toLowerCase()
}

export function basenameOf(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

export function dirnameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const i = normalized.lastIndexOf('/')
  return i >= 0 ? normalized.slice(0, i) : ''
}

export function joinPath(dir: string, rel: string): string {
  if (!rel) return dir
  if (rel.startsWith('/') || /^[A-Za-z]:[\\/]/.test(rel)) return rel
  if (rel.startsWith('http:') || rel.startsWith('https:') || rel.startsWith('data:')) return rel
  const clean = rel.replace(/^\.\//, '')
  if (!dir) return clean
  return `${dir.replace(/\/$/, '')}/${clean}`
}

/** 是否适合做内联预览（非 unknown 且完成写入后） */
export function detectArtifactKind(path: string): InlineArtifactKind {
  const ext = extOf(path)
  if (!ext) return 'unknown'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'svg') return 'svg'
  if (ext === 'md' || ext === 'mdx') return 'markdown'
  if (ext === 'json') return 'json'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (CODE_EXT.has(ext)) return 'code'
  return 'unknown'
}

/** 该类型是否默认展开预览（html/svg 优先看效果） */
export function defaultPreviewTab(
  kind: InlineArtifactKind
): 'preview' | 'diff' | 'code' {
  if (kind === 'html' || kind === 'svg' || kind === 'image' || kind === 'markdown') return 'preview'
  if (kind === 'code' || kind === 'json') return 'code'
  return 'diff'
}

export function languageFromPath(path: string): string {
  const ext = extOf(path)
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    css: 'css',
    scss: 'scss',
    html: 'html',
    htm: 'html',
    json: 'json',
    md: 'markdown',
    sh: 'bash',
    yml: 'yaml',
    yaml: 'yaml'
  }
  return map[ext] ?? ext
}
