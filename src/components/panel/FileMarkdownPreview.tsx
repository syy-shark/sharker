/**
 * 文件树 Markdown 富预览（对标 Codex View preview）。
 * 相对图按文档目录解析；frontmatter 不当正文。不订直播 token，不发明就地编辑。
 * @see ./ARCH.md
 */
import { memo, type Ref } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseFileCitation } from '../../../shared/file-citation'
import {
  resolveMarkdownPreviewImageSrc,
  splitMarkdownFrontmatter
} from '../../../shared/file-preview'
import { isInAppBrowserChatHref } from '../../../shared/chat-link'
import { ChatImage } from '../ChatImage'
import { ChatLink } from '../ChatLink'
import { FileCiteLink } from '../FileCiteLink'
import './FileMarkdownPreview.css'

/** 工作区 Markdown 渲染预览 */
export const FileMarkdownPreview = memo(function FileMarkdownPreview({
  content,
  markdownPath,
  workspacePath,
  extraRoots = [],
  onMouseUp,
  bodyRef
}: {
  content: string
  markdownPath: string
  workspacePath: string
  extraRoots?: readonly string[]
  onMouseUp?: () => void
  bodyRef?: Ref<HTMLElement>
}) {
  const { body, raw } = splitMarkdownFrontmatter(content)
  const extras = [...extraRoots]
  const components: Components = {
    a: ({ href, children, ...rest }) => {
      if (href && isInAppBrowserChatHref(href)) {
        return <ChatLink href={href}>{children}</ChatLink>
      }
      const file = href ? parseFileCitation(href) : null
      if (file) {
        return (
          <FileCiteLink path={file.path} line={file.line} column={file.column}>
            {children}
          </FileCiteLink>
        )
      }
      if (href && /^(https?:|mailto:)/i.test(href)) {
        return (
          <a
            href={href}
            {...rest}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault()
              void window.sharker?.openExternal?.(href)
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
    img: ({ src, alt }) => {
      if (!src) return null
      const resolved = resolveMarkdownPreviewImageSrc(src, markdownPath, workspacePath, extras)
      return resolved ? <ChatImage src={resolved} alt={alt ?? ''} /> : null
    }
  }

  return (
    <article
      ref={bodyRef as Ref<HTMLElement>}
      className="file-md-preview"
      tabIndex={-1}
      onMouseUp={onMouseUp}
    >
      {raw ? (
        <details className="file-md-preview-meta">
          <summary>文档属性</summary>
          <pre>{raw}</pre>
        </details>
      ) : null}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </article>
  )
})
