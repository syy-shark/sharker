/**
 * 审查 diff 内查找：跨文件命中、划选预填、焦点决定走审查还是对话查找。
 * 对标 Codex changelog：Cmd/Ctrl+F starts with current text selection（reviews and diffs）；
 * long review files next/previous jump to off-screen matches；preserved search state。
 * @see shared/ARCH.md
 */
import type { FileDiff } from './types'
import { findAllOccurrences } from './thread-search'

export interface ReviewDiffFile {
  fileKey: string
  filePath: string
  diff: FileDiff | undefined
}

export interface ReviewDiffMatch {
  fileKey: string
  filePath: string
  lineIndex: number
  start: number
  end: number
}

export interface FindHighlightPart {
  text: string
  hit: boolean
  start: number
}

/** 官方：审查面板（含查找框）聚焦时 ⌘F / ⌘G 搜 diff；输入框 / 对话柱仍走线程查找。 */
export function shouldHandleReviewFindShortcut(opts: { focusInsideReview: boolean }): boolean {
  return Boolean(opts.focusInsideReview)
}

export function isReviewFindFocus(node: EventTarget | null): boolean {
  if (!node || typeof Element === 'undefined') return false
  const el = node instanceof Element ? node : null
  return Boolean(el?.closest?.('.changes-panel'))
}

export function findInReviewDiffs(files: ReviewDiffFile[], query: string): ReviewDiffMatch[] {
  const q = query.trim()
  if (!q) return []
  const out: ReviewDiffMatch[] = []
  for (const file of files) {
    const lines = file.diff?.lines
    if (!lines?.length) continue
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const text = lines[lineIndex]?.content ?? ''
      if (!text) continue
      for (const hit of findAllOccurrences(text, q)) {
        out.push({
          fileKey: file.fileKey,
          filePath: file.filePath,
          lineIndex,
          start: hit.start,
          end: hit.end
        })
      }
    }
  }
  return out
}

export function wrapFindIndex(index: number, total: number, delta: number): number {
  if (total <= 0) return 0
  return (index + delta + total * 8) % total
}

export function splitFindHighlights(text: string, query: string): FindHighlightPart[] {
  const raw = String(text ?? '')
  const hits = findAllOccurrences(raw, query)
  if (!hits.length) return [{ text: raw, hit: false, start: 0 }]
  const parts: FindHighlightPart[] = []
  let cursor = 0
  for (const hit of hits) {
    if (hit.start > cursor) {
      parts.push({ text: raw.slice(cursor, hit.start), hit: false, start: cursor })
    }
    parts.push({ text: raw.slice(hit.start, hit.end), hit: true, start: hit.start })
    cursor = hit.end
  }
  if (cursor < raw.length) {
    parts.push({ text: raw.slice(cursor), hit: false, start: cursor })
  }
  return parts
}

export function sameReviewFindMatch(
  a: Pick<ReviewDiffMatch, 'fileKey' | 'lineIndex' | 'start'> | null | undefined,
  b: Pick<ReviewDiffMatch, 'fileKey' | 'lineIndex' | 'start'> | null | undefined
): boolean {
  if (!a || !b) return false
  return a.fileKey === b.fileKey && a.lineIndex === b.lineIndex && a.start === b.start
}
