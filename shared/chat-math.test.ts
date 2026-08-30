import { describe, expect, it } from 'vitest'
import {
  CHAT_MATH_MAX_TEX,
  chatMathSource,
  collectClosedChatMath,
  liveChatMathClassName,
  readChatMath,
  renderChatMathHtml,
  shouldRenderLiveChatMath
} from './chat-math'

describe('chat-math', () => {
  it('reads official delimiters, skips $...$, and falls back on bad TeX', () => {
    expect(readChatMath('If \\(E=mc^2\\) end', 3)).toEqual({
      tex: 'E=mc^2',
      display: false,
      fence: 'paren',
      end: 13
    })
    expect(readChatMath('$$a+b$$', 0)).toEqual({
      tex: 'a+b',
      display: true,
      fence: '$$',
      end: 7
    })
    expect(readChatMath('\\[x\\]', 0)?.fence).toBe('square')
    expect(readChatMath('$x$', 0)).toBeNull()
    expect(readChatMath('\\(open', 0)).toBeNull()
    expect(readChatMath('$$' + 'x'.repeat(CHAT_MATH_MAX_TEX + 1) + '$$', 0)).toBeNull()
    expect(chatMathSource('n^2', 'paren')).toBe('\\(n^2\\)')
    const html = renderChatMathHtml('E=mc^2', false)
    expect(html).toContain('katex')
    expect(html).not.toContain('<script>')
    expect(renderChatMathHtml('E=mc^2', false)).toBe(html)
    expect(renderChatMathHtml('\\bad{', false)).toBeNull()
  })

  it('defers KaTeX until the live stream is idle', () => {
    expect(shouldRenderLiveChatMath({ streaming: true })).toBe(false)
    expect(shouldRenderLiveChatMath({ streaming: false })).toBe(true)
    expect(shouldRenderLiveChatMath({})).toBe(true)
    expect(liveChatMathClassName({ display: true, raw: true })).toBe(
      'chat-math chat-math--raw chat-math--display'
    )
    expect(liveChatMathClassName({ display: true })).toBe('chat-math chat-math--display')
    expect(liveChatMathClassName({ raw: true })).toBe('chat-math chat-math--raw')
    expect(collectClosedChatMath('If \\(E=mc^2\\) and $$a+b$$.').map((hit) => hit.tex)).toEqual([
      'E=mc^2',
      'a+b'
    ])
    expect(collectClosedChatMath('$x$')).toEqual([])
  })
})
