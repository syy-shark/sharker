/**
 * 对话公式：闭合 `\(...\)` / `\[...\]` / `$$...$$` 画 KaTeX（对标 Codex 桌面）。
 * 非法 TeX 回退原文；不认 `$...$`；不订直播 token。
 * @see src/components/ARCH.md
 */
import { memo } from 'react'
import { chatMathSource, renderChatMathHtml, type ChatMathFence } from '../../shared/chat-math'
import 'katex/dist/katex.min.css'
import './ChatMath.css'

/** ChatMath Props：TeX 与围栏种类 */
export const ChatMath = memo(function ChatMath({
  tex,
  display,
  fence
}: {
  tex: string
  display: boolean
  fence: ChatMathFence
}) {
  const html = renderChatMathHtml(tex, display)
  if (!html) {
    return <span className="chat-math chat-math--raw">{chatMathSource(tex, fence)}</span>
  }
  return (
    <span
      className={`chat-math${display ? ' chat-math--display' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
