import { describe, expect, it } from 'vitest'
import { formatMcpStatus } from './mcp-status'

describe('mcp status', () => {
  it('explains how to configure when empty', () => {
    const text = formatMcpStatus([])
    expect(text).toContain('未配置')
    expect(text).toContain('mcp.json')
    expect(text).toContain('设置 → MCP 服务器')
    expect(text).toContain('sharker://settings/mcp')
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
  })
})
