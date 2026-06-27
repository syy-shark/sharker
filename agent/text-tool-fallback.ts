/**
 * 部分模型不支持 function calling，会在正文里输出 <read_file> 等伪 XML。
 * 解析后转成标准 tool_calls，由 loop 实际执行。
 */
import { randomUUID } from 'crypto'
import { KNOWN_TOOL_NAMES } from './tool-definitions'
import { isMcpDynamicToolName } from '../tools/services/mcp-tool-pool'

const KNOWN_TOOLS = KNOWN_TOOL_NAMES

/** 无参数也可执行的工具（宽松 tag 启发式） */
const ZERO_ARG_TOOLS = new Set([
  'desktop_doctor',
  'desktop_screenshot',
  'desktop_list_windows',
  'browser_close',
  'voice_stop',
  'mcp_list_tools',
  'list_skills',
  'task_list',
  'agent_list',
  'git_status'
])

/** 解析到文本工具后注入对话，避免模型重复输出 XML */
export const TEXT_TOOL_EXECUTED_HINT =
  '[系统提示] 已从正文解析并执行工具调用。请根据 tool 结果继续，勿再输出 <tool_call> 或 <function=...> XML。'

type ParsedToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** 工具名是否可解析执行 */
function isKnownToolName(name: string): boolean {
  return KNOWN_TOOLS.has(name) || isMcpDynamicToolName(name)
}

/** 从 <tag>value</tag> 块提取工具参数 */
function extractChildTags(inner: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  const tagRe = /<([a-z_]+)>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(inner)) !== null) {
    const key = m[1]
    if (key === 'function' || key === 'tool_call' || key === 'parameter') continue
    let val: unknown = m[2].trim()
    if (key === 'paths') {
      try {
        val = JSON.parse(String(val))
      } catch {
        val = String(val)
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      }
    } else if (key === 'args') {
      try {
        val = JSON.parse(String(val))
      } catch {
        val = String(val)
          .split(/\s+/)
          .filter(Boolean)
      }
    } else if (key === 'replace_all' || key === 'recursive' || key === 'staged') {
      val = val === 'true' || val === '1'
    } else if (key === 'depth' || key === 'offset' || key === 'limit' || key === 'x' || key === 'y') {
      const n = Number(val)
      if (!Number.isNaN(n)) val = n
    }
    args[key] = val
  }
  return args
}

/** GLM/Qwen 风格：<parameter=key>value</parameter> */
function extractParameterTags(inner: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  const paramRe = /<parameter=([a-z0-9_]+)>([\s\S]*?)<\/parameter>/gi
  let m: RegExpExecArray | null
  while ((m = paramRe.exec(inner)) !== null) {
    const key = m[1]
    let val: unknown = m[2].trim()
    if (key === 'x' || key === 'y' || key === 'count' || key === 'depth' || key === 'limit') {
      const n = Number(val)
      if (!Number.isNaN(n)) val = n
    } else if (val === 'true' || val === 'false') {
      val = val === 'true'
    }
    args[key] = val
  }
  return args
}

/** 尝试从内联 JSON 提取参数 */
function extractInlineJson(inner: string): Record<string, unknown> {
  const jsonMatch = inner.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/** 合并多种参数来源 */
function extractToolArgs(inner: string): Record<string, unknown> {
  return {
    ...extractChildTags(inner),
    ...extractParameterTags(inner),
    ...extractInlineJson(inner)
  }
}

/** 追加一条解析结果（去重同名） */
function pushToolCall(
  results: ParsedToolCall[],
  name: string,
  args: Record<string, unknown>,
  explicit: boolean
): void {
  if (!isKnownToolName(name)) return
  const hasArgs = Object.keys(args).length > 0
  if (!hasArgs && !explicit && !ZERO_ARG_TOOLS.has(name)) return
  if (results.some((r) => r.function.name === name)) return
  results.push({
    id: `text-${randomUUID()}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  })
}

/** 从助手正文中解析可执行的伪 XML / tool_call 块 */
export function parseTextToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = []

  // 格式：<tool_call> ... <function=desktop_screenshot> ... </tool_call>
  const toolCallBlockRe = /<tool_call>([\s\S]*?)<\/tool_call>/gi
  let block: RegExpExecArray | null
  while ((block = toolCallBlockRe.exec(text)) !== null) {
    const inner = block[1]
    const fnMatch = inner.match(/<function=([a-z0-9_]+)>/i)
    if (fnMatch) {
      pushToolCall(results, fnMatch[1], extractToolArgs(inner), true)
    }
  }

  // 格式：裸 <function=tool_name> 或 <function name="tool_name">
  const bareFnRe = /<function(?:=|\s+name=["'])([a-z0-9_]+)["']?\s*\/?>/gi
  let fn: RegExpExecArray | null
  while ((fn = bareFnRe.exec(text)) !== null) {
    const after = text.slice(fn.index, fn.index + 800)
    pushToolCall(results, fn[1], extractToolArgs(after), true)
  }

  // 格式：<desktop_screenshot></desktop_screenshot>（启发式，非 explicit）
  const blockRe = /<([a-z_]+)>\s*([\s\S]*?)\s*<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(text)) !== null) {
    const name = m[1]
    if (name === 'tool_call' || name === 'function' || name === 'parameter') continue
    pushToolCall(results, name, extractToolArgs(m[2]), false)
  }

  return results
}

/** 正文是否含可解析的文本工具调用 */
export function hasTextToolCalls(text: string): boolean {
  return parseTextToolCalls(text).length > 0
}

/** 流式展示用：去掉完整与尾部未闭合的 tool XML */
export function stripPartialToolXmlForDisplay(text: string): string {
  return stripTextToolCalls(text.replace(/<tool_call>[\s\S]*$/gi, ''))
}

/** 去掉正文中的伪 XML 工具块，避免展示给用户 */
export function stripTextToolCalls(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function=[^>]+>\s*<\/function>/gi, '')
    .replace(/<function=[^>]+\/?>/gi, '')
    .replace(/<parameter=[^>]+>[\s\S]*?<\/parameter>/gi, '')
    .replace(/<([a-z_]+)>\s*[\s\S]*?\s*<\/\1>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
