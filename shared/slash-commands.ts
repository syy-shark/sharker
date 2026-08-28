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
    name: 'plan-mode',
    description: '进入计划模式（/plan 别名，对标 Codex /plan-mode）',
    scope: 'agent',
    category: 'mode'
  },
  {
    name: 'goal',
    description: '设定 / 暂停 / 清除线程目标',
    scope: 'ui',
    action: 'set_goal',
    argsHint: '[文本|pause|resume|clear]',
    category: 'mode'
  },
  {
    name: 'status',
    description: '显示当前模型、权限、线程与上下文',
    scope: 'ui',
    action: 'show_status',
    category: 'session'
  },
  {
    name: 'diff',
    description: '打开变更审查（查看本地 diff）',
    scope: 'ui',
    action: 'show_diff',
    category: 'panel'
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
    name: 'fork',
    description: '分叉当前对话到新线程（保留消息，隔离 worktree 另建）',
    scope: 'ui',
    action: 'fork_conversation',
    category: 'session'
  },
  {
    name: 'side',
    description: '旁路新线程（不离开当前对话，弹出独立窗）',
    scope: 'ui',
    action: 'side_conversation',
    category: 'session'
  },
  {
    name: 'btw',
    description: '旁路新线程（/side 别名）',
    scope: 'ui',
    action: 'side_conversation',
    category: 'session'
  },
  {
    name: 'archive',
    description: '归档当前对话（保留记录，清托管 worktree）',
    scope: 'ui',
    action: 'archive_thread',
    category: 'session'
  },
  {
    name: 'rename',
    description: '重命名当前对话',
    scope: 'ui',
    action: 'rename_conversation',
    argsHint: '[标题]',
    category: 'session'
  },
  {
    name: 'pin',
    description: '置顶 / 取消置顶当前对话',
    scope: 'ui',
    action: 'pin_conversation',
    category: 'session'
  },
  {
    name: 'unread',
    description: '将当前对话标为未读',
    scope: 'ui',
    action: 'mark_unread',
    category: 'session'
  },
  {
    name: 'usage',
    description: '查看本机 Token 用量',
    scope: 'ui',
    action: 'show_usage',
    argsHint: '[daily|weekly|cumulative]',
    category: 'session'
  },
  {
    name: 'init',
    description: '在仓库根创建 AGENTS.md 项目说明',
    scope: 'ui',
    action: 'init_agents',
    category: 'workspace'
  },
  {
    name: 'permissions',
    description: '切换沙箱 / 完整权限',
    scope: 'ui',
    action: 'set_permissions',
    argsHint: '[sandbox|full]',
    category: 'mode'
  },
  {
    name: 'memories',
    description: '查看 / 开关长期记忆注入与写入',
    scope: 'ui',
    action: 'show_memories',
    argsHint: '[on|off|inject on|generate off]',
    category: 'session'
  },
  {
    name: 'local',
    description: '交接回本地工作区',
    scope: 'ui',
    action: 'set_thread_local',
    category: 'mode'
  },
  {
    name: 'worktree',
    description: '交接进隔离 worktree',
    scope: 'ui',
    action: 'set_thread_worktree',
    category: 'mode'
  },
  {
    name: 'mcp',
    description: '查看已配置的 MCP Server',
    scope: 'ui',
    action: 'show_mcp',
    argsHint: '[verbose]',
    category: 'tools'
  },
  {
    name: 'feedback',
    description: '生成本地诊断（不外发）',
    scope: 'ui',
    action: 'show_feedback',
    category: 'other'
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
    name: 'changes',
    description: '打开右侧变更审查',
    scope: 'ui',
    action: 'toggle_changes',
    category: 'panel'
  },
  {
    name: 'review',
    description: '审查变更（未提交或相对基线，只读）',
    scope: 'ui',
    action: 'review_working_tree',
    argsHint: '[uncommitted|branch] [here]',
    category: 'panel'
  },
  {
    name: 'personality',
    description: '切换人格（务实 / 共情 / 关闭）',
    scope: 'ui',
    action: 'set_personality',
    argsHint: '[pragmatic|empathetic|none]',
    category: 'mode'
  },
  {
    name: 'mention',
    description: '引用工作区文件（等同 @）',
    scope: 'ui',
    action: 'mention_file',
    category: 'workspace'
  },
  {
    name: 'skill',
    description: '引用 Skill（等同 $）',
    scope: 'ui',
    action: 'mention_skill',
    category: 'tools'
  },
  {
    name: 'skills',
    description: '浏览已安装 Skill',
    scope: 'ui',
    action: 'show_skills',
    argsHint: '[过滤]',
    category: 'tools'
  },
  {
    name: 'copy',
    description: '复制上一条已完成的助手回复',
    scope: 'ui',
    action: 'copy_last_output',
    category: 'session'
  },
  {
    name: 'fast',
    description: '开关 Fast（关掉或降到最低思考）',
    scope: 'ui',
    action: 'set_fast',
    argsHint: '[on|off|status]',
    category: 'mode'
  },
  {
    name: 'stop',
    description: '停止当前回合与后台终端',
    scope: 'ui',
    action: 'stop_terminals',
    category: 'session'
  },
  {
    name: 'browser',
    description: '打开 / 关闭内置浏览器',
    scope: 'ui',
    action: 'toggle_browser',
    category: 'panel'
  },
  {
    name: 'agents',
    description: '打开子 Agent 活动',
    scope: 'ui',
    action: 'toggle_agents',
    category: 'panel'
  },
  {
    name: 'subagents',
    description: '打开子 Agent 活动（/agents 别名）',
    scope: 'ui',
    action: 'toggle_agents',
    category: 'panel'
  },
  {
    name: 'approve',
    description: '批准重试最近一次被拒的高危操作',
    scope: 'ui',
    action: 'approve_denied',
    category: 'mode'
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
