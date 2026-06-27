/**
 * MCP stdio 客户端：Content-Length 帧 JSON-RPC，initialize + tools/list + tools/call。
 * @see tools/services/mcp-registry.ts
 */
import fs from 'fs/promises'
import path from 'path'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import type { McpServerConfig } from './mcp-registry'

const MCP_PROTOCOL_VERSION = '2024-11-05'
const REQUEST_TIMEOUT_MS = 120_000
/** 每轮对话前刷新 MCP 工具池的单 server 超时 */
export const MCP_POOL_CONNECT_MS = 12_000

/** Windows 上 npx/npm/.cmd 需 shell，否则 spawn EINVAL */
export function resolveMcpSpawn(config: McpServerConfig): {
  command: string
  args: string[]
  shell: boolean
} {
  let command = config.command
  const lower = command.toLowerCase()
  let shell = false
  if (process.platform === 'win32') {
    if (lower === 'npx') command = 'npx.cmd'
    else if (lower === 'npm') command = 'npm.cmd'
    if (/\.(cmd|bat)$/i.test(command) || lower === 'npx' || lower === 'npm') {
      shell = true
    }
  }
  return { command, args: config.args ?? [], shell }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    )
  ])
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface McpToolsListResult {
  tools: McpToolInfo[]
}

interface McpCallToolResult {
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  isError?: boolean
}

/** 单条 MCP Server 的持久 stdio 会话 */
class McpStdioSession {
  private readonly proc: ChildProcessWithoutNullStreams
  private readonly transport: 'content-length' | 'ndjson'
  private buffer = ''
  private stderr = ''
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >()
  private nextId = 1
  private closed = false

