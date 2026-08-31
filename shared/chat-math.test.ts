import { describe, expect, it } from 'vitest'
import {
  CHAT_MATH_MAX_TEX,
  chatMathSource,
  collectClosedChatMath,
  liveChatMathClassName,
  peekChatMathHtml,
  readChatMath,
  renderChatMathHtml,
  resolveLiveChatMathHtml,
  liveChatMathPaintHtml,
  shouldDeferChatMathPaintJob,
  shouldRenderLiveChatMath,
  shouldStartChatMathPaintJob,
  shouldWarmLiveChatMath
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
    expect(shouldWarmLiveChatMath({ streaming: true, tex: 'E=mc^2' })).toBe(true)
    expect(shouldWarmLiveChatMath({ streaming: false, tex: 'E=mc^2' })).toBe(false)
    expect(shouldWarmLiveChatMath({ streaming: true, tex: '  ' })).toBe(false)
    expect(shouldWarmLiveChatMath({ streaming: true })).toBe(false)
    expect(shouldStartChatMathPaintJob({ paint: true, hasCachedHtml: true })).toBe(false)
    expect(shouldStartChatMathPaintJob({ paint: true, hasCachedHtml: false })).toBe(true)
    expect(shouldStartChatMathPaintJob({ paint: false, hasCachedHtml: false })).toBe(false)
    expect(shouldDeferChatMathPaintJob({ preferImmediate: false })).toBe(true)
    expect(shouldDeferChatMathPaintJob({ preferImmediate: true })).toBe(false)
    expect(shouldDeferChatMathPaintJob({})).toBe(false)
    expect(liveChatMathClassName({ display: true, raw: true })).toBe(
      'chat-math chat-math--raw chat-math--display'
    )
    expect(liveChatMathClassName({ display: true })).toBe('chat-math chat-math--display')
    expect(liveChatMathClassName({ raw: true })).toBe('chat-math chat-math--raw')
    expect(peekChatMathHtml('unique-live-math', false)).toBeUndefined()
    const cached = renderChatMathHtml('n^2', false)
    expect(peekChatMathHtml('n^2', false)).toBe(cached)
    expect(resolveLiveChatMathHtml({ streaming: true, html: cached, cached })).toBeNull()
    expect(resolveLiveChatMathHtml({ streaming: false, html: null, cached })).toBe(cached)
    expect(resolveLiveChatMathHtml({ streaming: false, html: null })).toBeNull()
    expect(liveChatMathPaintHtml(null, 'a <b>', 'paren')).toBe('\\(a &lt;b&gt;\\)')
    expect(liveChatMathPaintHtml('<span>k</span>', 'n^2', 'paren')).toBe('<span>k</span>')
    expect(collectClosedChatMath('If \\(E=mc^2\\) and $$a+b$$.').map((hit) => hit.tex)).toEqual([
      'E=mc^2',
      'a+b'
    ])
    expect(collectClosedChatMath('$x$')).toEqual([])
  })
})
