import { describe, expect, it } from 'vitest'
import {
  CHAT_MATH_MAX_TEX,
  chatMathSource,
  readChatMath,
  renderChatMathHtml
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
})
