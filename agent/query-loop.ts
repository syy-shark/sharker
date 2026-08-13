/**
 * Query 核心循环：流式问模型 → 工具调用 → 审批 → 自动验证，直至纯文本结束。
 * @see agent/ARCH.md
 */
import { randomUUID } from 'crypto'
import type { AppSettings, ApprovalRequest, ChatMessage, StreamChunk } from '../shared/types'
import { needsToolCalling } from '../shared/needs-tools'
import { getActiveWorkspacePath } from '../shared/workspace'
import { streamChat, type ChatCompletionMessage } from '../providers/openai'
import { executeToolWithMeta } from '../tools/executor'
import { needsPathApproval } from '../tools/permissions'
import { assertToolAllowed, getToolDefinitionsForPhase, isHighRiskTool } from '../tools/registry'
import { getHarnessPhase, enterPlanMode, finishBuildMode } from '../tools/harness-state'
import { pickVerifyCommand, shouldSkipAutoVerify } from './verify'
import { parseTextToolCalls, stripPartialToolXmlForDisplay, stripTextToolCalls, TEXT_TOOL_EXECUTED_HINT } from './text-tool-fallback'
import {
  buildVisionContentParts,
  extractScreenshotPathFromToolOutput,
  isScreenshotTool,
  providerSupportsVision
} from './vision-feedback'
import type { ApprovalHandler } from './loop'
import {
  isApprovalGranted,
  normalizeApprovalDecision,
  resolveSessionGrant,
  type SessionApprovalStore
} from '../shared/approval-session'

/** 默认工具循环上限（读/改/跑命令累加，多文件项目生成需要更长续跑空间） */
const DEFAULT_MAX_ITERATIONS = 40

function summarizeToolOutput(output: string, toolName?: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return undefined

  // 文件读取：用“行数/路径感”摘要，不要把 L1 源码原文塞进直播步骤
  if (toolName === 'read_file') {
    const numbered = lines.filter((line) => /^L\d+:\s/.test(line)).length
    if (numbered > 0) return `读取 ${numbered} 行`
    return `读取 ${lines.length} 行`
  }

  // 跳过 JSON/代码起始行这类噪音，优先找自然语言或命令结果
  const preferred =
    lines.find((line) => !/^(L\d+:|[{}\[\]|]|```|diff --git|index |@@)/.test(line)) || lines[0]
  return preferred.length > 120 ? `${preferred.slice(0, 117)}...` : preferred
}

function expandableToolOutput(output: string): string | undefined {
  const trimmed = output.trim()
  if (!trimmed) return undefined
  return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}\n...（输出已截断）` : trimmed
}

/** 从助手正文（含伪工具 JSON / demo 围栏）抠出正在生成的 html */
function extractDemoHtmlFromAssistantText(text: string): string | undefined {
  // ```demo ... 未闭合
  const fence = text.match(
    /```(?:demo|demo-html|html-demo|visualization|viz|inline-demo)[^\n]*\n([\s\S]*)$/i
  )
  if (fence?.[1] != null && !/```/.test(fence[1])) {
    const body = fence[1].trim()
    if (body.length >= 24) return body
  }
  // "html": "...." 未闭合 JSON 字段
  const marker = '"html"'
  const keyAt = text.lastIndexOf(marker)
  if (keyAt < 0) return undefined
  let i = keyAt + marker.length
  while (i < text.length && /\s/.test(text[i]!)) i++
  if (text[i] !== ':') return undefined
  i++
  while (i < text.length && /\s/.test(text[i]!)) i++
  if (text[i] !== '"') return undefined
  i++
  let raw = ''
  while (i < text.length) {
    const c = text[i]!
    if (c === '\\') {
      if (i + 1 >= text.length) break
      const n = text[i + 1]!
      if (n === 'n') raw += '\n'
      else if (n === 't') raw += '\t'
      else if (n === 'r') raw += '\r'
      else if (n === '"' || n === '\\' || n === '/') raw += n
      else raw += n
      i += 2
      continue
    }
    if (c === '"') break
    raw += c
    i++
  }
  return raw.length >= 24 ? raw : undefined
}

/** 桌面自动化任务关键词（用于中途续跑） */
const COMPUTER_USE_TASK_PATTERN =
  /微信|wechat|桌面|打开|点击|操作|computer\s*use|发消息|群发|窗口|截图|输入|继续/i

/** 是否像桌面自动化任务 */
function isComputerUseTask(text: string): boolean {
  return COMPUTER_USE_TASK_PATTERN.test(text)
}

/** 最近一轮是否执行过 Computer Use 相关工具 */
function hadComputerUseToolsInTurn(messages: ChatCompletionMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('[系统提示]')) {
      break
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return m.tool_calls.some((tc) => tc.function.name.startsWith('desktop_'))
    }
  }
  return false
}

