/**
 * 斜杠命令目录：供输入框菜单与 /help 展示。
 * @see agent/commands.ts
 */
import { SCHEDULED_LABEL } from './automation'
import {
  OPEN_KEYBOARD_SHORTCUTS_LABEL,
  OPEN_REVIEW_TAB_LABEL,
  OPEN_SETTINGS_LABEL,
  RENAME_CHAT_LABEL,
  TOGGLE_BROWSER_PANEL_LABEL,
  TOGGLE_FILE_TREE_LABEL,
  TOGGLE_REVIEW_PANEL_LABEL,
  TOGGLE_TERMINAL_LABEL
} from './reveal-in-folder'
import { OPEN_SUBAGENTS_LABEL } from './subagent'

/** Official IDE / desktop slash copy (learn.chatgpt.com/docs/reference/slash-commands). */
export const SLASH_PLAN_DESCRIPTION = 'Toggle plan mode for multi-step planning.'
export const SLASH_GOAL_DESCRIPTION =
  'Set a persistent goal for ChatGPT to work toward; use /plan first to shape it.'
export const SLASH_STATUS_DESCRIPTION = 'Show the chat ID, context usage, and rate limits.'
export const SLASH_COMPACT_DESCRIPTION = "Compact the current chat's context."
export const SLASH_TASK_DESCRIPTION = 'Start a chat without a project.'
export const SLASH_INIT_DESCRIPTION = 'Generate an AGENTS.md scaffold for the current project.'
export const SLASH_MEMORIES_DESCRIPTION =
  'Configure whether the chat can use or generate memories, when Memories is available.'
export const SLASH_LOCAL_DESCRIPTION = 'Run the chat in the selected local project.'
export const SLASH_FEEDBACK_DESCRIPTION =
  'Open the feedback dialog to submit feedback and optionally include logs.'
export const SLASH_REVIEW_DESCRIPTION =
  'Start code review mode to review uncommitted changes or compare against a base branch.'
/** Official desktop /review visibility (learn.chatgpt.com/docs/code-review). */
export const REVIEW_SLASH_REQUIRES_GIT =
  'The `/review` command appears only when the open project is inside a Git repository.'
/** Official: hide `/review` from the composer list unless the project is a Git repo. */
export function shouldShowReviewSlash(options?: { isGitRepo?: boolean }): boolean {
  return options?.isGitRepo !== false
}
/** Official: Worktrees require a Git repository. */
export function shouldShowWorktreeSlash(options?: { isGitRepo?: boolean }): boolean {
  return options?.isGitRepo !== false
}
export const SLASH_PERSONALITY_DESCRIPTION =
  'Choose how Codex responds, when the current model supports personalities.'
export const SLASH_REASONING_DESCRIPTION = 'Choose the reasoning effort for the current chat.'
export const SLASH_APPROVE_DESCRIPTION =
  'Approve one retry of a recent automatic-review denial, when automatic review is active.'
