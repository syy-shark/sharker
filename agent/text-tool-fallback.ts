/**
 * Some weaker providers print pseudo tool calls in normal assistant text instead
 * of emitting native tool_calls. This module parses those fallback formats,
 * executes them through the normal loop, and strips them from the visible UI.
 */
import { randomUUID } from 'crypto'
import { KNOWN_TOOL_NAMES } from './tool-definitions'
import { isMcpDynamicToolName } from '../tools/services/mcp-tool-pool'

const KNOWN_TOOLS = KNOWN_TOOL_NAMES

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

export const TEXT_TOOL_EXECUTED_HINT =
  '[System reminder] A tool call was parsed and executed from assistant text. Continue from the tool result, and do not print pseudo tool calls as XML or JSON objects.'

type ParsedToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type ParsedJsonToolBlock = {
  start: number
  end: number
  calls: Array<{ name: string; args: Record<string, unknown> }>
}

function isKnownToolName(name: string): boolean {
  return KNOWN_TOOLS.has(name) || isMcpDynamicToolName(name)
}

function normalizeArgs(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return normalizeArgs(JSON.parse(value) as unknown)
    } catch {
      return {}
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function jsonValueToToolCalls(value: unknown): Array<{ name: string; args: Record<string, unknown> }> {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(jsonValueToToolCalls)

  const obj = value as Record<string, unknown>
  const nested = obj.tool_calls ?? obj.toolCalls
  if (Array.isArray(nested)) return nested.flatMap(jsonValueToToolCalls)

  const fn = obj.function
  if (fn && typeof fn === 'object' && !Array.isArray(fn)) {
    const fnObj = fn as Record<string, unknown>
    const fnName = typeof fnObj.name === 'string' ? fnObj.name : ''
    if (fnName) {
      return [{ name: fnName, args: normalizeArgs(fnObj.arguments ?? obj.arguments ?? obj.args) }]
    }
  }

  const name =
    typeof obj.tool === 'string'
      ? obj.tool
      : typeof obj.name === 'string'
        ? obj.name
        : typeof obj.function === 'string'
          ? obj.function
          : ''
  if (!name) return []
  return [{ name, args: normalizeArgs(obj.arguments ?? obj.args ?? obj.parameters ?? {}) }]
}

function findJsonObjectEnd(text: string, start: number): number | null {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return null
}

function looksLikeJsonToolPrefix(text: string): boolean {
  return /"tool"\s*:|"tool_calls"\s*:|"toolCalls"\s*:|"function"\s*:|"arguments"\s*:/i.test(text)
}

function extractJsonToolBlocks(text: string, includePartial = false): ParsedJsonToolBlock[] {
  const blocks: ParsedJsonToolBlock[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    const end = findJsonObjectEnd(text, i)
    if (end == null) {
      const startsAtLine = i === 0 || /\n\s*$/.test(text.slice(0, i))
      if (includePartial && (looksLikeJsonToolPrefix(text.slice(i)) || startsAtLine)) {
        blocks.push({ start: i, end: text.length, calls: [] })
      }
      break
    }

    try {
      const parsed = JSON.parse(text.slice(i, end)) as unknown
      const calls = jsonValueToToolCalls(parsed).filter((c) => isKnownToolName(c.name))
      if (calls.length > 0) {
        blocks.push({ start: i, end, calls })
        i = end - 1
      }
    } catch {
      /* not a JSON tool object */
    }
  }
  return blocks
}

function stripJsonToolBlocks(text: string, includePartial = false): string {
  const blocks = extractJsonToolBlocks(text, includePartial)
  if (blocks.length === 0) return text

  let out = ''
  let cursor = 0
  for (const block of blocks) {
    out += text.slice(cursor, block.start)
    cursor = block.end
  }
  out += text.slice(cursor)
  return out
}

function mentionsKnownToolName(text: string): boolean {
  const nameRe = /["']([a-z0-9_:.\/-]+)["']/gi
  let m: RegExpExecArray | null
  while ((m = nameRe.exec(text)) !== null) {
    if (isKnownToolName(m[1])) return true
  }
  return false
}

function containsJsonToolSyntax(text: string, includePartial = false): boolean {
  if (extractJsonToolBlocks(text).some((block) => block.calls.length > 0)) {
    return true
  }
  if (!includePartial) return false
  return looksLikeJsonToolPrefix(text) && mentionsKnownToolName(text)
}

function findOpenMarkdownFenceStart(text: string): number | null {
  const fenceRe = /(^|\n)[ \t]*```/g
  let openStart: number | null = null
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(text)) !== null) {
    const markerStart = m.index + (m[1] ? m[1].length : 0)
    openStart = openStart == null ? markerStart : null
  }
  return openStart
}

function stripJsonToolFences(text: string, includePartial = false): string {
  const completeFenceRe = /(^|\n)([ \t]*```[^\n]*\n[\s\S]*?\n[ \t]*```[^\n]*(?=\n|$))/g
  let out = text.replace(completeFenceRe, (match, leading: string, block: string) => {
    return containsJsonToolSyntax(block) ? leading : match
  })

  if (!includePartial) return out

  const openFenceStart = findOpenMarkdownFenceStart(out)
  if (openFenceStart == null) return out

  const partialFence = out.slice(openFenceStart)
  if (containsJsonToolSyntax(partialFence, true)) {
    out = out.slice(0, openFenceStart)
  }
  return out
}

function stripJsonToolSyntax(text: string, includePartial = false): string {
  return stripJsonToolBlocks(stripJsonToolFences(text, includePartial), includePartial)
}

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

function extractInlineJson(inner: string): Record<string, unknown> {
  const jsonMatch = inner.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}
  try {
    return normalizeArgs(JSON.parse(jsonMatch[0]) as unknown)
  } catch {
    return {}
  }
}

function extractToolArgs(inner: string): Record<string, unknown> {
  return {
    ...extractChildTags(inner),
    ...extractParameterTags(inner),
    ...extractInlineJson(inner)
  }
}

function pushToolCall(
  results: ParsedToolCall[],
  name: string,
  args: Record<string, unknown>,
  explicit: boolean
): void {
  if (!isKnownToolName(name)) return
  const hasArgs = Object.keys(args).length > 0
  if (!hasArgs && !explicit && !ZERO_ARG_TOOLS.has(name)) return
  const serializedArgs = JSON.stringify(args)
  if (results.some((r) => r.function.name === name && r.function.arguments === serializedArgs)) {
    return
  }
  results.push({
    id: `text-${randomUUID()}`,
    type: 'function',
    function: { name, arguments: serializedArgs }
  })
}

export function parseTextToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = []

  for (const block of extractJsonToolBlocks(text)) {
    for (const call of block.calls) {
      pushToolCall(results, call.name, call.args, true)
    }
  }

  const toolCallBlockRe = /<tool_call>([\s\S]*?)<\/tool_call>/gi
  let block: RegExpExecArray | null
  while ((block = toolCallBlockRe.exec(text)) !== null) {
    const inner = block[1]
    const fnMatch = inner.match(/<function=([a-z0-9_]+)>/i)
    if (fnMatch) {
      pushToolCall(results, fnMatch[1], extractToolArgs(inner), true)
    }
  }

  const bareFnRe = /<function(?:=|\s+name=["'])([a-z0-9_]+)["']?\s*\/?>/gi
  let fn: RegExpExecArray | null
  while ((fn = bareFnRe.exec(text)) !== null) {
    const after = text.slice(fn.index, fn.index + 800)
    pushToolCall(results, fn[1], extractToolArgs(after), true)
  }

  const blockRe = /<([a-z_]+)>\s*([\s\S]*?)\s*<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(text)) !== null) {
    const name = m[1]
    if (name === 'tool_call' || name === 'function' || name === 'parameter') continue
    pushToolCall(results, name, extractToolArgs(m[2]), false)
  }

  return results
}

export function hasTextToolCalls(text: string): boolean {
  return parseTextToolCalls(text).length > 0
}

export function stripPartialToolXmlForDisplay(text: string): string {
  return stripXmlToolCalls(stripJsonToolSyntax(text.replace(/<tool_call>[\s\S]*$/gi, ''), true))
}

function stripXmlToolCalls(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function=[^>]+>\s*<\/function>/gi, '')
    .replace(/<function=[^>]+\/?>/gi, '')
    .replace(/<parameter=[^>]+>[\s\S]*?<\/parameter>/gi, '')
    .replace(/<([a-z_]+)>\s*[\s\S]*?\s*<\/\1>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripTextToolCalls(text: string): string {
  return stripXmlToolCalls(stripJsonToolSyntax(text))
}
