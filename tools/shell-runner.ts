/**
 * 可中止、可后台的 shell 执行器：开发服务器等长驻进程不阻塞 Agent turn。
 * @see tools/README.md
 */
import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import { wrapShellCommand } from './shared/shell-spawn'

const DEFAULT_BLOCK_MS = 30_000
/** 开发服务器最长等待就绪时间 */
const DEV_SERVER_MAX_BLOCK_MS = 15_000
/** Sharker 自身 dev 占用 5173–5175，用户项目默认倾向 3000 */
const USER_DEV_PORT = 3000

/** 仍在运行的子进程（含已转后台的 dev server） */
const activeChildren = new Set<ChildProcess>()

/** 开发服务器 / 长驻进程命令特征 */
const DEV_SERVER_PATTERNS = [
  /\bnpm\s+run\s+(dev|start|serve)\b/i,
  /\bpnpm\s+(dev|start|serve)\b/i,
  /\byarn\s+(dev|start|serve)\b/i,
  /\bnpx\s+vite\b/i,
  /\bvite(\s|$)/i,
  /\bnext\s+dev\b/i,
  /\bng\s+serve\b/i,
  /\bpython3?\s+-m\s+http\.server\b/i,
  /\blive-server\b/i,
  /\bserve\s+(-[a-z]|--|\.\/|\/|\w)/i
]

/** 判断命令是否像开发服务器（应短阻塞后放后台） */
export function isLikelyDevServer(command: string): boolean {
  return DEV_SERVER_PATTERNS.some((p) => p.test(command))
}

/** 中止所有由本模块启动且仍在运行的 shell 子进程 */
export function killAllShellChildren(): void {
  for (const child of activeChildren) {
    killChildTree(child)
  }
  activeChildren.clear()
}

