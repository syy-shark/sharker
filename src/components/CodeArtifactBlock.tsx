/**
 * 紧凑编辑器式代码产物：固定头部、复制操作、行号与稳定滚动区域。
 * 头栏相对对话柱 sticky，块还在视口里就能复制（对标 Codex #20593，按钮官方 Copy，不发明换行开关 / Copied）。
 * CodeDiffBlock 复用 CodeArtifactShell，确保普通代码和 diff 视觉一致。
 * 直播跟尾只盯滚动壳与一层增高节点，不因 children 每枚 token 重挂
 * useLayoutEffect（对标 Codex #32030 / #22860 / #39120）。
 * 已完成围栏行单独 memo，只重绘增长行（对标 Codex #39061 / #22860）。
 * 闭合围栏才语法着色（对标 Codex 桌面 highlight.js / #18966）；直播 token 中不着色，
 * 围栏闭合后 effect 开工 highlight.js 写缓存；收束后命中预热缓存则同一帧着色，否则 effect 再着色。远窗历史 FenceImmediateHighlightContext 为假时缓存未命中不在揭示帧跑 highlight.js。
 * 行节点始终 `dangerouslySetInnerHTML`（`liveFenceLineHtml`），着色不从文本子节点换挂 `<code>`。
 */
import { Check, Copy } from 'lucide-react'
import { createContext, memo, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  continueLiveFenceLines,
  liveStickNeedsFollow,
  liveStickScrollTop,
  nextClosedFenceLines,
  shouldFollowArtifactTail,
  shouldAllowLiveFenceHighlight,
  shouldHighlightLiveFence,
  shouldPaintLiveFenceHighlight,
  liveFenceLineHtml
} from '../../shared/live-display'
import {
  hasCachedFenceHighlight,
  highlightFenceLines,
  shouldWarmLiveFenceHighlight
} from '../../shared/syntax-highlight'
import { COPY_LABEL } from '../../shared/reveal-in-folder'
import './CodeArtifactBlock.css'
import '../styles/syntax-highlight.css'

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
  /** 未闭合围栏 / 直播 diff：内层贴底跟尾，用户上翻不抢 */
  followTail?: boolean
}

/** 普通代码和 diff 共用的编辑器外壳；头栏相对对话柱 sticky。 */
export function CodeArtifactShell({
  label,
  detail,
  copyText,
  children,
  className = '',
  bodyClassName = '',
  footer,
  showHeader = true,
  ariaLabel,
  followTail = false
}: CodeArtifactShellProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const growRef = useRef<HTMLDivElement>(null)
  const userLockedRef = useRef(false)
  const followTailRef = useRef(followTail)
  const programmaticScrollRef = useRef(false)
  const lastSizeRef = useRef({ scrollHeight: 0, clientHeight: 0 })
  followTailRef.current = followTail
  if (!followTail) userLockedRef.current = false

  useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current)
    },
    []
  )

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const follow = () => {
      if (
        !shouldFollowArtifactTail({
          followTail: followTailRef.current,
          userLocked: userLockedRef.current
        })
      ) {
        return
      }
      const next = { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
      if (!liveStickNeedsFollow(lastSizeRef.current, next)) return
      lastSizeRef.current = next
      programmaticScrollRef.current = true
      el.scrollTop = liveStickScrollTop(next.scrollHeight, next.clientHeight)
      programmaticScrollRef.current = false
    }

    const onScroll = () => {
      if (programmaticScrollRef.current) return
      const distance = el.scrollHeight - el.clientHeight - el.scrollTop
      userLockedRef.current = distance > 16
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) userLockedRef.current = true
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    const ro = new ResizeObserver(follow)
    ro.observe(el)
    const grow = growRef.current
    if (grow) ro.observe(grow)
    follow()
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      ro.disconnect()
    }
  }, [followTail])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (
      !shouldFollowArtifactTail({
        followTail,
        userLocked: userLockedRef.current
      })
    ) {
      return
    }
    lastSizeRef.current = { scrollHeight: 0, clientHeight: 0 }
    programmaticScrollRef.current = true
    el.scrollTop = liveStickScrollTop(el.scrollHeight, el.clientHeight)
    lastSizeRef.current = { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
    programmaticScrollRef.current = false
  }, [followTail])

  const handleCopy = async () => {
    if (!copyText) return
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
              disabled={!copyText}
              onClick={() => void handleCopy()}
              aria-label={COPY_LABEL}
              title={COPY_LABEL}
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            </button>
          ) : null}
        </div>
      ) : null}
      <div ref={scrollRef} className={`code-artifact-scroll ${bodyClassName}`.trim()}>
        <div ref={growRef} className="code-artifact-grow">
          {children}
        </div>
      </div>
      {footer ? <div className="code-artifact-footer">{footer}</div> : null}
    </div>
  )
}

interface CodeArtifactBlockProps {
  code: string
  language?: string
  /** 未闭合围栏：内层贴底跟最新行 */
  followTail?: boolean
}

