/**
 * 闭合 ```mermaid 围栏内联成图（对标 Codex transcript Mermaid）。
 * 未闭合直播仍走 LiveFenceTail，避免每 token 跑解析。
 * @see src/components/ARCH.md
 */
import { useEffect, useId, useRef, useState } from 'react'
import {
  readCachedMermaidSvg,
  writeCachedMermaidSvg,
  type MermaidUiTheme
} from '../../shared/mermaid-fence'
import { CodeArtifactBlock, CodeArtifactShell } from './CodeArtifactBlock'
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

export function MermaidBlock({ code }: { code: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const theme = useUiMermaidTheme()
  const source = code.replace(/\n$/, '')
  const paintedSource = useRef(source.trim())
  const renderGen = useRef(0)
  const [svg, setSvg] = useState(() => readCachedMermaidSvg(source, theme) ?? '')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
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
    if (paintedSource.current !== text) {
      setSvg('')
    }
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
  }, [source, theme, reactId])

  if (!source.trim() || failed || !svg) {
    return <CodeArtifactBlock code={source} language="mermaid" />
  }
  return (
    <CodeArtifactShell
      label="mermaid"
      copyText={source}
      bodyClassName="mermaid-block-scroll"
      ariaLabel="mermaid 图"
    >
      <div className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />
    </CodeArtifactShell>
  )
}
