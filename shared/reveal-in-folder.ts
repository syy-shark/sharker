/**
 * 在系统文件管理器中显示路径（对标 Codex Open in Finder / Explorer / File Manager）。
 * 线程菜单打开项目目录；审查右键揭示文件。不接自定义 Open with handler。
 * @see shared/ARCH.md
 */

import { resolveConversationPath } from './conversation'

/** 官方桌面按平台换文案 */
export type RevealFolderPlatform = 'darwin' | 'win32' | string

/** 官方 macOS Finder / Windows Explorer / Linux File Manager（对标 Codex #13123 / #29449） */
export const OPEN_IN_FINDER_LABEL = 'Open in Finder'
export const OPEN_IN_EXPLORER_LABEL = 'Open in Explorer'
export const OPEN_IN_FILE_MANAGER_LABEL = 'Open in File Manager'
/** 官方文件引用 / 文件树 / Files changed 右键（对标 Codex #13123 / #17591 / #29316） */
export const COPY_PATH_LABEL = 'Copy path'

/** 官方桌面按平台换文案 */
export function revealInFolderLabel(platform: RevealFolderPlatform = 'linux'): string {
  if (platform === 'darwin') return OPEN_IN_FINDER_LABEL
  if (platform === 'win32') return OPEN_IN_EXPLORER_LABEL
  return OPEN_IN_FILE_MANAGER_LABEL
}

/** 线程项目目录：隔离 worktree 优先，否则工作区 cwd */
export function threadRevealFolderPath(input: {
  mode?: string
  worktreePath?: string
  workspacePath?: string
}): string {
  if (input.mode === 'worktree') {
    return resolveConversationPath({
      worktreePath: input.worktreePath,
      workspacePath: input.workspacePath
    })
  }
  return String(input.workspacePath || '').trim()
}

/** 审查文件落盘绝对路径；相对路径接到仓根。主进程再 `path.resolve` */
export function reviewFileRevealPath(filePath: string, repoRoot: string): string {
  const file = String(filePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
  const root = String(repoRoot || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
  if (!file) return ''
  if (file.startsWith('/') || /^[A-Za-z]:\//.test(file)) return file
  if (!root) return ''
  return `${root}/${file.replace(/^\/+/, '')}`
}

export type ThreadCopyAction = 'copy-cwd' | 'copy-session' | 'copy-deeplink' | 'copy-markdown'

/** 官方桌面消息 hover / Copy 子菜单名（对标 Codex #20643 / #25201） */
export const COPY_LABEL = 'Copy'
/** 官方桌面 Copy 子菜单与快捷键（对标 Codex #25201 / #28233 / learn.chatgpt.com） */
export const COPY_WORKING_DIRECTORY_LABEL = 'Copy working directory'
export const COPY_SESSION_ID_LABEL = 'Copy session ID'
/** 顶栏 Copy 子菜单原文（对标 Codex #25201 / #28233） */
export const COPY_DEEPLINK_LABEL = 'Copy deeplink'
/** 官方快捷键表名（对标 learn.chatgpt.com Copy chat deep link） */
export const COPY_CHAT_DEEP_LINK_LABEL = 'Copy chat deep link'
export const COPY_AS_MARKDOWN_LABEL = 'Copy as Markdown'
export const COPY_CONVERSATION_PATH_LABEL = 'Copy conversation path'
export const COPY_BROWSER_URL_LABEL = 'Copy browser URL'

/** 顶栏 Copy 子菜单（对标 Codex threadHeader Copy：cwd / session / deeplink / Markdown） */
export function threadCopyMenuItems(): Array<{ action: ThreadCopyAction; title: string }> {
  return [
    { action: 'copy-cwd', title: COPY_WORKING_DIRECTORY_LABEL },
    { action: 'copy-session', title: COPY_SESSION_ID_LABEL },
    { action: 'copy-deeplink', title: COPY_DEEPLINK_LABEL },
    { action: 'copy-markdown', title: COPY_AS_MARKDOWN_LABEL }
  ]
}

export type ThreadMenuAction = 'reveal' | 'copy-markdown' | 'rename' | 'pin' | 'archive'

/** 侧栏线程右键（对标 Codex thread menus / Copy as Markdown） */
export function threadMenuItems(input: {
  pinned?: boolean
  platform?: RevealFolderPlatform
}): Array<{ action: ThreadMenuAction; title: string }> {
  return [
    { action: 'reveal', title: revealInFolderLabel(input.platform) },
    { action: 'copy-markdown', title: COPY_AS_MARKDOWN_LABEL },
    { action: 'rename', title: '重命名' },
    { action: 'pin', title: input.pinned ? '取消置顶' : '置顶' },
    { action: 'archive', title: '归档' }
  ]
}
