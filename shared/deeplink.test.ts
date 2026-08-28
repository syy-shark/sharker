import { describe, expect, it } from 'vitest'
import {
  DEEPLINK_SCHEME,
  formatNewThreadDeeplink,
  formatThreadDeeplink,
  matchWorkspaceByOrigin,
  matchWorkspaceByPath,
  normalizeGitRemoteUrl,
  parseDeeplink
} from './deeplink'

describe('deeplink', () => {
  it('opens a new local thread', () => {
    expect(parseDeeplink('sharker://threads/new')).toEqual({ type: 'new_thread' })
    expect(parseDeeplink('sharker://threads/new?prompt=hello')).toEqual({
      type: 'new_thread',
      prompt: 'hello'
    })
  })

  it('requires a query on sharker://new', () => {
    expect(parseDeeplink('sharker://new')).toEqual({
      type: 'noop',
      reason: 'new-requires-query'
    })
    expect(parseDeeplink('sharker://new?path=/Users/me/proj')).toEqual({
      type: 'new_thread',
      path: '/Users/me/proj'
    })
  })

  it('opens an existing thread by id', () => {
    expect(parseDeeplink('sharker://threads/abc-123')).toEqual({
      type: 'open_thread',
      conversationId: 'abc-123'
    })
  })

  it('maps settings paths and unknown settings to the main page', () => {
    expect(parseDeeplink('sharker://settings')).toEqual({ type: 'settings', tab: 'models' })
    expect(parseDeeplink('sharker://settings/shortcuts')).toEqual({
      type: 'settings',
      tab: 'shortcuts'
    })
    expect(parseDeeplink('sharker://settings/browser-use')).toEqual({
      type: 'settings',
      tab: 'permissions'
    })
    expect(parseDeeplink('sharker://settings/git')).toEqual({
      type: 'settings',
      tab: 'permissions'
    })
    expect(parseDeeplink('sharker://settings/review')).toEqual({
      type: 'settings',
      tab: 'permissions'
    })
    expect(parseDeeplink('sharker://settings/notifications')).toEqual({
      type: 'settings',
      tab: 'appearance'
    })
    expect(parseDeeplink('sharker://settings/general')).toEqual({
      type: 'settings',
      tab: 'appearance'
    })
    expect(parseDeeplink('sharker://settings/connections/ssh')).toEqual({
      type: 'settings',
      tab: 'models'
    })
  })

  it('opens skills and automations, and noops plugins/pets', () => {
    expect(parseDeeplink('sharker://skills')).toEqual({ type: 'skills' })
    expect(parseDeeplink('sharker://automations')).toEqual({ type: 'automations', create: true })
    expect(parseDeeplink('sharker://plugins/install')).toEqual({
      type: 'noop',
      reason: 'unsupported'
    })
    expect(parseDeeplink('sharker://pets/install?name=x&imageUrl=https://x')).toEqual({
      type: 'noop',
      reason: 'unsupported'
    })
  })

  it('rejects other schemes and junk', () => {
    expect(parseDeeplink('https://example.com').type).toBe('noop')
    expect(parseDeeplink('not a url').type).toBe('noop')
    expect(parseDeeplink('').type).toBe('noop')
  })

  it('formats and round-trips a thread link', () => {
    const href = formatThreadDeeplink('conv-1')
    expect(href).toBe(`${DEEPLINK_SCHEME}://threads/conv-1`)
    expect(parseDeeplink(href)).toEqual({ type: 'open_thread', conversationId: 'conv-1' })
  })

  it('formats a new-thread link with a prompt', () => {
    const href = formatNewThreadDeeplink({ prompt: '看 diff' })
    expect(href.startsWith(`${DEEPLINK_SCHEME}://new?`)).toBe(true)
    expect(parseDeeplink(href)).toEqual({ type: 'new_thread', prompt: '看 diff' })
  })

  it('matches workspace path and git remotes', () => {
    expect(
      matchWorkspaceByPath([{ id: 'a', path: '/tmp/proj/' }], '/tmp/proj')?.id
    ).toBe('a')
    expect(normalizeGitRemoteUrl('git@github.com:acme/app.git')).toBe('github.com/acme/app')
    expect(normalizeGitRemoteUrl('https://github.com/acme/app.git')).toBe('github.com/acme/app')
    expect(
      matchWorkspaceByOrigin(
        [{ id: 'w', remoteUrl: 'git@github.com:acme/app.git' }],
        'https://github.com/acme/app'
      )
    ).toBe('w')
  })
})