  private constructor(proc: ChildProcessWithoutNullStreams, transport: 'content-length' | 'ndjson') {
    this.proc = proc
    this.transport = transport
    proc.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk.toString('utf8')))
    proc.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8')
    })
    proc.on('error', (err) => this.rejectAll(err))
    proc.on('exit', (code, signal) => {
      if (!this.closed) {
        this.rejectAll(new Error(`MCP process exited (code=${code}, signal=${signal})`))
      }
    })
  }

  /** 启动子进程并完成 MCP initialize 握手 */
  static async connect(config: McpServerConfig): Promise<McpStdioSession> {
    const { command, args, shell } = resolveMcpSpawn(config)
    const proc = spawn(command, args, {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell,
      windowsHide: true
    })
    const session = new McpStdioSession(proc, config.transport ?? 'content-length')
    await session.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'sharker', version: '0.1.0' }
    })
    session.notify('notifications/initialized', {})
    return session
  }

  /** 列出 Server 暴露的工具 */
  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.request('tools/list', {})) as McpToolsListResult
    return result?.tools ?? []
  }

  /** 调用指定 MCP 工具；workspace 用于落盘 screenshot 图片供后续 read_image */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    workspace?: string
  ): Promise<string> {
    const result = (await this.request('tools/call', {
      name,
      arguments: args
    })) as McpCallToolResult
    return formatCallToolResult(result, workspace)
  }

  /** 关闭会话并终止子进程 */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.rejectAll(new Error('MCP session closed'))
    try {
      this.proc.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }

  /** 最近 stderr（诊断用） */
  getStderr(): string {
    return this.stderr.trim()
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) {
        // 部分 MCP 实现用换行分隔 JSON（无 Content-Length）
        const lineEnd = this.buffer.indexOf('\n')
        if (lineEnd === -1) break
        const line = this.buffer.slice(0, lineEnd).trim()
        this.buffer = this.buffer.slice(lineEnd + 1)
        if (!line || line.startsWith('Content-Length:')) continue
        try {
          this.handleMessage(JSON.parse(line) as JsonRpcResponse)
        } catch {
          /* 等待更多数据 */
          this.buffer = line + '\n' + this.buffer
        }
        continue
      }

      const header = this.buffer.slice(0, headerEnd)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }
      const length = Number.parseInt(match[1], 10)
      const bodyStart = headerEnd + 4
      if (this.buffer.length < bodyStart + length) break
      const body = this.buffer.slice(bodyStart, bodyStart + length)
      this.buffer = this.buffer.slice(bodyStart + length)
      try {
        this.handleMessage(JSON.parse(body) as JsonRpcResponse)
      } catch (err) {
        this.rejectAll(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse): void {
    if (msg.id == null) return
    const pending = this.pending.get(msg.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(msg.id)
    if (msg.error) {
      pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`))
      return
    }
    pending.resolve(msg.result)
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('MCP session closed'))
    const id = this.nextId++
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timeout: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      this.writeMessage(payload)
    })
  }

  private notify(method: string, params?: unknown): void {
    const payload: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    this.writeMessage(payload)
  }

  private writeMessage(payload: JsonRpcRequest | JsonRpcNotification): void {
    const body = JSON.stringify(payload)
    if (this.transport === 'ndjson') {
      this.proc.stdin.write(`${body}\n`, 'utf8')
      return
    }
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
    this.proc.stdin.write(frame, 'utf8')
  }

  private rejectAll(err: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(err)
    }
    this.pending.clear()
  }
}

/** 按 server 名缓存的活跃会话 */
const sessionPool = new Map<string, McpStdioSession>()

/** 获取或创建 MCP 会话 */
export async function getMcpSession(config: McpServerConfig): Promise<McpStdioSession> {
  const cached = sessionPool.get(config.name)
  if (cached) return cached
  const session = await McpStdioSession.connect(config)
  sessionPool.set(config.name, session)
  return session
}

/** 快速连接并 tools/list（用于工具池刷新；失败不阻塞整轮对话） */
export async function connectAndListMcpTools(
  config: McpServerConfig,
  timeoutMs = MCP_POOL_CONNECT_MS
): Promise<McpToolInfo[]> {
  let session: McpStdioSession | undefined
  try {
    session = await withTimeout(McpStdioSession.connect(config), timeoutMs, `${config.name} connect`)
    sessionPool.set(config.name, session)
    return await withTimeout(session.listTools(), timeoutMs, `${config.name} tools/list`)
  } catch (err) {
    closeMcpSession(config.name)
    throw err
  }
}

/** 关闭指定或全部 MCP 会话 */
export function closeMcpSession(serverName?: string): void {
  if (serverName) {
    sessionPool.get(serverName)?.close()
    sessionPool.delete(serverName)
    return
  }
  for (const session of sessionPool.values()) session.close()
  sessionPool.clear()
}

/** 将 MCP image 块写入工作区 .sharker/desktop/ */
async function saveMcpImageBlock(
  workspace: string,
  data: string,
  mimeType?: string
): Promise<string> {
  const ext = mimeType?.includes('jpeg') || mimeType?.includes('jpg') ? '.jpg' : '.png'
  const dir = path.join(workspace, '.sharker', 'desktop')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `mcp-${Date.now()}${ext}`)
  const payload = data.includes(',') ? (data.split(',').pop() ?? data) : data
  await fs.writeFile(filePath, Buffer.from(payload, 'base64'))
  return filePath
}

/** 将 tools/call 结果格式化为模型可读文本 */
async function formatCallToolResult(
  result: McpCallToolResult,
  workspace?: string
): Promise<string> {
  if (!result) return '(empty MCP result)'
  const parts: string[] = []
  for (const block of result.content ?? []) {
    if (block.type === 'text' && block.text) parts.push(block.text)
    else if (block.type === 'image' && block.data) {
      if (workspace) {
        try {
          const saved = await saveMcpImageBlock(workspace, block.data, block.mimeType)
          parts.push(
            `Screenshot saved: ${saved}\n` +
              `MIME: ${block.mimeType ?? 'image/png'}\n` +
              'Use coordinate_width/coordinate_height from adjacent JSON for mcp_computer_use__click x,y. ' +
              'Prefer accessibility_tree from get_app_state over guessing from pixels.'
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          parts.push(`[image save failed: ${msg}; base64 length ${block.data.length}]`)
        }
      } else {
        parts.push(
          `[image ${block.mimeType ?? 'image/png'} base64 ${block.data.length} chars — no workspace to save]`
        )
      }
    } else {
      parts.push(JSON.stringify(block))
    }
  }
  const text = parts.join('\n\n').trim()
  if (result.isError) return `[MCP tool error]\n${text || JSON.stringify(result)}`
  return text || JSON.stringify(result)
}
