/**
 * 紧凑编辑器式代码产物：固定头部、复制操作、行号与稳定滚动区域。
 * CodeDiffBlock 复用 CodeArtifactShell，确保普通代码和 diff 视觉一致。
 */
import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import './CodeArtifactBlock.css'

interface CodeArtifactShellProps {
  label: string
  detail?: ReactNode
  copyText?: string
  children: ReactNode
  className?: string
  bodyClassName?: string
  footer?: ReactNode
  showHeader?: boolean
  ariaLabel?: string
}

/** 普通代码和 diff 共用的编辑器外壳。 */
export function CodeArtifactShell({
  label,
  detail,
  copyText,
  children,
  className = '',
  bodyClassName = '',
  footer,
  showHeader = true,
  ariaLabel
}: CodeArtifactShellProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current)
    },
    []
  )

  const handleCopy = async () => {
    if (copyText == null) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={`code-artifact-shell ${showHeader ? '' : 'code-artifact-shell--headerless'} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel ?? label}
    >
      {showHeader ? (
        <div className="code-artifact-head">
          <span className="code-artifact-label" title={label}>
            {label}
          </span>
          {detail ? <span className="code-artifact-detail">{detail}</span> : null}
          {copyText != null ? (
            <button
              type="button"
              className="code-artifact-copy"
              onClick={() => void handleCopy()}
              aria-label={copied ? '已复制代码' : '复制代码'}
              title={copied ? '已复制' : '复制'}
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={`code-artifact-scroll ${bodyClassName}`.trim()}>{children}</div>
      {footer ? <div className="code-artifact-footer">{footer}</div> : null}
    </div>
  )
}

interface CodeArtifactBlockProps {
  code: string
  language?: string
}

function normalizeLanguage(language?: string): string {
  const value = language?.trim().toLowerCase()
  if (!value || value === 'plaintext' || value === 'plain') return 'text'
  return value
}

/**
 * 直播未闭合围栏：单块 `<pre>` 更新，避免每 token 重建行号节点。
 * 闭合后走 MarkdownBody → CodeArtifactBlock。
 */
export function LiveFenceTail({ code, language }: CodeArtifactBlockProps) {
  const label = normalizeLanguage(language)
  return (
    <div
      className="code-artifact-shell live-fence-tail"
      role="group"
      aria-label={`${label} 直播代码`}
    >
      <div className="code-artifact-head">
        <span className="code-artifact-label">{label}</span>
        <span className="code-artifact-detail">写入中</span>
        <span className="code-artifact-copy-slot" aria-hidden />
      </div>
      <div className="code-artifact-scroll">
        <div className="code-artifact-code live-fence-tail__code">
          <span className="live-fence-tail__gutter" aria-hidden />
          <pre className="live-fence-tail__pre">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

/** Markdown fenced code 的紧凑编辑器展示。 */
export function CodeArtifactBlock({ code, language }: CodeArtifactBlockProps) {
  const normalizedCode = code.replace(/\n$/, '')
  const lines = normalizedCode.split('\n')
  const label = normalizeLanguage(language)

  return (
    <CodeArtifactShell label={label} copyText={normalizedCode} ariaLabel={`${label} 代码块`}>
      <div className="code-artifact-code">
        {lines.map((line, index) => (
          <div className="code-artifact-line" key={index}>
            <span className="code-artifact-line-number" aria-hidden>
              {index + 1}
            </span>
            <code className="code-artifact-line-text">{line || ' '}</code>
          </div>
        ))}
      </div>
    </CodeArtifactShell>
  )
}
