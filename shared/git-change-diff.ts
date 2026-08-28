/**
 * 把 git 工作区文件的新旧文本收成 FileDiff，供右侧审查面板使用。
 * @see shared/ARCH.md
 */
import { buildFileDiff } from './line-diff'
import type { FileDiff } from './types'

/** 未跟踪 / 新增：整份新文件记为添加 */
export function isNewGitChange(status: string): boolean {
  const s = status.trim()
  return s === '??' || s === 'A' || s === 'AM' || s.endsWith('A')
}

/** 删除：工作区已无文件 */
export function isDeletedGitChange(status: string): boolean {
  return status.trim() === 'D' || status.trim().startsWith('D')
}

/**
 * 由 HEAD 文本与工作区文本构建审查用 diff。
 * `oldText === null` 表示新增或未跟踪。
 */
export function diffFromGitTexts(options: {
  path: string
  status: string
  oldText: string | null
  newText: string
}): FileDiff {
  if (isDeletedGitChange(options.status)) {
    return buildFileDiff(options.path, options.oldText ?? '', '')
  }
  if (options.oldText == null || isNewGitChange(options.status)) {
    return buildFileDiff(options.path, null, options.newText)
  }
  return buildFileDiff(options.path, options.oldText, options.newText)
}
