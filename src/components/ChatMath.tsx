/**
 * 对话公式：闭合 `\(...\)` / `\[...\]` / `$$...$$` 画 KaTeX（对标 Codex 桌面）。
 * 非法 TeX 回退原文；不认 `$...$`；直播 token 中先画原文，收束后再着色。
 * @see src/components/ARCH.md
 */
import { memo, useContext } from 'react'
import {
  chatMathSource,
  renderChatMathHtml,
  shouldRenderLiveChatMath,
  type ChatMathFence
} from '../../shared/chat-math'
import { LiveMarkdownStreamingContext } from './CodeArtifactBlock'
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
  const streaming = useContext(LiveMarkdownStreamingContext)
  if (!shouldRenderLiveChatMath({ streaming })) {
    return <span className="chat-math chat-math--raw">{chatMathSource(tex, fence)}</span>
  }
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
