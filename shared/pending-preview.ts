/**
 * 输入框上方注入/排队预览截断（对标 Codex #39864 pending input wrapping）。
 * 长文只画前几行，避免预览把对话柱挤矮、直播贴底跟着抖（#40788）。
 * @see shared/ARCH.md
 */

/** 预览最多行数：再长进编辑框看 */
export const PENDING_PREVIEW_MAX_LINES = 3

/** 单行超长也不做全程折行测量 */
export const PENDING_PREVIEW_MAX_CHARS = 240

/** 归一 CRLF 后按行/字数截断，末尾加省略号 */
export function clampPendingInputPreview(
  text: string,
  maxLines = PENDING_PREVIEW_MAX_LINES,
  maxChars = PENDING_PREVIEW_MAX_CHARS
): string {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const clippedLines = lines.slice(0, Math.max(1, maxLines))
  let out = clippedLines.join('\n')
  const overflowLines = lines.length > clippedLines.length
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars).trimEnd()}…`
    return out
  }
  if (overflowLines) return `${out.trimEnd()}…`
  return out
}

/** 原文是否会被预览截掉（给 title / aria 用全文） */
export function pendingPreviewNeedsClamp(
  text: string,
  maxLines = PENDING_PREVIEW_MAX_LINES,
  maxChars = PENDING_PREVIEW_MAX_CHARS
): boolean {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n')
  if (normalized.split('\n').length > maxLines) return true
  return normalized.length > maxChars
}
