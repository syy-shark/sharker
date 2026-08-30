/**
 * 对话写盘卡：官方 Edited basename / Edited N files（对标 Codex render_changes_block）。
 * 标题打开审查；展开列文件；同名只加最短可区分路径（对标 Codex #20700）。
 * 头栏与文件行可画 +N −M；正文加长或无 +/- 新工具不扫指纹、不重跑合计；有写盘仍立刻显示（对标 Codex Edited N files / #22860，不复制官方 #38695）。
 * 右键 Open / Open in Finder / Copy path。不发明回合 Undo / 自定义 Open with。
 * @see shared/ARCH.md
 */

import { formatEditedFilesHeader } from './edit-activity'
import {
  COPY_PATH_LABEL,
  OPEN_LABEL,
  revealInFolderLabel,
  type RevealFolderPlatform
} from './reveal-in-folder'

export type FilesChangedLineStats = { added: number; removed: number }

/** 头栏合计 + 按路径；数字没变就复用同一对象，避免直播 token 重挂卡 */
export type FilesChangedStatsView = {
  added: number
  removed: number
  byPath: Readonly<Record<string, FilesChangedLineStats>>
}

export const EMPTY_FILES_CHANGED_STATS: FilesChangedStatsView = {
  added: 0,
  removed: 0,
  byPath: {}
}

type FilesChangedStatSource = 'done' | 'preview'

type FilesChangedStatSegment = {
  fileDiff?: { path?: string; stats?: FilesChangedLineStats }
  fileDiffs?: Array<{ path?: string; stats?: FilesChangedLineStats }>
  editPreview?: Array<{ path?: string; stats?: FilesChangedLineStats }>
}

function normalizeFilesChangedPath(path: string): string {
  return String(path || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
}

function addFilesChangedStat(
  map: Map<string, FilesChangedLineStats & { source: FilesChangedStatSource }>,
  path: string,
  stats: FilesChangedLineStats | undefined,
  source: FilesChangedStatSource
): void {
  const norm = normalizeFilesChangedPath(path)
  if (!norm) return
  const added = Math.max(0, stats?.added ?? 0)
  const removed = Math.max(0, stats?.removed ?? 0)
  const existing = map.get(norm)
  if (existing) {
    if (source === 'preview' && existing.source === 'done') return
    if (source === 'done' && existing.source === 'preview') {
      map.set(norm, { added, removed, source })
      return
    }
    existing.added += added
    existing.removed += removed
    return
  }
  map.set(norm, { added, removed, source })
}

function sameFilesChangedByPath(
  left: Readonly<Record<string, FilesChangedLineStats>>,
  right: Readonly<Record<string, FilesChangedLineStats>>
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    const a = left[key]
    const b = right[key]
    if (!a || !b || a.added !== b.added || a.removed !== b.removed) return false
  }
  return true
}

/** 从本轮片段合计 +/-；同一路径预览被完成后的 diff 盖掉，多次完成则累加 */
export function filesChangedStatsFromSegments(
  segments: readonly FilesChangedStatSegment[] | null | undefined
): FilesChangedStatsView {
  const map = new Map<string, FilesChangedLineStats & { source: FilesChangedStatSource }>()
  for (const segment of segments ?? []) {
    if (segment.fileDiff) {
      addFilesChangedStat(map, segment.fileDiff.path ?? '', segment.fileDiff.stats, 'done')
    }
    for (const diff of segment.fileDiffs ?? []) {
      addFilesChangedStat(map, diff.path ?? '', diff.stats, 'done')
    }
    for (const preview of segment.editPreview ?? []) {
      addFilesChangedStat(map, preview.path ?? '', preview.stats, 'preview')
    }
  }
  if (map.size === 0) return EMPTY_FILES_CHANGED_STATS
  const byPath: Record<string, FilesChangedLineStats> = {}
  let added = 0
  let removed = 0
  for (const [path, stats] of map) {
    byPath[path] = { added: stats.added, removed: stats.removed }
    added += stats.added
    removed += stats.removed
  }
  return { added, removed, byPath }
}

let filesChangedHold: {
  view: FilesChangedStatsView
  identity: string
  segments: readonly FilesChangedStatSegment[] | null | undefined
} | null = null

function segmentHasFilesChangedStats(segment: FilesChangedStatSegment | undefined): boolean {
  if (!segment) return false
  if (segment.fileDiff) return true
  if (segment.fileDiffs && segment.fileDiffs.length > 0) return true
  return Boolean(segment.editPreview && segment.editPreview.length > 0)
}

/**
 * 前缀引用没变或只换成无 +/- 的桥接段、追加的工具也没有写盘 +/-：不必拼指纹。
 * 对标 Codex #22860：回答 token / 读工具不扫已改文件卡。
 * 有 fileDiff / fileDiffs / editPreview 仍立刻合计（不复制官方 #38695 回合结束才出 diff）。
 */
