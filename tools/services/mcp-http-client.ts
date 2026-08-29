/**
 * MCP Streamable HTTP 会话：POST JSON-RPC，读 JSON 或 SSE。
 * 对标 Codex Streamable HTTP（Bearer / 静态头）。不实现 OAuth。
 * @see tools/services/mcp-client.ts
 */
import type { McpServerConfig } from '../../shared/mcp-config'
import {
  buildMcpHttpHeaders,
  MCP_HTTP_PROTOCOL_VERSION,
  parseMcpSseResult,
  readMcpJsonRpcResult
} from '../../shared/mcp-http'
import type { McpSessionHandle, McpToolInfo } from './mcp-client'
import { formatCallToolResult } from './mcp-client'

const REQUEST_TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    )
  ])
}

/** 单条 Streamable HTTP MCP 会话 */
export class McpHttpSession implements McpSessionHandle {
  private sessionId: string | undefined
  private nextId = 1
  private closed = false
  private readonly abort = new AbortController()

  private constructor(private readonly config: McpServerConfig) {}

  static async connect(config: McpServerConfig): Promise<McpHttpSession> {
    const url = String(config.url || '').trim()
    if (!url) throw new Error(`MCP HTTP server "${config.name}" missing url`)
    const session = new McpHttpSession(config)
    await session.request('initialize', {
      protocolVersion: MCP_HTTP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'sharker', version: '0.1.0' }
    })
    await session.notify('notifications/initialized', {})
    return session
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.request('tools/list', {})) as { tools?: McpToolInfo[] }
    return result?.tools ?? []
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    workspace?: string
  ): Promise<string> {
    const result = (await this.request('tools/call', { name, arguments: args })) as Parameters<
      typeof formatCallToolResult
    >[0]
    return formatCallToolResult(result, workspace)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.abort.abort()
    const url = String(this.config.url || '').trim()
    const sessionId = this.sessionId
    if (url && sessionId) {
      void fetch(url, {
        method: 'DELETE',
        headers: this.headers(),
        signal: AbortSignal.timeout(4000)
      }).catch(() => undefined)
    }
  }

  private headers(): Record<string, string> {
    const envName = this.config.bearerTokenEnvVar
    const bearerToken = envName ? process.env[envName] : undefined
    return buildMcpHttpHeaders({
      sessionId: this.sessionId,
      bearerToken,
      extra: this.config.httpHeaders
    })
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const url = String(this.config.url || '').trim()
    await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
      signal: this.abort.signal
    }).catch(() => undefined)
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) throw new Error('MCP session closed')
    const id = this.nextId++
    const url = String(this.config.url || '').trim()
    const res = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: this.abort.signal
      }),
      REQUEST_TIMEOUT_MS,
      `MCP HTTP ${method}`
    )
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`MCP HTTP ${res.status}${body ? `: ${body.slice(0, 240)}` : ''}`)
    }
    const ctype = res.headers.get('content-type') || ''
    if (ctype.includes('text/event-stream')) {
      return parseMcpSseResult(await res.text(), id)
    }
    return readMcpJsonRpcResult(await res.json(), id)
  }
}
