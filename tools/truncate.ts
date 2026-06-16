/**
 * 工具输出截断，防止过长结果撑爆模型上下文。
 * @see tools/README.md
 */
const DEFAULT_MAX_CHARS = 10_000
const HEAD_RATIO = 0.55

/** 截断过长工具输出：保留头尾，中间省略 */
export function truncateToolOutput(text: string, maxChars = DEFAULT_MAX_CHARS): string {
  if (text.length <= maxChars) return text
  const headLen = Math.floor(maxChars * HEAD_RATIO)
  const tailLen = maxChars - headLen - 80
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
