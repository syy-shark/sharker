import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_MODE_LABEL,
  BROWSER_COMMENTS_INTRO,
  BROWSER_COMMENT_PREFIX,
  BROWSER_CLICK_OR_DRAG_HINT,
  BROWSER_NAME_PROBLEM_HINT,
  BROWSER_WRITE_SAVE_HINT,
  browserCommentAnnotateScript,
  browserCommentSetScript,
  canAnnotateBrowserUrl,
  formatBrowserCommentExcerpt,
  isBrowserAnnotateToggleChord,
  parseBrowserCommentMessage,
  placeBrowserCommentPopover,
  browserCommentPickKind,
  shouldSubmitBrowserCommentImmediately,
  shouldToggleBrowserAnnotate
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
    expect(isBrowserAnnotateToggleChord({ key: '.', metaKey: true })).toBe(true)
    expect(isBrowserAnnotateToggleChord({ key: '.', ctrlKey: true })).toBe(true)
    expect(isBrowserAnnotateToggleChord({ key: '.', metaKey: true, shiftKey: true })).toBe(false)
    expect(isBrowserAnnotateToggleChord({ key: '.', metaKey: true, isComposing: true })).toBe(false)
    expect(isBrowserAnnotateToggleChord({ key: 'l', metaKey: true })).toBe(false)
    expect(shouldToggleBrowserAnnotate('https://localhost:3000', false)).toBe(true)
    expect(shouldToggleBrowserAnnotate('about:blank', false)).toBe(false)
    expect(shouldToggleBrowserAnnotate('about:blank', true)).toBe(true)
    expect(browserCommentPickKind({}, false)).toBe('element')
    expect(browserCommentPickKind({ shiftKey: true }, false)).toBe('area')
    expect(browserCommentPickKind({}, true)).toBe('area')
    expect(shouldSubmitBrowserCommentImmediately({ metaKey: true })).toBe(true)
    expect(shouldSubmitBrowserCommentImmediately({ ctrlKey: true })).toBe(true)
    expect(shouldSubmitBrowserCommentImmediately({})).toBe(false)
    expect(
      parseBrowserCommentMessage(
        `${BROWSER_COMMENT_PREFIX}${JSON.stringify({
          type: 'pick',
          kind: 'element',
          url: 'https://example.com',
          selector: '#ok',
          text: 'Save',
          immediate: true,
          rect: { x: 1, y: 2, width: 3, height: 4 },
          viewport: { width: 100, height: 50 }
        })}`
      )
    ).toMatchObject({ immediate: true, selector: '#ok' })
    const script = browserCommentAnnotateScript()
    expect(script).toContain('shiftKey')
    expect(script).toContain('immediate')
    const browserSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/EmbeddedBrowser.tsx'),
      'utf8'
    )
    expect(browserSrc).toContain('isBrowserAnnotateToggleChord')
    expect(browserSrc).toContain('toggleAnnotate')
    expect(browserSrc).toContain('parsed.immediate')
    expect(ANNOTATION_MODE_LABEL).toBe('Annotation mode')
    expect(BROWSER_COMMENTS_INTRO).toMatch(/use browser comments to give ChatGPT precise feedback/)
    expect(BROWSER_WRITE_SAVE_HINT).toBe('Write and save your comment.')
    expect(BROWSER_NAME_PROBLEM_HINT).toMatch(/name the problem and the result you want/)
    expect(BROWSER_CLICK_OR_DRAG_HINT).toBe('Click an element, or drag to select an area.')
    expect(browserSrc).toContain('ANNOTATION_MODE_LABEL')
    expect(browserSrc).toContain('BROWSER_COMMENTS_INTRO')
    expect(browserSrc).toContain('BROWSER_WRITE_SAVE_HINT')
    expect(browserSrc).toContain('BROWSER_NAME_PROBLEM_HINT')
    expect(browserSrc).toContain('BROWSER_CLICK_OR_DRAG_HINT')
    expect(browserSrc).toContain('TOGGLE_BROWSER_BROWSE_OR_COMMENT_MODE_LABEL')
    expect(browserSrc).not.toContain('>批注<')
    expect(browserSrc).not.toContain('aria-label="批注页面"')
    expect(browserSrc).not.toContain('写出问题和期望结果')
    expect(browserSrc).not.toContain('@Browser')
  })
})
