/**
 * 工具活动的侧栏 label 格式化。
 * 详见 shared/ARCH.md
 */
import { parsePatch } from './patch'

const PATH_TOOLS = new Set([
  'read_file',
  'write_file',
  'search_replace',
  'delete_path',
  'move_path',
  'list_dir',
  'grep',
  'glob_file_search',
  'create_directory'
])

/** 会改工作区文件的工具（供「本轮」审查范围） */
const WRITE_TOOLS = new Set([
  'write_file',
  'search_replace',
  'delete_path',
  'move_path',
  'apply_patch'
])

/** 取路径 basename（统一斜杠） */
export function basenamePath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

/** 从工具参数提取被浏览文件的显示名 */
export function extractBrowsedPaths(
  toolName: string,
  args?: Record<string, unknown>
): string[] {
  if (!args || !PATH_TOOLS.has(toolName)) return []
  const raw = args.path ?? args.target_path ?? args.source_path
  if (typeof raw !== 'string' || !raw.trim()) return []
  return [basenamePath(raw.trim())]
}

/**
 * 从写盘工具参数取出工作区相对路径（对标 Codex Last turn）。
 * `workspace` 为空时返回原路径的 posix 形式。
 */
export function extractChangedRelPaths(
  toolName: string,
  args: Record<string, unknown> | undefined,
  workspace = ''
): string[] {
  if (!args || !WRITE_TOOLS.has(toolName)) return []
  const root = workspace.replaceAll('\\', '/').replace(/\/$/, '')
  const toRel = (raw: string): string | null => {
    const posix = raw.trim().replaceAll('\\', '/')
    if (!posix) return null
    if (root && posix.startsWith(`${root}/`)) return posix.slice(root.length + 1)
    if (root && posix === root) return null
    return posix.replace(/^\.\//, '')
  }
  if (toolName === 'apply_patch' && typeof args.patch === 'string') {
    const seen = new Set<string>()
    for (const hunk of parsePatch(args.patch)) {
      const rel = toRel(hunk.path)
      if (rel) seen.add(rel)
    }
    return [...seen]
  }
  const raws = [args.path, args.target_path, args.source_path]
  const seen = new Set<string>()
  for (const raw of raws) {
    if (typeof raw !== 'string') continue
    const rel = toRel(raw)
    if (rel) seen.add(rel)
  }
  return [...seen]
}

/** 格式化工具活动侧栏 label（含路径/命令摘要） */
export function formatToolActivity(
  toolName: string,
  args?: Record<string, unknown>
): string {
  const paths = extractBrowsedPaths(toolName, args)
  if (paths.length) return `${toolName} · ${paths[0]}`
  if (toolName === 'run_terminal_cmd' && typeof args?.command === 'string') {
    const cmd = args.command.trim().replace(/\s+/g, ' ')
    const short = cmd.length > 72 ? `${cmd.slice(0, 69)}…` : cmd
    return `${toolName} · ${short}`
  }
  if (toolName === 'glob_file_search' && typeof args?.pattern === 'string') {
    return `${toolName} · ${args.pattern}`
  }
  if (toolName === 'present_inline_demo') {
    const caption = typeof args?.caption === 'string' ? args.caption.trim() : ''
    return caption ? `${toolName} · ${caption}` : toolName
  }
  return toolName
}
