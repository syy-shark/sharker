/**
 * 审查面板文件名 / 行背景点击（对标 Codex Review pane）。
 * 文件名走 `file_opener`（none 为应用内预览）；行背景展开或收起 diff。
 * ⌘/Ctrl+单击 diff 行跳到该行（官方 Clicking a single line while holding Cmd pressed…）。右键含打开预览、Open in Finder、展开 diff。
 * @see shared/ARCH.md
 */

import { revealInFolderLabel, type RevealFolderPlatform } from './reveal-in-folder'

export type ReviewFileClickTarget = 'name' | 'background'

export type ReviewFileClickIntent = 'open' | 'toggle'

export type ReviewFileMenuAction = 'open' | 'reveal' | 'toggle'

/** Official review pane Cmd+click (learn.chatgpt.com/docs/code-review). */
export const REVIEW_CMD_CLICK_LINE_HINT =
  'Clicking a single line while holding Cmd pressed opens the line in your chosen editor.'
/** Official review pane file-name click (learn.chatgpt.com/docs/code-review). */
export const REVIEW_FILE_NAME_OPENS_HINT =
  'Clicking a file name typically opens that file in your chosen editor. You can choose the default editor in developer settings.'

/** 审查文件树右键菜单（对标 Codex review Open in Finder / open menu） */
export function reviewFileMenuItems(
  expanded: boolean,
  platform: RevealFolderPlatform = 'linux'
): Array<{ action: ReviewFileMenuAction; title: string }> {
  return [
    { action: 'open', title: '打开预览' },
    { action: 'reveal', title: revealInFolderLabel(platform) },
    { action: 'toggle', title: expanded ? '收起 diff' : '展开 diff' }
  ]
}

export function clampReviewMenuPosition(
  x: number,
  y: number,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  pad = 8
): { x: number; y: number } {
  const width = Math.max(0, menu.width)
  const height = Math.max(0, menu.height)
  const vw = Math.max(0, viewport.width)
  const vh = Math.max(0, viewport.height)
  return {
    x: Math.min(Math.max(pad, x), Math.max(pad, vw - width - pad)),
    y: Math.min(Math.max(pad, y), Math.max(pad, vh - height - pad))
  }
}

/** 点文件名打开预览；点行背景展开/收起 */
export function resolveReviewFileClick(target: ReviewFileClickTarget): ReviewFileClickIntent {
  return target === 'name' ? 'open' : 'toggle'
}

/** 从点击目标判断是文件名还是行背景 */
export function reviewFileClickTargetFromElement(el: EventTarget | null): ReviewFileClickTarget {
  if (typeof Element !== 'undefined' && el instanceof Element && el.closest('[data-review-file-name]')) {
    return 'name'
  }
  return 'background'
}

/** ⌘/Ctrl+单击行打开该行（Shift/Alt 不抢） */
export function shouldOpenReviewLine(options: {
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}): boolean {
  if (options.altKey || options.shiftKey) return false
  return Boolean(options.metaKey || options.ctrlKey)
}