/** 助手是否声称任务已完成 */
function assistantClaimsDone(text: string): boolean {
  return /已完成|已经发送|发送成功|任务完成|搞定了|done/i.test(text)
}

function isContinuationRequest(text: string): boolean {
  return /^(继续|接着|接着做|继续做|继续处理|继续执行|continue|go on|keep going)[!.?~，,\s]*$/i.test(
    text.trim()
  )
}

/** 助手是否停在“接下来要做”的中间态 */
function assistantIsStoppingMidTask(text: string): boolean {
  const tail = text.trim().slice(-700)
  return /(?:need|needs|should|will|let me|now\s+let\s+me|i'?ll|i\s+will|first|next|then)\s+.{0,40}(?:start|run|open|load|check|create|write|update|add|modify|fix|verify|inspect|build|implement|continue)|(?:start|run|open|load)\s+(?:a\s+)?(?:local\s+)?server|(?:http|local)\s+server|(?:需要|我先|让我|现在|接下来|下一步|然后).{0,30}(?:启动|运行|打开|加载|检查|修复|验证|创建|写入|修改|更新|添加|继续|服务器)|(?:let me|now|next|接下来|下一步|现在).{0,80}:\s*$/i.test(
    tail
  )
}

function isActionableWorkRequest(text: string): boolean {
  return /(?:continue|keep\s+going|go\s+on|create|build|make|implement|fix|run|start|open|test|verify|inspect|screenshot|server|website|three\.?js|vite|npm|html|css|js|ts|react|electron)|(?:继续|接着|做|写|实现|修|运行|启动|打开|检查|验证|网站|页面|服务器)/i.test(
    text
  )
}

function historySuggestsActionableWork(history: ChatMessage[]): boolean {
  return history.slice(-10).some((m) => {
    if (m.meta?.activities?.length || m.meta?.segments?.some((s) => s.kind === 'tool')) return true
    if (m.role === 'tool' || m.toolName) return true
    return isActionableWorkRequest(m.content)
  })
}

function isDestructiveOperation(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === 'uninstall_application') return true
  if (toolName === 'delete_path') {
    return Boolean(args.recursive) || String(args.path ?? '').includes('*')
  }
  if (toolName === 'run_terminal_cmd') {
    const cmd = String(args.command ?? '')
    return /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?-?[a-zA-Z]*r\b|\bapt\s+(remove|purge)\b|\bdpkg\s+-r\b|\bpkill\b|\bsnap\s+remove\b|\bflatpak\s+uninstall\b/i.test(
      cmd
    )
  }
  return false
}

/** 从用户消息提取卸载目标关键词 */
function extractUninstallKeyword(text: string): string | null {
  const m = text.match(
    /(?:删(?:掉|除)|卸载|remove|uninstall|卸掉)\s*(?:我的|一下|掉|了)?\s*([A-Za-z0-9_\u4e00-\u9fff++.-]{2,})/i
  )
  if (m) return m[1].replace(/的(?:游戏|数据|客户端).*$/i, '').trim()
  if (/steam/i.test(text)) return 'steam'
  return null
}

