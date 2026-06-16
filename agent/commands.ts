/**
 * 斜杠命令注册表：本地处理、不走模型的用户输入。
 * @see agent/README.md
 */

/** 单条斜杠命令的执行结果 */
export interface CommandRunResult {
  /** 直接作为助手回复的文本（如 /help） */
  reply?: string
  /** 渲染进程侧命令（如 clear 清空对话） */
  command?: string
}

/** 斜杠命令定义 */
export interface SlashCommand {
  name: string
  description: string
  run: () => CommandRunResult
}

const COMMANDS: SlashCommand[] = [
  {
    name: 'help',
    description: '显示 Sharker 能力与可用命令',
    run: () => ({
      reply: [
        '# Sharker 帮助',
        '',
        '**能力**：看搜改跑、Git、Skills、终端命令；改代码后自动验证。',
        '',
        '**权限**：sandbox 仅限工作区；full 可访问整机。高危操作需确认。',
        '',
        '**命令**：',
        '- `/help` — 显示本帮助',
        '- `/clear` — 清空当前对话',
        '',
        '直接输入问题即可开始；Agent 忙时可排队，或用「插队」立即执行新任务。'
      ].join('\n')
    })
  },
  {
    name: 'clear',
    description: '清空当前对话消息',
    run: () => ({ command: 'clear' })
  }
]

/** 列出所有已注册斜杠命令 */
export function listSlashCommands(): SlashCommand[] {
  return [...COMMANDS]
}

/**
 * 解析用户输入是否为斜杠命令；匹配则返回执行结果，否则返回 null。
 * @param userText 原始用户输入
 */
export function matchSlashCommand(userText: string): CommandRunResult | null {
  const trimmed = userText.trim()
  if (!trimmed.startsWith('/')) return null
  const name = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase()
  if (!name) return null
  const cmd = COMMANDS.find((c) => c.name === name)
  if (!cmd) {
    return {
      reply: `未知命令 \`/${name}\`。输入 \`/help\` 查看可用命令。`
    }
  }
  return cmd.run()
}