/** 终止子进程及其进程组（Unix）；Windows 仅 kill 子进程 */
function killChildTree(child: ChildProcess): void {
  if (!child.pid) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    return
  }
  if (process.platform === 'win32') {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

function trimBuffer(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n...(output truncated)`
}

function formatOutput(stdout: string, stderr: string): string {
  const out = [stdout, stderr].filter(Boolean).join('\n').trim()
  return out || '(no output)'
}

/** 从日志输出解析候选监听端口 */
export function parsePortsFromOutput(text: string): number[] {
  const ports = new Set<number>()
  const patterns = [
    /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d+)/gi,
    /Local:\s+https?:\/\/[^:]+:(\d+)/gi,
    /Network:\s+https?:\/\/[^:]+:(\d+)/gi,
    /listening on (?:port )?(\d+)/gi,
    /ready on (?:port )?(\d+)/gi,
    /started server on .*:(\d+)/gi
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const port = Number(m[1])
      if (port > 0 && port < 65536) ports.add(port)
    }
  }
  return [...ports]
}

/** TCP 探测端口是否可连接 */
function probePortReady(port: number, host = '127.0.0.1', timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)
    socket.on('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolve(true)
    })
    socket.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

/** 在候选端口中找第一个已就绪的 */
async function findReadyPort(candidates: number[]): Promise<number | null> {
  for (const port of candidates) {
    if (await probePortReady(port)) return port
  }
  return null
}

/**
 * 仅对裸 python http.server 补端口；其余靠环境变量，避免破坏 npm script。
 */
function augmentDevServerCommand(command: string): string {
  if (!isLikelyDevServer(command)) return command
  if (/--port\s+\d+|-p\s+\d+|\bPORT=\d+/.test(command)) return command
  if (/\bpython3?\s+-m\s+http\.server\s*$/i.test(command.trim())) {
    return `${command.trim()} ${USER_DEV_PORT}`
  }
  return command
}

/** 后台化后持续排空 stdout/stderr，避免 EPIPE 写崩子进程 */
function detachBackgroundChild(child: ChildProcess): void {
  const drain = (stream: NodeJS.ReadableStream | null | undefined): void => {
    if (!stream) return
    stream.on('data', () => {})
    stream.resume()
  }
  drain(child.stdout)
  drain(child.stderr)
  child.unref()
}

function devServerSpawnEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TERM: 'dumb',
    BROWSER: 'none',
    PORT: String(USER_DEV_PORT),
    VITE_PORT: String(USER_DEV_PORT)
  }
}

function devServerReadyNote(port: number, pid: number | undefined): string {
  return `\n\n[开发服务器已在后台运行（端口 ${port}，PID ${pid ?? '?'}）。请在系统浏览器打开 http://localhost:${port}；聊天内链接会在外部浏览器打开。]`
}

export interface ShellRunOptions {
  blockUntilMs?: number
  signal?: AbortSignal
  maxBuffer?: number
}

/**
 * 执行 shell 命令：默认阻塞至结束；开发服务器检测到就绪或超时后转后台。
 */
export async function runShellCommand(
  command: string,
  cwd: string,
  options?: ShellRunOptions
): Promise<string> {
  const maxBuffer = options?.maxBuffer ?? 4 * 1024 * 1024
  const isDevServer = isLikelyDevServer(command)
  let blockMs = options?.blockUntilMs ?? DEFAULT_BLOCK_MS
  if (options?.blockUntilMs === undefined && isDevServer) {
    blockMs = DEV_SERVER_MAX_BLOCK_MS
  }
  const runCommand = augmentDevServerCommand(command)
  const { command: shellBin, args: shellArgs } = wrapShellCommand(runCommand)

  return new Promise((resolve, reject) => {
    const child = spawn(shellBin, shellArgs, {
      cwd,
      env: isDevServer ? devServerSpawnEnv() : { ...process.env, TERM: 'dumb' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    activeChildren.add(child)

    let stdout = ''
    let stderr = ''
    let settled = false
    let backgrounded = false
    let readinessInFlight = false

    const detachListeners = (): void => {
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort)
      }
    }

    const cleanup = (keepChild: boolean): void => {
      if (!keepChild) activeChildren.delete(child)
    }

    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(blockTimer)
      detachListeners()
      killChildTree(child)
      cleanup(false)
      reject(err)
    }

    const finish = (result: string, keepChild: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(blockTimer)
      detachListeners()
      if (keepChild) detachBackgroundChild(child)
      cleanup(keepChild)
      resolve(result)
    }

    const onAbort = (): void => {
      fail(new Error('命令已取消'))
    }

    if (options?.signal) {
      if (options.signal.aborted) {
        fail(new Error('命令已取消'))
        return
      }
      options.signal.addEventListener('abort', onAbort)
    }

    /** 开发服务器：日志解析端口 + TCP 探测，就绪则提前后台化 */
    const tryFinishDevServerEarly = async (): Promise<void> => {
      if (!isDevServer || settled || readinessInFlight) return
      readinessInFlight = true
      try {
        const combined = `${stdout}\n${stderr}`
        const parsed = parsePortsFromOutput(combined)
        const candidates = parsed.length > 0 ? parsed : [USER_DEV_PORT]
        const ready = await findReadyPort(candidates)
        if (ready != null && !settled) {
          backgrounded = true
          const out = formatOutput(stdout, stderr)
          finish(out + devServerReadyNote(ready, child.pid), true)
        }
      } finally {
        readinessInFlight = false
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = trimBuffer(stdout + chunk.toString(), maxBuffer)
      if (isDevServer) void tryFinishDevServerEarly()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = trimBuffer(stderr + chunk.toString(), maxBuffer)
      if (isDevServer) void tryFinishDevServerEarly()
    })

    child.on('error', (err) => fail(err))

    const blockTimer = setTimeout(() => {
      if (settled) return
      void (async () => {
        if (settled) return
        backgrounded = true
        const out = formatOutput(stdout, stderr)
        if (isDevServer) {
          const parsed = parsePortsFromOutput(`${stdout}\n${stderr}`)
          const candidates = parsed.length > 0 ? parsed : [USER_DEV_PORT]
          const ready = await findReadyPort(candidates)
          const port = ready ?? candidates[0] ?? USER_DEV_PORT
          const note = ready
            ? devServerReadyNote(port, child.pid)
            : `\n\n[开发服务器已在后台运行（端口可能为 ${port}，PID ${child.pid ?? '?'}）。若无法打开请稍等几秒后访问 http://localhost:${port}]`
          finish(out + note, true)
        } else {
          finish(
            `${out}\n\n[命令已运行超过 ${blockMs / 1000}s，进程继续在后台执行，PID ${child.pid ?? '?'}]`,
            true
          )
        }
      })()
    }, blockMs)

    child.on('close', (code) => {
      clearTimeout(blockTimer)
      if (settled) {
        if (!backgrounded) cleanup(false)
        return
      }
      detachListeners()
      const out = formatOutput(stdout, stderr)
      if (code !== 0 && code !== null) {
        finish(`${out}\n\n(exit code ${code})`, false)
      } else {
        finish(out, false)
      }
    })
  })
}
