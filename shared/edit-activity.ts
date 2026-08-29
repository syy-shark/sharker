/**
 * 官方写盘过程文案（对标 Codex `render_changes_block`：Added / Edited / Deleted）。
 * 多文件补丁用 Edited N files。失败补丁用 Failed to apply patch。
 * 不发明回合 Undo，也不把 write_file 一律标成 Added（整文件覆盖仍是 Edited）。
 * @see shared/ARCH.md
 */

import { exploreNameFromPath } from './explore-activity'

export const EDIT_WRITE_TOOL = 'write_file'
export const EDIT_REPLACE_TOOL = 'search_replace'
export const EDIT_PATCH_TOOL = 'apply_patch'
export const EDIT_DELETE_TOOLS = new Set(['delete_path', 'delete_file'])
export const EDIT_MOVE_TOOL = 'move_path'

const EDIT_TOOLS = new Set([
  EDIT_WRITE_TOOL,
  EDIT_REPLACE_TOOL,
  EDIT_PATCH_TOOL,
  'delete_path',
  'delete_file',
  EDIT_MOVE_TOOL
])

export type EditChangeKind = 'add' | 'edit' | 'delete'

/** 是否为官方 Added / Edited / Deleted 过程行 */
export function isEditActivityToolName(name: string): boolean {
  return EDIT_TOOLS.has(name)
}

function argText(args: Record<string, unknown> | undefined, keys: string[]): string {
  if (!args) return ''
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function leafOf(path: string | undefined, fallback?: string): string | undefined {
  return exploreNameFromPath(path) || exploreNameFromPath(fallback)
}

/** 官方多文件头：Edited N files */
export function formatEditedFilesHeader(count: number): string {
  const n = Math.max(0, Math.floor(count))
  if (n <= 0) return ''
  return n === 1 ? 'Edited 1 file' : `Edited ${n} files`
}

/** 单文件：Added / Edited / Deleted + basename */
export function formatEditFileActivity(kind: EditChangeKind, path?: string): string {
  const leaf = leafOf(path)
  if (kind === 'add') return leaf ? `Added ${leaf}` : 'Added'
  if (kind === 'delete') return leaf ? `Deleted ${leaf}` : 'Deleted'
  return leaf ? `Edited ${leaf}` : 'Edited'
}

function patchPaths(args?: Record<string, unknown>, toolDetail?: string): string[] {
  const fromArgs = argText(args, ['path'])
  const preview =
    Array.isArray(args?.files) && args
      ? (args.files as unknown[])
          .map((item) => (typeof item === 'string' ? item : ''))
          .filter(Boolean)
      : []
  const paths = [fromArgs, ...preview, toolDetail || ''].filter(Boolean)
  const unique: string[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    const leaf = leafOf(path)
    if (!leaf || seen.has(leaf)) continue
    seen.add(leaf)
    unique.push(path)
  }
  return unique
}

/** 写盘工具 → 官方 Added / Edited / Deleted / Edited N files */
export function formatEditActivity(
  toolName: string,
  args?: Record<string, unknown>,
  toolDetail?: string,
  status?: string,
  fileCount?: number
): string | null {
  if (!isEditActivityToolName(toolName)) return null
  if (toolName === EDIT_PATCH_TOOL && status === 'error') return 'Failed to apply patch'
  if ((fileCount ?? 0) > 1) return formatEditedFilesHeader(fileCount ?? 0)
  if (EDIT_DELETE_TOOLS.has(toolName)) {
    return formatEditFileActivity('delete', argText(args, ['path']) || toolDetail)
  }
  if (toolName === EDIT_MOVE_TOOL) {
    const from = leafOf(argText(args, ['source', 'from']) || toolDetail)
    const to = leafOf(argText(args, ['destination', 'to']))
    if (from && to) return `Edited ${from} → ${to}`
    return formatEditFileActivity('edit', to || from)
  }
  if (toolName === EDIT_PATCH_TOOL) {
    const paths = patchPaths(args, toolDetail)
    if (paths.length > 1) return formatEditedFilesHeader(paths.length)
    return formatEditFileActivity('edit', paths[0] || toolDetail)
  }
  return formatEditFileActivity('edit', argText(args, ['path']) || toolDetail)
}
