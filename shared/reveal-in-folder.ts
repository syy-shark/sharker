/**
 * 在系统文件管理器中显示路径（对标 Codex Open in Finder / Explorer / File Manager）。
 * 线程菜单打开项目目录；审查右键揭示文件。不接自定义 Open with handler。
 * @see shared/ARCH.md
 */

import { resolveConversationPath } from './conversation'

/** 官方桌面按平台换文案 */
export type RevealFolderPlatform = 'darwin' | 'win32' | string

/** 官方 macOS Finder / Windows Explorer / Linux File Manager */
export function revealInFolderLabel(platform: RevealFolderPlatform = 'linux'): string {
  if (platform === 'darwin') return '在访达中显示'
  if (platform === 'win32') return '在资源管理器中显示'
  return '在文件管理器中显示'
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

/** 顶栏 Copy 子菜单（对标 Codex threadHeader Copy：cwd / session / deeplink / Markdown） */
export function threadCopyMenuItems(): Array<{ action: ThreadCopyAction; title: string }> {
  return [
    { action: 'copy-cwd', title: '复制工作目录' },
    { action: 'copy-session', title: '复制会话 ID' },
    { action: 'copy-deeplink', title: '复制对话深链' },
    { action: 'copy-markdown', title: '复制为 Markdown' }
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
    { action: 'copy-markdown', title: '复制为 Markdown' },
    { action: 'rename', title: '重命名' },
    { action: 'pin', title: input.pinned ? '取消置顶' : '置顶' },
    { action: 'archive', title: '归档' }
  ]
}
