/**
 * 流式 Markdown：整段散文走廉价增量，不在每段收束时换 remark 树。
 * 未闭合围栏单独 LiveFenceTail；回合结束后 AssistantMessage 才整段交给 MarkdownBody。
 * @see src/components/ARCH.md
 */
import { memo, useMemo, useRef, type ReactNode } from 'react'
import { LiveFenceTail } from './CodeArtifactBlock'
import { MermaidBlock } from './MermaidBlock'
import { isMermaidLang } from '../../shared/mermaid-fence'
import { ChatImage } from './ChatImage'
import { FileCiteLink } from './FileCiteLink'
import { InlineDemo, isInlineDemoLang } from './InlineDemo'
import {
  collectLinkDefinitions,
  cheapInlineNodeKeys,
  continueCheapProseBlocks,
  continueStreamingMarkdown,
  extractOpenFenceBody,
  linkDefinitionBlob,
  parseCheapProseBlocks,
  splitStreamingMarkdown,
  streamingProseText,
  type CheapInlineNode,
  type CheapLinkDef,
  type CheapListItem,
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

function cheapMarkBody(node: Extract<CheapInlineNode, { type: 'strong' | 'em' | 'del' }>): ReactNode {
  if (node.children?.length) return renderCheapInline(node.children)
  if (node.inner === 'em') return <em>{node.text}</em>
  if (node.inner === 'strong') return <strong>{node.text}</strong>
  if (node.inner === 'del') return <del>{node.text}</del>
  return node.text
}

/** 廉价行内节点 → 元素（含可点文件引用） */
function renderCheapInline(nodes: CheapInlineNode[]): ReactNode[] {
  const keys = cheapInlineNodeKeys(nodes)
  return nodes.map((node, index) => {
    const key = keys[index]!
    if (node.type === 'code') return <code key={key}>{node.text}</code>
    if (node.type === 'strong') {
      return <strong key={key}>{cheapMarkBody(node)}</strong>
    }
    if (node.type === 'del') {
      return <del key={key}>{cheapMarkBody(node)}</del>
    }
    if (node.type === 'em') {
      return <em key={key}>{cheapMarkBody(node)}</em>
    }
    if (node.type === 'link') {
      return (
        <a
          key={key}
          href={node.href}
          title={node.title}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault()
            if (
              node.href.startsWith('http://') ||
              node.href.startsWith('https://') ||
              node.href.startsWith('mailto:')
            ) {
              void window.sharker.openExternal?.(node.href)
            }
          }}
        >
          {node.children ? renderCheapInline(node.children) : node.text}
        </a>
      )
    }
    if (node.type === 'file') {
      return (
        <FileCiteLink key={key} path={node.path} line={node.line} column={node.column}>
          {node.text}
        </FileCiteLink>
      )
    }
    if (node.type === 'image') {
      return <ChatImage key={key} src={node.href} alt={node.alt} title={node.title} />
    }
    if (node.type === 'fn') {
      return (
        <sup key={key}>
          <a
            href={`#user-content-fn-${node.id}`}
            id={`user-content-fnref-${node.id}`}
            data-footnote-ref
            aria-describedby="footnote-label"
          >
            {node.id}
          </a>
        </sup>
      )
    }
    if (node.type === 'br') return <br key={key} />
    return <span key={key}>{node.text}</span>
  })
}

function listItemParagraphs(item: CheapListItem): CheapInlineNode[][] {
  return [...(item.nodes.length ? [item.nodes] : []), ...(item.extra ?? [])]
}

/** 廉价列表（含嵌套），任务项用 GFM class；松散列表对标 remark `li>p` */
function renderCheapList(
  ordered: boolean,
  items: CheapListItem[],
  key?: number,
  loose?: boolean,
  start?: number
): ReactNode {
  const Tag = ordered ? 'ol' : 'ul'
  const hasTask = items.some((item) => parseCheapTaskItem(item.nodes))
  const wrapP = Boolean(loose || items.some((item) => item.extra?.length))
  const startAt = ordered && start && start !== 1 ? start : undefined
  return (
    <Tag key={key} className={hasTask ? 'contains-task-list' : undefined} start={startAt}>
      {items.map((item, i) => {
        const task = parseCheapTaskItem(item.nodes)
        const nested = item.nested
          ? renderCheapList(
              item.nested.ordered,
              item.nested.items,
              undefined,
              item.nested.loose,
              item.nested.start
            )
          : null
        const paragraphs = listItemParagraphs({
          ...item,
          nodes: task ? task.nodes : item.nodes
        })
        const body =
          paragraphs.length === 0
            ? null
            : wrapP || paragraphs.length > 1
              ? paragraphs.map((nodes, pi) => (
                  <p key={pi}>
                    {pi === 0 && task ? (
                      <input type="checkbox" disabled checked={task.checked} tabIndex={-1} />
                    ) : null}
                    {renderCheapInline(nodes)}
                  </p>
                ))
              : (
                  <>
                    {task ? (
                      <input type="checkbox" disabled checked={task.checked} tabIndex={-1} />
                    ) : null}
                    {renderCheapInline(task ? task.nodes : item.nodes)}
                  </>
                )
        const tail =
          item.suffix?.length && (wrapP || paragraphs.length > 1) ? (
            <p>{renderCheapInline(item.suffix)}</p>
          ) : item.suffix?.length ? (
            renderCheapInline(item.suffix)
          ) : null
        const inner = (
          <>
            {body}
            {item.blocks?.map((block, bi) => renderCheapBlock(block, bi))}
            {tail}
            {nested}
          </>
        )
        if (!task) {
          return <li key={i}>{inner}</li>
        }
        return (
          <li key={i} className="task-list-item live-prose-task">
            {inner}
          </li>
        )
      })}
    </Tag>
  )
}

