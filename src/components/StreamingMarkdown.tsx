/**
 * 流式 Markdown：围栏顶层 `live-fence-N`；已收散文按块成闭合 `LiveProseTail`。
 * 增长尾固定 `prose-run-0`，空行收段不换尾 key；文末单独换行不收段，表行留在同一增长尾；围栏闭合也不搬进散文尾。
 * 已画廉价块 / 列表项 / 表行 / 行内按对象身份 memo；新表行不换已画表头 / 旧行的 cells 引用；defs 与渲染槽没变则复用（对标 Codex #22860）。
 * 增长尾最后一块（含段落软换行、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、闭合并栏后再起表 / 标题 / 引用 / 段落、标题后另起的项内表、引用内围栏闭合后的后续段、缩进代码后另起的标题、缩进代码 / 脚注续行 / 引用内换行后的列表项、围栏 / 表 / 列表 / 引用 / 段落后的增长段）只重解析增长段；前面的标题 / 段落保持不动（对标 Codex #39061 / #34045）。
 * @see src/components/ARCH.md
 */
import { memo, useMemo, useRef, type ReactNode } from 'react'
import { LiveFenceTail } from './CodeArtifactBlock'
import { MermaidBlock } from './MermaidBlock'
import { isMermaidLangPrefix } from '../../shared/mermaid-fence'
import { ChatImage } from './ChatImage'
import { FileCiteLink } from './FileCiteLink'
import { InlineDemo, isInlineDemoLang } from './InlineDemo'
import {
  cheapInlineNodeKeys,
  cheapProseBlockKeys,
  continueCheapProseBlocks,
  continueStreamingMarkdown,
  continueStreamingRenderSlots,
  matchLiveTaskMarker,
  nextLinkDefinitions,
  parseCheapProseBlocks,
  splitStreamingMarkdown,
  type CheapInlineNode,
  type CheapLinkDef,
  type CheapListItem,
  type CheapProseBlock,
  type LinkDefinitionState
} from '../../shared/streaming-markdown'

/** GFM 任务项：直播时就画 checkbox；未写完的 `[x` / `[ ]` 先占位，收束后不从普通 li 跳成任务列表 */
function parseCheapTaskItem(
  nodes: CheapInlineNode[]
): { checked: boolean; nodes: CheapInlineNode[] } | null {
  const first = nodes[0]
  if (!first || first.type !== 'text') return null
  const match = matchLiveTaskMarker(first.text)
  if (!match) return null
  const rest: CheapInlineNode[] = match.rest
    ? [{ type: 'text', text: match.rest }, ...nodes.slice(1)]
    : nodes.slice(1)
  return { checked: match.checked, nodes: rest }
}

function cheapMarkBody(node: Extract<CheapInlineNode, { type: 'strong' | 'em' | 'del' }>): ReactNode {
  if (node.children?.length) return renderCheapInline(node.children)
  if (node.inner === 'em') return <em>{node.text}</em>
  if (node.inner === 'strong') return <strong>{node.text}</strong>
  if (node.inner === 'del') return <del>{node.text}</del>
  return node.text
}

