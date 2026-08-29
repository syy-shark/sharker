/**
 * MCP Streamable HTTP 请求头与 SSE 解析（无网络）。
 * 对标 Codex Streamable HTTP：Bearer / 静态头 / Mcp-Session-Id。
 * 不实现 OAuth CIMD/DCR。
 * @see shared/ARCH.md
 */

/** HTTP MCP 协议版本（Streamable HTTP） */
export const MCP_HTTP_PROTOCOL_VERSION = '2025-03-26'

/** 拼 Streamable HTTP 头 */
export function buildMcpHttpHeaders(input: {
  sessionId?: string
  bearerToken?: string
  extra?: Record<string, string>
}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': MCP_HTTP_PROTOCOL_VERSION
  }
  if (input.sessionId) headers['Mcp-Session-Id'] = input.sessionId
  if (input.bearerToken) headers.Authorization = `Bearer ${input.bearerToken}`
  for (const [key, value] of Object.entries(input.extra ?? {})) {
    if (!key.trim()) continue
    headers[key] = value
  }
  return headers
}

/** 取出 JSON-RPC 成功 result；error 抛错 */
export function readMcpJsonRpcResult(payload: unknown, id: number): unknown {
  if (!payload || typeof payload !== 'object') {
    throw new Error('MCP HTTP response is not JSON-RPC')
  }
  const msg = payload as {
    id?: number
    error?: { code?: number; message?: string }
    result?: unknown
  }
  if (msg.error) {
    throw new Error(`MCP error ${msg.error.code ?? '?'}: ${msg.error.message ?? 'unknown'}`)
  }
  if (msg.id != null && msg.id !== id) {
    throw new Error(`MCP HTTP response id mismatch (want ${id}, got ${msg.id})`)
  }
  return msg.result
}

/** 从 SSE `data:` 块取出对应 id 的 result */
export function parseMcpSseResult(text: string, id: number): unknown {
  const blocks = String(text || '').split(/\r?\n\r?\n/)
  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim()
    if (!data || data === '[DONE]') continue
    try {
      const parsed: unknown = JSON.parse(data)
      if (!parsed || typeof parsed !== 'object') continue
      const rec = parsed as { id?: number }
      if (rec.id != null && rec.id !== id) continue
      return readMcpJsonRpcResult(parsed, id)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('MCP error')) throw err
    }
  }
  throw new Error('MCP HTTP SSE missing JSON-RPC result')
}
