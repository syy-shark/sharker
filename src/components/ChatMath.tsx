/**
 * 对话公式：闭合 `\(...\)` / `\[...\]` / `$$...$$` 画 KaTeX（对标 Codex 桌面）。
 * 非法 TeX 回退原文；不认 `$...$`；直播 token 中先画原文，闭合后 effect 开工 KaTeX 写缓存；
 * 收束后命中预热缓存则同一帧着色，否则 effect 再着色。
 * 缓存命中重挂不再 setHtml；远窗 FenceImmediateHighlightContext 为假时未命中成图推到下一帧。
 * @see src/components/ARCH.md
 */
import { memo, useContext, useEffect, useState } from 'react'
import {
  chatMathSource,
  liveChatMathClassName,
  peekChatMathHtml,
  renderChatMathHtml,
  resolveLiveChatMathHtml,
  shouldDeferChatMathPaintJob,
  shouldRenderLiveChatMath,
  shouldStartChatMathPaintJob,
  shouldWarmLiveChatMath,
  type ChatMathFence
} from '../../shared/chat-math'
import { FenceImmediateHighlightContext, LiveMarkdownStreamingContext } from './CodeArtifactBlock'
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
  const preferImmediate = useContext(FenceImmediateHighlightContext)
  const allowPaint = shouldRenderLiveChatMath({ streaming })
  const peeked = allowPaint ? peekChatMathHtml(tex, display) : undefined
  const [html, setHtml] = useState<string | null>(() => {
    if (!allowPaint) return null
    if (peeked !== undefined) return peeked
    if (shouldDeferChatMathPaintJob({ preferImmediate })) return null
    return renderChatMathHtml(tex, display)
  })
  const painted = resolveLiveChatMathHtml({
    streaming,
    html,
    cached: allowPaint ? peeked : undefined
  })

  useEffect(() => {
    if (!allowPaint) {
      setHtml(null)
      if (shouldWarmLiveChatMath({ streaming, tex })) {
        const nextTex = tex
        const nextDisplay = display
        queueMicrotask(() => {
          renderChatMathHtml(nextTex, nextDisplay)
        })
      }
      return
    }
    if (
      !shouldStartChatMathPaintJob({
        paint: allowPaint,
        hasCachedHtml: peekChatMathHtml(tex, display) !== undefined
      })
    ) {
      return
    }
    let cancelled = false
    let raf = 0
    const paintHtml = () => {
      if (!cancelled) setHtml(renderChatMathHtml(tex, display))
    }
    if (shouldDeferChatMathPaintJob({ preferImmediate })) {
      raf = requestAnimationFrame(() => {
        paintHtml()
      })
    } else {
      paintHtml()
    }
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [allowPaint, tex, display, streaming, preferImmediate])

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
