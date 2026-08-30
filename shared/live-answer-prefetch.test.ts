import { describe, expect, it } from 'vitest'
import { peekChatMathHtml, renderChatMathHtml } from './chat-math'
import { peekChatImageSizeFromDataUrl, readCachedChatImageSize } from './chat-image'
import {
  collectClosedLiveChatImagesFromAnswer,
  collectClosedLiveChatMathFromAnswer,
  collectClosedLiveMermaidFromAnswer,
  prefetchLiveAnswerPaint
} from './live-answer-prefetch'
import { hasCachedFenceHighlight, highlightFenceLines } from './syntax-highlight'

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
    expect(prefetchLiveAnswerPaint(md)).toEqual({ fences: 1, math: 2, mermaid: 0, images: 0 })
    expect(hasCachedFenceHighlight('const ignore = "\\(x\\)"', 'ts')).toBe(true)
    expect(peekChatMathHtml('E=mc^2', false)).toBeTruthy()
    const paintedMath = renderChatMathHtml('E=mc^2', false)
    const paintedFence = highlightFenceLines('const ignore = "\\(x\\)"', 'ts')
    expect(prefetchLiveAnswerPaint(md)).toEqual({ fences: 1, math: 2, mermaid: 0, images: 0 })
    expect(renderChatMathHtml('E=mc^2', false)).toBe(paintedMath)
    expect(highlightFenceLines('const ignore = "\\(x\\)"', 'ts')).toBe(paintedFence)
    expect(collectClosedLiveChatMathFromAnswer('```ts\nconst x = "\\(E=mc^2\\)"\n```')).toEqual([])
    expect(collectClosedLiveMermaidFromAnswer('See\n```mermaid\ngraph TD\nA-->B\n```')).toEqual([
      'graph TD\nA-->B'
    ])
    expect(prefetchLiveAnswerPaint('See\n```mermaid\ngraph TD\nA-->B\n```')).toEqual({
      fences: 0,
      math: 0,
      mermaid: 1,
      images: 0
    })
    const png = `data:image/png;base64,${Buffer.from(
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x01, 0x40, 0x00, 0x00, 0x00, 0xc8
      ])
    ).toString('base64')}`
    const withImage = [
      `See ![shot](${png})`,
      '',
      '```ts',
      `const ignore = "![x](${png})"`,
      '```'
    ].join('\n')
    expect(collectClosedLiveChatImagesFromAnswer(withImage)).toEqual([png])
    expect(prefetchLiveAnswerPaint(withImage)).toEqual({
      fences: 1,
      math: 0,
      mermaid: 0,
      images: 1
    })
    expect(readCachedChatImageSize(png)).toEqual(peekChatImageSizeFromDataUrl(png))
  })
})
