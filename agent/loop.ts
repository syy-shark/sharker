/**
 * Agent system prompt 与标题生成；Turn 主循环见 pipeline.ts / query-loop.ts。
 * @see agent/README.md
 */
import type { AppSettings, ApprovalRequest, ChatMessage } from '../shared/types'
import { getActiveWorkspacePath } from '../shared/workspace'
import { gatherComputerUseStatus } from '../shared/computer-use-status'
import { gatherBrowserUseStatus } from '../shared/browser-use-status'
import { simpleCompletion } from '../providers/openai'
import { buildWorkspaceBootstrap } from './workspace-bootstrap'

const CODING_RULES_BASE = `# Work rules
- You MUST use the provided function tools (read_file, write_file, list_dir, etc.) to read, create, and edit files.
- NEVER print fake XML tool tags in your message text (e.g. <read_file>...</read_file>). Always call tools via tool_calls.
- Before editing a file, read it (read_file) or locate code (grep/glob) first.
- When exploring, batch multiple read-only tool calls in ONE turn (read_file + grep + list_dir) for speed.
- Users may attach files with @path/to/file in their message — content is injected automatically.
- Prefer search_replace for small edits; use write_file only for new files.
- MCP tools from ~/.sharker/mcp.json appear as mcp_<server>__<tool> — call them directly when configured.
- After code changes in Node/TS projects, rely on harness auto-verify output if present.
- run_terminal_cmd cwd must be the workspace path or a subdirectory — never / alone.
- Dev servers (npm run dev, vite, python -m http.server) run in background on port 3000 (not 5173); give the user http://localhost:3000 to open in their browser.
- Only git_commit / git_push when the user explicitly asks.
- Browser automation: browser_* tools (Playwright) or MCP @playwright/mcp; desktop automation: mcp_cua_driver__* (Cua Driver) or desktop_* fallback on Linux.
- When Computer Use is available (see # Computer Use section below if present), follow the Computer Use workflow there — do NOT stop after list_windows/screenshot alone.

# Communication style
- Do NOT use emoji or decorative symbols (e.g. ✅ 📋 📌 🎉) anywhere in your reply — not in prose, lists, or simulated terminal/command output.
- Only use emoji when the user explicitly asks for emoji or an emoji-heavy style.
- Prefer plain text: "已添加笔记", "今天", "-" bullets — no pictographs as status markers.
- Be concise.
- When listing commands, features, or comparisons (e.g. 命令/说明、功能/描述), use GitHub-style Markdown tables with a header row and |---| separator - not space-aligned plain text columns.`

function platformUninstallRules(): string {
  if (process.platform === 'win32') {
    return `# Uninstall / remove applications (Windows)
- When the user asks to uninstall software, prefer **uninstall_application** or winget-style commands via run_terminal_cmd.
- Do NOT claim removal succeeded until harness verify output confirms it.
- Every turn must end with a plain-text summary for the user.`
  }
  if (process.platform === 'linux') {
    return `# Uninstall / remove applications (Linux)
- When the user asks to uninstall or delete an app (卸载、删掉 Steam 等), call **uninstall_application** — it stops processes, removes apt packages via pkexec, deletes user data, cleans shortcuts, and verifies.
- Do NOT use manual rm -rf alone for full app removal; apt packages will remain and the app can reappear in the menu.
- Do NOT hide .desktop entries as a substitute for uninstalling.
- After any delete, read the harness verify output (STILL EXISTS / clean: false) before telling the user it is done.
- Every turn must end with a plain-text summary for the user.`
  }
  return `# Uninstall / remove applications
- Use **uninstall_application** when appropriate; verify before telling the user it is done.
- Every turn must end with a plain-text summary for the user.`
}

function buildCuaDriverWorkflow(): string[] {
  return [
    '## Cua Driver workflow (follow strictly for desktop tasks)',
    '1. Start with mcp_cua_driver__get_window_state — UIA/AT-SPI tree + screenshot metadata.',
    '2. Prefer element-level mcp_cua_driver__click / type_text over raw coordinates.',
    '3. Default dispatch is background; if tool returns background_unavailable, retry with dispatch foreground (needs user approval).',
    '4. Do NOT stop after one screenshot or window list — continue until the user task is done.',
    '5. Click/type/scroll need user approval in Sharker — wait for Allow, then continue.',
    '6. Never output <tool_call> XML in text — use real function tool_calls only.'
  ]
}