/** 已画行内按对象身份 memo，增长段不重绘已闭合 code / 链接 / 图（对标 Codex #22860） */
const CheapInlineView = memo(function CheapInlineView({ node }: { node: CheapInlineNode }) {
  if (node.type === 'code') return <code>{node.text}</code>
  if (node.type === 'strong') return <strong>{cheapMarkBody(node)}</strong>
  if (node.type === 'del') return <del>{cheapMarkBody(node)}</del>
  if (node.type === 'em') return <em>{cheapMarkBody(node)}</em>
  if (node.type === 'link') {
    return (
      <a
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
      <FileCiteLink path={node.path} line={node.line} column={node.column}>
        {node.text}
      </FileCiteLink>
    )
  }
  if (node.type === 'image') {
    return <ChatImage src={node.href} alt={node.alt} title={node.title} />
  }
  if (node.type === 'fn') {
    return (
      <sup>
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
  if (node.type === 'br') return <br />
  return <span>{node.text}</span>
})

/** 廉价行内节点 → 元素（含可点文件引用） */
function renderCheapInline(nodes: CheapInlineNode[]): ReactNode[] {
  const keys = cheapInlineNodeKeys(nodes)
  return nodes.map((node, index) => <CheapInlineView key={keys[index]} node={node} />)
}

function listItemParagraphs(item: CheapListItem): CheapInlineNode[][] {
  return [...(item.nodes.length ? [item.nodes] : []), ...(item.extra ?? [])]
}

/** 已画列表项按对象身份 memo，增长项不重绘已画 li（对标 Codex #22860） */
const CheapListItemView = memo(function CheapListItemView({ item }: { item: CheapListItem }) {
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
      : paragraphs.map((nodes, pi) => (
          <p key={pi}>
            {pi === 0 && task ? (
              <input type="checkbox" disabled checked={task.checked} tabIndex={-1} />
            ) : null}
            {renderCheapInline(nodes)}
          </p>
        ))
  const tail = item.suffix?.length ? <p>{renderCheapInline(item.suffix)}</p> : null
  const inner = (
    <>
      {body}
      {item.blocks?.length ? renderCheapBlocks(item.blocks) : null}
      {tail}
      {nested}
    </>
  )
  if (!task) return <li>{inner}</li>
  return <li className="task-list-item live-prose-task">{inner}</li>
})

/** 廉价列表（含嵌套），任务项用 GFM class；项内始终 `li>p`，变松时不重挂已画行内 */}
function renderCheapList(
  ordered: boolean,
  items: CheapListItem[],
  key?: string,
  loose?: boolean,
  start?: number
): ReactNode {
  const Tag = ordered ? 'ol' : 'ul'
  const hasTask = items.some((item) => parseCheapTaskItem(item.nodes))
  const startAt = ordered && start && start !== 1 ? start : undefined
  return (
    <Tag key={key} className={hasTask ? 'contains-task-list' : undefined} start={startAt}>
      {items.map((item, i) => (
        <CheapListItemView key={i} item={item} />
      ))}
    </Tag>
  )
}

function cellAlign(align: 'left' | 'right' | 'center' | null | undefined) {
  return align ? { textAlign: align } : undefined
}

/** 已画表行按 cells 引用 memo，新行不重绘表头 / 旧行 */
const CheapTableRowView = memo(function CheapTableRowView({
  cells,
  align,
  header
}: {
  cells: CheapInlineNode[][]
  align?: Array<'left' | 'right' | 'center' | null> | null
  header?: boolean
}) {
  const Cell = header ? 'th' : 'td'
  return (
    <tr>
      {cells.map((cell, i) => (
        <Cell key={i} style={cellAlign(align?.[i])}>
          {renderCheapInline(cell)}
        </Cell>
      ))}
    </tr>
  )
})

function renderCheapBlocks(blocks: CheapProseBlock[]): ReactNode[] {
  const keys = cheapProseBlockKeys(blocks)
  return blocks.map((block, index) => (
    <CheapBlockView key={keys[index]} block={block} blockKey={keys[index]!} />
  ))
}

/** 已画块按对象身份 memo，增长尾不重绘已闭合段落 / 标题 / 列表 */
const CheapBlockView = memo(function CheapBlockView({
  block,
  blockKey
}: {
  block: CheapProseBlock
  blockKey: string
}) {
  return renderCheapBlock(block, blockKey)
})

/** 廉价块用与收束后 MarkdownBody 接近的标签，减少贴底跳动 */
function renderCheapBlock(block: CheapProseBlock, key: string): ReactNode {
  if (block.type === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return <Tag key={key}>{renderCheapInline(block.nodes)}</Tag>
  }
  if (block.type === 'list') {
    return renderCheapList(block.ordered, block.items, key, block.loose, block.start)
  }
  if (block.type === 'quote') {
    return <blockquote key={key}>{renderCheapBlocks(block.blocks)}</blockquote>
  }
  if (block.type === 'table') {
    return (
      <table key={key}>
        <thead>
          <CheapTableRowView cells={block.header} align={block.align} header />
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <CheapTableRowView key={r} cells={row} align={block.align} />
          ))}
        </tbody>
      </table>
    )
  }
  if (block.type === 'hr') return <hr key={key} />
  if (block.type === 'pre') {
    if (isMermaidLangPrefix(block.lang)) {
      return <MermaidBlock key={key} code={block.text} />
    }
    if (isInlineDemoLang(block.lang)) {
      return <InlineDemo key={key} html={block.text} streaming />
    }
    return <LiveFenceTail key={key} code={block.text} language={block.lang} />
  }
  if (block.type === 'footnotes') {
    return (
      <section key={key} data-footnotes className="footnotes">
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
  return <p key={key}>{renderCheapInline(block.nodes)}</p>
}

/** 增长中的散文尾：廉价块 + 行内，不跑 remark；已画块走 CheapBlockView 身份 memo */
const LiveProseTail = memo(function LiveProseTail({
  text,
  defs,
  closed
}: {
  text: string
  defs?: ReadonlyMap<string, string | CheapLinkDef>
  closed?: boolean
}) {
  const prevRef = useRef({ text: '', blocks: parseCheapProseBlocks('') })
  const blocks = useMemo(() => {
    const next = continueCheapProseBlocks(prevRef.current.text, prevRef.current.blocks, text, defs)
    prevRef.current = { text, blocks: next }
    return next
  }, [text, defs])
  return (
    <div className={`live-prose-tail${closed ? ' live-prose-closed' : ''}`}>
      {renderCheapBlocks(blocks)}
    </div>
  )
})

function renderLiveFenceSlot(
  key: string,
  lang: string | undefined,
  body: string,
  closed: boolean
) {
  if (isInlineDemoLang(lang)) {
    return <InlineDemo key={key} html={body} streaming />
  }
  if (isMermaidLangPrefix(lang)) {
    return <MermaidBlock key={key} code={body} closed={closed} language={lang} />
  }
  return <LiveFenceTail key={key} code={body} language={lang} followTail={!closed} />
}

/** 直播正文：围栏顶层槽 + 已收散文闭合槽 + 增长尾 `prose-run-0` */
export const StreamingMarkdown = memo(function StreamingMarkdown({ text }: { text: string }) {
  const prevRef = useRef({
    text: '',
    split: splitStreamingMarkdown(''),
    slots: continueStreamingRenderSlots(null, splitStreamingMarkdown('')),
    defs: null as LinkDefinitionState | null
  })
  const split = useMemo(() => {
    const next = continueStreamingMarkdown(prevRef.current.split, prevRef.current.text, text)
    prevRef.current.text = text
    prevRef.current.split = next
    return next
  }, [text])
  const slots = useMemo(() => {
    const next = continueStreamingRenderSlots(prevRef.current.slots, split)
    prevRef.current.slots = next
    return next
  }, [split])
  const defsState = useMemo(() => {
    const next = nextLinkDefinitions(prevRef.current.defs, text)
    prevRef.current.defs = next
    return next
  }, [text])
  return (
    <div className="streaming-markdown">
      {slots.map((slot) => {
        if (slot.kind === 'fence') {
          return renderLiveFenceSlot(slot.key, slot.lang, slot.body, slot.closed)
        }
        return (
          <LiveProseTail key={slot.key} text={slot.text} defs={defsState.defs} closed={slot.closed} />
        )
      })}
    </div>
  )
})
