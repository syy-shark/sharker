/**
 * 审查面板文件名 / 行背景点击（对标 Codex Review pane）。
 * 文件名打开右侧预览（本机没有「默认编辑器」钩子）；行背景展开或收起 diff。
 * ⌘/Ctrl+单击 diff 行跳到该行预览。
 * @see shared/ARCH.md
 */

export type ReviewFileClickTarget = 'name' | 'background'

export type ReviewFileClickIntent = 'open' | 'toggle'

/** 点文件名打开预览；点行背景展开/收起 */
export function resolveReviewFileClick(target: ReviewFileClickTarget): ReviewFileClickIntent {
  return target === 'name' ? 'open' : 'toggle'
}

/** 从点击目标判断是文件名还是行背景 */
export function reviewFileClickTargetFromElement(el: EventTarget | null): ReviewFileClickTarget {
  if (el instanceof Element && el.closest('[data-review-file-name]')) return 'name'
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
