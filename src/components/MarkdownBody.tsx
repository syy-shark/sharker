/**
 * 聊天 Markdown 渲染：http(s) 链接在系统浏览器打开，避免在 Electron 窗口内跳转。
 * @see src/README.md
 */
import { memo, isValidElement, type ReactNode } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseUnifiedDiff } from '../../shared/line-diff'
import { CodeDiffBlock } from './CodeDiffBlock'
import { CompareBlock, parseCompareRows } from './CompareBlock'

/** 是否应在系统浏览器中打开 */
function shouldOpenExternally(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://')
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

/** 尝试渲染 旧/新 对比或显式 diff 块；普通代码块返回 null */
function trySpecialCodeBlock(text: string, lang?: string): ReactNode | null {
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
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
  code: ({ className, children, ...rest }) => {
    const match = /language-(\w+)/.exec(className ?? '')
    if (match?.[1] === 'diff') {
      const text = extractCodeText(children)
      const special = trySpecialCodeBlock(text, 'diff')
      if (special) return special
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
      const lang = /language-(\w+)/.exec(childProps.className ?? '')?.[1]
      const text = extractCodeText(childProps.children)
      const special = trySpecialCodeBlock(text, lang)
      if (special) return special
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
