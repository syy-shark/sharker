/**
 * 对话查找当前命中：用 CSS Highlight 标可见文本，不改 React 树。
 * @see src/lib/ARCH.md
 */
import { findAllOccurrences, locateFlatRange } from '../../shared/thread-search'

const FIND_HIGHLIGHT = 'sharker-find'

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

/** 只扫气泡正文，避开直播过程区（每 token 重绘时少走一棵大树） */
export const FIND_HIGHLIGHT_SCOPE = '.message-body--assistant, .message-bubble--user'

/** 在消息根节点里标第 occurrence 处可见命中 */
export function paintFindHighlight(root: Element, query: string, occurrence: number): void {
  const store = highlightStore()
  if (!store) return
  const scope = root.querySelector(FIND_HIGHLIGHT_SCOPE) ?? root
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let flat = ''
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text) || !node.data) continue
    nodes.push(node)
    flat += node.data
  }
  const occ = findAllOccurrences(flat, query)[occurrence]
  if (!occ) {
    store.delete(FIND_HIGHLIGHT)
    return
  }
  const loc = locateFlatRange(
    nodes.map((node) => node.data.length),
    occ.start,
    occ.end
  )
  if (!loc) {
    store.delete(FIND_HIGHLIGHT)
    return
  }
  const range = document.createRange()
  range.setStart(nodes[loc.startIndex]!, loc.startOffset)
  range.setEnd(nodes[loc.endIndex]!, loc.endOffset)
  store.set(FIND_HIGHLIGHT, new Highlight(range))
}