/** 用户是否在请求卸载应用 */
function isUninstallRequest(text: string): boolean {
  return /卸载|删掉|删除.*(?:应用|软件|steam|游戏)|remove|uninstall|卸掉/i.test(text)
}

/** 本轮是否已执行过删除/卸载类工具 */
function hadDestructiveOpsInTurn(messages: ChatCompletionMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('[系统提示]')) {
      break
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return m.tool_calls.some((tc) => {
        try {
          const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
          return isDestructiveOperation(tc.function.name, args)
        } catch {
          return false
        }
      })
    }
  }
  return false
}

/** 本轮是否已做删除后验证 */
function hadDestructiveVerifyInTurn(messages: ChatCompletionMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('[系统提示]') && !m.content.startsWith('[Harness')) {
      break
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      if (m.tool_calls.some((tc) => tc.function.name === 'verify_removal' || tc.function.name === 'uninstall_application')) {
        return true
      }
      if (m.tool_calls.some((tc) => {
        if (tc.function.name !== 'run_terminal_cmd') return false
        try {
          const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
          const cmd = String(args.command ?? '')
          return /\bfind\b|\bdpkg\b|\bps\s+aux\b|\btest\s+!|\bverify_removal\b/i.test(cmd)
        } catch {
          return false
        }
      })) {
        return true
      }
    }
    if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('[Harness 自动验证]')) {
      return true
    }
  }
  return false
}

/** 本轮是否已调用 uninstall_application */
function usedUninstallApplicationInTurn(messages: ChatCompletionMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('[系统提示]')) break
    if (m.role === 'assistant' && m.tool_calls?.some((tc) => tc.function.name === 'uninstall_application')) {
      return true
    }
  }
  return false
}

/** 只读工具可在同轮并行执行（2+ 个且全部为只读时） */
const PARALLEL_READ_TOOLS = new Set([
  'read_file',
  'read_image',
  'read_pdf',
  'read_notebook',
  'read_graph',
  'list_dir',
  'glob_file_search',
  'grep',
  'git_status',
  'git_diff',
  'git_log',
  'git_show',
  'web_fetch',
  'web_search',
  'desktop_doctor',
  'desktop_screenshot',
  'desktop_list_windows',
  'desktop_get_ui_tree',
  'browser_snapshot',
  'browser_screenshot',
  'task_list',
  'task_get',
  'task_output',
  'agent_list',
  'agent_get_result'
])

/** 判断工具是否可与其他只读工具并行 */
function canParallelizeTool(name: string): boolean {
  return PARALLEL_READ_TOOLS.has(name)
}

/** queryLoop 可选参数 */
export interface QueryLoopOptions {
  userText: string
  history: ChatMessage[]
  maxIterations?: number
  /** 会话级「允许本会话」授权表；与 conversation 绑定由调用方注入 */
  sessionApprovals?: SessionApprovalStore
  /** 流式 chunk 归属会话（多会话隔离） */
  conversationId?: string
}

/** 判断工具是否修改了文件内容 */
function isEditTool(name: string): boolean {
  return (
    name === 'write_file' ||
    name === 'search_replace' ||
    name === 'apply_patch' ||
    name === 'edit_notebook'
  )
}

/**
 * Agent 核心干活循环：模型流式回复 → tool_calls → 审批 → 执行 → 再问，直至无工具或达上限。
 * @param messages 已含 system 与历史的完整消息列表
 */

/** 执行工具并在等待期间刷出 onStatus 进度，避免直播过程长时间静止 */
async function* runToolWithLiveStatus(
  toolName: string,
  args: Record<string, unknown>,
  settings: Parameters<typeof executeToolWithMeta>[2],
  signal: AbortSignal | undefined,
  conversationId?: string
): AsyncGenerator<StreamChunk, Awaited<ReturnType<typeof executeToolWithMeta>>> {
  const pending: string[] = []
  let last = ''
  const job = executeToolWithMeta(toolName, args, settings, signal, (content) => {
    const clean = (content || '').trim()
    if (!clean || clean === last) return
    last = clean
    pending.push(clean)
  })
  // 挂上 catch 避免未处理 rejection；结果仍由 await job 获取
  void job.catch(() => {})
  while (true) {
    while (pending.length) {
      const content = pending.shift()!
      yield {
        type: 'status',
        content,
        toolName,
        conversationId
      }
    }
    const done = await Promise.race([
      job.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 120))
    ])
    if (done) break
  }
  while (pending.length) {
    const content = pending.shift()!
    yield {
      type: 'status',
      content,
      toolName,
      conversationId
    }
  }
  return await job
}


