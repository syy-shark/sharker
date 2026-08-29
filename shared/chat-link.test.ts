import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  chatLinkOpensInSystemBrowser,
  isInAppBrowserChatHref,
  resolveChatLinkOpen
} from './chat-link'

describe('chat link open', () => {
  it('opens http(s) in the in-app browser unless the modifier click is held', () => {
    expect(isInAppBrowserChatHref('https://localhost:3000/pricing')).toBe(true)
    expect(isInAppBrowserChatHref('http://127.0.0.1:5173/')).toBe(true)
    expect(isInAppBrowserChatHref('mailto:hi@ex.com')).toBe(false)
    expect(isInAppBrowserChatHref('file:///tmp/a.html')).toBe(false)
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
    expect(resolveChatLinkOpen('javascript:alert(1)')).toBe('ignore')
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/MarkdownBody.tsx'),
      'utf8'
    )
    const live = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/StreamingMarkdown.tsx'),
      'utf8'
    )
    expect(md).toContain('resolveChatLinkOpen')
    expect(md).toContain('dispatchOpenBrowserUrl')
    expect(live).toContain('resolveChatLinkOpen')
    expect(live).toContain('dispatchOpenBrowserUrl')
  })
})