function cellAlign(align: 'left' | 'right' | 'center' | null | undefined) {
  return align ? { textAlign: align } : undefined
}

/** 廉价块用与收束后 MarkdownBody 接近的标签，减少贴底跳动 */
function renderCheapBlock(block: CheapProseBlock, index: number): ReactNode {
  if (block.type === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return <Tag key={index}>{renderCheapInline(block.nodes)}</Tag>
  }
  if (block.type === 'list') {
    return renderCheapList(block.ordered, block.items, index, block.loose, block.start)
  }
  if (block.type === 'quote') {
    return <blockquote key={index}>{block.blocks.map(renderCheapBlock)}</blockquote>
  }
  if (block.type === 'table') {
    return (
      <table key={index}>
        <thead>
          <tr>
            {block.header.map((cell, i) => (
              <th key={i} style={cellAlign(block.align?.[i])}>
                {renderCheapInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        {block.rows.length ? (
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} style={cellAlign(block.align?.[c])}>
                    {renderCheapInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : null}
      </table>
    )
  }
  if (block.type === 'hr') return <hr key={index} />
  if (block.type === 'pre') {
    if (isMermaidLang(block.lang)) {
      return <MermaidBlock key={index} code={block.text} />
    }
    if (isInlineDemoLang(block.lang) && isInlineDemoPaintable(block.text)) {
      return <InlineDemo key={index} html={block.text} streaming />
    }
    return <LiveFenceTail key={index} code={block.text} language={block.lang} />
  }
  if (block.type === 'footnotes') {
    return (
      <section key={index} data-footnotes className="footnotes">
        <h2 className="sr-only" id="footnote-label">
          Footnotes
        </h2>
        <ol>
          {block.items.map((item) => (
            <li key={item.id} id={`user-content-fn-${item.id}`}>
              {item.paragraphs.map((nodes, pi) => (
                <p key={pi}>
                  {renderCheapInline(nodes)}
                  {pi === item.paragraphs.length - 1 ? (
                    <>
                      {' '}
                      <a
                        href={`#user-content-fnref-${item.id}`}
                        data-footnote-backref
                        className="data-footnote-backref"
                        aria-label="Back to content"
                      >
                        ↩
                      </a>
                    </>
                  ) : null}
                </p>
              ))}
            </li>
          ))}
        </ol>
      </section>
    )
  }
  return <p key={index}>{renderCheapInline(block.nodes)}</p>
}

/** 增长中的散文尾：廉价块 + 行内，不跑 remark */
const LiveProseTail = memo(function LiveProseTail({
  text,
  defs
}: {
  text: string
  defs?: ReadonlyMap<string, string | CheapLinkDef>
}) {
  const prevRef = useRef({ text: '', blocks: parseCheapProseBlocks('') })
  const blocks = useMemo(() => {
    const next = continueCheapProseBlocks(prevRef.current.text, prevRef.current.blocks, text, defs)
    prevRef.current = { text, blocks: next }
    return next
  }, [text, defs])
  return <div className="live-prose-tail">{blocks.map(renderCheapBlock)}</div>
})

/** 直播正文：散文全文廉价增量；未闭合围栏单独画，避免每段收束换 remark */
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
  const defsBlob = useMemo(() => linkDefinitionBlob(text), [text])
  const defs = useMemo(() => collectLinkDefinitions(text), [defsBlob])
  const proseText = useMemo(() => streamingProseText(text, split), [text, split])
  return (
    <div className="streaming-markdown">
      {proseText ? <LiveProseTail text={proseText} defs={defs} /> : null}
      {split.tailKind === 'fence' ? (
        isInlineDemoLang(split.tailLang) && isInlineDemoPaintable(fenceBody) ? (
          <InlineDemo html={fenceBody} streaming />
        ) : (
          <LiveFenceTail code={fenceBody} language={split.tailLang} />
        )
      ) : null}
    </div>
  )
})
