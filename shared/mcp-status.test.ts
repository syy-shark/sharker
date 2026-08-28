import { describe, expect, it } from 'vitest'
import { formatMcpStatus } from './mcp-status'

describe('mcp status', () => {
  it('explains how to configure when empty', () => {
    const text = formatMcpStatus([])
    expect(text).toContain('未配置')
    expect(text).toContain('mcp.json')
  })

  it('lists servers and optional tools', () => {
    const text = formatMcpStatus(
      [
        {
          name: 'git',
          command: 'npx',
          args: ['-y', 'mcp-git'],
          tools: ['git_status', 'git_diff']
        }
      ],
      true
    )
    expect(text).toContain('**git**')
    expect(text).toContain('`git_status`')
    expect(text).toContain('npx -y mcp-git')
  })
})
