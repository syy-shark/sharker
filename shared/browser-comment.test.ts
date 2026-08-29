import { describe, expect, it } from 'vitest'
import {
  BROWSER_COMMENT_PREFIX,
  browserCommentAnnotateScript,
  browserCommentSetScript,
  canAnnotateBrowserUrl,
  formatBrowserCommentExcerpt,
  parseBrowserCommentMessage,
  placeBrowserCommentPopover
} from './browser-comment'

describe('browser comment', () => {
  it('formats page comments for composer chips and ignores start pages', () => {
    expect(canAnnotateBrowserUrl('https://localhost:3000/pricing')).toBe(true)
    expect(canAnnotateBrowserUrl('http://127.0.0.1:5173/')).toBe(true)
    expect(canAnnotateBrowserUrl('file:///tmp/preview.html')).toBe(true)
    expect(canAnnotateBrowserUrl('data:text/html,hi')).toBe(false)
    expect(canAnnotateBrowserUrl('about:blank')).toBe(false)
    expect(canAnnotateBrowserUrl('')).toBe(false)
    const element = {
      kind: 'element' as const,
      url: 'http://localhost:3000/pricing',
      selector: 'button.cta',
      text: 'Buy now',
      rect: { x: 40, y: 80, width: 120, height: 36 },
      viewport: { width: 800, height: 600 }
    }
    expect(formatBrowserCommentExcerpt(element)).toBe(
      ['Buy now', 'button.cta', 'http://localhost:3000/pricing'].join('\n')
    )
    expect(
      formatBrowserCommentExcerpt({
        ...element,
        kind: 'area',
        selector: '',
        text: ''
      })
    ).toBe(['Area 40,80 120×36', 'http://localhost:3000/pricing'].join('\n'))
    expect(parseBrowserCommentMessage('plain')).toBeNull()
    expect(parseBrowserCommentMessage(`${BROWSER_COMMENT_PREFIX}{"type":"cancel"}`)).toBe('cancel')
    expect(
      parseBrowserCommentMessage(
        `${BROWSER_COMMENT_PREFIX}${JSON.stringify({
          type: 'pick',
          kind: 'element',
          url: 'https://example.com',
          selector: '#ok',
          text: '  Save  ',
          rect: { x: 1, y: 2, width: 3, height: 4 },
          viewport: { width: 100, height: 50 }
        })}`
      )
    ).toEqual({
      kind: 'element',
      url: 'https://example.com',
      selector: '#ok',
      text: 'Save',
      rect: { x: 1, y: 2, width: 3, height: 4 },
      viewport: { width: 100, height: 50 }
    })
    expect(placeBrowserCommentPopover(element.rect, element.viewport, { width: 400, height: 300 })).toEqual({
      top: 66,
      left: 20
    })
    expect(browserCommentAnnotateScript()).toContain(BROWSER_COMMENT_PREFIX)
    expect(browserCommentSetScript(true)).toContain('set(true)')
    expect(browserCommentSetScript(false)).toContain('set(false)')
  })
})