export async function* queryLoop(
  settings: AppSettings,
  messages: ChatCompletionMessage[],
  onApproval: ApprovalHandler,
  signal: AbortSignal | undefined,
  opts: QueryLoopOptions
): AsyncGenerator<StreamChunk> {
  const workspace = getActiveWorkspacePath(settings)
  const {
    userText,
    history,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    sessionApprovals,
    conversationId
  } = opts
  let iterations = 0
  let verifyDoneForTurn = false
  let warnedNearLimit = false
  let computerUseNudges = 0
  let destructiveVerifyNudges = 0
  let finalTextNudges = 0
  let emptyTextNudges = 0
  let continuationNudges = 0
  let ranToolsThisTurn = false
  const resumeLikely = isContinuationRequest(userText) && historySuggestsActionableWork(history)
  const skipVerify = shouldSkipAutoVerify(userText)

  if (resumeLikely) {
    messages.push({
      role: 'user',
      content:
        '[系统提示] 用户只说“继续”，意思是继续上一项未完成的实际任务。请根据历史上下文直接推进：需要检查文件/页面/命令时必须调用工具，不要只回复“我来检查/Let me check”。只有任务完成或确实受阻时才总结。'
    })
  }

  const uninstallKeyword = extractUninstallKeyword(userText)
  if (isUninstallRequest(userText) && uninstallKeyword && !usedUninstallApplicationInTurn(messages)) {
    messages.push({
      role: 'user',
      content:
        `[系统提示] 用户要求卸载「${uninstallKeyword}」。` +
        '必须调用 uninstall_application 工具（停进程、brew cask、.app、~/Library 用户数据、验证）。' +
        '不要仅用 rm -rf 删目录。'
    })
  }

  while (iterations < maxIterations) {
    iterations++
    if (signal?.aborted) {
      yield { type: 'done' }
      return
    }

    let assistantText = ''
    let displayedAssistantText = ''
    let toolCalls: ChatCompletionMessage['tool_calls']
    let parsedToolsFromText = false

    const remaining = maxIterations - iterations
    if (!warnedNearLimit && remaining <= 2) {
      warnedNearLimit = true
      messages.push({
        role: 'user',
        content:
          `[系统提示] 本轮工具调用即将用尽（剩余约 ${remaining + 1} 轮）。` +
          '请优先完成剩余必要工具调用；只有任务真正完成或明确受阻时才用文字总结。'
      })
    }

    const preferTools = resumeLikely || needsToolCalling(userText, history)
    const toolDefs = getToolDefinitionsForPhase(undefined, settings)
    let lastTextDemoLen = 0
    for await (const chunk of streamChat(settings, messages, signal, {
      preferTools,
      toolDefinitions: toolDefs
    })) {
      if (chunk.type === 'reasoning' && chunk.content) {
        yield { type: 'think', content: chunk.content }
      }
      if (chunk.type === 'delta' && chunk.content) {
        assistantText += chunk.content
        const cleaned = stripPartialToolXmlForDisplay(assistantText)
        const displayDelta = cleaned.slice(displayedAssistantText.length)
        displayedAssistantText = cleaned
        if (displayDelta) {
          yield { type: 'token', content: displayDelta }
        }
        // 弱模型把工具 JSON / ```demo 打在正文里：边写边预览
        const fromText = extractDemoHtmlFromAssistantText(assistantText)
        if (fromText && fromText.length - lastTextDemoLen >= 40) {
          lastTextDemoLen = fromText.length
          yield {
            type: 'tool_preview',
            toolName: 'present_inline_demo',
            content: fromText
          }
        }
      }
      if (chunk.type === 'tool_status' && chunk.content) {
        yield {
          type: 'status',
          content: chunk.content,
          toolName: chunk.toolStatus?.toolName
        }
        // 原生 tool_calls：参数尚在拼接就预览（html 可为空先占位）
        if (chunk.toolStatus?.toolName === 'present_inline_demo') {
          yield {
            type: 'tool_preview',
            toolName: 'present_inline_demo',
            toolCallId: chunk.toolStatus.toolCallId,
            content: chunk.toolStatus.partialHtml ?? '',
            toolArgs: chunk.toolStatus.partialCaption
              ? { caption: chunk.toolStatus.partialCaption }
              : undefined
          }
        }
      }
      if (chunk.type === 'tool_calls' && chunk.toolCalls) {
        toolCalls = chunk.toolCalls
      }
    }

    if (!toolCalls?.length) {
      toolCalls = parseTextToolCalls(assistantText)
      parsedToolsFromText = (toolCalls?.length ?? 0) > 0
    }

    if (!toolCalls?.length) {
      const textEmpty = !assistantText.trim()
      const userAskedUninstall = isUninstallRequest(userText)
      const verifyKeyword = extractUninstallKeyword(userText)
      const needsAutoVerify =
        userAskedUninstall &&
        verifyKeyword &&
        hadDestructiveOpsInTurn(messages) &&
        !hadDestructiveVerifyInTurn(messages) &&
        destructiveVerifyNudges < 1 &&
        iterations < maxIterations - 1

      if (needsAutoVerify) {
        destructiveVerifyNudges++
        const verifyArgs = { name: verifyKeyword }
        const verifyCallId = randomUUID()
        yield { type: 'tool_start', toolName: 'verify_removal', toolArgs: verifyArgs, toolCallId: verifyCallId, isVerification: true }
        try {
          const toolRun = runToolWithLiveStatus('verify_removal', verifyArgs, settings, signal, conversationId)
          let result: Awaited<ReturnType<typeof executeToolWithMeta>>
          while (true) {
            const step = await toolRun.next()
            if (step.done) {
              result = step.value
              break
            }
            yield step.value
          }
          messages.push({
            role: 'user',
            content: `[Harness 自动验证]\n${result.output}`
          })
          yield {
            type: 'tool_done', toolName: 'verify_removal', toolCallId: verifyCallId,
            isVerification: true, resultSummary: summarizeToolOutput(result.output, 'verify_removal'),
            resultOutput: expandableToolOutput(result.output)
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          messages.push({
            role: 'user',
            content: `[Harness 自动验证] 失败：${err}`
          })
          yield { type: 'tool_done', toolName: 'verify_removal', toolCallId: verifyCallId, isVerification: true, toolStatus: 'error', error: err }
        }
        continue
      }

      const shouldContinueActionableWork =
        (resumeLikely || isActionableWorkRequest(userText)) &&
        assistantIsStoppingMidTask(assistantText) &&
        !assistantClaimsDone(assistantText) &&
        continuationNudges < 6 &&
        iterations < maxIterations - 1

      if (shouldContinueActionableWork) {
        continuationNudges++
        messages.push({
          role: 'user',
          content:
            '[System reminder] The user asked for an actionable task, and your last message stopped at an intermediate step. Do not finish yet. Continue by calling the appropriate tools now. If you started or need a local server, keep going: start it in the background, open/load the page, inspect or screenshot it, fix visible errors, and only summarize after the task is complete or truly blocked.'
        })
        continue
      }

      if (textEmpty && ranToolsThisTurn && finalTextNudges < 1) {
        finalTextNudges++
        messages.push({
          role: 'user',
          content:
            '[系统提示] 请用纯文字向用户总结本轮已完成的工作、验证结果与后续建议。不要调用任何工具。'
        })
        for await (const chunk of streamChat(settings, messages, signal, { preferTools: false })) {
          if (signal?.aborted) {
            yield { type: 'done' }
            return
          }
          if (chunk.type === 'reasoning' && chunk.content) {
            yield { type: 'think', content: chunk.content }
          }
          if (chunk.type === 'delta' && chunk.content) {
            yield { type: 'token', content: chunk.content }
          }
          if (chunk.type === 'tool_status' && chunk.content) {
            yield {
              type: 'status',
              content: chunk.content,
              toolName: chunk.toolStatus?.toolName
            }
          }
        }
        yield { type: 'done' }
        return
      }

      if (textEmpty && !ranToolsThisTurn && emptyTextNudges < 1 && iterations < maxIterations - 1) {
        emptyTextNudges++
        messages.push({
          role: 'user',
          content:
            '[System reminder] Your previous response produced no user-visible text and no tool call. Reply again with a concise plain-text answer for the user. Do not call tools unless absolutely necessary.'
        })
        continue
      }

      const shouldNudgeComputerUse =
        isComputerUseTask(userText) &&
        hadComputerUseToolsInTurn(messages) &&
        !assistantClaimsDone(assistantText) &&
        computerUseNudges < 3 &&
        iterations < maxIterations - 1

      if (shouldNudgeComputerUse) {
        computerUseNudges++
        messages.push({
          role: 'user',
          content:
            '[系统提示] 桌面任务尚未完成。请继续调用 Computer Use 工具：desktop_screenshot / desktop_list_windows，' +
            '再 desktop_click / desktop_type / desktop_scroll，直到用户请求做完。' +
            '不要只描述计划。点击/打字会弹出审批，用户点「允许」后继续。'
        })
        continue
      }

      if (textEmpty) {
        yield {
          type: 'error',
          error:
            '模型本轮没有返回可显示的文字。Sharker 已避免静默结束；请检查当前模型是否支持 Chat Completions 流式正文输出，或换用更兼容的模型/Base URL。'
        }
      }
      yield { type: 'done' }
      return
    }

    const assistantContent = stripTextToolCalls(assistantText)

    ranToolsThisTurn = true

    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCalls
    })

    let editedThisIteration = false
    const screenshotPaths: string[] = []

    const collectScreenshotPath = (toolName: string, output: string) => {
      if (!isScreenshotTool(toolName)) return
      const p = extractScreenshotPathFromToolOutput(output)
      if (p && !screenshotPaths.includes(p)) screenshotPaths.push(p)
    }

    const parseToolArgs = (tc: NonNullable<typeof toolCalls>[number]): Record<string, unknown> => {
      try {
        return JSON.parse(tc.function.arguments || '{}')
      } catch {
        return {}
      }
    }

    const needsApprovalBeforeRun = (
      toolName: string,
      args: Record<string, unknown>
    ): boolean => {
      const pathErr = needsPathApproval(toolName, args, workspace, settings.permissionMode)
      const risk = isHighRiskTool(toolName, args)
      return Boolean(pathErr || risk.highRisk)
    }

    const canRunAllParallel =
      toolCalls.length > 1 &&
      toolCalls.every((tc) => canParallelizeTool(tc.function.name)) &&
      toolCalls.every((tc) => !needsApprovalBeforeRun(tc.function.name, parseToolArgs(tc)))

    if (canRunAllParallel) {
      for (const tc of toolCalls) {
        yield {
          type: 'tool_start',
          toolName: tc.function.name,
          toolArgs: parseToolArgs(tc),
          toolCallId: tc.id
        }
      }

      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          const args = parseToolArgs(tc)
          try {
            const result = await executeToolWithMeta(tc.function.name, args, settings, signal)
            return { ok: true as const, result }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { ok: false as const, message }
          }
        })
      )

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const outcome = results[i]
        if (!outcome.ok) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${outcome.message}` })
          yield { type: 'tool_done', toolName: tc.function.name, toolCallId: tc.id, toolStatus: 'error', error: outcome.message }
          continue
        }
        const result = outcome.result
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result.output })
        collectScreenshotPath(tc.function.name, result.output)
        if (isEditTool(tc.function.name)) editedThisIteration = true
        yield {
          type: 'tool_done',
          toolName: tc.function.name,
          toolCallId: tc.id,
          fileDiff: result.fileDiff,
          fileDiffs: result.fileDiffs,
          resultSummary: summarizeToolOutput(result.output, tc.function.name),
          resultOutput: expandableToolOutput(result.output),
          exitCode: result.exitCode,
          toolStatus: result.exitCode != null && result.exitCode !== 0 ? 'error' : 'done',
          error: result.exitCode != null && result.exitCode !== 0 ? `命令退出码 ${result.exitCode}` : undefined
        }
      }
    } else {
      for (const tc of toolCalls) {
        if (signal?.aborted) {
          yield { type: 'turn_cancelled' }
          yield { type: 'done' }
          return
        }
        const toolName = tc.function.name
        const args = parseToolArgs(tc)

        yield { type: 'tool_start', toolName, toolArgs: args, toolCallId: tc.id }

        if (toolName === 'enter_plan_mode') {
          enterPlanMode()
          yield { type: 'harness_mode', harnessPhase: 'plan' }
        }

        try {
          assertToolAllowed(toolName, settings)
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${err}` })
          yield { type: 'tool_done', toolName, toolCallId: tc.id, toolStatus: 'error', error: err }
          continue
        }

        const pathErr = needsPathApproval(toolName, args, workspace, settings.permissionMode)
        const risk = isHighRiskTool(toolName, args)

        if (pathErr || risk.highRisk) {
          const req: ApprovalRequest = {
            id: randomUUID(),
            title: pathErr ? '路径访问确认' : '高危操作确认',
            description: pathErr ?? risk.reason,
            toolName,
            args,
            conversationId
          }
          // 已「允许本会话」则跳过 UI，仍走真实授权表（非 UI 标签）
          const auto = sessionApprovals
            ? resolveSessionGrant(sessionApprovals, toolName, args)
            : null
          let approved: boolean
          if (auto != null) {
            approved = isApprovalGranted(auto)
            yield {
              type: 'approval_resolved',
              toolName,
              toolCallId: tc.id,
              approved,
              conversationId
            }
          } else {
            yield { type: 'approval_needed', approval: req, conversationId }
            const decision = normalizeApprovalDecision(await onApproval(req))
            approved = sessionApprovals
              ? sessionApprovals.applyDecision(decision, toolName, args)
              : isApprovalGranted(decision)
            yield {
              type: 'approval_resolved',
              toolName,
              toolCallId: tc.id,
              approved,
              conversationId
            }
          }
          if (!approved) {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: `User denied: ${req.description}`
            })
            yield {
              type: 'tool_done',
              toolName,
              toolCallId: tc.id,
              toolStatus: 'error',
              error: '用户拒绝了此操作',
              conversationId
            }
            continue
          }
        }

        try {
          const toolRun = runToolWithLiveStatus(toolName, args, settings, signal, conversationId)
          let result: Awaited<ReturnType<typeof executeToolWithMeta>>
          while (true) {
            const step = await toolRun.next()
            if (step.done) {
              result = step.value
              break
            }
            yield step.value
          }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result.output })
          collectScreenshotPath(toolName, result.output)
          if (isEditTool(toolName)) editedThisIteration = true
          if (result.planReady) {
            yield {
              type: 'plan_ready',
              planDocument: result.planDocument,
              planFilePath: result.planFilePath
            }
            yield { type: 'harness_mode', harnessPhase: 'normal' }
          }
          yield {
            type: 'tool_done',
            toolName,
            toolCallId: tc.id,
            fileDiff: result.fileDiff,
            fileDiffs: result.fileDiffs,
            resultSummary: summarizeToolOutput(result.output, toolName),
            resultOutput: expandableToolOutput(result.output),
            exitCode: result.exitCode,
            toolStatus: result.exitCode != null && result.exitCode !== 0 ? 'error' : 'done',
            error: result.exitCode != null && result.exitCode !== 0 ? `命令退出码 ${result.exitCode}` : undefined
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${err}` })
          yield { type: 'tool_done', toolName, toolCallId: tc.id, toolStatus: 'error', error: err }
        }
        if (signal?.aborted) {
          yield { type: 'turn_cancelled' }
          yield { type: 'done' }
          return
        }
      }
    }

    // 工具批次结束、等待模型下一步时给出明确直播状态，避免过程区“像停住”
    yield {
      type: 'status',
      content: '根据已完成步骤规划下一步…',
      conversationId
    }

    if (parsedToolsFromText) {
      messages.push({ role: 'user', content: TEXT_TOOL_EXECUTED_HINT })
    }

    if (providerSupportsVision(settings) && screenshotPaths.length > 0) {
      for (const imagePath of screenshotPaths) {
        try {
          const parts = await buildVisionContentParts(imagePath)
          messages.push({ role: 'user', content: parts })
        } catch {
          /* 读图失败则跳过视觉回灌 */
        }
      }
    }

    if (editedThisIteration && !verifyDoneForTurn && !skipVerify && workspace) {
      const cmd = await pickVerifyCommand(workspace)
      if (cmd) {
        verifyDoneForTurn = true
        const verifyArgs = { command: cmd, cwd: workspace }
        const verifyCallId = randomUUID()
        yield { type: 'tool_start', toolName: 'run_terminal_cmd', toolArgs: verifyArgs, toolCallId: verifyCallId, isVerification: true }
        try {
          const toolRun = runToolWithLiveStatus('run_terminal_cmd', verifyArgs, settings, signal, conversationId)
          let result: Awaited<ReturnType<typeof executeToolWithMeta>>
          while (true) {
            const step = await toolRun.next()
            if (step.done) {
              result = step.value
              break
            }
            yield step.value
          }
          messages.push({
            role: 'user',
            content: `[自动验证] 已运行 \`${cmd}\`：\n${result.output}`
          })
          yield {
            type: 'tool_done', toolName: 'run_terminal_cmd', toolCallId: verifyCallId,
            isVerification: true, resultSummary: summarizeToolOutput(result.output, 'run_terminal_cmd'),
            resultOutput: expandableToolOutput(result.output), exitCode: result.exitCode,
            toolStatus: result.exitCode != null && result.exitCode !== 0 ? 'error' : 'done',
            error: result.exitCode != null && result.exitCode !== 0 ? `验证命令退出码 ${result.exitCode}` : undefined
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          messages.push({
            role: 'user',
            content: `[自动验证] \`${cmd}\` 失败：\n${err}`
          })
          yield { type: 'tool_done', toolName: 'run_terminal_cmd', toolCallId: verifyCallId, isVerification: true, toolStatus: 'error', error: err }
        }
      }
    }
  }

  if (getHarnessPhase() === 'build') {
    finishBuildMode()
  }

  // 触顶后做一次无工具收尾，避免用户只看到硬错误
  messages.push({
    role: 'user',
    content:
      '[系统提示] 已达到本轮工具调用上限。请根据目前已完成的工作，用纯文字总结进度、' +
      '已改动内容与后续建议，不要再调用任何工具。'
  })

  let summaryText = ''
  for await (const chunk of streamChat(settings, messages, signal, { preferTools: false })) {
    if (signal?.aborted) {
      yield { type: 'done' }
      return
    }
    if (chunk.type === 'reasoning' && chunk.content) {
      yield { type: 'think', content: chunk.content }
    }
    if (chunk.type === 'delta' && chunk.content) {
      summaryText += chunk.content
      yield { type: 'token', content: chunk.content }
    }
    if (chunk.type === 'tool_status' && chunk.content) {
      yield {
        type: 'status',
        content: chunk.content,
        toolName: chunk.toolStatus?.toolName
      }
    }
  }

  if (!summaryText.trim()) {
    yield { type: 'error', error: '达到最大工具调用轮次' }
  }
  yield { type: 'done' }
}
