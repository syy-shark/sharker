/**
 * Codex 式命令面板目录（⌘K / ⌘⇧P）。
 * @see shared/ARCH.md
 */
import {
  ARCHIVE_CHAT_LABEL,
  CLEAR_ALL_UNREAD_INDICATORS_LABEL,
  CLEAR_TERMINAL_LABEL,
  COPY_AS_MARKDOWN_LABEL,
  COPY_CHAT_DEEP_LINK_LABEL,
  COPY_CONVERSATION_PATH_LABEL,
  COPY_SESSION_ID_LABEL,
  COPY_WORKING_DIRECTORY_LABEL,
  DECREASE_FONT_SIZE_LABEL,
  FIND_IN_CHAT_LABEL,
  INCREASE_FONT_SIZE_LABEL,
  MARK_CHAT_AS_UNREAD_LABEL,
  NAVIGATE_BACK_LABEL,
  NAVIGATE_FORWARD_LABEL,
  NEW_CHAT_LABEL,
  NEW_STANDALONE_CHAT_LABEL,
  NEXT_CHAT_NEEDING_ATTENTION_LABEL,
  OPEN_BROWSER_TAB_LABEL,
  OPEN_FOLDER_LABEL,
  OPEN_KEYBOARD_SHORTCUTS_LABEL,
  OPEN_MODEL_PICKER_LABEL,
  OPEN_PROJECT_PICKER_LABEL,
  OPEN_REVIEW_TAB_LABEL,
  OPEN_SETTINGS_LABEL,
  OPEN_SIDE_CHAT_LABEL,
  PIN_OR_UNPIN_CHAT_LABEL,
  REDO_LAST_APP_ACTION_LABEL,
  RENAME_CHAT_LABEL,
  RESET_FONT_SIZE_LABEL,
  RUN_ENVIRONMENT_ACTION_1_LABEL,
  SEARCH_CHATS_LABEL,
  SEARCH_FILES_LABEL,
  START_DICTATION_LABEL,
  START_VOICE_CHAT_LABEL,
  TOGGLE_ACTIVITY_VIEW_LABEL,
  TOGGLE_BOTTOM_PANEL_LABEL,
  TOGGLE_BROWSER_PANEL_LABEL,
  TOGGLE_FILE_TREE_LABEL,
  TOGGLE_SIDEBAR_LABEL,
  TOGGLE_TERMINAL_LABEL,
  UNDO_LAST_APP_ACTION_LABEL
} from './reveal-in-folder'

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
    title: NEW_CHAT_LABEL,
    shortcut: '⌘N',
    keywords: 'new chat conversation 新对话',
    action: 'new_conversation'
  },
  {
    id: 'task',
    title: '无项目新对话',
    keywords: 'task chat global no project 无项目 全局 /task /chat',
    action: 'new_global_conversation'
  },
  {
    id: 'model',
    title: OPEN_MODEL_PICKER_LABEL,
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
    title: 'Fork conversation',
    keywords: 'fork thread 分叉 对话 local',
    action: 'fork_conversation'
  },
  {
    id: 'fork-worktree',
    title: 'Fork to isolated worktree',
    keywords: 'fork worktree 分叉 隔离 checkout',
    action: 'fork_conversation'
  },
  {
    id: 'side',
    title: OPEN_SIDE_CHAT_LABEL,
    keywords: 'side btw popout 旁路 侧边',
    action: 'side_conversation'
  },
  {
    id: 'archive',
    title: ARCHIVE_CHAT_LABEL,
    keywords: 'archive 归档',
    action: 'archive_thread'
  },
  {
    id: 'archive-project-chats',
    title: '归档当前项目对话',
    keywords: 'archive chats project 归档 项目 对话 归档项目',
    action: 'archive_project_chats'
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
    title: '本对话记忆',
    keywords: 'memories memory 记忆 注入 写入',
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
    id: 'general',
    title: '通用设置',
    keywords: 'general follow-up enter review sleep 通用 后续 排队 注入 审查',
    action: 'open_general'
  },
  {
    id: 'personalization',
    title: '个性化',
    keywords: 'personalization personality agents.md 个性化 人格 自定义说明',
    action: 'open_personalization'
  },
  {
    id: 'notifications',
    title: '通知设置',
    keywords: 'notifications notify 通知 回合 批准',
    action: 'open_notifications'
  },
  {
    id: 'suggested-prompts',
    title: '建议提示',
    keywords: 'suggested prompts resume 建议 提示 空对话',
    action: 'open_suggested_prompts'
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
    title: '在文件管理器中显示项目',
    keywords: 'open worktree folder finder explorer 访达 资源管理器 打开 隔离',
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
    id: 'mcp-servers',
    title: 'MCP 服务器',
    keywords: 'mcp servers stdio http streamable 工具 设置',
    action: 'open_mcp'
  },
  {
    id: 'feedback',
    title: '打开反馈',
    keywords: 'feedback diagnose 反馈 诊断 问题',
    action: 'show_feedback'
  },
  {
    id: 'share',
    title: '分享只读快照',
    keywords: 'share snapshot thread 分享 快照 只读 /share',
    action: 'share_thread'
  },
  {
    id: 'copy-markdown',
    title: COPY_AS_MARKDOWN_LABEL,
    keywords: 'copy as markdown conversation export 复制 对话 markdown',
    action: 'copy_conversation_markdown'
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
    title: OPEN_REVIEW_TAB_LABEL,
    shortcut: '⌃⇧G',
    keywords: 'changes panel review 审查 面板 open review',
    action: 'toggle_changes'
  },
  {
    id: 'files',
    title: TOGGLE_FILE_TREE_LABEL,
    keywords: 'files tree 文件 开关 toggle',
    action: 'toggle_files'
  },
  {
    id: 'panel',
    title: TOGGLE_BOTTOM_PANEL_LABEL,
    shortcut: '⌘J',
    keywords: 'panel bottom 面板 右侧',
    action: 'toggle_panel'
  },
  {
    id: 'terminal',
    title: TOGGLE_TERMINAL_LABEL,
    shortcut: 'Ctrl+`',
    keywords: 'terminal 终端 开关 toggle',
    action: 'toggle_terminal'
  },
  {
    id: 'environment-action',
    title: RUN_ENVIRONMENT_ACTION_1_LABEL,
    shortcut: '⌘⇧D',
    keywords: 'run action environment local worktree 环境 动作 setup',
    action: 'run_environment_action'
  },
  {
    id: 'browser',
    title: TOGGLE_BROWSER_PANEL_LABEL,
    keywords: 'browser 浏览器 开关 toggle',
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
    title: TOGGLE_ACTIVITY_VIEW_LABEL,
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
    title: FIND_IN_CHAT_LABEL,
    shortcut: '⌘F',
    keywords: 'find search thread 查找 搜索',
    action: 'find_in_thread'
  },
  {
    id: 'search-chats',
    title: SEARCH_CHATS_LABEL,
    shortcut: undefined,
    keywords: 'search chats history 搜索 对话 历史',
    action: 'show_history'
  },
  {
    id: 'dictate',
    title: START_DICTATION_LABEL,
    shortcut: '⌃⇧D',
    keywords: 'dictate voice speech 听写 语音',
    action: 'start_dictation'
  },
  {
    id: 'voice-chat',
    title: START_VOICE_CHAT_LABEL,
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
    title: OPEN_SETTINGS_LABEL,
    shortcut: '⌘,',
    keywords: 'settings 设置',
    action: 'open_settings'
  },
  {
    id: 'folder',
    title: OPEN_FOLDER_LABEL,
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
    title: TOGGLE_SIDEBAR_LABEL,
    shortcut: '⌘B',
    keywords: 'sidebar 侧栏',
    action: 'toggle_sidebar'
  },
  {
    id: 'shortcuts',
    title: OPEN_KEYBOARD_SHORTCUTS_LABEL,
    shortcut: '⌘/',
    keywords: 'shortcuts keymap help 快捷键',
    action: 'shortcut_help'
  },
  {
    id: 'nav-back',
    title: NAVIGATE_BACK_LABEL,
    shortcut: '⌘[',
    keywords: 'back navigate 后退 导航',
    action: 'nav_back'
  },
  {
    id: 'nav-forward',
    title: NAVIGATE_FORWARD_LABEL,
    shortcut: '⌘]',
    keywords: 'forward navigate 前进 导航',
    action: 'nav_forward'
  },
  {
    id: 'font-larger',
    title: INCREASE_FONT_SIZE_LABEL,
    shortcut: '⌘+',
    keywords: 'font size zoom larger 字号 放大',
    action: 'font_larger'
  },
  {
    id: 'font-smaller',
    title: DECREASE_FONT_SIZE_LABEL,
    shortcut: '⌘-',
    keywords: 'font size zoom smaller 字号 缩小',
    action: 'font_smaller'
  },
  {
    id: 'font-reset',
    title: RESET_FONT_SIZE_LABEL,
    shortcut: '⌘0',
    keywords: 'font size reset 字号 重置',
    action: 'font_reset'
  },
  {
    id: 'clear-terminal',
    title: CLEAR_TERMINAL_LABEL,
    shortcut: 'Ctrl+L',
    keywords: 'clear terminal 清屏 终端',
    action: 'clear_terminal'
  },
  {
    id: 'clear-unread',
    title: CLEAR_ALL_UNREAD_INDICATORS_LABEL,
    shortcut: '⇧Esc',
    keywords: 'unread badge clear 未读 徽标',
    action: 'clear_unread'
  },
  {
    id: 'archive-shortcut',
    title: ARCHIVE_CHAT_LABEL,
    shortcut: '⌘⇧A',
    keywords: 'archive 归档',
    action: 'archive_thread'
  },
  {
    id: 'search-files',
    title: SEARCH_FILES_LABEL,
    shortcut: '⌘P',
    keywords: 'search files mention @ 文件 搜索',
    action: 'mention_file'
  },
  {
    id: 'open-browser',
    title: OPEN_BROWSER_TAB_LABEL,
    shortcut: '⌘T',
    keywords: 'browser tab 浏览器 标签',
    action: 'open_browser'
  },
  {
    id: 'next-attention',
    title: NEXT_CHAT_NEEDING_ATTENTION_LABEL,
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
    title: RENAME_CHAT_LABEL,
    shortcut: '⌘⌥R',
    keywords: 'rename title 重命名 标题',
    action: 'rename_conversation'
  },
  {
    id: 'pin',
    title: PIN_OR_UNPIN_CHAT_LABEL,
    shortcut: '⌘⌥P',
    keywords: 'pin unpin 置顶',
    action: 'pin_conversation'
  },
  {
    id: 'unread',
    title: MARK_CHAT_AS_UNREAD_LABEL,
    shortcut: '⌘⇧U',
    keywords: 'unread mark 未读',
    action: 'mark_unread'
  },
  {
    id: 'standalone',
    title: NEW_STANDALONE_CHAT_LABEL,
    shortcut: '⌘⌥O / ⌘⌥N',
    keywords: 'standalone new window quick chat 独立 新对话',
    action: 'standalone_conversation'
  },
  {
    id: 'project-picker',
    title: OPEN_PROJECT_PICKER_LABEL,
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
    title: COPY_WORKING_DIRECTORY_LABEL,
    shortcut: '⌘⇧C',
    keywords: 'copy cwd directory working 工作目录 路径',
    action: 'copy_cwd'
  },
  {
    id: 'copy-session',
    title: COPY_SESSION_ID_LABEL,
    shortcut: '⌘⌥C',
    keywords: 'copy session id 会话',
    action: 'copy_session_id'
  },
  {
    id: 'copy-deeplink',
    title: COPY_CHAT_DEEP_LINK_LABEL,
    shortcut: '⌘⌥L',
    keywords: 'copy deep link deeplink url sharker:// 深链',
    action: 'copy_deep_link'
  },
  {
    id: 'copy-conversation-path',
    title: COPY_CONVERSATION_PATH_LABEL,
    shortcut: '⌘⌥⇧C',
    keywords: 'copy conversation path worktree 对话路径 隔离',
    action: 'copy_conversation_path'
  },
  {
    id: 'undo-app',
    title: UNDO_LAST_APP_ACTION_LABEL,
    shortcut: '⌘Z',
    keywords: 'undo archive pin rename 撤销 归档 置顶 重命名',
    action: 'undo_app'
  },
  {
    id: 'redo-app',
    title: REDO_LAST_APP_ACTION_LABEL,
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
