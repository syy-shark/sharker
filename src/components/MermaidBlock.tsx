/**
 * ```mermaid / ```mmd 围栏：开闭都挂本组件，未闭合不解析。
 * 成图前继续 LiveFenceTail，避免闭合瞬间卸掉代码尾再挂一套。
 * @see src/components/ARCH.md
 */
import { useEffect, useId, useRef, useState } from 'react'
import {
  isMermaidLang,
  mermaidSvgAspectStyle,
  readCachedMermaidSvg,
  writeCachedMermaidSvg,
  type MermaidUiTheme
} from '../../shared/mermaid-fence'
import { CodeArtifactBlock, CodeArtifactShell, LiveFenceTail } from './CodeArtifactBlock'
import './MermaidBlock.css'

type MermaidApi = {
  initialize: (config: {
    startOnLoad: boolean
    securityLevel: 'strict' | 'loose' | 'antiscript' | 'sandbox'
    theme: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  }) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let mermaidLoader: Promise<MermaidApi> | null = null

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((mod) => (mod.default ?? mod) as MermaidApi)
  }
  return mermaidLoader
}

function readUiTheme(): MermaidUiTheme {
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'default'
}

function useUiMermaidTheme(): MermaidUiTheme {
  const [theme, setTheme] = useState<MermaidUiTheme>(() =>
    typeof document === 'undefined' ? 'default' : readUiTheme()
  )
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setTheme(readUiTheme())
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
  language = 'mermaid'
}: {
  code: string
  /** 未闭合时只画代码尾，不跑 mermaid.render */
  closed?: boolean
  language?: string
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const theme = useUiMermaidTheme()
  const source = code.replace(/\n$/, '')
  const paintedSource = useRef(source.trim())
  const renderGen = useRef(0)
  const [svg, setSvg] = useState(() =>
    closed ? (readCachedMermaidSvg(source, theme) ?? '') : ''
  )
  const [failed, setFailed] = useState(false)
  const fenceLang = isMermaidLang(language) ? language : 'mermaid'

  useEffect(() => {
    if (!closed) {
      setFailed(false)
      return
    }
    const text = source.trim()
    if (!text) {
      paintedSource.current = ''
      setSvg('')
      setFailed(false)
      return
    }
    const cached = readCachedMermaidSvg(text, theme)
    if (cached) {
      paintedSource.current = text
      setSvg(cached)
      setFailed(false)
      return
    }
    // 源码改了仍先留着上一张 SVG，避免闪回源码再跳成图（贴底会跟着跳）
    let cancelled = false
    setFailed(false)
    renderGen.current += 1
    const renderId = `sharker-mermaid-${reactId}-${renderGen.current}`
    void loadMermaid()
      .then((mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme
        })
        return mermaid.render(renderId, text)
      })
      .then((result) => {
        if (!cancelled) {
          writeCachedMermaidSvg(text, theme, result.svg)
          paintedSource.current = text
          setSvg(result.svg)
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
  }, [closed, source, theme, reactId])

  if (!closed) {
    return <LiveFenceTail code={source} language={fenceLang} />
  }
  if (!source.trim() || failed) {
    return <CodeArtifactBlock code={source} language={fenceLang} />
  }
  if (!svg) {
    return <LiveFenceTail code={source} language={fenceLang} />
  }
  const aspect = mermaidSvgAspectStyle(svg)
  return (
    <CodeArtifactShell
      label="mermaid"
      copyText={source}
      bodyClassName="mermaid-block-scroll"
      ariaLabel="mermaid 图"
    >
      <div className="mermaid-block" style={aspect} dangerouslySetInnerHTML={{ __html: svg }} />
    </CodeArtifactShell>
  )
}
