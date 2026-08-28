/**
 * Agent system prompt 与标题生成；Turn 主循环见 pipeline.ts / query-loop.ts。
 * @see agent/ARCH.md
 */
import type { AppSettings, ApprovalRequest, ChatMessage } from '../shared/types'
import { getActiveWorkspacePath } from '../shared/workspace'
import { gatherComputerUseStatus } from '../shared/computer-use-status'
import { gatherBrowserUseStatus } from '../shared/browser-use-status'
import { simpleCompletion } from '../providers/openai'
import { buildWorkspaceBootstrap } from './workspace-bootstrap'
import { loadAgentsInstructions } from './agents-md'
import { parsePersonality, personalityPrompt } from '../shared/personality'
import { gitPromptSystemSection } from '../shared/git-prompt'
import { getHarnessPhase } from '../tools/harness-state'

const CODING_RULES_BASE = `# Work rules
- You MUST use the provided function tools (read_file, write_file, list_dir, etc.) to read, create, and edit files.
- NEVER print fake XML tool tags or JSON tool-call objects in your message text (e.g. <read_file>...</read_file> or {"tool":"write_file",...}). Always call tools via tool_calls.
- Before editing a file, read it (read_file) or locate code (grep/glob) first.
- When exploring, batch multiple read-only tool calls in ONE turn (read_file + grep + list_dir) for speed.
- Users may attach files with @path/to/file in their message — content is injected automatically.
- Prefer search_replace for small edits; use write_file only for new files.
- After code changes in Node/TS projects, rely on harness auto-verify output if present.
- run_terminal_cmd cwd must be the workspace path or a subdirectory — never / alone.
- To inspect this chat’s integrated terminal (dev server / build output), call read_thread_terminal instead of asking the user to paste it.
- Dev servers (npm run dev, vite, python -m http.server) run in background on port 3000 (not 5173); give the user http://localhost:3000 to open in their browser.
- Starting a local server is only a step, never the finish line. After it starts, continue with the next concrete action: load the page, inspect/screenshot it, fix errors, and report only when the requested task is actually complete or blocked by a real external gate.
- For coding/building tasks, do not stop at "I will start..." or "needs a server". Use tools to do the work, keep going after background tasks, and verify the visible result when possible.
- Only git_commit / git_push when the user explicitly asks.
- Browser automation: browser_* tools (Playwright); desktop automation: desktop_* on macOS (screencapture / osascript / cliclick).
- Visible browsing: when the user asks to open a website for them (e.g. "用 Chrome 打开哔哩哔哩"), call open_url with browser="chrome" or "default"; use browser_* only for headless page inspection/automation.
- When Computer Use is available (see # Computer Use section below if present), follow the Computer Use workflow there — do NOT stop after list_windows/screenshot alone.

# Communication style
- Do NOT use emoji or decorative symbols (e.g. ✅ 📋 📌 🎉) anywhere in your reply — not in prose, lists, or simulated terminal/command output.
- Only use emoji when the user explicitly asks for emoji or an emoji-heavy style.
- Prefer plain text: "已添加笔记", "今天", "-" bullets — no pictographs as status markers.
- Be concise.
- When listing commands, features, or comparisons (e.g. 命令/说明、功能/描述), use GitHub-style Markdown tables with a header row and |---| separator - not space-aligned plain text columns.

# Inline demos (conversation-native visualization) — CRITICAL
Follow the full harness spec: docs/inline-demo-spec.md (summary below).
When the user asks to demonstrate, show, illustrate, animate, or "画/演示/可视化" a concept, UI idea, animation, algorithm, comparison, or teaching example:
1. **Preferred**: call \`present_inline_demo\` with self-contained HTML/CSS/JS. Embedded in chat automatically.
2. **Alternative**: fenced block \`\`\`demo (aliases: demo-html, visualization, viz, inline-demo).
3. **Forbidden**: write HTML to disk + open browser / localhost / open_url just to "show" a demo.
4. Host CSS vars: --text, --text-secondary, --text-muted, --accent, --accent-soft, --border, --border-soft, --bg, --surface, --surface-nested, --surface-popover, --danger, --success, --radius, --font, --mono. Body background **transparent**. Surfaces use these vars — never hardcode #111 / #1a1a1a / #222 page fills (they will not match the host metal/glass theme). No outer fake browser chrome on the whole demo.
5. **Layout (must)**:
   - Root fits chat width; no fixed huge min-height; no large empty bottom padding that leaves a blank band under the demo.
   - Host shows the demo **fully expanded in the chat** (no internal scrollbar). Do not wrap the whole demo in \`overflow:auto\` + fixed height.
   - All text stays **inside** cards (overflow hidden / min-width:0 / overflow-wrap). Never clip labels out of cards.
   - Multi-column rows (e.g. Git 三区): use flex/grid with \`flex-wrap: wrap\`, equal \`min-width: 0\`, gap; never collapse a middle column into a vertical strip.
6. **Interaction (must)**:
   - Every visible step button must **work** when clicked (update zones + log). Do not ship dead buttons.
   - Disabled state only when truly unavailable; otherwise keep clickable. Wire real onclick/handlers in the same HTML.
7. **Fake terminal (only the log block, not the whole demo)**:
   - Put shell output in \`<pre class="demo-terminal">\`. Host adds macOS traffic lights + centered title.
   - Continuous log lines: command then output immediately — **no blank spacers / empty min-height slots**.
8. **Commit history**: compact list (hash + message), height fits content — not an empty tall graph.
9. Prose: short line before and/or after the demo; no long restatement after process stream.
10. File writes / servers are for real project work — never as a substitute for inline demos.
11. **Math in demos**: Prefer Unicode (G_μν, Λ, π, ρ) or wrap LaTeX as \`( ... )\` / \`[ ... ]\` / \`$...$\` so the host KaTeX can render. Never dump raw unbroken strings like \`G_{\\mu\\nu}\` as plain table text without delimiters or Unicode.`

