import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  chatLinkMenuItems,
  chatLinkOpensInSystemBrowser,
  findHttpLinksInText,
  isInAppBrowserChatHref,
  resolveChatLinkOpen
} from './chat-link'

describe('chat link open', () => {
  it('opens http(s) in the in-app browser unless the modifier click is held', () => {
    expect(isInAppBrowserChatHref('https://localhost:3000/pricing')).toBe(true)
    expect(isInAppBrowserChatHref('http://127.0.0.1:5173/')).toBe(true)
    expect(isInAppBrowserChatHref('mailto:hi@ex.com')).toBe(false)
    expect(isInAppBrowserChatHref('file:///tmp/a.html')).toBe(true)
    expect(isInAppBrowserChatHref('file:///tmp/a.html#ok')).toBe(true)
    expect(isInAppBrowserChatHref('file:///tmp/a.ts')).toBe(false)
    expect(isInAppBrowserChatHref('javascript:alert(1)')).toBe(false)
    expect(chatLinkOpensInSystemBrowser({ metaKey: true })).toBe(true)
    expect(chatLinkOpensInSystemBrowser({ ctrlKey: true })).toBe(true)
    expect(chatLinkOpensInSystemBrowser({})).toBe(false)
    expect(resolveChatLinkOpen('https://ex.com')).toBe('in-app')
    expect(resolveChatLinkOpen('https://ex.com', { metaKey: true })).toBe('system')
    expect(resolveChatLinkOpen('https://ex.com', { ctrlKey: true })).toBe('system')
    expect(resolveChatLinkOpen('mailto:hi@ex.com')).toBe('system')
    expect(resolveChatLinkOpen('mailto:hi@ex.com', { metaKey: true })).toBe('system')
    expect(resolveChatLinkOpen('/src/foo.ts')).toBe('ignore')
    expect(resolveChatLinkOpen('file:///tmp/a.html')).toBe('in-app')
    expect(resolveChatLinkOpen('file:///tmp/a.html', { metaKey: true })).toBe('system')
    expect(resolveChatLinkOpen('file:///tmp/a.ts')).toBe('ignore')
    expect(resolveChatLinkOpen('javascript:alert(1)')).toBe('ignore')
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/MarkdownBody.tsx'),
      'utf8'
    )
    const live = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/StreamingMarkdown.tsx'),
      'utf8'
    )
    expect(findHttpLinksInText('Local: http://localhost:5173/')).toEqual([
      { start: 7, end: 29, href: 'http://localhost:5173/' }
    ])
    expect(findHttpLinksInText('see https://ex.com/a).')).toEqual([
      { start: 4, end: 20, href: 'https://ex.com/a' }
    ])
    expect(findHttpLinksInText('no links here')).toEqual([])
    expect(chatLinkMenuItems().map((item) => item.action)).toEqual(['in-app', 'system', 'copy'])
    expect(md).toContain('ChatLink')
    expect(live).toContain('ChatLink')
    const linkSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ChatLink.tsx'),
      'utf8'
    )
    expect(linkSrc).toContain('chatLinkMenuItems')
    expect(linkSrc).toContain('resolveChatLinkOpen')
    expect(linkSrc).toContain('dispatchOpenBrowserUrl')
    const termSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/EmbeddedTerminal.tsx'),
      'utf8'
    )
    expect(termSrc).toContain('registerLinkProvider')
    expect(termSrc).toContain('findHttpLinksInText')
    expect(termSrc).toContain('linkHandler')
    const appSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'),
      'utf8'
    )
    const treeSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/FileTree.tsx'),
      'utf8'
    )
    expect(appSrc).toContain('shouldOpenHtmlInAppBrowser')
    expect(appSrc).toContain('resolveWorkspaceHtmlFileUrl')
    expect(treeSrc).toContain('dispatchOpenBrowserUrl')
    expect(treeSrc).toContain('resolveWorkspaceHtmlFileUrl')
    expect(live).toContain('isHtmlPreviewPath')
    expect(live).toContain('parseFileCitation')
  })
})
