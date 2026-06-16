/**
 * Agent system prompt 与标题生成；Turn 主循环见 pipeline.ts / query-loop.ts。
 * @see agent/README.md
 */
import type { AppSettings, ApprovalRequest, ChatMessage } from '../shared/types'
import { getActiveWorkspacePath } from '../shared/workspace'
import { simpleCompletion } from '../providers/openai'
import { buildWorkspaceBootstrap } from './workspace-bootstrap'

const CODING_RULES = `# Work rules
- You MUST use the provided function tools (read_file, write_file, list_dir, etc.) to read, create, and edit files.
- NEVER print fake XML tool tags in your message text (e.g. <read_file>...</read_file>). Always call tools via tool_calls.
- Before editing a file, read it (read_file) or locate code (grep/glob) first.
- Prefer search_replace for small edits; use write_file only for new files.
- After code changes in Node/TS projects, rely on harness auto-verify output if present.
- run_terminal_cmd cwd must be the workspace path or a subdirectory — never / alone.
- Dev servers (npm run dev, vite, python -m http.server) run in background on port 3000 (not 5173); give the user http://localhost:3000 to open in their browser.
- Only git_commit / git_push when the user explicitly asks.
- Be concise. No emoji.`

/** 拼接身份、工作区、权限模式、编码规则与可选的工作区快照 */
export async function buildSystemPrompt(
  settings: AppSettings,
  options?: { includeBootstrap?: boolean }
): Promise<string> {
  const workspace = getActiveWorkspacePath(settings)
  const mode = settings.permissionMode === 'full' ? 'full (entire machine)' : 'sandbox (workspace only)'
  const parts = [
    `You are Sharker, a capable desktop AI assistant on Ubuntu.`,
    `You help with files, terminal commands, and programming via function tools — not by describing tools in plain text.`,
    ``,
    `Current workspace: ${workspace || '(not set)'}`,
    `Permission mode: ${mode}`,
    `All file paths and terminal/git cwd must be inside the workspace directory above.`,
    `Use that path as cwd for run_terminal_cmd and git tools — never use / or paths outside the workspace unless mode is full.`
  ]

  if (options?.includeBootstrap && workspace) {
    const snapshot = await buildWorkspaceBootstrap(workspace)
    if (snapshot) {
      parts.push('', '# Workspace snapshot', snapshot)
    }
  }

  parts.push('', CODING_RULES)
  return parts.join('\n')
}

/** 高危/路径审批回调：返回用户是否允许执行 */
export type ApprovalHandler = (req: ApprovalRequest) => Promise<boolean>

/** 根据对话前几轮内容生成简短中文标题，失败时回退到首条用户消息 */
export async function generateTitle(settings: AppSettings, messages: ChatMessage[]): Promise<string> {
  if (!messages.length) return '新对话'
  const transcript = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`)
    .join('\n')

  const sysPrompt = `You generate concise Chinese titles (2-8 characters) for chat conversations.
Return ONLY the title text, nothing else. No quotes, no punctuation, no explanation.
Examples: "React状态管理" "数据库优化方案" "CSS布局讨论" "Git合并冲突"`

  try {
    const result = await simpleCompletion(settings, sysPrompt, `Based on this conversation, generate a short title:\n\n${transcript}`)
    const cleaned = result.replace(/['"]/g, '').trim()
    if (cleaned && cleaned.length <= 20) return cleaned
    return cleaned.slice(0, 18) || '新对话'
  } catch {
    const firstUser = messages.find((m) => m.role === 'user' && m.content.trim())
    if (!firstUser) return '新对话'
    const text = firstUser.content.replace(/\s+/g, ' ').trim()
    return text.length <= 28 ? text : `${text.slice(0, 28)}…`
  }
}
