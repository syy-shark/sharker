/**
 * Codex 式命令面板目录（⌘K / ⌘⇧P）。
 * @see shared/ARCH.md
 */

/** 命令面板条目 */
export interface PaletteCommand {
  id: string
  title: string
  hint?: string
  shortcut?: string
  keywords: string
  action: string
}

/** 工作台命令（与斜杠 / 快捷键对齐） */
export const PALETTE_COMMANDS: PaletteCommand[] = [
  {
    id: 'new',
    title: '新对话',
    shortcut: '⌘N',
    keywords: 'new chat conversation 新对话',
    action: 'new_conversation'
  },
  {
    id: 'history',
    title: '历史对话',
    keywords: 'history resume 历史',
    action: 'show_history'
  },
  {
    id: 'fork',
    title: '分叉当前对话',
    keywords: 'fork thread 分叉 对话',
    action: 'fork_conversation'
  },
  {
    id: 'status',
    title: '会话状态',
    keywords: 'status model permission 状态 模型',
    action: 'show_status'
  },
  {
    id: 'goal',
    title: '设定线程目标',
    keywords: 'goal 目标',
    action: 'set_goal'
  },
  {
    id: 'open-worktree',
    title: '打开隔离 worktree',
    keywords: 'open worktree folder 打开 隔离',
    action: 'open_worktree'
  },
  {
    id: 'create-branch',
    title: '在此创建分支',
    keywords: 'create branch here 分支',
    action: 'create_branch_here'
  },
  {
    id: 'review',
    title: '审查未提交变更',
    shortcut: '⌘⌥B',
    keywords: 'review changes diff 审查 变更',
    action: 'review_working_tree'
  },
  {
    id: 'diff',
    title: '查看本地 diff',
    keywords: 'diff changes 变更 差异',
    action: 'show_diff'
  },
  {
    id: 'mcp',
    title: 'MCP 状态',
    keywords: 'mcp tools 工具',
    action: 'show_mcp'
  },
  {
    id: 'feedback',
    title: '复制诊断反馈',
    keywords: 'feedback diagnose 反馈 诊断',
    action: 'show_feedback'
  },
  {
    id: 'local',
    title: '交接回本地',
    keywords: 'local handoff 本地 交接',
    action: 'set_thread_local'
  },
  {
    id: 'worktree',
    title: '交接进隔离 worktree',
    keywords: 'worktree isolate 隔离',
    action: 'set_thread_worktree'
  },
  {
    id: 'changes',
    title: '打开审查面板',
    shortcut: '⌃⇧G',
    keywords: 'changes panel 审查 面板',
    action: 'toggle_changes'
  },
  {
    id: 'files',
    title: '打开文件树',
    keywords: 'files tree 文件',
    action: 'toggle_files'
  },
  {
    id: 'terminal',
    title: '打开终端',
    shortcut: '⌘J',
    keywords: 'terminal 终端',
    action: 'toggle_terminal'
  },
  {
    id: 'browser',
    title: '打开内置浏览器',
    keywords: 'browser 浏览器',
    action: 'toggle_browser'
  },
  {
    id: 'agents',
    title: '打开子 Agent 活动',
    shortcut: '⌘⌥U',
    keywords: 'agents subagent activity 活动 子代理',
    action: 'toggle_agents'
  },
  {
    id: 'mention',
    title: '引用工作区文件',
    keywords: 'mention file @ 引用 文件',
    action: 'mention_file'
  },
  {
    id: 'skill',
    title: '引用 Skill',
    keywords: 'skill $ 技能',
    action: 'mention_skill'
  },
  {
    id: 'find',
    title: '在对话中查找',
    shortcut: '⌘F',
    keywords: 'find search thread 查找 搜索',
    action: 'find_in_thread'
  },
  {
    id: 'search-chats',
    title: '搜索对话',
    shortcut: '⌘G',
    keywords: 'search chats history 搜索 对话 历史',
    action: 'show_history'
  },
  {
    id: 'dictate',
    title: '开始听写',
    shortcut: '⌃⇧D',
    keywords: 'dictate voice speech 听写 语音',
    action: 'start_dictation'
  },
  {
    id: 'voice-chat',
    title: '语音对话',
    shortcut: '⌃⇧V',
    keywords: 'voice chat talk 语音 对话',
    action: 'start_voice_chat'
  },
  {
    id: 'popout',
    title: '弹出当前对话',
    keywords: 'popout popup window 弹出 窗口',
    action: 'popout_thread'
  },
  {
    id: 'settings',
    title: '打开设置',
    shortcut: '⌘,',
    keywords: 'settings 设置',
    action: 'open_settings'
  },
  {
    id: 'folder',
    title: '打开文件夹',
    shortcut: '⌘O',
    keywords: 'open folder workspace 工作区 文件夹',
    action: 'open_folder'
  },
  {
    id: 'automations',
    title: '打开自动化',
    keywords: 'automations triage queue 自动化 审查队列',
    action: 'open_automations'
  },
  {
    id: 'personality',
    title: '切换人格',
    keywords: 'personality pragmatic empathetic 人格 务实 共情',
    action: 'set_personality'
  },
  {
    id: 'sidebar',
    title: '切换侧栏',
    shortcut: '⌘B',
    keywords: 'sidebar 侧栏',
    action: 'toggle_sidebar'
  },
  {
    id: 'shortcuts',
    title: '快捷键一览',
    shortcut: '⌘/',
    keywords: 'shortcuts keymap help 快捷键',
    action: 'shortcut_help'
  }
]

/** 按标题 / 关键词过滤命令 */
export function filterPaletteCommands(query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return PALETTE_COMMANDS
  return PALETTE_COMMANDS.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.keywords.toLowerCase().includes(q) ||
      c.id.startsWith(q)
  )
}
