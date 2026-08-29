import { describe, expect, it } from 'vitest'
import {
  draftToMcpServer,
  enabledMcpServers,
  formatMcpEnvText,
  isMcpServerEnabled,
  isValidMcpServerName,
  mcpServerKind,
  mcpServerLaunchLabel,
  normalizeMcpServers,
  parseMcpArgsLine,
  parseMcpEnvText,
  removeMcpServer,
  setMcpServerEnabledFlag,
  upsertMcpServer
} from './mcp-config'
import { buildMcpHttpHeaders, parseMcpSseResult, readMcpJsonRpcResult } from './mcp-http'

describe('mcp config', () => {
  it('normalizes servers and launch labels', () => {
    expect(isValidMcpServerName('context7')).toBe(true)
    expect(isValidMcpServerName('bad name')).toBe(false)
    expect(isMcpServerEnabled({})).toBe(true)
    expect(isMcpServerEnabled({ enabled: false })).toBe(false)
    expect(mcpServerKind({ url: 'https://mcp.example.com' })).toBe('http')
    expect(mcpServerKind({ command: 'npx' })).toBe('stdio')
    expect(mcpServerLaunchLabel({ command: 'npx', args: ['-y', 'mcp-git'] })).toBe('npx -y mcp-git')
    expect(mcpServerLaunchLabel({ url: 'https://mcp.example.com/mcp' })).toBe(
      'https://mcp.example.com/mcp'
    )
    const servers = normalizeMcpServers([
      { name: 'git', command: 'npx', args: ['-y', 'mcp-git'], enabled: false },
      { name: 'docs', url: 'https://mcp.example.com' },
      { name: '' },
      null
    ])
    expect(servers).toHaveLength(2)
    expect(enabledMcpServers(servers).map((s) => s.name)).toEqual(['docs'])
    expect(parseMcpArgsLine('-y "@scope/pkg" extra')).toEqual(['-y', '@scope/pkg', 'extra'])
    expect(parseMcpEnvText('TOKEN=abc\n# skip\nEMPTY\nFOO=bar=baz')).toEqual({
      TOKEN: 'abc',
      FOO: 'bar=baz'
    })
    expect(formatMcpEnvText({ TOKEN: 'abc' })).toBe('TOKEN=abc')
    const added = upsertMcpServer(servers, { name: 'git', command: 'uvx', enabled: true })
    expect(added.find((s) => s.name === 'git')?.command).toBe('uvx')
    expect(setMcpServerEnabledFlag(added, 'docs', false).find((s) => s.name === 'docs')?.enabled).toBe(
      false
    )
    expect(removeMcpServer(added, 'git').map((s) => s.name)).toEqual(['docs'])
    const stdio = draftToMcpServer({
      name: 'git',
      kind: 'stdio',
      command: 'npx',
      argsText: '-y mcp-git',
      envText: 'TOKEN=abc'
    })
    expect(stdio.ok).toBe(true)
    if (stdio.ok) {
      expect(stdio.server).toMatchObject({
        name: 'git',
        command: 'npx',
        args: ['-y', 'mcp-git'],
        env: { TOKEN: 'abc' }
      })
    }
    const http = draftToMcpServer({
      name: 'docs',
      kind: 'http',
      url: 'https://mcp.example.com/mcp',
      bearerTokenEnvVar: 'DOCS_TOKEN'
    })
    expect(http.ok).toBe(true)
    if (http.ok) expect(http.server.url).toBe('https://mcp.example.com/mcp')
    expect(draftToMcpServer({ name: 'x y', kind: 'stdio', command: 'npx' }).ok).toBe(false)
    expect(draftToMcpServer({ name: 'x', kind: 'http', url: 'mcp.example.com' }).ok).toBe(false)
  })

  it('builds Streamable HTTP headers and reads SSE JSON-RPC', () => {
    expect(
      buildMcpHttpHeaders({
        sessionId: 'sid-1',
        bearerToken: 'tok',
        extra: { 'X-Region': 'us' }
      })
    ).toMatchObject({
      Authorization: 'Bearer tok',
      'Mcp-Session-Id': 'sid-1',
      'X-Region': 'us',
      Accept: 'application/json, text/event-stream'
    })
    expect(readMcpJsonRpcResult({ jsonrpc: '2.0', id: 1, result: { tools: [] } }, 1)).toEqual({
      tools: []
    })
    expect(() =>
      readMcpJsonRpcResult({ jsonrpc: '2.0', id: 1, error: { code: 1, message: 'nope' } }, 1)
    ).toThrow(/nope/)
    expect(
      parseMcpSseResult(
        'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n',
        2
      )
    ).toEqual({ ok: true })
    expect(() => parseMcpSseResult('data: {"jsonrpc":"2.0","id":9,"result":{}}\n\n', 1)).toThrow(
      /missing/
    )
  })
})
