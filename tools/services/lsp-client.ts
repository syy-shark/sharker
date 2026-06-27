/**
 * LSP 客户端：spawn 语言服务器并向 Agent 暴露 diagnostics 摘要。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import path from 'path'

/** LSP 连接摘要 */
export interface LspStatus {
  running: boolean
  server: string
  workspace: string
  lastError?: string
}

let proc: ChildProcessWithoutNullStreams | null = null
let status: LspStatus = { running: false, server: '', workspace: '' }

/** 启动 TypeScript 语言服务器（workspace 根） */
export function startTypescriptLsp(workspace: string): LspStatus {
  stopLsp()
  const server = path.join(workspace, 'node_modules', '.bin', 'typescript-language-server')
  try {
    proc = spawn(server, ['--stdio'], { cwd: workspace, stdio: 'pipe' })
    status = { running: true, server: 'typescript-language-server', workspace }
    proc.on('exit', () => {
      status = { ...status, running: false }
      proc = null
    })
    proc.stderr.on('data', (buf) => {
      status = { ...status, lastError: String(buf).slice(0, 200) }
    })
  } catch (e) {
    status = {
      running: false,
      server: 'typescript-language-server',
      workspace,
      lastError: e instanceof Error ? e.message : String(e)
    }
  }
  return status
}

/** 停止 LSP */
export function stopLsp(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
  status = { ...status, running: false }
}

/** 当前 LSP 状态 */
export function getLspStatus(): LspStatus {
  return { ...status }
}