export function shouldSkipFilesChangedIdentity(input: {
  prevSegments: readonly FilesChangedStatSegment[] | null | undefined
  segments: readonly FilesChangedStatSegment[] | null | undefined
}): boolean {
  const prev = input.prevSegments
  const next = input.segments
  if (!prev || !next) return false
  if (prev === next) return true
  if (next.length < prev.length) return false
  for (let i = 0; i < prev.length; i++) {
    const before = prev[i]
    const after = next[i]
    if (before === after) continue
    if (segmentHasFilesChangedStats(before) || segmentHasFilesChangedStats(after)) return false
  }
  for (let i = prev.length; i < next.length; i++) {
    if (segmentHasFilesChangedStats(next[i])) return false
  }
  return true
}

/** 只盯写盘 +/-；正文加长不进指纹，避免每枚 token 重合计 */
export function liveFilesChangedIdentity(
  segments: readonly FilesChangedStatSegment[] | null | undefined
): string {
  let out = ''
  for (const segment of segments ?? []) {
    if (segment.fileDiff) {
      const diff = segment.fileDiff
      out += `d:${diff.path ?? ''}:${diff.stats?.added ?? 0}:${diff.stats?.removed ?? 0};`
    }
    for (const diff of segment.fileDiffs ?? []) {
      out += `f:${diff.path ?? ''}:${diff.stats?.added ?? 0}:${diff.stats?.removed ?? 0};`
    }
    for (const preview of segment.editPreview ?? []) {
      out += `p:${preview.path ?? ''}:${preview.stats?.added ?? 0}:${preview.stats?.removed ?? 0};`
    }
  }
  return out
}

/** 写盘指纹没变则复用上一帧 +/-（对标 Codex #22860） */
export function shouldReuseFilesChangedStats(input: {
  prev: FilesChangedStatsView | null
  identity: string
  prevIdentity: string
}): boolean {
  return Boolean(input.prev && input.identity && input.identity === input.prevIdentity)
}

/** 数字没变退回 prev，直播 token / 心跳不换卡上的 +/- 对象 */
export function nextFilesChangedStats(
  prev: FilesChangedStatsView | null,
  segments: readonly FilesChangedStatSegment[] | null | undefined
): FilesChangedStatsView {
  if (prev && filesChangedHold?.view === prev && filesChangedHold.segments === segments) {
    return prev
  }
  if (
    prev &&
    filesChangedHold?.view === prev &&
    shouldSkipFilesChangedIdentity({
      prevSegments: filesChangedHold.segments,
      segments
    })
  ) {
    filesChangedHold = {
      view: prev,
      identity: filesChangedHold.identity,
      segments
    }
    return prev
  }
  const identity = liveFilesChangedIdentity(segments)
  if (
    prev &&
    filesChangedHold?.view === prev &&
    shouldReuseFilesChangedStats({
      prev,
      identity,
      prevIdentity: filesChangedHold.identity
    })
  ) {
    filesChangedHold = { view: prev, identity, segments }
    return prev
  }
  const next = filesChangedStatsFromSegments(segments)
  const view =
    prev &&
    prev.added === next.added &&
    prev.removed === next.removed &&
    sameFilesChangedByPath(prev.byPath, next.byPath)
      ? prev
      : next
  filesChangedHold = { view, identity, segments }
  return view
}

/** 卡头：单文件 Edited basename，多文件 Edited N files（对标 Codex render_changes_block） */
export function formatFilesChangedHeader(paths: readonly string[]): string {
  const list = filesChangedDisplayPaths(paths)
  if (list.length === 1) {
    return `Edited ${filesChangedDisplayLabel(list[0]!, list)}`
  }
  return formatEditedFilesHeader(list.length)
}

/** 与审查合计同一套 `+N −M`；两边都是 0 则空串 */
export function formatFilesChangedLineStats(added: number, removed: number): string {
  if (!added && !removed) return ''
  return `+${Math.max(0, added)} −${Math.max(0, removed)}`
}

/** 展开行查找该路径的 +/-（兼容斜杠） */
export function filesChangedStatsForPath(
  path: string,
  byPath: Readonly<Record<string, FilesChangedLineStats>> | undefined
): FilesChangedLineStats | undefined {
  if (!byPath) return undefined
  const direct = byPath[path]
  if (direct) return direct
  return byPath[normalizeFilesChangedPath(path)]
}

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
    { action: 'open', title: OPEN_LABEL },
    { action: 'reveal', title: revealInFolderLabel(platform) },
    { action: 'copy', title: COPY_PATH_LABEL }
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

const DOCUMENT_EXT = new Set(['md', 'mdx', 'txt', 'rst', 'pdf', 'doc', 'docx', 'html', 'htm'])
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
