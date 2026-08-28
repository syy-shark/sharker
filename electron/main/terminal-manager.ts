/**
 * 集成终端 PTY 管理（node-pty）。
 * 输出尾写入 thread-terminal-store，供 read_thread_terminal 读取。
 * 若报 posix_spawnp failed：多为 spawn-helper 无 +x，运行 npm run fix:pty。
 * @see ./ARCH.md
 */
import fs from 'fs'
import os from 'os'
import type { BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { defaultInteractiveShell } from '../../tools/shared/shell-spawn'
import {
  activateThreadTerminal,
  appendThreadTerminalOutput,
  bindThreadTerminal,
  removeThreadTerminal,
  upsertThreadTerminal
} from '../../tools/services/thread-terminal-store'

interface TerminalSession {
  id: string
  pty: pty.IPty
}

const sessions = new Map<string, TerminalSession>()

function resolveWorkdir(cwd: string): string {
  const raw = cwd?.trim() || os.homedir()
  try {
    if (fs.existsSync(raw) && fs.statSync(raw).isDirectory()) return raw
  } catch {
    /* fall through */
  }
  return os.homedir()
}

function spawnShell(shell: string, workdir: string): pty.IPty {
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'en_US.UTF-8',
    PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'
  } as Record<string, string>

  const attempts: Array<{ args: string[] }> = [{ args: [] }]
  if (shell.includes('zsh') || shell.endsWith('/bash') || shell.endsWith('/sh')) {
    attempts.push({ args: ['-l'] })
  }

  let lastErr: unknown
  for (const { args } of attempts) {
    try {
      return pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workdir,
        env
      })
    } catch (e) {
      lastErr = e
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
  const hint =
    msg.includes('posix_spawnp') || msg.includes('spawn')
      ? '（可在仓库执行 npm run fix:pty 修复 spawn-helper 权限）'
      : ''
  throw new Error(`node-pty 启动失败（${shell}）：${msg}${hint}`)
}

/** 创建 PTY 会话并向窗口推送输出 */
export function createTerminal(
  win: BrowserWindow,
  cwd: string,
  conversationId = '',
  title = '终端'
): { id: string } {
  const id = crypto.randomUUID()
  const shell = defaultInteractiveShell()
  const workdir = resolveWorkdir(cwd)
  const proc = spawnShell(shell, workdir)
  const thread = conversationId.trim() || id

  sessions.set(id, { id, pty: proc })
  upsertThreadTerminal({
    id,
    conversationId: thread,
    cwd: workdir,
    title: title.trim() || '终端',
    active: true,
    buffer: ''
  })

  proc.onData((data) => {
    appendThreadTerminalOutput(id, data)
    if (!win.isDestroyed()) win.webContents.send('terminal:data', { id, data })
  })

  proc.onExit(() => {
    sessions.delete(id)
    removeThreadTerminal(id)
    if (!win.isDestroyed()) win.webContents.send('terminal:exit', { id })
  })
  return { id }
}

/** 写入 PTY stdin */
export function writeTerminal(id: string, data: string): void {
  const s = sessions.get(id)
  if (!s) return
  try {
    s.pty.write(data)
  } catch {
    /* PTY already exited */
  }
}

/** 调整 PTY 尺寸 */
export function resizeTerminal(id: string, cols: number, rows: number): void {
  const s = sessions.get(id)
  if (!s) return
  const c = Math.max(2, Math.floor(cols || 80))
  const r = Math.max(1, Math.floor(rows || 24))
  try {
    s.pty.resize(c, r)
  } catch {
    /* PTY already exited */
  }
}

export function bindTerminalThread(id: string, conversationId: string): void {
  bindThreadTerminal(id, conversationId)
}

export function activateTerminal(id: string): void {
  activateThreadTerminal(id)
}

/** 销毁 PTY */
export function killTerminal(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  try {
    s.pty.kill()
  } catch {
    /* already dead */
  }
  sessions.delete(id)
  removeThreadTerminal(id)
}

/** 窗口关闭时清理全部 PTY */
export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) killTerminal(id)
}