function platformUninstallRules(): string {
  return `# Uninstall / remove applications (macOS)
- When the user asks to uninstall or delete an app, call **uninstall_application** — it stops processes, removes .app bundles / brew casks when possible, deletes user data under ~/Library, and verifies.
- Prefer brew uninstall --cask for Homebrew apps; trash /Applications/*.app for drag-installed apps.
- After any delete, read the harness verify output (STILL EXISTS / clean: false) before telling the user it is done.
- Every turn must end with a plain-text summary for the user.`
}

function buildDesktopWorkflow(): string[] {
  return [
    '## Desktop workflow (follow strictly for desktop tasks)',
    '1. Start with desktop_screenshot and/or desktop_list_windows.',
    '2. Use desktop_click / desktop_type / desktop_key / desktop_scroll to interact.',
    '3. Do NOT stop after one screenshot or window list — continue until the user task is done.',
    '4. Click/type/scroll need user approval in Sharker — wait for Allow, then continue.',
    '5. Never output <tool_call> XML in text — use real function tool_calls only.',
    '6. Prefer screenshot vision + coordinate clicks when UI structure is unclear.'
  ]
}

function buildComputerUsePrompt(cu: Awaited<ReturnType<typeof gatherComputerUseStatus>>): string[] {
  return [
    '# Computer Use (desktop automation · macOS)',
    `Status: ${cu.builtinReady ? 'ready' : 'partial — grant Screen Recording / Accessibility'}`,
    `Tools: ${cu.builtinTools.join(', ')}`,
    'Grant Accessibility + Screen Recording in System Settings → Privacy & Security.',
    ...buildDesktopWorkflow()
  ]
}

function buildCodingRules(): string {
  return `${CODING_RULES_BASE}\n\n${platformUninstallRules()}`
}

