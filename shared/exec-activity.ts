/**
 * 官方命令过程文案（对标 Codex `exec_cell`：Running / Ran + command）。
 * 不发明 You ran（用户 shell）或 unified-exec 交互单元格。
 * @see shared/ARCH.md
 */

export const EXEC_TOOL = 'run_terminal_cmd'

/** shell 命令摘要：保留 -rf 等短选项，直播标题截断 */
export function summarizeExecCommand(detail: string | undefined, max = 36): string | undefined {
  if (!detail) return undefined
  const clean = String(detail)
    .replace(/```[\s\S]*?```/g, '代码片段')
    .replace(/[`*>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return undefined
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** 进行中 Running，完成后 Ran；无命令时只留头 */
export function formatExecActivity(command: string | undefined, status?: string): string {
  const cmd = summarizeExecCommand(command)
  const header = status === 'active' ? 'Running' : 'Ran'
  return cmd ? `${header} ${cmd}` : header
}
