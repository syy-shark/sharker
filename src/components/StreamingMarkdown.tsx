/**
 * 流式 Markdown：已闭合块 memo 住，只重绘增长中的尾部。
 * @see src/components/ARCH.md
 */
import { memo, useMemo, useRef, type ReactNode } from 'react'
import { LiveFenceTail } from './CodeArtifactBlock'
import { FileCiteLink } from './FileCiteLink'
import { InlineDemo, isInlineDemoLang } from './InlineDemo'
import { MarkdownBody } from './MarkdownBody'
import {
  continueCheapProseBlocks,
  continueStreamingMarkdown,
  extractOpenFenceBody,
  parseCheapProseBlocks,
  splitStreamingMarkdown,
  type CheapInlineNode,
  type CheapProseBlock
} from '../../shared/streaming-markdown'
import { isInlineDemoPaintable } from '../../shared/live-display'

/** GFM 任务项：直播时就画 checkbox，收束后不从普通 li 跳成任务列表 */
function parseCheapTaskItem(
  nodes: CheapInlineNode[]
): { checked: boolean; nodes: CheapInlineNode[] } | null {
  const first = nodes[0]
  if (!first || first.type !== 'text') return null
  const match = /^\[([ xX])\]\s+(.*)$/.exec(first.text)
  if (!match) return null
  const restText = match[2]
  const rest: CheapInlineNode[] = restText
    ? [{ type: 'text', text: restText }, ...nodes.slice(1)]
    : nodes.slice(1)
  return { checked: match[1] !== ' ', nodes: rest }
}

/** 廉价行内节点 → 元素（含可点文件引用） */
function renderCheapInline(nodes: CheapInlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === 'code') return <code key={index}>{node.text}</code>
    if (node.type === 'strong') return <strong key={index}>{node.text}</strong>
    if (node.type === 'em') return <em key={index}>{node.text}</em>
    if (node.type === 'link') {
      return (
        <a
          key={index}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault()
            if (node.href.startsWith('http://') || node.href.startsWith('https://')) {
              void window.sharker.openExternal?.(node.href)
            }
          }}
        >
          {node.text}
        </a>
      )
    }
    if (node.type === 'file') {
      return (
        <FileCiteLink key={index} path={node.path} line={node.line} column={node.column}>
          {node.text}
        </FileCiteLink>
      )
    }
    if (node.type === 'image') {
      return <img key={index} src={node.href} alt={node.alt} loading="lazy" />
    }
    return <span key={index}>{node.text}</span>
  })
}

/** 廉价块用与收束后 MarkdownBody 接近的标签，减少贴底跳动 */
function renderCheapBlock(block: CheapProseBlock, index: number): ReactNode {
  if (block.type === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return <Tag key={index}>{renderCheapInline(block.nodes)}</Tag>
  }
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    const tasks = block.items.map((item) => parseCheapTaskItem(item))
    const hasTask = tasks.some(Boolean)
    return (
      <Tag key={index} className={hasTask ? 'contains-task-list' : undefined}>
        {block.items.map((item, i) => {
          const task = tasks[i]
          if (!task) return <li key={i}>{renderCheapInline(item)}</li>
          return (
            <li key={i} className="task-list-item live-prose-task">
              <input type="checkbox" disabled checked={task.checked} tabIndex={-1} />
              {renderCheapInline(task.nodes)}
            </li>
          )
        })}
      </Tag>
    )
  }
  if (block.type === 'quote') {
    return <blockquote key={index}>{renderCheapInline(block.nodes)}</blockquote>
  }
  if (block.type === 'table') {
    return (
      <table key={index}>
        <thead>
          <tr>
            {block.header.map((cell, i) => (
              <th key={i}>{renderCheapInline(cell)}</th>
            ))}
          </tr>
        </thead>
        {block.rows.length ? (
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{renderCheapInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : null}
      </table>
    )
  }
  if (block.type === 'hr') return <hr key={index} />
  return <p key={index}>{renderCheapInline(block.nodes)}</p>
}

/** 增长中的散文尾：廉价块 + 行内，不跑 remark */
const LiveProseTail = memo(function LiveProseTail({ text }: { text: string }) {
  const prevRef = useRef({ text: '', blocks: parseCheapProseBlocks('') })
  const blocks = useMemo(() => {
    const next = continueCheapProseBlocks(prevRef.current.text, prevRef.current.blocks, text)
    prevRef.current = { text, blocks: next }
    return next
  }, [text])
  return <div className="live-prose-tail">{blocks.map(renderCheapBlock)}</div>
})

/** 直播正文：稳定块 + 尾部，避免每 token 重解析全文 */
export const StreamingMarkdown = memo(function StreamingMarkdown({ text }: { text: string }) {
  const prevRef = useRef({ text: '', split: splitStreamingMarkdown('') })
  const split = useMemo(() => {
    const next = continueStreamingMarkdown(prevRef.current.split, prevRef.current.text, text)
    prevRef.current = { text, split: next }
    return next
  }, [text])
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
