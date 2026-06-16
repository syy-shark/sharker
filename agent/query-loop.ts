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
import { isHighRiskTool, needsPathApproval } from '../tools/permissions'
import { pickVerifyCommand, shouldSkipAutoVerify } from './verify'
import { parseTextToolCalls, stripTextToolCalls } from './text-tool-fallback'
import type { ApprovalHandler } from './loop'

/** queryLoop 可选参数 */
export interface QueryLoopOptions {
  userText: string
  history: ChatMessage[]
  maxIterations?: number
}

/** 判断工具是否修改了文件内容 */
function isEditTool(name: string): boolean {
  return name === 'write_file' || name === 'search_replace'
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
  const { userText, history, maxIterations = 12 } = opts
  let iterations = 0
  let verifyDoneForTurn = false
  const skipVerify = shouldSkipAutoVerify(userText)

  while (iterations < maxIterations) {
    iterations++
    if (signal?.aborted) {
      yield { type: 'done' }
      return
    }

    let assistantText = ''
    let toolCalls: ChatCompletionMessage['tool_calls']

    const preferTools = needsToolCalling(userText, history)
    for await (const chunk of streamChat(settings, messages, signal, { preferTools })) {
      if (chunk.type === 'reasoning' && chunk.content) {
        yield { type: 'think', content: chunk.content }
      }
      if (chunk.type === 'delta' && chunk.content) {
        assistantText += chunk.content
        yield { type: 'token', content: chunk.content }
      }
      if (chunk.type === 'tool_calls' && chunk.toolCalls) {
        toolCalls = chunk.toolCalls
      }
    }

    if (!toolCalls?.length) {
      toolCalls = parseTextToolCalls(assistantText)
    }

    if (!toolCalls?.length) {
      yield { type: 'done' }
      return
    }

    const assistantContent = stripTextToolCalls(assistantText)

    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCalls
    })

    let editedThisIteration = false

    for (const tc of toolCalls) {
      if (signal?.aborted) {
        yield { type: 'done' }
        return
      }
      const toolName = tc.function.name
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function.arguments || '{}')
      } catch {
        args = {}
      }

      yield { type: 'tool_start', toolName, toolArgs: args, toolCallId: tc.id }

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
        if (isEditTool(toolName)) editedThisIteration = true
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

  yield { type: 'error', error: '达到最大工具调用轮次' }
  yield { type: 'done' }
}
