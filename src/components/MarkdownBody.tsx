/**
 * 聊天 Markdown 渲染：http(s) 外开；本地文件引用打开右侧预览。
 * 保住 GFM 任务列表 class；元素子节点不套 span。
 * 支持 ```demo 对话原生内联演示（无浏览器外壳）。
 * @see src/ARCH.md
 */
import { memo, isValidElement, type ReactNode } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { matchFileCitationAt, parseFileCitation } from '../../shared/file-citation'
import { parseUnifiedDiff } from '../../shared/line-diff'
import { CodeArtifactBlock } from './CodeArtifactBlock'
import { CodeDiffBlock } from './CodeDiffBlock'
import { CompareBlock, parseCompareRows } from './CompareBlock'
import { FileCiteLink } from './FileCiteLink'
import { InlineDemo, isInlineDemoLang, parseDemoMeta } from './InlineDemo'

/** 是否应在系统浏览器中打开 */
function shouldOpenExternally(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://')
}

/** 纯文本里的 path:line / #L 做成可点引用 */
function linkifyFileCitations(text: string): ReactNode {
  const parts: ReactNode[] = []
  let i = 0
  let buf = ''
  while (i < text.length) {
    const hit = matchFileCitationAt(text, i)
    if (hit) {
      if (buf) parts.push(buf)
      buf = ''
      parts.push(
        <FileCiteLink
          key={`${hit.citation.path}:${hit.citation.line ?? 0}:${i}`}
          path={hit.citation.path}
          line={hit.citation.line}
          column={hit.citation.column}
        >
          {hit.text}
        </FileCiteLink>
      )
      i = hit.end
      continue
    }
    buf += text[i]
    i += 1
  }
  if (buf) parts.push(buf)
  return parts.length === 1 ? parts[0] : parts
}

/** 递归处理 remark 子节点里的纯文本；元素（含任务 checkbox）原样留下，避免收束时套 span 跳动 */
function withFileCitations(children: ReactNode): ReactNode {
  if (typeof children === 'string') return linkifyFileCitations(children)
  if (typeof children === 'number') return children
  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return <span key={index}>{withFileCitations(child)}</span>
      }
      return child
    })
  }
  return children
}

/** 从 react-markdown code 子节点提取纯文本 */
function extractCodeText(children: ReactNode): string {
  if (typeof children === 'string') return children.replace(/\n$/, '')
  if (Array.isArray(children)) return children.map(extractCodeText).join('').replace(/\n$/, '')
  if (isValidElement(children) && children.props && typeof children.props === 'object') {
    const props = children.props as { children?: ReactNode }
    if (props.children != null) return extractCodeText(props.children)
  }
  return String(children ?? '').replace(/\n$/, '')
}

/** 尝试渲染 演示 / 对比 / diff；普通代码块返回 null */
function trySpecialCodeBlock(
  text: string,
  lang?: string,
  className?: string
): ReactNode | null {
  if (isInlineDemoLang(lang)) {
    const { caption } = parseDemoMeta(className)
    return <InlineDemo html={text} caption={caption} />
  }
  const compareRows = parseCompareRows(text)
  if (compareRows) return <CompareBlock rows={compareRows} />
  if (lang === 'diff') {
    const lines = parseUnifiedDiff(text)
    if (lines.length > 0) return <CodeDiffBlock lines={lines} />
  }
  return null
}

const markdownComponents: Components = {
  a: ({ href, children, ...rest }) => {
    if (href && shouldOpenExternally(href)) {
      return (
        <a
          href={href}
          {...rest}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault()
            void window.sharker.openExternal(href)
          }}
        >
          {children}
        </a>
      )
    }
    const file = href ? parseFileCitation(href) : null
    if (file) {
      return (
        <FileCiteLink path={file.path} line={file.line} column={file.column}>
          {children}
        </FileCiteLink>
      )
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
  p: ({ children }) => <p>{withFileCitations(children)}</p>,
  ul: ({ children, className }) => <ul className={className}>{children}</ul>,
  ol: ({ children, className }) => <ol className={className}>{children}</ol>,
  img: ({ src, alt }) =>
    src && /^https?:\/\//i.test(src) ? <img src={src} alt={alt ?? ''} loading="lazy" /> : null,
  li: ({ children, className }) => <li className={className}>{withFileCitations(children)}</li>,
  td: ({ children }) => <td>{withFileCitations(children)}</td>,
  th: ({ children }) => <th>{withFileCitations(children)}</th>,
  h1: ({ children }) => <h1>{withFileCitations(children)}</h1>,
  h2: ({ children }) => <h2>{withFileCitations(children)}</h2>,
  h3: ({ children }) => <h3>{withFileCitations(children)}</h3>,
  code: ({ className, children, ...rest }) => {
    const match = /language-([^\s]+)/.exec(className ?? '')
    const lang = match?.[1]
    if (lang === 'diff' || isInlineDemoLang(lang)) {
      const text = extractCodeText(children)
      const special = trySpecialCodeBlock(text, lang, className)
      if (special) return special
    }
    if (!lang) {
      const text = extractCodeText(children)
      const file = parseFileCitation(text)
      if (file) {
        return (
          <FileCiteLink path={file.path} line={file.line} column={file.column}>
            <code className={className} {...rest}>
              {children}
            </code>
          </FileCiteLink>
        )
      }
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  },
  pre: ({ children, ...rest }) => {
    if (isValidElement(children)) {
      const childProps = children.props as { className?: string; children?: ReactNode }
      const className = childProps.className ?? ''
      const lang = /language-([^\s]+)/.exec(className)?.[1]
      const text = extractCodeText(childProps.children)
      const special = trySpecialCodeBlock(text, lang, className)
      if (special) return special
      return <CodeArtifactBlock code={text} language={lang} />
    }
    return <pre {...rest}>{children}</pre>
  }
}

/** 助手消息 Markdown 正文（按字符串 memo，减少流式重解析） */
export const MarkdownBody = memo(function MarkdownBody({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  )
})
