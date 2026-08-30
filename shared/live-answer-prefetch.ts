/**
 * 收束后预热直播回答里的围栏着色与 KaTeX 缓存。
 * microtask 排在 done 栈之后、React 重挂历史行之前，立刻跟进的下一轮不必当场跑 highlight.js / katex。
 * @see shared/ARCH.md
 */
import { collectClosedChatMath, renderChatMathHtml } from './chat-math'
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

/** 把收束正文里的闭合围栏与公式写入缓存。 */
export function prefetchLiveAnswerPaint(text: string): { fences: number; math: number } {
  const src = String(text ?? '')
  if (!src.trim()) return { fences: 0, math: 0 }
  const fences = prefetchLiveFenceHighlights(src)
  let math = 0
  for (const hit of collectClosedLiveChatMathFromAnswer(src)) {
    renderChatMathHtml(hit.tex, hit.display)
    math += 1
  }
  return { fences, math }
}

/** 收束栈走完再暖缓存，排在 React 重挂历史行之前。 */
export function schedulePrefetchLiveAnswerPaint(text: string): void {
  const src = String(text ?? '')
  if (!src.trim()) return
  queueMicrotask(() => {
    prefetchLiveAnswerPaint(src)
  })
}
