/**
 * 紧凑编辑器式代码产物：固定头部、复制操作、行号与稳定滚动区域。
 * CodeDiffBlock 复用 CodeArtifactShell，确保普通代码和 diff 视觉一致。
 */
import { Check, Copy } from 'lucide-react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
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

const ArtifactCodeLine = memo(function ArtifactCodeLine({
  index,
  text
}: {
  index: number
  text: string
}) {
  return (
    <div className="code-artifact-line">
      <span className="code-artifact-line-number" aria-hidden>
        {index + 1}
      </span>
      <code className="code-artifact-line-text">{text || ' '}</code>
    </div>
  )
})

/** 直播与收束共用行节点，闭合围栏时文字/行号不再换一套 DOM */
function ArtifactCodeLines({ code }: { code: string }) {
  const lines = code.replace(/\n$/, '').split('\n')
  return (
    <div className="code-artifact-code">
      {lines.map((line, index) => (
        <ArtifactCodeLine key={index} index={index} text={line} />
      ))}
    </div>
  )
}

/**
 * 直播未闭合围栏：与 CodeArtifactBlock 同一行结构，已闭合行 memo 住。
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
        <ArtifactCodeLines code={code} />
      </div>
    </div>
  )
}

/** Markdown fenced code 的紧凑编辑器展示。 */
export function CodeArtifactBlock({ code, language }: CodeArtifactBlockProps) {
  const normalizedCode = code.replace(/\n$/, '')
  const label = normalizeLanguage(language)

  return (
    <CodeArtifactShell label={label} copyText={normalizedCode} ariaLabel={`${label} 代码块`}>
      <ArtifactCodeLines code={normalizedCode} />
    </CodeArtifactShell>
  )
}
