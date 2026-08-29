/**
 * 对话文件引用：默认右侧预览（对标 Codex View Code）；App 按 file_opener 决定是否改走外部 URI。
 * @see src/lib/ARCH.md
 */
import type { FileCitation } from '../../shared/file-citation'

/** window 自定义事件名 */
export const OPEN_WORKSPACE_FILE_EVENT = 'sharker:open-file'

/** 打开工作区文件预览的载荷 */
export type OpenWorkspaceFileDetail = FileCitation

/** 派发打开文件预览；App 开右侧文件树，FileTree 读盘并跳行 */
export function dispatchOpenWorkspaceFile(detail: OpenWorkspaceFileDetail): void {
  if (typeof window === 'undefined' || !detail.path) return
  window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_FILE_EVENT, { detail }))
}
