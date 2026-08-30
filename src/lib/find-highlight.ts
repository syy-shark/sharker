/**
 * 对话查找当前命中与划选回跳段落：用独立 CSS Highlight 标可见文本，不改 React 树。
 * 查找用 `sharker-find`，Add to chat 回跳用 `sharker-selection`（对标 Codex #41391），互不覆盖。
 * @see src/lib/ARCH.md
 */
import { findFlattenedExcerptRange } from '../../shared/selected-text-preview'
import { findAllOccurrences, locateFlatRange } from '../../shared/thread-search'

const FIND_HIGHLIGHT = 'sharker-find'

/** Add to chat 回跳段落用的 CSS Highlight 名（不对查找高亮动手） */
export const SELECTION_HIGHLIGHT = 'sharker-selection'

type HighlightStore = {
  delete: (name: string) => void
  set: (name: string, highlight: Highlight) => void
}

function highlightStore(): HighlightStore | null {
  const css = window.CSS as typeof CSS & { highlights?: HighlightStore }
  return css.highlights ?? null
}

/** 关掉当前查找高亮 */
export function clearFindHighlight(): void {
  highlightStore()?.delete(FIND_HIGHLIGHT)
}

/** 关掉划选回跳段落高亮 */
export function clearSelectionHighlight(): void {
  highlightStore()?.delete(SELECTION_HIGHLIGHT)
}

/** 只扫气泡正文，避开直播过程区（每 token 重绘时少走一棵大树） */
export const FIND_HIGHLIGHT_SCOPE = '.message-body--assistant, .message-bubble--user'

function collectScopeTextNodes(root: Element): { nodes: Text[]; flat: string } {
  const scope = root.querySelector(FIND_HIGHLIGHT_SCOPE) ?? root
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let flat = ''
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text) || !node.data) continue
    nodes.push(node)
    flat += node.data
  }
  return { nodes, flat }
}

function rangeFromFlatOffsets(nodes: Text[], start: number, end: number): Range | null {
  const loc = locateFlatRange(
    nodes.map((node) => node.data.length),
    start,
    end
  )
  if (!loc) return null
  const range = document.createRange()
  range.setStart(nodes[loc.startIndex]!, loc.startOffset)
  range.setEnd(nodes[loc.endIndex]!, loc.endOffset)
  return range
}

/** 在消息根节点里标第 occurrence 处可见命中 */
export function paintFindHighlight(root: Element, query: string, occurrence: number): void {
  const store = highlightStore()
  if (!store) return
  const { nodes, flat } = collectScopeTextNodes(root)
  const occ = findAllOccurrences(flat, query)[occurrence]
  if (!occ) {
    store.delete(FIND_HIGHLIGHT)
    return
  }
  const range = rangeFromFlatOffsets(nodes, occ.start, occ.end)
  if (!range) {
    store.delete(FIND_HIGHLIGHT)
    return
  }
  store.set(FIND_HIGHLIGHT, new Highlight(range))
}

/**
 * 在消息根节点里标划选摘录对应的可见段落（对标 Codex #41391）。
 * 无 CSS Highlight 时仍返回 Range，给对话柱滚到段落；对不上则 null，调用方退回整行。
 */
export function paintSelectionHighlight(root: Element, excerpt: string): Range | null {
  const { nodes, flat } = collectScopeTextNodes(root)
  const span = findFlattenedExcerptRange(flat, excerpt)
  if (!span) return null
  const range = rangeFromFlatOffsets(nodes, span.start, span.end)
  if (!range) return null
  const store = highlightStore()
  if (store) store.set(SELECTION_HIGHLIGHT, new Highlight(range))
  return range
}