/** 直播 Markdown 树：true 时闭合围栏也不跑 Prism（对标 Codex #22860） */
export const LiveMarkdownLiveContext = createContext(false)

/** 直播 token 中：闭合 mermaid 也不跑 mermaid.render */
export const LiveMarkdownStreamingContext = createContext(false)

/** 远窗历史行：缓存未命中时不在揭示帧跑 highlight.js（对标 Codex #22860） */
export const FenceImmediateHighlightContext = createContext(true)

function normalizeLanguage(language?: string): string {
  const value = language?.trim().toLowerCase()
  if (!value || value === 'plaintext' || value === 'plain') return 'text'
  return value
}

const ArtifactCodeLine = memo(function ArtifactCodeLine({
  index,
  text,
  html
}: {
  index: number
  text: string
  html?: string
}) {
  return (
    <div className="code-artifact-line">
      <span className="code-artifact-line-number" aria-hidden>
        {index + 1}
      </span>
      <code
        className="code-artifact-line-text"
        dangerouslySetInnerHTML={{ __html: liveFenceLineHtml(html, text) }}
      />
    </div>
  )
})

/** 已完成围栏行：lines 引用没变就不重绘（对标 Codex #39061 / #22860） */
const ClosedFenceLines = memo(function ClosedFenceLines({
  lines,
  htmlLines
}: {
  lines: string[]
  htmlLines?: string[] | null
}) {
  return (
    <>
      {lines.map((line, index) => (
        <ArtifactCodeLine key={index} index={index} text={line} html={htmlLines?.[index]} />
      ))}
    </>
  )
})

/** 直播与收束共用行节点，闭合围栏时文字/行号不再换一套 DOM */
export function ArtifactCodeLines({
  code,
  language,
  highlight = false
}: {
  code: string
  language?: string
  highlight?: boolean
}) {
  const prevRef = useRef({ lines: [] as string[], closed: [] as string[], code: '' })
  const lines = continueLiveFenceLines(prevRef.current.lines, code, prevRef.current.code)
  const closed = nextClosedFenceLines(prevRef.current.closed, lines)
  prevRef.current = { lines, closed, code }
  const htmlLines = highlight ? highlightFenceLines(code, language) : null
  const tail = lines.length ? lines[lines.length - 1]! : null
  return (
    <div className="code-artifact-code">
      {closed.length ? (
        <ClosedFenceLines lines={closed} htmlLines={htmlLines} />
      ) : null}
      {tail !== null ? (
        <ArtifactCodeLine
          key={closed.length}
          index={closed.length}
          text={tail}
          html={htmlLines?.[closed.length]}
        />
      ) : null}
    </div>
  )
}

/**
 * 直播围栏：与 CodeArtifactBlock 同一 CodeArtifactShell，复制按钮位一直在。
 * 开闭不换外壳，收束后也不再另挂一套头栏。
 */
export function LiveFenceTail({ code, language, followTail = false }: CodeArtifactBlockProps) {
  const live = useContext(LiveMarkdownLiveContext)
  const streaming = useContext(LiveMarkdownStreamingContext)
  const preferImmediate = useContext(FenceImmediateHighlightContext)
  const normalizedCode = code.replace(/\n$/, '')
  const label = normalizeLanguage(language)
  const closed = !followTail
  const allowHighlight = shouldAllowLiveFenceHighlight({ closed, streaming })
  const cached = hasCachedFenceHighlight(normalizedCode, language)
  const immediateHighlight = shouldHighlightLiveFence({
    live,
    closed,
    streaming,
    cached,
    preferImmediate
  })
  const [highlight, setHighlight] = useState(immediateHighlight)
  const paintHighlight = shouldPaintLiveFenceHighlight({
    live,
    closed,
    streaming,
    cached: highlight || cached,
    preferImmediate
  })

  useEffect(() => {
    if (!allowHighlight) {
      setHighlight(false)
      if (shouldWarmLiveFenceHighlight({ closed, streaming, language })) {
        const code = normalizedCode
        const lang = language
        queueMicrotask(() => {
          highlightFenceLines(code, lang)
        })
      }
      return
    }
    setHighlight(true)
  }, [allowHighlight, closed, streaming, language, normalizedCode])

  return (
    <CodeArtifactShell
      className="live-fence-tail"
      label={label}
      copyText={normalizedCode}
      ariaLabel={`${label} 代码块`}
      followTail={followTail}
    >
      <ArtifactCodeLines code={normalizedCode} language={language} highlight={paintHighlight} />
    </CodeArtifactShell>
  )
}

/** Markdown fenced code 的紧凑编辑器展示。 */
export function CodeArtifactBlock({ code, language }: CodeArtifactBlockProps) {
  const normalizedCode = code.replace(/\n$/, '')
  const label = normalizeLanguage(language)

  return (
    <CodeArtifactShell label={label} copyText={normalizedCode} ariaLabel={`${label} 代码块`}>
      <ArtifactCodeLines code={normalizedCode} language={language} highlight />
    </CodeArtifactShell>
  )
}
