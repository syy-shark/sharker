/**
 * 官方 MCP Calling / Called 文案。
 * @see shared/mcp-activity.ts
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  formatMcpActivity,
  formatMcpApprovalLabel,
  formatMcpArgs,
  formatMcpInvocation,
  isMcpActivityToolName,
  isMcpDynamicToolName,
  isMcpJsonDump,
  parseMcpInvocation
} from './mcp-activity'

describe('mcp-activity', () => {
  it('parses dynamic names and mcp_call_tool without dumping wrapper args', () => {
    expect(isMcpDynamicToolName('mcp_github__search')).toBe(true)
    expect(isMcpDynamicToolName('mcp_call_tool')).toBe(false)
    expect(isMcpActivityToolName('mcp_list_tools')).toBe(true)
    expect(isMcpActivityToolName('read_file')).toBe(false)
    expect(parseMcpInvocation('mcp_github__search', { q: 'codex' })).toEqual({
      server: 'github',
      tool: 'search',
      arguments: { q: 'codex' }
    })
    expect(
      parseMcpInvocation('mcp_call_tool', {
        server: 'docs',
        tool_name: 'lookup',
        arguments: { q: 'plan' }
      })
    ).toEqual({
      server: 'docs',
      tool: 'lookup',
      arguments: { q: 'plan' }
    })
    expect(parseMcpInvocation('mcp_list_tools')).toEqual({
      server: 'mcp',
      tool: 'list_tools'
    })
    expect(parseMcpInvocation('read_file')).toBeNull()
    expect(formatMcpArgs({ path: '/tmp/a' })).toBe('{"path":"/tmp/a"}')
    expect(formatMcpArgs({})).toBe('')
    const long = formatMcpArgs({ blob: 'x'.repeat(200) }, 24)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(24)
    expect(
      formatMcpInvocation({ server: 'github', tool: 'search', arguments: { q: 'codex' } })
    ).toBe('github.search({"q":"codex"})')
    expect(formatMcpActivity('mcp_github__search', { q: 'codex' }, 'active')).toBe(
      'Calling github.search({"q":"codex"})'
    )
    expect(formatMcpActivity('mcp_github__search', { q: 'codex' }, 'done')).toBe(
      'Called github.search({"q":"codex"})'
    )
    expect(formatMcpActivity('mcp_list_tools', undefined, 'active')).toBe(
      'Calling mcp.list_tools()'
    )
    expect(
      formatMcpActivity(
        'mcp_call_tool',
        { server: 'docs', tool_name: 'lookup', arguments: { q: 'plan' } },
        'done'
      )
    ).toBe('Called docs.lookup({"q":"plan"})')
    expect(isMcpJsonDump('{"ok":true}')).toBe(true)
    expect(isMcpJsonDump('[1,2]')).toBe(true)
    expect(isMcpJsonDump('Listed 2 tools')).toBe(false)
    expect(formatMcpApprovalLabel('mcp_github__search', { q: 'codex' })).toBe(
      'Calling github.search({"q":"codex"})'
    )
    expect(formatMcpApprovalLabel('read_file', { path: 'a.ts' })).toBe('read_file')
  })

  it('keeps the live approval summary on official Calling server.tool({compact})', () => {
    const approvalSrc = readFileSync(
      new URL('../src/components/InlineApproval.tsx', import.meta.url),
      'utf8'
    )
    expect(approvalSrc).toContain('formatMcpApprovalLabel')
    expect(approvalSrc).not.toContain('查看操作参数')
    expect(approvalSrc).not.toContain('正在提交审批结果')
    expect(approvalSrc).not.toContain('操作参数无法显示')
  })
})
