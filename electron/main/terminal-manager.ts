/**
 * 集成终端 PTY 管理（node-pty）。
 */
import os from 'os'
import type { BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { defaultInteractiveShell } from '../../tools/shared/shell-spawn'

interface TerminalSession {
  id: string
  pty: pty.IPty
}

const sessions = new Map<string, TerminalSession>()

/** 创建 PTY 会话并向窗口推送输出 */
export function createTerminal(
  win: BrowserWindow,
  cwd: string
): { id: string } {
  const id = crypto.randomUUID()
  const shell = defaultInteractiveShell()
  const proc = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: cwd || os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>
  })

  proc.onData((data) => {
    if (!win.isDestroyed()) win.webContents.send('terminal:data', { id, data })
  })

  proc.onExit(() => {
    sessions.delete(id)
    if (!win.isDestroyed()) win.webContents.send('terminal:exit', { id })
  })

  sessions.set(id, { id, pty: proc })
  return { id }
}

/** 写入 PTY stdin */
export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.pty.write(data)
}

/** 调整 PTY 尺寸 */
export function resizeTerminal(id: string, cols: number, rows: number): void {
  sessions.get(id)?.pty.resize(cols, rows)
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
}

/** 窗口关闭时清理全部 PTY */
export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) killTerminal(id)
}
