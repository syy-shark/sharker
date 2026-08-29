/**
 * 官方上下文压缩过程文案（对标 Codex 桌面 contextCompaction）。
 * 自动压缩进行中 Automatically compacting context，完成后 Context automatically compacted。
 * `/compact` 进行中 Compacting context。不发明 Optimized the conversation。
 * @see shared/ARCH.md
 */

export const COMPRESS_TOOL = 'compress'

/** 开轮自动压缩直播状态（对标 Codex Automatically compacting context） */
export const AUTO_COMPACT_LIVE_STATUS = 'Automatically compacting context'

/** `/compact` 直播状态（对标 Codex contextCompaction） */
export const COMPACT_LIVE_STATUS = 'Compacting context'

/** 自动压缩完成后的过程行（对标 Codex Context automatically compacted） */
export const AUTO_COMPACT_DONE_TITLE = 'Context automatically compacted'

/** `/compact` 完成后的过程行（对标 Codex ContextCompaction） */
export const COMPACT_DONE_TITLE = 'Context compacted'

const AUTO_LIVE_ALIASES = new Set([
  AUTO_COMPACT_LIVE_STATUS,
  '正在自动压缩上下文…'
])

const MANUAL_LIVE_ALIASES = new Set([COMPACT_LIVE_STATUS, '正在压缩上下文…'])

const AUTO_DONE_ALIASES = new Set([
  AUTO_COMPACT_DONE_TITLE,
  '压缩上下文'
])

export function isCompactActivityToolName(name: string | undefined): boolean {
  return name === COMPRESS_TOOL
}

export function isAutoCompactCopy(text: string | undefined): boolean {
  const value = String(text || '').trim()
  return AUTO_LIVE_ALIASES.has(value) || AUTO_DONE_ALIASES.has(value)
}

export function isManualCompactCopy(text: string | undefined): boolean {
  const value = String(text || '').trim()
  return MANUAL_LIVE_ALIASES.has(value) || value === COMPACT_DONE_TITLE
}

/** 直播头 / 过程行：自动与 `/compact` 分开，完成后不再用进行中文案 */
export function formatCompactActivity(
  liveContent?: string,
  status?: string
): string {
  if (status === 'active') {
    return isAutoCompactCopy(liveContent) ? AUTO_COMPACT_LIVE_STATUS : COMPACT_LIVE_STATUS
  }
  if (isManualCompactCopy(liveContent)) return COMPACT_DONE_TITLE
  return AUTO_COMPACT_DONE_TITLE
}
