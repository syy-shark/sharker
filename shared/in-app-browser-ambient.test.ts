/**
 * 官方内置浏览器 ambient 文案与注入条件。
 * @see shared/in-app-browser-ambient.ts
 */
import { describe, expect, it } from 'vitest'
import {
  appendInAppBrowserAmbient,
  formatInAppBrowserAmbient,
  isInAppBrowserAmbientUrl,
  resolveInAppBrowserAmbient
} from './in-app-browser-ambient'

describe('in-app-browser-ambient', () => {
  it('accepts http(s) and file URLs, rejects start pages', () => {
    expect(isInAppBrowserAmbientUrl('https://localhost:3000/app')).toBe(true)
    expect(isInAppBrowserAmbientUrl('http://127.0.0.1:5173/')).toBe(true)
    expect(isInAppBrowserAmbientUrl('file:///tmp/preview.html')).toBe(true)
    expect(isInAppBrowserAmbientUrl('about:blank')).toBe(false)
    expect(isInAppBrowserAmbientUrl('data:text/html,hi')).toBe(false)
    expect(isInAppBrowserAmbientUrl('')).toBe(false)
  })

  it('matches official desktop wording from openai/codex#39562', () => {
    expect(formatInAppBrowserAmbient('https://cloud.example.com/app')).toBe(
      [
        '# In app browser:',
        '- The user has the in-app browser open with 1 tab.',
        '- Current URL: https://cloud.example.com/app'
      ].join('\n')
    )
    expect(formatInAppBrowserAmbient('about:blank')).toBe('')
  })

  it('appends the official block to system and leaves empty URLs alone', () => {
    const system = 'You are Sharker.'
    expect(appendInAppBrowserAmbient(system, 'https://127.0.0.1:3000')).toBe(
      `${system}\n\n# In app browser:\n- The user has the in-app browser open with 1 tab.\n- Current URL: https://127.0.0.1:3000`
    )
    expect(appendInAppBrowserAmbient(system, 'about:blank')).toBe(system)
    expect(appendInAppBrowserAmbient(system, '')).toBe(system)
  })

  it('only resolves when the visible chat has the browser pane open', () => {
    const open = {
      page: 'chat',
      panelOpen: true,
      tab: 'browser',
      url: 'https://localhost:4173',
      forActiveConversation: true
    }
    expect(resolveInAppBrowserAmbient(open)).toEqual({ url: 'https://localhost:4173' })
    expect(resolveInAppBrowserAmbient({ ...open, tab: 'files' })).toBeNull()
    expect(resolveInAppBrowserAmbient({ ...open, panelOpen: false })).toBeNull()
    expect(resolveInAppBrowserAmbient({ ...open, page: 'settings' })).toBeNull()
    expect(resolveInAppBrowserAmbient({ ...open, forActiveConversation: false })).toBeNull()
    expect(resolveInAppBrowserAmbient({ ...open, url: 'about:blank' })).toBeNull()
  })
})
