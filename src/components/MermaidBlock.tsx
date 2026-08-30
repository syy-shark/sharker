/**
 * ```mermaid / ```mmd 围栏：开闭都挂本组件，未闭合或直播 token 中不解析。
 * 成图前继续代码尾，避免闭合瞬间卸掉再挂一套，也不在 16ms 热路径跑 mermaid.render。
 * 收束后若 SVG 缓存已暖，同一帧成图；否则与收束预取共用 `renderMermaidSvg`，
 * 立刻跟进的重挂不取消已开工的成图。
 * @see src/components/ARCH.md
 */
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  isMermaidLang,
  mermaidSlotHeight,
  readUiMermaidTheme,
  renderMermaidSvg,
  resolveLiveMermaidSvg,
  shouldRenderLiveMermaid,
  mermaidSvgAspectStyle,
  readCachedMermaidSvg,
  type MermaidUiTheme
} from '../../shared/mermaid-fence'
import { ArtifactCodeLines, CodeArtifactShell, LiveMarkdownStreamingContext } from './CodeArtifactBlock'
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
    if (!paint) {
      setFailed(false)
      return
    }
    const text = source.trim()
    if (!text) {
      setSvg('')
      setFailed(false)
      return
    }
    let cancelled = false
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
    return () => {
      cancelled = true
    }
  }, [paint, source, theme])

  const shell = (children: ReactNode, bodyClassName?: string, ariaLabel?: string) => (
    <CodeArtifactShell
      className="live-fence-tail"
      label={fenceLang}
      copyText={source}
      bodyClassName={bodyClassName}
      ariaLabel={ariaLabel ?? `${fenceLang} 代码块`}
      followTail={!closed && !shownSvg}
    >
      {children}
    </CodeArtifactShell>
  )

  if (!closed || !source.trim() || failed || !shownSvg) {
    return shell(
      placeholder(<ArtifactCodeLines code={source} />),
      undefined,
      failed ? 'mermaid 解析失败' : undefined
    )
  }
  const aspect = mermaidSvgAspectStyle(shownSvg)
  return shell(
    <div
      className="mermaid-block"
      style={{ ...aspect, minHeight: reserved }}
      dangerouslySetInnerHTML={{ __html: shownSvg }}
    />,
    'mermaid-block-scroll',
    'mermaid 图'
  )
}
