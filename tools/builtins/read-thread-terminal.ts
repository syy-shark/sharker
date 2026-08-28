/**
 * read_thread_terminal：读当前对话集成终端输出尾（对标 Codex inspect terminal）。
 * @see tools/ARCH.md
 */
import { readThreadTerminal } from '../services/thread-terminal-store'
import { formatThreadTerminalSnapshot } from '../../shared/terminal-snapshot'
import { ok } from '../context'
import type { ToolHandler } from '../types'
import { NO_RISK } from '../types'

export const readThreadTerminalTool: ToolHandler = {
  name: 'read_thread_terminal',
  title: '读集成终端',
  assessRisk() {
    return NO_RISK
  },
  async execute(args, ctx) {
    const conversationId = ctx.conversationId?.trim() ?? ''
    const snap = readThreadTerminal(conversationId)
    const maxChars = args.max_chars != null ? Number(args.max_chars) : undefined
    return ok(
      formatThreadTerminalSnapshot({
        attached: snap.attached,
        cwd: snap.cwd,
        tabs: snap.tabs,
        output: snap.output,
        maxChars
      })
    )
  }
}
