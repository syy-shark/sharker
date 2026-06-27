/**
 * Query 核心循环：流式问模型 → 工具调用 → 审批 → 自动验证，直至纯文本结束。
 * @see agent/README.md
 */
import { randomUUID } from 'crypto'
import type { AppSettings, ApprovalRequest, ChatMessage, StreamChunk } from '../shared/types'
import { needsToolCalling } from '../shared/needs-tools'
import { getActiveWorkspacePath } from '../shared/workspace'
import { streamChat, type ChatCompletionMessage } from '../providers/openai'
import { executeToolWithMeta } from '../tools/executor'
import { needsPathApproval } from '../tools/permissions'
import { assertToolAllowed, getToolDefinitionsForPhase, isHighRiskTool } from '../tools/registry'
import { isMcpDynamicToolName, resolveMcpDynamicTool } from '../tools/services/mcp-tool-pool'
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

/** 默认工具循环上限（读/改/跑命令累加，12 轮对续改任务偏紧） */
const DEFAULT_MAX_ITERATIONS = 25

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
      return m.tool_calls.some((tc) => {
        const n = tc.function.name
        return (
          n.startsWith('desktop_') ||
          n.startsWith('mcp_cua_driver__') ||
          n.startsWith('mcp_computer_use__') ||
          n.includes('computer_use')
        )
      })
    }
  }
  return false
}

/** 助手是否声称任务已完成 */
function assistantClaimsDone(text: string): boolean {
  return /已完成|已经发送|发送成功|任务完成|搞定了|done/i.test(text)
}

/** 是否删除/卸载类工具调用 */
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
  'mcp_list_tools',
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
  'agent_get_result',
  'list_skills',
  'read_skill'
])

/** 判断工具是否可与其他只读工具并行 */
function canParallelizeTool(name: string): boolean {
  if (PARALLEL_READ_TOOLS.has(name)) return true
  if (isMcpDynamicToolName(name)) {
    return resolveMcpDynamicTool(name)?.readOnly === true
  }
  return false
}

/** queryLoop 可选参数 */
export interface QueryLoopOptions {
  userText: string
  history: ChatMessage[]
  maxIterations?: number
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
export async function* queryLoop(
  settings: AppSettings,
  messages: ChatCompletionMessage[],
  onApproval: ApprovalHandler,
  signal: AbortSignal | undefined,
  opts: QueryLoopOptions
): AsyncGenerator<StreamChunk> {
  const workspace = getActiveWorkspacePath(settings)
  const { userText, history, maxIterations = DEFAULT_MAX_ITERATIONS } = opts
  let iterations = 0
  let verifyDoneForTurn = false
  let warnedNearLimit = false
  let computerUseNudges = 0
  let destructiveVerifyNudges = 0
  let finalTextNudges = 0
  let ranToolsThisTurn = false
  const skipVerify = shouldSkipAutoVerify(userText)

  const uninstallKeyword = extractUninstallKeyword(userText)
  if (isUninstallRequest(userText) && uninstallKeyword && !usedUninstallApplicationInTurn(messages)) {
    messages.push({
      role: 'user',
      content:
        `[系统提示] 用户要求卸载「${uninstallKeyword}」。` +
        '必须调用 uninstall_application 工具（停进程、pkexec 卸 apt 包、清用户数据、验证）。' +
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
          '请优先用文字给出结论或下一步，避免不必要的读文件/跑命令。'
      })
    }

    const preferTools = needsToolCalling(userText, history)
    const toolDefs = getToolDefinitionsForPhase(undefined, settings)
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
        yield { type: 'tool_start', toolName: 'verify_removal', toolArgs: verifyArgs }
        try {
          const result = await executeToolWithMeta('verify_removal', verifyArgs, settings, signal)
          messages.push({
            role: 'user',
            content: `[Harness 自动验证]\n${result.output}`
          })
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          messages.push({
            role: 'user',
            content: `[Harness 自动验证] 失败：${err}`
          })
        }
        yield { type: 'tool_done', toolName: 'verify_removal' }
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
        }
        yield { type: 'done' }
        return
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
            '[系统提示] 桌面任务尚未完成。请继续调用 Cua Driver / Computer Use 工具：优先 mcp_cua_driver__get_window_state，' +
            '再 click / type_text / scroll，直到用户请求做完。若 background_unavailable 可改用 dispatch foreground。' +
            '不要只描述计划。点击/打字会弹出审批，用户点「允许」后继续。'
        })
        continue
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
          return executeToolWithMeta(tc.function.name, args, settings, signal)
        })
      )

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const result = results[i]
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result.output })
        collectScreenshotPath(tc.function.name, result.output)
        if (isEditTool(tc.function.name)) editedThisIteration = true
        yield {
          type: 'tool_done',
          toolName: tc.function.name,
          toolCallId: tc.id,
          fileDiff: result.fileDiff
        }
      }
    } else {
      for (const tc of toolCalls) {
        if (signal?.aborted) {
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
          yield { type: 'tool_done', toolName, toolCallId: tc.id }
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
            args
          }
          yield { type: 'approval_needed', approval: req }
          const approved = await onApproval(req)
          if (!approved) {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: `User denied: ${req.description}`
            })
            yield { type: 'tool_done', toolName, toolCallId: tc.id }
            continue
          }
        }

        try {
          const result = await executeToolWithMeta(toolName, args, settings, signal)
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
            fileDiff: result.fileDiff
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${err}` })
          yield { type: 'tool_done', toolName, toolCallId: tc.id }
        }
        if (signal?.aborted) {
          yield { type: 'done' }
          return
        }
      }
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
        yield { type: 'tool_start', toolName: 'run_terminal_cmd', toolArgs: verifyArgs }
        try {
          const result = await executeToolWithMeta('run_terminal_cmd', verifyArgs, settings, signal)
          messages.push({
            role: 'user',
            content: `[自动验证] 已运行 \`${cmd}\`：\n${result.output}`
          })
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          messages.push({
            role: 'user',
            content: `[自动验证] \`${cmd}\` 失败：\n${err}`
          })
        }
        yield { type: 'tool_done', toolName: 'run_terminal_cmd' }
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
  }

  if (!summaryText.trim()) {
    yield { type: 'error', error: '达到最大工具调用轮次' }
  }
  yield { type: 'done' }
}
