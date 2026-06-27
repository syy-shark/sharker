/**
 * 跨平台 shell 启动：Windows 用 cmd.exe，Unix 用 $SHELL/bash。
 */

export interface ShellInvocation {
  command: string
  args: string[]
}

/** 将用户命令包装为单次 spawn 的 argv（非交互） */
export function wrapShellCommand(command: string): ShellInvocation {
  if (process.platform === 'win32') {
    const comSpec = process.env.ComSpec || 'cmd.exe'
    return { command: comSpec, args: ['/d', '/s', '/c', command] }
  }
  const shell = process.env.SHELL || '/bin/bash'
  return { command: shell, args: ['-lc', command] }
}

/** 集成终端 PTY 默认 shell */
export function defaultInteractiveShell(): string {
  if (process.platform === 'win32') {
    return process.env.SHARKER_SHELL || process.env.ComSpec || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}
