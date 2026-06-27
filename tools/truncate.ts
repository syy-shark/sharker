/**
 * 工具输出截断，防止过长结果撑爆模型上下文。
 * @see tools/README.md
 */
const DEFAULT_MAX_CHARS = 10_000
const HEAD_RATIO = 0.55

/** 截断过长工具输出：保留头尾，中间省略 */
export function truncateToolOutput(text: string, maxChars?: number, toolName?: string): string {
  let limit = maxChars ?? DEFAULT_MAX_CHARS
  if (toolName?.includes('get_app_state') || toolName?.includes('mcp_computer_use__')) {
    limit = Math.max(limit, 120_000)
  }
  if (text.length <= limit) return text
  const headLen = Math.floor(limit * HEAD_RATIO)
  const tailLen = limit - headLen - 80
  const omitted = text.length - headLen - tailLen
  return (
    text.slice(0, headLen) +
    `\n\n… 省略 ${omitted.toLocaleString()} 字符 …\n\n` +
    text.slice(-tailLen)
  )
}

/** 截断行数组，超出时附加省略提示 */
export function truncateLines(lines: string[], maxLines: number): string {
  if (lines.length <= maxLines) return lines.join('\n')
  const rest = lines.length - maxLines
  return lines.slice(0, maxLines).join('\n') + `\n… 还有 ${rest} 行未显示 …`
}
