/**
 * 收束后预热直播回答里的围栏着色、KaTeX 缓存，并开工 mermaid 模块。
 * microtask 排在 done 栈之后、React 收束帧之前，立刻跟进的下一轮不必当场跑 highlight.js / katex / import('mermaid')；
 * 同一直播实例命中缓存则收束帧直接着色 / 成图，不必先闪纯文本。
 * @see shared/ARCH.md
 */
import { collectClosedChatMath, renderChatMathHtml } from './chat-math'
import { isMermaidLang, prefetchMermaidModule } from './mermaid-fence'
import {
  finalizeStreamingMarkdownSplit,
  splitStreamingMarkdown,
  streamingRenderSlots
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

/** 只收已闭合 mermaid / mmd 源码，给模块预取计数。 */
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

/** 把收束正文里的闭合围栏与公式写入缓存，并开工 mermaid 模块。 */
export function prefetchLiveAnswerPaint(text: string): {
  fences: number
  math: number
  mermaid: number
} {
  const src = String(text ?? '')
  if (!src.trim()) return { fences: 0, math: 0, mermaid: 0 }
  const fences = prefetchLiveFenceHighlights(src)
  let math = 0
  for (const hit of collectClosedLiveChatMathFromAnswer(src)) {
    renderChatMathHtml(hit.tex, hit.display)
    math += 1
  }
  const mermaid = collectClosedLiveMermaidFromAnswer(src)
  if (mermaid.length) prefetchMermaidModule()
  return { fences, math, mermaid: mermaid.length }
}

/** 收束栈走完再暖缓存，排在 React 重挂历史行之前。 */
export function schedulePrefetchLiveAnswerPaint(text: string): void {
  const src = String(text ?? '')
  if (!src.trim()) return
  queueMicrotask(() => {
    prefetchLiveAnswerPaint(src)
  })
}
