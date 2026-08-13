/**
 * macOS shell 启动：$SHELL 或 /bin/zsh。
 */

export interface ShellInvocation {
  command: string
  args: string[]
}

/** 将用户命令包装为单次 spawn 的 argv（非交互） */
export function wrapShellCommand(command: string): ShellInvocation {
  const shell = process.env.SHELL || '/bin/zsh'
  return { command: shell, args: ['-lc', command] }
}

/** 集成终端 PTY 默认 shell */
export function defaultInteractiveShell(): string {
  return process.env.SHARKER_SHELL || process.env.SHELL || '/bin/zsh'
}
