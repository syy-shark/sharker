/**
 * ```mermaid / ```mmd 围栏：开闭都挂本组件，未闭合或直播 token 中不解析。
 * 成图前继续代码尾，避免闭合瞬间卸掉再挂一套，也不在 16ms 热路径跑 mermaid.render。
 * 直播中围栏闭合后 effect 开工成图写缓存（不 setSvg）；收束后若 SVG 缓存已暖，同一帧成图；
 * 否则与收束预取共用 `renderMermaidSvg`，立刻跟进的重挂不取消已开工的成图。
 * 缓存命中重挂不再 render / setSvg；远窗 FenceImmediateHighlightContext 为假时未命中成图推到下一帧。
 * 成图前后共用 `mermaid-slot`，不换 CodeArtifactShell 的第一层子节点类型。
 * @see src/components/ARCH.md
 */
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  isMermaidLang,
  mermaidSlotHeight,
  readUiMermaidTheme,
  renderMermaidSvg,
  resolveLiveMermaidSvg,
  shouldShowMermaidSvg,
  shouldRenderLiveMermaid,
  shouldStartMermaidPaintJob,
  shouldDeferMermaidPaintJob,
  shouldWarmLiveMermaid,
  mermaidSvgAspectStyle,
  readCachedMermaidSvg,
  type MermaidUiTheme
} from '../../shared/mermaid-fence'
import {
  ArtifactCodeLines,
  CodeArtifactShell,
  FenceImmediateHighlightContext,
  LiveMarkdownStreamingContext
} from './CodeArtifactBlock'
import './MermaidBlock.css'

function useUiMermaidTheme(): MermaidUiTheme {
  const [theme, setTheme] = useState<MermaidUiTheme>(() =>
    typeof document === 'undefined' ? 'default' : readUiMermaidTheme()
  )
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setTheme(readUiMermaidTheme())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

export function MermaidBlock({
  code,
  closed = true,
  language = 'mermaid',
  streaming = false
}: {
  code: string
  /** 未闭合时只画代码尾，不跑 mermaid.render */
  closed?: boolean
  language?: string
  /** 直播 token 中即使已闭合也不成图 */
  streaming?: boolean
}) {
  const theme = useUiMermaidTheme()
  const source = code.replace(/\n$/, '')
  const streamingFromTree = useContext(LiveMarkdownStreamingContext)
  const preferImmediate = useContext(FenceImmediateHighlightContext)
  const stream = streaming || streamingFromTree
  const paint = shouldRenderLiveMermaid({ closed, streaming: stream })
  const [svg, setSvg] = useState(() =>
    paint ? (readCachedMermaidSvg(source, theme) ?? '') : ''
  )
  const cachedSvg = paint ? (readCachedMermaidSvg(source, theme) ?? '') : ''
  const shownSvg = resolveLiveMermaidSvg({ paint, svg, cached: cachedSvg })
  const [failed, setFailed] = useState(false)
  const fenceLang = isMermaidLang(language) ? language : 'mermaid'
  const slotHeight = mermaidSlotHeight(source, theme, shownSvg)
  const slotHighWater = useRef(slotHeight)
  if (slotHeight > slotHighWater.current) slotHighWater.current = slotHeight
  const reserved = slotHighWater.current
  const placeholder = (lines: ReactNode) => (
    <div className="mermaid-placeholder" style={{ minHeight: reserved }}>
      {lines}
    </div>
  )

  useEffect(() => {
    const text = source.trim()
    if (!paint) {
      setFailed(false)
      if (shouldWarmLiveMermaid({ closed, streaming: stream }) && text) {
        void renderMermaidSvg(text, theme).catch(() => undefined)
      }
      return
    }
    if (!text) {
      setSvg('')
      setFailed(false)
      return
    }
    if (
      !shouldStartMermaidPaintJob({
        paint,
        hasCachedSvg: Boolean(readCachedMermaidSvg(source, theme))
      })
    ) {
      return
    }
    let cancelled = false
    let raf = 0
    const start = () => {
      void renderMermaidSvg(text, theme)
        .then((next) => {
          if (!cancelled) {
            setSvg(next)
            setFailed(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSvg('')
            setFailed(true)
          }
        })
    }
    if (shouldDeferMermaidPaintJob({ preferImmediate })) {
      raf = requestAnimationFrame(() => {
        if (!cancelled) start()
      })
    } else {
      start()
    }
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [paint, source, theme, closed, stream, preferImmediate])

  const showSvg = shouldShowMermaidSvg({
    closed,
    hasSource: Boolean(source.trim()),
    failed,
    svg: shownSvg
  })
  const aspect = showSvg ? mermaidSvgAspectStyle(shownSvg) : undefined
  return (
    <CodeArtifactShell
      className="live-fence-tail"
      label={fenceLang}
      copyText={source}
      bodyClassName={showSvg ? 'mermaid-block-scroll' : undefined}
      ariaLabel={failed ? 'mermaid 解析失败' : showSvg ? 'mermaid 图' : `${fenceLang} 代码块`}
      followTail={!closed && !showSvg}
    >
      <div className="mermaid-slot" style={{ minHeight: reserved }}>
        {showSvg ? (
          <div className="mermaid-block" style={aspect} dangerouslySetInnerHTML={{ __html: shownSvg }} />
        ) : (
          placeholder(<ArtifactCodeLines code={source} />)
        )}
      </div>
    </CodeArtifactShell>
  )
}
