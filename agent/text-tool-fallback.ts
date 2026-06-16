/**
 * 部分模型不支持 function calling，会在正文里输出 <read_file> 等伪 XML。
 * 解析后转成标准 tool_calls，由 loop 实际执行。
 */
import { randomUUID } from 'crypto'
import { TOOL_DEFINITIONS } from './tool-definitions'

const KNOWN_TOOLS = new Set(TOOL_DEFINITIONS.map((t) => t.function.name))

type ParsedToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** 从 <tag>value</tag> 块提取工具参数 */
function extractChildTags(inner: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  const tagRe = /<([a-z_]+)>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(inner)) !== null) {
    const key = m[1]
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
    } else if (key === 'depth' || key === 'offset' || key === 'limit') {
      const n = Number(val)
      if (!Number.isNaN(n)) val = n
    }
    args[key] = val
  }
  return args
}

/** 从助手正文中解析可执行的伪 XML 工具调用 */
export function parseTextToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = []
  const blockRe = /<([a-z_]+)>\s*([\s\S]*?)\s*<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(text)) !== null) {
    const name = m[1]
    if (!KNOWN_TOOLS.has(name)) continue
    const args = extractChildTags(m[2])
    if (Object.keys(args).length === 0) continue
    results.push({
      id: `text-${randomUUID()}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) }
    })
  }
  return results
}

/** 去掉正文中的伪 XML 工具块，避免展示给用户 */
export function stripTextToolCalls(text: string): string {
  return text.replace(/<([a-z_]+)>\s*[\s\S]*?\s*<\/\1>/gi, '').replace(/\n{3,}/g, '\n\n').trim()
}
