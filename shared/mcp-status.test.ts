import { describe, expect, it } from 'vitest'
import { formatMcpStatus, shouldOpenMcpSettings } from './mcp-status'

describe('mcp status', () => {
  it('explains how to configure when empty', () => {
    const text = formatMcpStatus([])
    expect(text).toContain('未配置')
    expect(text).toContain('mcp.json')
    expect(text).toContain('Settings → MCP servers')
    expect(text).toContain('sharker://settings/mcp')
    expect(shouldOpenMcpSettings([])).toBe(true)
    expect(shouldOpenMcpSettings([], 'verbose')).toBe(false)
  })

  it('lists servers and optional tools', () => {
    const text = formatMcpStatus(
      [
        {
          name: 'git',
          command: 'npx',
          args: ['-y', 'mcp-git'],
          tools: ['git_status', 'git_diff']
        },
        {
          name: 'docs',
          url: 'https://mcp.example.com/mcp',
          enabled: false
        }
      ],
      true
    )
    expect(text).toContain('**git**')
    expect(text).toContain('`git_status`')
    expect(text).toContain('npx -y mcp-git')
    expect(text).toContain('https://mcp.example.com/mcp')
    expect(text).toContain('已关闭')
    expect(
      shouldOpenMcpSettings(
        [
          { name: 'git', command: 'npx' },
          { name: 'docs', url: 'https://mcp.example.com/mcp', enabled: false }
        ],
        ''
      )
    ).toBe(false)
  })
})
