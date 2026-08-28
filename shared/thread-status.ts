/**
 * `/status` 会话状态文案（对标 Codex 桌面端 /status）。
 * @see shared/ARCH.md
 */

/** `/status` 展示所需的当前线程快照 */
export interface ThreadStatusInfo {
  /** 当前对话 id（对标 Codex /status chat ID） */
  conversationId?: string
  modelLabel: string
  permissionMode: string
  networkMode: string
  threadMode: 'local' | 'worktree'
  workspacePath: string
  worktreePath?: string
  branch?: string
  goal?: string
  contextUsed?: number
  contextLimit?: number
}

function line(label: string, value: string | undefined): string {
  const v = String(value || '').trim()
  return `- **${label}**：${v || '—'}`
}

/** 拼一段 Markdown 状态（本地助手回复，不走模型） */
export function formatThreadStatus(info: ThreadStatusInfo): string {
  const mode = info.threadMode === 'worktree' ? '隔离 worktree' : '本地工作区'
  const ctx =
    info.contextUsed != null && info.contextLimit
      ? `${info.contextUsed} / ${info.contextLimit}`
      : undefined
  return [
    '**会话状态**',
    '',
    line('对话 ID', info.conversationId),
    line('模型', info.modelLabel),
    line('权限', info.permissionMode),
    line('网络', info.networkMode),
    line('线程', mode),
    line('工作区', info.workspacePath),
    info.threadMode === 'worktree' ? line('Worktree', info.worktreePath) : '',
    line('分支', info.branch),
    line('目标', info.goal),
    ctx ? line('上下文', ctx) : ''
  ]
    .filter(Boolean)
    .join('\n')
}