/** 拼接身份、工作区、权限模式、编码规则与可选的工作区快照 */
export async function buildSystemPrompt(
  settings: AppSettings,
  options?: { includeBootstrap?: boolean; cwd?: string; conversationId?: string }
): Promise<string> {
  const workspace = getActiveWorkspacePath(settings)
  const mode = settings.permissionMode === 'full' ? 'full (entire machine)' : 'sandbox (workspace only)'
  const net = settings.networkMode ?? 'open'
  const netLabel =
    net === 'disabled' ? 'disabled (no outbound web/shell network)' : net === 'local_only' ? 'local_only (localhost only)' : 'open'
  const parts = [
    `You are Sharker, a capable desktop AI assistant on macOS.`,
    `You help with files, terminal commands, and programming via function tools — not by describing tools in plain text.`,
    ``,
    `Current workspace: ${workspace || '(not set)'}`,
    `Permission mode: ${mode}`,
    `Network mode: ${netLabel}`,
    `All file paths and terminal/git cwd must be inside the workspace directory above.`,
    `Use that path as cwd for run_terminal_cmd and git tools — never use / or paths outside the workspace unless mode is full.`
  ]

  if (workspace) {
    try {
      const agents = await loadAgentsInstructions(workspace, { cwd: options?.cwd || workspace })
      if (agents.trim()) {
        parts.push('', '# Project instructions (AGENTS.md)', agents)
      }
    } catch {
      /* optional */
    }
  }

  if (options?.includeBootstrap && workspace) {
    const snapshot = await buildWorkspaceBootstrap(workspace)
    if (snapshot) {
      parts.push('', '# Workspace snapshot', snapshot)
    }
  }

  if (options?.includeBootstrap) {
    try {
      const cu = await gatherComputerUseStatus(workspace)
      parts.push('', ...buildComputerUsePrompt(cu))
    } catch {
      /* status probe optional */
    }

    if (settings.browserUseEnabled !== false) {
      try {
        const bu = await gatherBrowserUseStatus(workspace)
        parts.push(
          '',
          '# Browser Use',
          `Playwright: ${bu.playwrightAvailable ? 'installed' : 'not installed — npm install playwright && npx playwright install chromium'}`,
          'Visible browsing: use open_url to open URLs in the user browser/Chrome.',
          'In-app Browser panel can open URLs without Playwright.',
          'Headless automation: browser_* tools when Playwright is installed.'
        )
      } catch {
        /* optional */
      }
    }
  }

  const tone = personalityPrompt(parsePersonality(settings.personality))
  if (tone) parts.push('', '# Communication style', tone)
  const gitStyle = gitPromptSystemSection(settings)
  if (gitStyle) parts.push('', gitStyle)

  if (getHarnessPhase(options?.conversationId) === 'plan') {
    parts.push(
      '',
      '# Plan mode',
      'You are in plan mode for this conversation.',
      'Use only read-only tools to research the codebase and the user goal.',
      'Do not edit files, run mutating shell commands, commit, or push.',
      'Write a complete Markdown plan, then call exit_plan_mode with the full plan document.',
      'The user can click Build to execute the plan later.'
    )
  }

  parts.push('', buildCodingRules())
  return parts.join('\n')
}

/**
 * 高危/路径审批回调：返回 once / session / deny（或兼容 boolean）。
 * session 授权由 query-loop 的 SessionApprovalStore 落表并跳过后续同 tool。
 */
export type ApprovalHandler = (
  req: ApprovalRequest
) => Promise<import('../shared/approval-session').ApprovalDecision | boolean>

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
    const cleaned = result.replace(/['"`*_#]/g, '').replace(/\s+/g, ' ').trim()
    if (!cleaned) throw new Error('empty title')
    if (cleaned.length <= 20) return cleaned
    return cleaned.slice(0, 18) || '新对话'
  } catch {
    const firstUser = messages.find((m) => m.role === 'user' && m.content.trim())
    if (!firstUser) return '新对话'
    const text = firstUser.content.replace(/\s+/g, ' ').trim()
    return text.length <= 28 ? text : `${text.slice(0, 28)}…`
  }
}
