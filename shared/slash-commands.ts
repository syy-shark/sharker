/**
 * 斜杠命令目录：供输入框菜单与 /help 展示。
 * @see agent/commands.ts
 */

/** 命令作用域：UI 本地执行 vs 走 Agent 管线 */
export type SlashCommandScope = 'ui' | 'agent'

/** 斜杠命令元数据 */
export interface SlashCommandMeta {
  name: string
  description: string
  scope: SlashCommandScope
  /** UI 命令的动作 id（renderer 处理） */
  action?: string
  /** 可选参数提示 */
  argsHint?: string
  category: SlashCommandCategory
}

export type SlashCommandCategory =
  | 'mode'
  | 'session'
  | 'tools'
  | 'workspace'
  | 'panel'
  | 'other'

export const SLASH_COMMAND_CATEGORIES: Record<
  SlashCommandCategory,
  { label: string; order: number }
> = {
  mode: { label: '模式', order: 0 },
  session: { label: '对话', order: 1 },
  tools: { label: '工具', order: 2 },
  workspace: { label: '工作区', order: 3 },
  panel: { label: '面板', order: 4 },
  other: { label: '其他', order: 5 }
}

/** 全部斜杠命令（UI + Agent） */
export const SLASH_COMMANDS: SlashCommandMeta[] = [
  {
    name: 'plan',
    description: '进入计划模式（只读调研，输出计划）',
    scope: 'agent',
    category: 'mode'
  },
  {
    name: 'build',
    description: '按计划进入构建模式（需先有计划）',
    scope: 'agent',
    category: 'mode'
  },
  {
    name: 'compact',
    description: '压缩当前对话上下文（摘要旧消息）',
    scope: 'agent',
    category: 'session'
  },
  {
    name: 'clear',
    description: '清空当前对话消息',
    scope: 'agent',
    category: 'session'
  },
  {
    name: 'new',
    description: '新建对话',
    scope: 'ui',
    action: 'new_conversation',
    category: 'session'
  },
  {
    name: 'history',
    description: '浏览并恢复历史对话',
    scope: 'ui',
    action: 'show_history',
    category: 'session'
  },
  {
    name: 'resume',
    description: '恢复上一条对话',
    scope: 'ui',
    action: 'resume_conversation',
    category: 'session'
  },
  {
    name: 'model',
    description: '切换对话模型',
    scope: 'ui',
    action: 'pick_model',
    argsHint: '[模型名]',
    category: 'tools'
  },
  {
    name: 'skill',
    description: '选择 Skill 并注入提示',
    scope: 'ui',
    action: 'pick_skill',
    argsHint: '[skill名]',
    category: 'tools'
  },
  {
    name: 'branch',
    description: '查看 / 切换 Git 分支',
    scope: 'ui',
    action: 'git_branch',
    category: 'workspace'
  },
  {
    name: 'terminal',
    description: '打开 / 关闭右侧终端面板',
    scope: 'ui',
    action: 'toggle_terminal',
    category: 'panel'
  },
  {
    name: 'files',
    description: '打开 / 关闭右侧文件树',
    scope: 'ui',
    action: 'toggle_files',
    category: 'panel'
  },
  {
    name: 'browser',
    description: '打开 / 关闭内置浏览器',
    scope: 'ui',
    action: 'toggle_browser',
    category: 'panel'
  },
  {
    name: 'automations',
    description: '打开自动化（定时任务）',
    scope: 'ui',
    action: 'open_automations',
    category: 'panel'
  },
  {
    name: 'settings',
    description: '打开设置',
    scope: 'ui',
    action: 'open_settings',
    category: 'other'
  },
  {
    name: 'help',
    description: '显示帮助与命令列表',
    scope: 'agent',
    category: 'other'
  }
]

/** 按输入过滤命令（/ 后文本，不含 /） */
export function filterSlashCommands(query: string): SlashCommandMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) => c.name.startsWith(q) || c.description.toLowerCase().includes(q)
  )
}

/** 生成 help 文本中的命令表 */
export function formatSlashCommandHelp(): string {
  const byCat = new Map<SlashCommandCategory, SlashCommandMeta[]>()
  for (const c of SLASH_COMMANDS) {
    const list = byCat.get(c.category) ?? []
    list.push(c)
    byCat.set(c.category, list)
  }
  const lines = ['**斜杠命令**（输入 `/` 可自动补全）：', '']
  for (const cat of Object.keys(SLASH_COMMAND_CATEGORIES).sort(
    (a, b) =>
      SLASH_COMMAND_CATEGORIES[a as SlashCommandCategory].order -
      SLASH_COMMAND_CATEGORIES[b as SlashCommandCategory].order
  ) as SlashCommandCategory[]) {
    const items = byCat.get(cat)
    if (!items?.length) continue
    lines.push(`**${SLASH_COMMAND_CATEGORIES[cat].label}**`)
    for (const c of items) {
      lines.push(`- \`/${c.name}\` — ${c.description}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}
