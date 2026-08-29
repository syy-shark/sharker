/**
 * 官方探索过程文案（对标 Codex `exec_cell`：Read / List / Search）。
 * 每步一行，不发明 Exploring 分组头（官方分组会合并多步，直播会跳）。
 * 目标用 basename，与官方活动条一致（#18458 要完整路径是未修的官方缺口，不发明更长标题）。
 * @see shared/ARCH.md
 */

export const EXPLORE_READ_TOOL = 'read_file'
export const EXPLORE_LIST_TOOL = 'list_dir'
export const EXPLORE_GREP_TOOL = 'grep'
export const EXPLORE_GLOB_TOOL = 'glob_file_search'

const EXPLORE_TOOLS = new Set([
  EXPLORE_READ_TOOL,
  EXPLORE_LIST_TOOL,
  EXPLORE_GREP_TOOL,
  EXPLORE_GLOB_TOOL
])

/** 是否为官方 Read / List / Search 过程行 */
export function isExploreActivityToolName(name: string): boolean {
  return EXPLORE_TOOLS.has(name)
}

function argText(args: Record<string, unknown> | undefined, keys: string[]): string {
  if (!args) return ''
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** 直播用末段名，避免整段路径把过程区顶高 */
export function exploreNameFromPath(path: string | undefined, max = 24): string | undefined {
  const cleaned = String(path || '')
    .replace(/[`*>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return undefined
  const base = cleaned.split(/[\\/]/).filter(Boolean).at(-1) || cleaned
  return base.length > max ? `${base.slice(0, max - 1)}…` : base
}

function clipQuery(query: string, max = 36): string {
  const text = query.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** 官方 Search query [in path] */
export function formatExploreSearch(query: string, path?: string): string {
  const q = clipQuery(query)
  const leaf = exploreNameFromPath(path)
  if (q && leaf) return `Search ${q} in ${leaf}`
  if (q) return `Search ${q}`
  if (leaf) return `Search ${leaf}`
  return 'Search'
}

/** Read / List / Search + 目标；未知探索工具返回 null */
export function formatExploreActivity(
  toolName: string,
  args?: Record<string, unknown>,
  toolDetail?: string
): string | null {
  if (toolName === EXPLORE_READ_TOOL) {
    const leaf = exploreNameFromPath(argText(args, ['path']) || toolDetail)
    return leaf ? `Read ${leaf}` : 'Read'
  }
  if (toolName === EXPLORE_LIST_TOOL) {
    const leaf = exploreNameFromPath(argText(args, ['path']) || toolDetail)
    return leaf ? `List ${leaf}` : 'List'
  }
  if (toolName === EXPLORE_GREP_TOOL) {
    return formatExploreSearch(
      argText(args, ['pattern', 'query']) || toolDetail || '',
      argText(args, ['path'])
    )
  }
  if (toolName === EXPLORE_GLOB_TOOL) {
    return formatExploreSearch(argText(args, ['pattern']) || toolDetail || '', argText(args, ['cwd']))
  }
  return null
}