function buildComputerUsePrompt(cu: Awaited<ReturnType<typeof gatherComputerUseStatus>>): string[] {
  const lines = [
    '# Computer Use (desktop automation · Cua Driver)',
    `Status: ${cu.builtinReady ? 'ready' : 'partial — open Settings → Computer Use and run checks'}`,
    `Builtin stubs: ${cu.builtinTools.join(', ')} (prefer MCP when connected)`
  ]

  const usesCua =
    cu.mcp.connected &&
    (cu.mcp.toolSamples.some((t) => t.includes('cua_driver')) ||
      cu.mcp.command?.includes('cua-driver'))

  if (cu.mcp.connected && usesCua) {
    lines.push(
      `MCP cua-driver: connected (${cu.mcp.toolCount} tools), e.g. ${cu.mcp.toolSamples.slice(0, 4).join(', ')}`,
      ...buildCuaDriverWorkflow()
    )
  } else if (cu.mcp.connected) {
    lines.push(
      `MCP computer-use: connected (${cu.mcp.toolCount} tools), e.g. ${cu.mcp.toolSamples.slice(0, 4).join(', ')}`,
      'Use mcp_computer_use__get_app_state / screenshot / click when cua-driver is unavailable.'
    )
  } else if (cu.mcp.configured) {
    lines.push(`MCP configured but not connected: ${cu.mcp.error ?? 'check binary path and daemon'}`)
  } else if (process.platform === 'win32') {
    lines.push(
      'Cua Driver not configured — user should install via Settings → Computer Use.',
      'Fallback: run_terminal_cmd uses **Windows cmd** (not bash). Examples:',
      '- Open Chrome + URL: start chrome https://www.bilibili.com',
      '- Open app: start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
      'Prefer mcp_cua_driver__* when MCP is connected; use browser_* for headless web tasks.'
    )
  } else {
    lines.push(
      'MCP not connected — enable cua-driver in Settings → Computer Use.',
      'Linux fallback: desktop_* + ydotool when ydotoold is running.'
    )
    if (process.platform === 'linux') {
      lines.push(
        'WeChat / 微信 on Linux may lack AT-SPI tree — use screenshot vision + coordinate clicks if needed.'
      )
    }
  }

  return lines
}

function buildCodingRules(): string {
  return `${CODING_RULES_BASE}\n\n${platformUninstallRules()}`
}

/** 拼接身份、工作区、权限模式、编码规则与可选的工作区快照 */
export async function buildSystemPrompt(
  settings: AppSettings,
  options?: { includeBootstrap?: boolean }
): Promise<string> {
  const workspace = getActiveWorkspacePath(settings)
  const platformLabel =
    process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'
  const mode = settings.permissionMode === 'full' ? 'full (entire machine)' : 'sandbox (workspace only)'
  const net = settings.networkMode ?? 'open'
  const netLabel =
    net === 'disabled' ? 'disabled (no outbound web/shell network)' : net === 'local_only' ? 'local_only (localhost only)' : 'open'
  const parts = [
    `You are Sharker, a capable desktop AI assistant on ${platformLabel}.`,
    `You help with files, terminal commands, and programming via function tools — not by describing tools in plain text.`,
    ``,
    `Current workspace: ${workspace || '(not set)'}`,
    `Permission mode: ${mode}`,
    `Network mode: ${netLabel}`,
    `All file paths and terminal/git cwd must be inside the workspace directory above.`,
    `Use that path as cwd for run_terminal_cmd and git tools — never use / or paths outside the workspace unless mode is full.`
  ]

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
          process.platform === 'win32'
            ? 'Windows: browser_* and MCP @playwright/mcp work natively; in-app Browser panel opens URLs without Playwright.'
            : 'In-app Browser panel can open URLs without Playwright.',
          bu.mcpPlaywrightConfigured
            ? 'MCP @playwright/mcp is configured in ~/.sharker/mcp.json.'
            : 'Enable Browser Use in Settings to auto-configure MCP @playwright/mcp.'
        )
      } catch {
        /* optional */
      }
    }
  }

  parts.push('', buildCodingRules())
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
