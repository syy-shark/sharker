/**
 * 流式 Markdown：已闭合块 memo 住，只重绘增长中的尾部。
 * @see src/components/ARCH.md
 */
import { memo, useMemo } from 'react'
import { LiveFenceTail } from './CodeArtifactBlock'
import { InlineDemo, isInlineDemoLang } from './InlineDemo'
import { MarkdownBody } from './MarkdownBody'
import {
  extractOpenFenceBody,
  parseCheapInlineMarkdown,
  splitStreamingMarkdown
} from '../../shared/streaming-markdown'
import { isInlineDemoPaintable } from '../../shared/live-display'

/** 增长中的散文尾：行内标记廉价解析，不跑 remark */
const LiveProseTail = memo(function LiveProseTail({ text }: { text: string }) {
  const nodes = useMemo(() => parseCheapInlineMarkdown(text), [text])
  return (
    <p className="live-prose-tail">
      {nodes.map((node, index) => {
        if (node.type === 'code') return <code key={index}>{node.text}</code>
        if (node.type === 'strong') return <strong key={index}>{node.text}</strong>
        if (node.type === 'em') return <em key={index}>{node.text}</em>
        return <span key={index}>{node.text}</span>
      })}
    </p>
  )
})

/** 直播正文：稳定块 + 尾部，避免每 token 重解析全文 */
export const StreamingMarkdown = memo(function StreamingMarkdown({ text }: { text: string }) {
  const split = useMemo(() => splitStreamingMarkdown(text), [text])
  const fenceBody = useMemo(
    () => (split.tailKind === 'fence' ? extractOpenFenceBody(split.tail) : ''),
    [split.tail, split.tailKind]
  )
  return (
    <div className="streaming-markdown">
      {split.blocks.map((block) => (
        <MarkdownBody key={block.id}>{block.text}</MarkdownBody>
      ))}
      {split.tail ? (
        split.tailKind === 'fence' ? (
          isInlineDemoLang(split.tailLang) && isInlineDemoPaintable(fenceBody) ? (
            <InlineDemo html={fenceBody} streaming />
          ) : (
            <LiveFenceTail code={fenceBody} language={split.tailLang} />
          )
        ) : (
          <LiveProseTail text={split.tail} />
        )
      ) : null}
    </div>
  )
})
