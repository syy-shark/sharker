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
    description: '切换计划模式；带说明则开始规划',
    scope: 'agent',
    argsHint: '[说明]',
    category: 'mode'
  },
  {
    name: 'plan-mode',
    description: '切换计划模式（/plan 别名）',
    scope: 'agent',
    argsHint: '[说明]',
    category: 'mode'
  },
  {
    name: 'goal',
    description: '设定目标并开始首轮；空参查看，edit 改写，pause / resume / clear 管理',
    scope: 'ui',
    action: 'set_goal',
    argsHint: '[文本|edit|pause|resume|clear]',
    category: 'mode'
  },
  {
    name: 'status',
    description: '显示对话 ID、模型、权限、上下文与本机用量',
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
    scope: 'ui',
    action: 'compact_context',
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
    name: 'task',
    description: '在全局工作区开新对话（不绑定项目；/chat 同义）',
    scope: 'ui',
    action: 'new_global_conversation',
    category: 'session'
  },
  {
    name: 'chat',
    description: '不绑定项目开新对话（对标 Codex /chat）',
    scope: 'ui',
    action: 'new_global_conversation',
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
    description: '从历史恢复一条对话',
    scope: 'ui',
    action: 'resume_conversation',
    category: 'session'
  },
  {
    name: 'title',
    description: '重命名当前对话（/rename 别名）',
    scope: 'ui',
    action: 'rename_conversation',
    argsHint: '[标题]',
    category: 'session'
  },
  {
    name: 'agent',
    description: '打开子 Agent 活动',
    scope: 'ui',
    action: 'toggle_agents',
    category: 'panel'
  },
  {
    name: 'fork',
    description: '分叉到新本地线程；/fork worktree 另建隔离 worktree（不复用源路径）',
    scope: 'ui',
    action: 'fork_conversation',
    argsHint: '[local|worktree]',
    category: 'session'
  },
  {
    name: 'side',
    description: '旁路新线程（不离开当前对话，弹出独立窗；可带问题立刻发送）',
    scope: 'ui',
    action: 'side_conversation',
    argsHint: '[问题]',
    category: 'session'
  },
  {
    name: 'btw',
    description: '旁路新线程（/side 别名；可带问题立刻发送）',
    scope: 'ui',
    action: 'side_conversation',
    argsHint: '[问题]',
    category: 'session'
  },
  {
    name: 'project',
    description: '打开项目选择器（对标 Codex /project）',
    scope: 'ui',
    action: 'open_project_picker',
    category: 'workspace'
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
    description: '本对话记忆：使用 / 写入 / 关闭（不改全局）',
    scope: 'ui',
    action: 'show_memories',
    argsHint: '[on|off|use|inherit]',
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
    description: '打开 MCP 状态（设置 → MCP 服务器）',
    scope: 'ui',
    action: 'show_mcp',
    argsHint: '[verbose]',
    category: 'tools'
  },
  {
    name: 'feedback',
    description: '打开反馈对话框（仅本机复制，不外发）',
    scope: 'ui',
    action: 'show_feedback',
    category: 'other'
  },
  {
    name: 'share',
    description: '复制当前对话的只读快照（脱敏，不含工具输出）',
    scope: 'ui',
    action: 'share_thread',
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
    description: '审查变更（先选未提交 / 基线 / 指定 commit，可加关注点，只读）',
    scope: 'ui',
    action: 'review_working_tree',
    argsHint: '[uncommitted|branch|commit] [here|detached] [关注点]',
    category: 'panel'
  },
  {
    name: 'personality',
    description: '切换人格（务实 / 友好 / 关闭）',
    scope: 'ui',
    action: 'set_personality',
    argsHint: '[pragmatic|friendly|none]',
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
    description: '浏览并选用已安装 Skill（无参数打开侧栏 Skills 页）',
    scope: 'ui',
    action: 'show_skills',
    argsHint: '[过滤]',
    category: 'tools'
  },
  {
    name: 'copy',
    description: '复制上一条回复；有代码或引用时先选目标',
    scope: 'ui',
    action: 'copy_last_output',
    category: 'session'
  },
  {
    name: 'delete',
    description: '永久删除当前对话',
    scope: 'ui',
    action: 'delete_conversation',
    category: 'session'
  },
  {
    name: 'theme',
    description: '打开外观设置',
    scope: 'ui',
    action: 'open_appearance',
    category: 'other'
  },
  {
    name: 'debug-config',
    description: '打印本机配置摘要（不含密钥）',
    scope: 'ui',
    action: 'show_debug_config',
    category: 'other'
  },
  {
    name: 'reasoning',
    description: '查看或设定思考档（对标 Codex /reasoning）',
    scope: 'ui',
    action: 'set_reasoning',
    argsHint: '[档位]',
    category: 'mode'
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
    name: 'keymap',
    description: '打开键盘快捷键设置',
    scope: 'ui',
    action: 'open_shortcuts',
    category: 'other'
  },
  {
    name: 'help',
    description: '显示帮助与命令列表',
    scope: 'agent',
    category: 'other'
  }
]

/** Composer `!command` 走终端，不经过模型 */
export const BANG_SLASH_COMMAND: SlashCommandMeta = {
  name: 'shell',
  description: '在终端执行',
  scope: 'ui',
  action: 'run_shell',
  category: 'tools'
}

/**
 * 识别输入框里的 UI 斜杠（`/review branch`）。
 * 忙时先原样排队，收束后再解析（对标 Codex Tab queue slash）。
 */
export function matchUiSlashCommand(text: string): { cmd: SlashCommandMeta; args: string } | null {
  const t = String(text ?? '').trim()
  if (!t.startsWith('/')) return null
  const body = t.slice(1).trim()
  if (!body) return null
  const space = body.search(/\s/)
  const name = (space >= 0 ? body.slice(0, space) : body).toLowerCase()
  const args = space >= 0 ? body.slice(space + 1).trim() : ''
  const cmd = SLASH_COMMANDS.find((c) => c.name === name && c.scope === 'ui')
  return cmd ? { cmd, args } : null
}

/** 菜单选中命令时：已有 `/…` 草稿则整行排队，否则用 `/${name}` */
export function composerSlashLine(input: string, cmdName: string): string {
  const raw = String(input ?? '').trim()
  if (raw.startsWith('/')) return raw
  return `/${String(cmdName || '').trim()}`
}

/** 按输入过滤命令（/ 后文本，不含 /） */
export function filterSlashCommands(query: string): SlashCommandMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) => c.name.startsWith(q) || c.description.toLowerCase().includes(q)
  )
}

/** 斜杠菜单：内置命令 + 已安装 Skill（对标 Codex：Enabled skills appear in the slash list） */
export function slashItemsWithSkills(
  query: string,
  skills: Array<{ name: string; description?: string }>
): SlashCommandMeta[] {
  const commands = filterSlashCommands(query)
  const reserved = new Set(SLASH_COMMANDS.map((c) => c.name.toLowerCase()))
  const q = query.trim().toLowerCase()
  const skillItems: SlashCommandMeta[] = []
  for (const skill of skills) {
    const name = String(skill.name || '').trim()
    if (!name || reserved.has(name.toLowerCase())) continue
    if (
      q &&
      !name.toLowerCase().includes(q) &&
      !String(skill.description || '').toLowerCase().includes(q)
    ) {
      continue
    }
    skillItems.push({
      name,
      description: skill.description?.trim() || '已安装 Skill',
      scope: 'ui',
      action: 'insert_skill',
      category: 'tools'
    })
  }
  return skillItems.length ? [...commands, ...skillItems] : commands
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
