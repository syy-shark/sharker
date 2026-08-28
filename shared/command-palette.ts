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
    id: 'task',
    title: '无项目新对话',
    keywords: 'task global no project 无项目 全局 /task',
    action: 'new_global_conversation'
  },
  {
    id: 'model',
    title: '选择模型',
    shortcut: 'Ctrl⇧M',
    keywords: 'model pick 模型 /model',
    action: 'pick_model'
  },
  {
    id: 'history',
    title: '历史对话',
    keywords: 'history resume 历史',
    action: 'show_history'
  },
  {
    id: 'resume',
    title: '恢复历史对话',
    keywords: 'resume history picker 恢复 历史',
    action: 'resume_conversation'
  },
  {
    id: 'compact',
    title: '压缩上下文',
    keywords: 'compact context 压缩 上下文',
    action: 'compact_context'
  },
  {
    id: 'fork',
    title: '分叉当前对话',
    keywords: 'fork thread 分叉 对话 local',
    action: 'fork_conversation'
  },
  {
    id: 'fork-worktree',
    title: '分叉到隔离 worktree',
    keywords: 'fork worktree 分叉 隔离 checkout',
    action: 'fork_conversation'
  },
  {
    id: 'side',
    title: '旁路新线程',
    keywords: 'side btw popout 旁路 侧边',
    action: 'side_conversation'
  },
  {
    id: 'archive',
    title: '归档当前对话',
    keywords: 'archive 归档',
    action: 'archive_thread'
  },
  {
    id: 'init',
    title: '初始化 AGENTS.md',
    keywords: 'init agents.md 项目说明',
    action: 'init_agents'
  },
  {
    id: 'permissions',
    title: '切换权限模式',
    keywords: 'permissions sandbox full 权限 沙箱',
    action: 'set_permissions'
  },
  {
    id: 'memories',
    title: '记忆状态',
    keywords: 'memories memory 记忆',
    action: 'show_memories'
  },
  {
    id: 'copy',
    title: '复制上一条助手回复',
    shortcut: 'Ctrl+O',
    keywords: 'copy output 复制 回复',
    action: 'copy_last_output'
  },
  {
    id: 'delete',
    title: '删除当前对话',
    keywords: 'delete conversation 删除 对话',
    action: 'delete_conversation'
  },
  {
    id: 'theme',
    title: '外观设置',
    keywords: 'theme appearance 外观 主题',
    action: 'open_appearance'
  },
  {
    id: 'debug-config',
    title: '调试配置',
    keywords: 'debug config 配置 诊断',
    action: 'show_debug_config'
  },
  {
    id: 'fast',
    title: '开关 Fast',
    keywords: 'fast thinking 思考 快速',
    action: 'set_fast'
  },
  {
    id: 'reasoning',
    title: '查看或设定思考档',
    keywords: 'reasoning thinking effort 思考 推理',
    action: 'set_reasoning'
  },
  {
    id: 'skills',
    title: '浏览 Skills',
    keywords: 'skills $ 技能',
    action: 'show_skills'
  },
  {
    id: 'stop',
    title: '停止回合与终端',
    keywords: 'stop abort terminal 停止 终端',
    action: 'stop_terminals'
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
    title: '打开反馈',
    keywords: 'feedback diagnose 反馈 诊断 问题',
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
    id: 'panel',
    title: '开关工作区面板',
    shortcut: '⌘J',
    keywords: 'panel bottom 面板 右侧',
    action: 'toggle_panel'
  },
  {
    id: 'terminal',
    title: '打开终端',
    shortcut: 'Ctrl+`',
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
    shortcut: '⌘⌥⇧U',
    keywords: 'agents subagent 子代理',
    action: 'toggle_agents'
  },
  {
    id: 'activity',
    title: '活动视图',
    shortcut: '⌘⌥U',
    keywords: 'activity waiting unread running 活动 等待 未读 进行中',
    action: 'toggle_activity'
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
    keywords: 'personality pragmatic friendly empathetic 人格 务实 友好 共情',
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
    title: '键盘快捷键',
    shortcut: '⌘/',
    keywords: 'shortcuts keymap help 快捷键',
    action: 'shortcut_help'
  },
  {
    id: 'nav-back',
    title: '后退',
    shortcut: '⌘[',
    keywords: 'back navigate 后退 导航',
    action: 'nav_back'
  },
  {
    id: 'nav-forward',
    title: '前进',
    shortcut: '⌘]',
    keywords: 'forward navigate 前进 导航',
    action: 'nav_forward'
  },
  {
    id: 'font-larger',
    title: '放大字号',
    shortcut: '⌘+',
    keywords: 'font size zoom larger 字号 放大',
    action: 'font_larger'
  },
  {
    id: 'font-smaller',
    title: '缩小字号',
    shortcut: '⌘-',
    keywords: 'font size zoom smaller 字号 缩小',
    action: 'font_smaller'
  },
  {
    id: 'font-reset',
    title: '重置字号',
    shortcut: '⌘0',
    keywords: 'font size reset 字号 重置',
    action: 'font_reset'
  },
  {
    id: 'clear-terminal',
    title: '清终端',
    shortcut: 'Ctrl+L',
    keywords: 'clear terminal 清屏 终端',
    action: 'clear_terminal'
  },
  {
    id: 'clear-unread',
    title: '清除未读徽标',
    shortcut: '⇧Esc',
    keywords: 'unread badge clear 未读 徽标',
    action: 'clear_unread'
  },
  {
    id: 'archive-shortcut',
    title: '归档当前对话',
    shortcut: '⌘⇧A',
    keywords: 'archive 归档',
    action: 'archive_thread'
  },
  {
    id: 'search-files',
    title: '搜索工作区文件',
    shortcut: '⌘P',
    keywords: 'search files mention @ 文件 搜索',
    action: 'mention_file'
  },
  {
    id: 'open-browser',
    title: '打开浏览器标签',
    shortcut: '⌘T',
    keywords: 'browser tab 浏览器 标签',
    action: 'open_browser'
  },
  {
    id: 'next-attention',
    title: '下一条进行中对话',
    shortcut: '⌘⌥A',
    keywords: 'attention live next 进行中 关注',
    action: 'next_attention'
  },
  {
    id: 'approve',
    title: '批准重试被拒操作',
    keywords: 'approve retry denied 批准 重试 拒绝',
    action: 'approve_denied'
  },
  {
    id: 'rename',
    title: '重命名当前对话',
    shortcut: '⌘⌥R',
    keywords: 'rename title 重命名 标题',
    action: 'rename_conversation'
  },
  {
    id: 'pin',
    title: '置顶 / 取消置顶',
    shortcut: '⌘⌥P',
    keywords: 'pin unpin 置顶',
    action: 'pin_conversation'
  },
  {
    id: 'unread',
    title: '标为未读',
    shortcut: '⌘⇧U',
    keywords: 'unread mark 未读',
    action: 'mark_unread'
  },
  {
    id: 'standalone',
    title: '独立新对话',
    shortcut: '⌘⌥O / ⌘⌥N',
    keywords: 'standalone new window quick chat 独立 新对话',
    action: 'standalone_conversation'
  },
  {
    id: 'project-picker',
    title: '打开项目选择器',
    shortcut: '⌘⌥⇧O',
    keywords: 'project picker workspace folder 项目 工作区',
    action: 'open_project_picker'
  },
  {
    id: 'usage',
    title: '打开用量',
    keywords: 'usage tokens profile streak 用量 画像 token 统计',
    action: 'open_usage'
  },
  {
    id: 'copy-cwd',
    title: '复制工作目录',
    shortcut: '⌘⇧C',
    keywords: 'copy cwd directory 工作目录 路径',
    action: 'copy_cwd'
  },
  {
    id: 'copy-session',
    title: '复制会话 ID',
    shortcut: '⌘⌥C',
    keywords: 'copy session id 会话',
    action: 'copy_session_id'
  },
  {
    id: 'copy-deeplink',
    title: '复制对话深链',
    shortcut: '⌘⌥L',
    keywords: 'copy deep link url sharker:// 深链',
    action: 'copy_deep_link'
  },
  {
    id: 'copy-conversation-path',
    title: '复制对话路径',
    shortcut: '⌘⌥⇧C',
    keywords: 'copy conversation path worktree 对话路径 隔离',
    action: 'copy_conversation_path'
  },
  {
    id: 'undo-app',
    title: '撤销上一次应用操作',
    shortcut: '⌘Z',
    keywords: 'undo archive pin rename 撤销 归档 置顶 重命名',
    action: 'undo_app'
  },
  {
    id: 'redo-app',
    title: '重做上一次应用操作',
    shortcut: '⌘⇧Z',
    keywords: 'redo 重做',
    action: 'redo_app'
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