export const SLASH_FORK_DESCRIPTION = 'Copy a local chat into a new local chat or worktree.'
/** Official desktop Share / `/share` (learn.chatgpt.com Use ChatGPT + changelog). Local copy only; do not invent Who has access / Copy link. */
export const SLASH_SHARE_DESCRIPTION = 'Share a read-only snapshot of a local Codex thread.'
/** Official desktop `/copy` (learn.chatgpt.com/docs/reference/slash-commands). Not message-id targeting (#24073). */
export const SLASH_COPY_DESCRIPTION = 'Copy the last response, code block, or quote.'
/** Official desktop slash catalog title (learn.chatgpt.com/docs/reference/slash-commands). */
export const SLASH_COMMANDS_LABEL = 'Slash commands'

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
    description: SLASH_PLAN_DESCRIPTION,
    scope: 'agent',
    argsHint: '[说明]',
    category: 'mode'
  },
  {
    name: 'plan-mode',
    description: SLASH_PLAN_DESCRIPTION,
    scope: 'agent',
    argsHint: '[说明]',
    category: 'mode'
  },
  {
    name: 'goal',
    description: SLASH_GOAL_DESCRIPTION,
    scope: 'ui',
    action: 'set_goal',
    argsHint: '[文本|edit|pause|resume|clear]',
    category: 'mode'
  },
  {
    name: 'status',
    description: SLASH_STATUS_DESCRIPTION,
    scope: 'ui',
    action: 'show_status',
    category: 'session'
  },
  {
    name: 'diff',
    description: OPEN_REVIEW_TAB_LABEL,
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
    description: SLASH_COMPACT_DESCRIPTION,
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
    description: 'New chat',
    scope: 'ui',
    action: 'new_conversation',
    category: 'session'
  },
  {
    name: 'task',
    description: SLASH_TASK_DESCRIPTION,
    scope: 'ui',
    action: 'new_global_conversation',
    category: 'session'
  },
  {
    name: 'chat',
    description: SLASH_TASK_DESCRIPTION,
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
    description: RENAME_CHAT_LABEL,
    scope: 'ui',
    action: 'rename_conversation',
    argsHint: '[标题]',
    category: 'session'
  },
  {
    name: 'agent',
    description: OPEN_SUBAGENTS_LABEL,
    scope: 'ui',
    action: 'toggle_agents',
    category: 'panel'
  },
  {
    name: 'fork',
    description: SLASH_FORK_DESCRIPTION,
    scope: 'ui',
    action: 'fork_conversation',
    argsHint: '[local|worktree]',
    category: 'session'
  },
  {
    name: 'side',
    description: 'Start a temporary side chat without interrupting the main chat.',
    scope: 'ui',
    action: 'side_conversation',
    argsHint: '[问题]',
    category: 'session'
  },
  {
    name: 'btw',
    description: 'Start a temporary side chat without interrupting the main chat.',
    scope: 'ui',
    action: 'side_conversation',
    argsHint: '[问题]',
    category: 'session'
  },
  {
    name: 'project',
    description: 'Choose a project for new chats.',
    scope: 'ui',
    action: 'open_project_picker',
    category: 'workspace'
  },
  {
    name: 'archive',
    description: 'Archive chat',
    scope: 'ui',
    action: 'archive_thread',
    category: 'session'
  },
  {
    name: 'rename',
    description: 'Rename chat',
    scope: 'ui',
    action: 'rename_conversation',
    argsHint: '[标题]',
    category: 'session'
  },
  {
    name: 'pin',
    description: 'Pin or unpin chat',
    scope: 'ui',
    action: 'pin_conversation',
    category: 'session'
  },
  {
    name: 'unread',
    description: 'Mark chat as unread',
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
    description: SLASH_INIT_DESCRIPTION,
    scope: 'ui',
    action: 'init_agents',
    category: 'workspace'
  },
  {
    name: 'permissions',
    description: '切换沙箱 / 完整权限（输入框下方也可切）',
    scope: 'ui',
    action: 'set_permissions',
    argsHint: '[sandbox|full]',
    category: 'mode'
  },
  {
    name: 'memories',
    description: SLASH_MEMORIES_DESCRIPTION,
    scope: 'ui',
    action: 'show_memories',
    argsHint: '[on|off|use|inherit]',
    category: 'session'
  },
  {
    name: 'local',
    description: SLASH_LOCAL_DESCRIPTION,
    scope: 'ui',
    action: 'set_thread_local',
    category: 'mode'
  },
  {
    name: 'worktree',
    description: 'Run the chat in a new Git worktree.',
    scope: 'ui',
    action: 'set_thread_worktree',
    category: 'mode'
  },
  {
    name: 'mcp',
    description: 'Open MCP status to view connected servers.',
    scope: 'ui',
    action: 'show_mcp',
    argsHint: '[verbose]',
    category: 'tools'
  },
  {
    name: 'feedback',
    description: SLASH_FEEDBACK_DESCRIPTION,
    scope: 'ui',
    action: 'show_feedback',
    category: 'other'
  },
  {
    name: 'share',
    description: SLASH_SHARE_DESCRIPTION,
    scope: 'ui',
    action: 'share_thread',
    category: 'session'
  },
  {
    name: 'model',
    description: 'Choose the model for the current chat.',
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
    description: TOGGLE_TERMINAL_LABEL,
    scope: 'ui',
    action: 'toggle_terminal',
    category: 'panel'
  },
  {
    name: 'files',
    description: TOGGLE_FILE_TREE_LABEL,
    scope: 'ui',
    action: 'toggle_files',
    category: 'panel'
  },
  {
    name: 'changes',
    description: TOGGLE_REVIEW_PANEL_LABEL,
    scope: 'ui',
    action: 'toggle_changes',
    category: 'panel'
  },
  {
    name: 'review',
    description: SLASH_REVIEW_DESCRIPTION,
    scope: 'ui',
    action: 'review_working_tree',
    argsHint: '[uncommitted|branch|commit] [here|detached] [关注点]',
    category: 'panel'
  },
  {
    name: 'personality',
    description: SLASH_PERSONALITY_DESCRIPTION,
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
    description: SLASH_COPY_DESCRIPTION,
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
    description: SLASH_REASONING_DESCRIPTION,
    scope: 'ui',
    action: 'set_reasoning',
    argsHint: '[档位]',
    category: 'mode'
  },
  {
    name: 'fast',
    description: '开关 Fast（输入框旁也可切；关掉或降到最低思考）',
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
    description: TOGGLE_BROWSER_PANEL_LABEL,
    scope: 'ui',
    action: 'toggle_browser',
    category: 'panel'
  },
  {
    name: 'agents',
    description: OPEN_SUBAGENTS_LABEL,
    scope: 'ui',
    action: 'toggle_agents',
    category: 'panel'
  },
  {
    name: 'subagents',
    description: OPEN_SUBAGENTS_LABEL,
    scope: 'ui',
    action: 'toggle_agents',
    category: 'panel'
  },
  {
    name: 'approve',
    description: SLASH_APPROVE_DESCRIPTION,
    scope: 'ui',
    action: 'approve_denied',
    category: 'mode'
  },
  {
    name: 'automations',
    description: SCHEDULED_LABEL,
    scope: 'ui',
    action: 'open_automations',
    category: 'panel'
  },
  {
    name: 'settings',
    description: OPEN_SETTINGS_LABEL,
    scope: 'ui',
    action: 'open_settings',
    category: 'other'
  },
  {
    name: 'keymap',
    description: OPEN_KEYBOARD_SHORTCUTS_LABEL,
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
export function filterSlashCommands(
  query: string,
  options?: { isGitRepo?: boolean }
): SlashCommandMeta[] {
  const q = query.trim().toLowerCase()
  const listed = SLASH_COMMANDS.filter((c) => {
    if (c.name === 'review') return shouldShowReviewSlash(options)
    if (c.name === 'worktree') return shouldShowWorktreeSlash(options)
    return true
  })
  if (!q) return listed
  return listed.filter(
    (c) => c.name.startsWith(q) || c.description.toLowerCase().includes(q)
  )
}

/** 斜杠菜单：内置命令 + 已安装 Skill（对标 Codex：Enabled skills appear in the slash list） */
export function slashItemsWithSkills(
  query: string,
  skills: Array<{ name: string; description?: string }>,
  options?: { isGitRepo?: boolean }
): SlashCommandMeta[] {
  const commands = filterSlashCommands(query, options)
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
