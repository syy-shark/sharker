import { describe, expect, it } from 'vitest'
import { renderChatMathHtml } from './chat-math'
import {
  collectClosedLiveChatMathFromAnswer,
  collectClosedLiveMermaidFromAnswer,
  prefetchLiveAnswerPaint
} from './live-answer-prefetch'
import { highlightFenceLines } from './syntax-highlight'

describe('live-answer-prefetch', () => {
  it('warms fence and math caches and skips math inside code fences', () => {
    const md = [
      'Energy is \\(E=mc^2\\).',
      '',
      '```ts',
      'const ignore = "\\(x\\)"',
      '```',
      '',
      'Also $$a+b$$.'
    ].join('\n')

    expect(collectClosedLiveChatMathFromAnswer(md).map((hit) => hit.tex)).toEqual([
      'E=mc^2',
      'a+b'
    ])
    expect(prefetchLiveAnswerPaint(md)).toEqual({ fences: 1, math: 2, mermaid: 0 })
    const paintedMath = renderChatMathHtml('E=mc^2', false)
    const paintedFence = highlightFenceLines('const ignore = "\\(x\\)"', 'ts')
    expect(prefetchLiveAnswerPaint(md)).toEqual({ fences: 1, math: 2, mermaid: 0 })
    expect(renderChatMathHtml('E=mc^2', false)).toBe(paintedMath)
    expect(highlightFenceLines('const ignore = "\\(x\\)"', 'ts')).toBe(paintedFence)
    expect(collectClosedLiveChatMathFromAnswer('```ts\nconst x = "\\(E=mc^2\\)"\n```')).toEqual([])
    expect(collectClosedLiveMermaidFromAnswer('See\n```mermaid\ngraph TD\nA-->B\n```')).toEqual([
      'graph TD\nA-->B'
    ])
    expect(prefetchLiveAnswerPaint('See\n```mermaid\ngraph TD\nA-->B\n```')).toEqual({
      fences: 0,
      math: 0,
      mermaid: 1
    })
  })
})
