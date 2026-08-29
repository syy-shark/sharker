/**
 * 对话文件引用：默认右侧预览（对标 Codex View Code）；工作区 HTML 无行号走内置浏览器 file://；App 按 file_opener 决定是否改走外部 URI。
 * @see src/lib/ARCH.md
 */
import type { FileCitation } from '../../shared/file-citation'

/** window 自定义事件名 */
export const OPEN_WORKSPACE_FILE_EVENT = 'sharker:open-file'

/** 在访达 / 资源管理器中显示工作区文件 */
export const REVEAL_WORKSPACE_FILE_EVENT = 'sharker:reveal-file'

/** 复制解析后的本机路径（对标 Codex file citation Copy path） */
export const COPY_WORKSPACE_FILE_PATH_EVENT = 'sharker:copy-file-path'

/** 打开工作区文件预览的载荷 */
export type OpenWorkspaceFileDetail = FileCitation

/** 派发打开文件预览；App 开右侧文件树，FileTree 读盘并跳行 */
export function dispatchOpenWorkspaceFile(detail: OpenWorkspaceFileDetail): void {
  if (typeof window === 'undefined' || !detail.path) return
  window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_FILE_EVENT, { detail }))
}

/** 派发揭示文件；App 按对话 cwd 解析后 showItemInFolder */
export function dispatchRevealWorkspaceFile(path: string): void {
  if (typeof window === 'undefined' || !path) return
  window.dispatchEvent(new CustomEvent(REVEAL_WORKSPACE_FILE_EVENT, { detail: { path } }))
}

/** 派发复制路径；App 按对话 cwd 解析后再写入剪贴板 */
export function dispatchCopyWorkspaceFilePath(path: string): void {
  if (typeof window === 'undefined' || !path) return
  window.dispatchEvent(new CustomEvent(COPY_WORKSPACE_FILE_PATH_EVENT, { detail: { path } }))
}
