import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import { filterWorkspaces, normalizeSettings } from './workspace'

describe('workspace settings', () => {
  it('migrates requireModEnter into composerEnterBehavior', () => {
    expect(normalizeSettings({ requireModEnter: true }, '/home/u').composerEnterBehavior).toBe(
      'cmdAlways'
    )
    expect(normalizeSettings({ requireModEnter: true }, '/home/u').requireModEnter).toBe(true)
    expect(
      normalizeSettings({ composerEnterBehavior: 'cmdIfMultiline', requireModEnter: true }, '/home/u')
        .composerEnterBehavior
    ).toBe('cmdIfMultiline')
    expect(
      normalizeSettings({ composerEnterBehavior: 'cmdIfMultiline' }, '/home/u').requireModEnter
    ).toBe(false)
    expect(normalizeSettings({}, '/home/u').composerEnterBehavior).toBe('enter')
    expect(normalizeSettings(DEFAULT_SETTINGS, '/home/u').composerEnterBehavior).toBe('enter')
    expect(normalizeSettings({}, '/home/u').reviewDelivery).toBe('inline')
    expect(normalizeSettings({ reviewDelivery: 'detached' }, '/home/u').reviewDelivery).toBe(
      'detached'
    )
    expect(normalizeSettings(DEFAULT_SETTINGS, '/home/u').reviewDelivery).toBe('inline')
    expect(normalizeSettings({}, '/home/u').memoriesEnabled).toBe(false)
    expect(normalizeSettings({ memoriesEnabled: true }, '/home/u').memoriesEnabled).toBe(true)
    expect(normalizeSettings(DEFAULT_SETTINGS, '/home/u').memoriesEnabled).toBe(false)
  })
})

describe('workspace project picker', () => {
  it('filters by label, path or id', () => {
    const items = [
      { id: 'ws-1', label: 'Sharker', path: '/Users/me/sharker' },
      { id: 'ws-2', label: '映雪', path: '/Users/me/xuemusic' }
    ]
    expect(filterWorkspaces(items, 'shark').map((w) => w.id)).toEqual(['ws-1'])
    expect(filterWorkspaces(items, 'xuemusic').map((w) => w.id)).toEqual(['ws-2'])
    expect(filterWorkspaces(items, 'ws-2').map((w) => w.id)).toEqual(['ws-2'])
    expect(filterWorkspaces(items, '')).toEqual(items)
    expect(filterWorkspaces(items, 'zzz')).toEqual([])
    const withExtra = normalizeSettings(
      {
        workspaces: [
          { id: 'ws-1', label: 'App', path: '/repo', extraPaths: ['/repo', '/extra', 'rel', '/extra/'] }
        ],
        activeWorkspaceId: 'ws-1'
      },
      '/home/u'
    )
    const item = withExtra.workspaces.find((w) => w.id === 'ws-1')
    expect(item?.extraPaths).toEqual(['/extra'])
  })
})
