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
    id: 'review',
    title: '审查未提交变更',
    shortcut: '⌘⌥B',
    keywords: 'review changes diff 审查 变更',
    action: 'review_working_tree'
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
    id: 'mention',
    title: '引用工作区文件',
    keywords: 'mention file @ 引用 文件',
    action: 'mention_file'
  },
  {
    id: 'find',
    title: '在对话中查找',
    shortcut: '⌘F',
    keywords: 'find search thread 查找 搜索',
    action: 'find_in_thread'
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
