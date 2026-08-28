/**
 * 流式 Markdown：已闭合块 memo 住，只重绘增长中的尾部。
 * @see src/components/ARCH.md
 */
import { memo, useMemo } from 'react'
import { CodeArtifactBlock } from './CodeArtifactBlock'
import { InlineDemo, isInlineDemoLang } from './InlineDemo'
import { MarkdownBody } from './MarkdownBody'
import { extractOpenFenceBody, splitStreamingMarkdown } from '../../shared/streaming-markdown'
import { isInlineDemoPaintable } from '../../shared/live-display'

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
            <CodeArtifactBlock code={fenceBody} language={split.tailLang} />
          )
        ) : (
          <MarkdownBody>{split.tail}</MarkdownBody>
        )
      ) : null}
    </div>
  )
})
