/**
 * 对话公式：闭合 `\(...\)` / `\[...\]` / `$$...$$` 画 KaTeX（对标 Codex 桌面）。
 * 非法 TeX 回退原文；不认 `$...$`；直播 token 中先画原文，收束后命中预热缓存则同一帧着色，否则 effect 再着色。
 * @see src/components/ARCH.md
 */
import { memo, useContext, useEffect, useState } from 'react'
import {
  chatMathSource,
  liveChatMathClassName,
  peekChatMathHtml,
  renderChatMathHtml,
  resolveLiveChatMathHtml,
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
  const allowPaint = shouldRenderLiveChatMath({ streaming })
  const [html, setHtml] = useState<string | null>(() =>
    allowPaint ? renderChatMathHtml(tex, display) : null
  )
  const painted = resolveLiveChatMathHtml({
    streaming,
    html,
    cached: allowPaint ? peekChatMathHtml(tex, display) : undefined
  })

  useEffect(() => {
    if (!allowPaint) {
      setHtml(null)
      return
    }
    setHtml(renderChatMathHtml(tex, display))
  }, [allowPaint, tex, display])

  if (!painted) {
    return (
      <span className={liveChatMathClassName({ display, raw: true })}>
        {chatMathSource(tex, fence)}
      </span>
    )
  }
  return (
    <span
      className={liveChatMathClassName({ display })}
      dangerouslySetInnerHTML={{ __html: painted }}
    />
  )
})
