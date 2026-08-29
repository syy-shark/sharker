import { describe, expect, it } from 'vitest'
import { formatDebugConfig } from './debug-config'
import { DEFAULT_SETTINGS } from './types'

describe('debug-config', () => {
  it('redacts api keys and lists providers', () => {
    const text = formatDebugConfig({
      ...DEFAULT_SETTINGS,
      permissionMode: 'full',
      providers: [
        {
          id: 'p1',
          name: 'Demo',
          baseUrl: 'https://example.test',
          apiKey: 'sk-secret',
          model: 'demo-1'
        }
      ],
      activeProviderId: 'p1',
      keyboardShortcuts: { toggle_sidebar: 'mod+b' }
    })
    expect(text).toContain('权限：full')
    expect(text).toContain('Key 已配置')
    expect(text).toContain('Demo')
    expect(text).not.toContain('sk-secret')
    expect(text).toContain('快捷键覆盖：1 项')
    expect(text).toContain('代码字号 1')
    expect(text).toContain('功能 关')
    expect(
      formatDebugConfig({
        ...DEFAULT_SETTINGS,
        memoriesEnabled: true,
        memoryInjection: false
      })
    ).toContain('功能 开 · 注入 关')
  })
})
