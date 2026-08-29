/**
 * 对话里「已改 N 个文件」卡（对标 Codex Files changed card / N files edited）。
 * 标题打开审查；展开列出路径；文件名打开；右键打开或在访达中显示。
 * 不发明回合 Undo / 自定义 Open with。
 * @see shared/ARCH.md
 */

import { revealInFolderLabel, type RevealFolderPlatform } from './reveal-in-folder'

export type FilesChangedHeaderTarget = 'review' | 'toggle'

export type FilesChangedFileMenuAction = 'open' | 'reveal'

/** 点标题打开审查；点展开钮只列文件 */
export function filesChangedHeaderTargetFromElement(
  el: EventTarget | null
): FilesChangedHeaderTarget {
  if (
    typeof Element !== 'undefined' &&
    el instanceof Element &&
    el.closest('[data-files-changed-toggle]')
  ) {
    return 'toggle'
  }
  return 'review'
}

/** 文件行右键（对标 Codex Files changed Open in Finder） */
export function filesChangedFileMenuItems(
  platform: RevealFolderPlatform = 'linux'
): Array<{ action: FilesChangedFileMenuAction; title: string }> {
  return [
    { action: 'open', title: '打开预览' },
    { action: 'reveal', title: revealInFolderLabel(platform) }
  ]
}

/** 列表里显示的相对路径；空串丢掉 */
export function filesChangedDisplayPaths(files: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of files) {
    const path = String(raw || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/')
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}
