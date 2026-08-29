/**
 * 对话里「已改 N 个文件」卡（对标 Codex Files changed card / N files edited / artifact cards）。
 * 标题打开审查；展开列文件；同名只加最短可区分路径（对标 Codex #20700）。
 * 右键打开 / 揭示 / 复制路径。不发明回合 Undo / 自定义 Open with。
 * @see shared/ARCH.md
 */

import { revealInFolderLabel, type RevealFolderPlatform } from './reveal-in-folder'

export type FilesChangedHeaderTarget = 'review' | 'toggle'

export type FilesChangedFileMenuAction = 'open' | 'reveal' | 'copy'

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

/** 文件行右键（对标 Codex Files changed / artifact Open · Reveal · Copy path） */
export function filesChangedFileMenuItems(
  platform: RevealFolderPlatform = 'linux'
): Array<{ action: FilesChangedFileMenuAction; title: string }> {
  return [
    { action: 'open', title: '打开预览' },
    { action: 'reveal', title: revealInFolderLabel(platform) },
    { action: 'copy', title: '复制路径' }
  ]
}

/** 列表用的文件名；空路径丢掉 */
export function filesChangedBasename(path: string): string {
  const parts = String(path || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
  return parts[parts.length - 1] || String(path || '').trim()
}

/**
 * 官方 artifact 卡默认只画 basename；同名才加最短父路径（对标 Codex #20700）。
 * hover 仍用完整相对路径。
 */
export function filesChangedDisplayLabel(path: string, allPaths: readonly string[]): string {
  const norm = String(path || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
  const base = filesChangedBasename(norm)
  if (!base) return norm
  const siblings = allPaths
    .map((item) =>
      String(item || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
    )
    .filter((item) => item && filesChangedBasename(item) === base)
  if (siblings.length <= 1) return base
  const parts = norm.split('/').filter(Boolean)
  for (let take = 2; take <= parts.length; take++) {
    const label = parts.slice(-take).join('/')
    const clashes = siblings.filter((item) => {
      const other = item.split('/').filter(Boolean)
      return other.slice(-take).join('/') === label
    })
    if (clashes.length === 1) return label
  }
  return norm
}

const DOCUMENT_EXT = new Set(['md', 'mdx', 'txt', 'rst', 'pdf', 'doc', 'docx'])
const SPREADSHEET_EXT = new Set(['csv', 'tsv', 'xls', 'xlsx'])
const SLIDE_EXT = new Set(['ppt', 'pptx'])
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])

function filesChangedExt(path: string): string {
  const base = filesChangedBasename(path)
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** 官方 artifact 卡副标：Document · MD / Image · PNG；代码文件不画以免挤直播 */
export function filesChangedKindLabel(path: string): string {
  const ext = filesChangedExt(path)
  if (!ext) return ''
  const mark = ext.toUpperCase()
  if (IMAGE_EXT.has(ext)) return `Image · ${mark === 'JPEG' ? 'JPG' : mark}`
  if (DOCUMENT_EXT.has(ext)) return `Document · ${mark}`
  if (SPREADSHEET_EXT.has(ext)) return `Spreadsheet · ${mark}`
  if (SLIDE_EXT.has(ext)) return `Slides · ${mark}`
  return ''
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
