/**
 * 收束后预热直播回答里的围栏着色、KaTeX 缓存、图片尺寸，并开工 mermaid 模块与 SVG 成图。
 * microtask 排在 done 栈之后、React 收束帧之前，立刻跟进的下一轮不必当场跑 highlight.js / katex /
 * import('mermaid') / mermaid.render / 图片解码；同一直播实例命中缓存则收束帧直接着色 / 成图 / 占位。
 * @see shared/ARCH.md
 */
import { prefetchChatImageSizes } from './chat-image'
import { collectClosedChatMath, renderChatMathHtml } from './chat-math'
import { isMermaidLang, prefetchMermaidSvgs } from './mermaid-fence'
import {
  collectLinkDefinitions,
  finalizeStreamingMarkdownSplit,
  parseCheapInlineMarkdown,
  splitStreamingMarkdown,
  streamingRenderSlots,
  type CheapInlineNode
} from './streaming-markdown'
import { prefetchLiveFenceHighlights } from './syntax-highlight'

/** 只扫散文槽里的闭合公式，不吃代码围栏。 */
export function collectClosedLiveChatMathFromAnswer(
  text: string
): Array<{ tex: string; display: boolean }> {
  const src = String(text ?? '')
  if (!src.trim()) return []
  const split = finalizeStreamingMarkdownSplit(splitStreamingMarkdown(src))
  const hits: Array<{ tex: string; display: boolean }> = []
  for (const slot of streamingRenderSlots(split)) {
    if (slot.kind !== 'prose') continue
    for (const hit of collectClosedChatMath(slot.text)) {
      hits.push({ tex: hit.tex, display: hit.display })
    }
  }
  return hits
}

/** 从廉价行内树收图片 dest，嵌套强调 / 链接里的图也算。 */
function walkCheapInlineImages(
  nodes: readonly CheapInlineNode[],
  hrefs: string[],
  seen: Set<string>
): void {
  for (const node of nodes) {
    if (node.type === 'image') {
      const href = String(node.href ?? '').trim()
      if (href && !seen.has(href)) {
        seen.add(href)
        hrefs.push(href)
      }
    }
    if ('children' in node && node.children?.length) {
      walkCheapInlineImages(node.children, hrefs, seen)
    }
  }
}

/** 只扫散文槽里的图片 dest，不吃代码围栏。 */
export function collectClosedLiveChatImagesFromAnswer(text: string): string[] {
  const src = String(text ?? '')
  if (!src.trim()) return []
  const split = finalizeStreamingMarkdownSplit(splitStreamingMarkdown(src))
  const defs = collectLinkDefinitions(src)
  const hrefs: string[] = []
  const seen = new Set<string>()
  for (const slot of streamingRenderSlots(split)) {
    if (slot.kind !== 'prose') continue
    walkCheapInlineImages(parseCheapInlineMarkdown(slot.text, defs, false), hrefs, seen)
  }
  return hrefs
}

/** 只收已闭合 mermaid / mmd 源码，给模块与 SVG 预取计数。 */
export function collectClosedLiveMermaidFromAnswer(text: string): string[] {
  const src = String(text ?? '')
  if (!src.trim()) return []
  const split = finalizeStreamingMarkdownSplit(splitStreamingMarkdown(src))
  const sources: string[] = []
  for (const slot of streamingRenderSlots(split)) {
    if (slot.kind !== 'fence' || !slot.closed) continue
    if (!isMermaidLang(slot.lang)) continue
    sources.push(slot.body.replace(/\n$/, ''))
  }
  return sources
}

/** 把收束正文里的闭合围栏、公式与图片尺寸写入缓存，并开工 mermaid 模块与 SVG 成图。 */
export function prefetchLiveAnswerPaint(text: string): {
  fences: number
  math: number
  mermaid: number
  images: number
} {
  const src = String(text ?? '')
  if (!src.trim()) return { fences: 0, math: 0, mermaid: 0, images: 0 }
  const fences = prefetchLiveFenceHighlights(src)
  let math = 0
  for (const hit of collectClosedLiveChatMathFromAnswer(src)) {
    renderChatMathHtml(hit.tex, hit.display)
    math += 1
  }
  const mermaid = collectClosedLiveMermaidFromAnswer(src)
  if (mermaid.length) prefetchMermaidSvgs(mermaid)
  const images = collectClosedLiveChatImagesFromAnswer(src)
  if (images.length) prefetchChatImageSizes(images)
  return { fences, math, mermaid: mermaid.length, images: images.length }
}

/** 收束栈走完再暖缓存，排在 React 重挂历史行之前。 */
export function schedulePrefetchLiveAnswerPaint(text: string): void {
  const src = String(text ?? '')
  if (!src.trim()) return
  queueMicrotask(() => {
    prefetchLiveAnswerPaint(src)
  })
}
