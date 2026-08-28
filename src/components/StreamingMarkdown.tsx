/**
 * 流式 Markdown：已闭合块 memo 住，只重绘增长中的尾部。
 * @see src/components/ARCH.md
 */
import { CodeArtifactBlock } from './CodeArtifactBlock'
import { InlineDemo, isInlineDemoLang } from './InlineDemo'
import { MarkdownBody } from './MarkdownBody'
import { extractOpenFenceBody, splitStreamingMarkdown } from '../../shared/streaming-markdown'
import { isInlineDemoPaintable } from '../../shared/live-display'

/** 直播正文：稳定块 + 尾部，避免每 token 重解析全文 */
export function StreamingMarkdown({ text }: { text: string }) {
  const split = splitStreamingMarkdown(text)
  return (
    <div className="streaming-markdown">
      {split.blocks.map((block) => (
        <MarkdownBody key={block.id}>{block.text}</MarkdownBody>
      ))}
      {split.tail ? (
        split.tailKind === 'fence' ? (
          isInlineDemoLang(split.tailLang) && isInlineDemoPaintable(extractOpenFenceBody(split.tail)) ? (
            <InlineDemo html={extractOpenFenceBody(split.tail)} streaming />
          ) : (
            <CodeArtifactBlock
              code={extractOpenFenceBody(split.tail)}
              language={split.tailLang}
            />
          )
        ) : (
          <MarkdownBody>{split.tail}</MarkdownBody>
        )
      ) : null}
    </div>
  )
}
