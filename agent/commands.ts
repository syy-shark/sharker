/**
 * 斜杠命令注册表：本地处理、不走模型的用户输入。
 * @see agent/README.md
 */
import { formatSlashCommandHelp } from '../shared/slash-commands'
import { enterPlanMode, getPlanDocument } from '../tools/harness-state'

/** 单条斜杠命令的执行结果 */
export interface CommandRunResult {
  /** 直接作为助手回复的文本（如 /help） */
  reply?: string
  /** 渲染进程侧命令（如 clear 清空对话） */
  command?: string
  /** 改写后仍需走模型的用户文本 */
  rewrittenText?: string
  /** 是否继续 queryLoop */
  shouldQuery?: boolean
}

/** 斜杠命令定义 */
interface SlashCommand {
  name: string
  description: string
  run: (args: string) => CommandRunResult
}

const COMMANDS: SlashCommand[] = [
  {
    name: 'help',
    description: '显示 Sharker 能力与可用命令',
    run: () => ({
      reply: [
        '# Sharker 帮助',
        '',
        '**能力**：看搜改跑、Git、Skills、子 Agent、MCP、Computer/Browser Use。',
        '',
        formatSlashCommandHelp(),
        '',
        '直接输入问题即可开始；Agent 忙时可排队，或用「插队」立即执行新任务。'
      ].join('\n')
    })
  },
  {
    name: 'clear',
    description: '清空当前对话消息',
    run: () => ({ command: 'clear' })
  },
  {
    name: 'compact',
    description: '压缩当前对话上下文',
    run: () => ({ command: 'compact' })
  },
  {
    name: 'plan',
    description: '进入计划模式',
    run: (args) => {
      enterPlanMode()
      const hint = args.trim()
      const base =
        '请进入**计划模式**：仅使用只读工具调研代码库与用户目标，输出完整 Markdown 计划，然后调用 exit_plan_mode。'
      return {
        shouldQuery: true,
        rewrittenText: hint ? `${base}\n\n用户补充：${hint}` : base
      }
    }
  },
  {
    name: 'build',
    description: '按计划进入构建模式',
    run: () => {
      const { document } = getPlanDocument()
      if (!document?.trim()) {
        return {
          reply:
            '暂无待执行计划。请先 `/plan` 进入计划模式，或等待 Agent 调用 exit_plan_mode 产出计划后再 Build。'
        }
      }
      return {
        shouldQuery: true,
        rewrittenText: `__SHARKER_BUILD__\n请严格按照以下计划逐步实施（可使用全部工具）：\n\n${document}`
      }
    }
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
  const body = trimmed.slice(1)
  const space = body.indexOf(' ')
  const name = (space >= 0 ? body.slice(0, space) : body).toLowerCase()
  const args = space >= 0 ? body.slice(space + 1) : ''
  if (!name) return null
  const cmd = COMMANDS.find((c) => c.name === name)
  if (!cmd) {
    return {
      reply: `未知命令 \`/${name}\`。输入 \`/help\` 查看可用命令。`
    }
  }
  return cmd.run(args)
}
