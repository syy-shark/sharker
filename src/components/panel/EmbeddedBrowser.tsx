/**
 * 内置浏览器：Chrome 式工具栏 + 本地新标签 + 外站玻璃注入。
 * 批注模式点元素或拖选区域，写成 composer Selection 芯片（对标 Codex Annotation mode）。
 * @see ./ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, PenLine, RotateCw } from 'lucide-react'
import {
  BROWSER_START_PAGE_VERSION,
  browserStartPageDataUrl,
  resolveBrowserStartTheme,
  type BrowserStartTheme
} from './browser-start-page'
import {
  browserCommentSetScript,
  canAnnotateBrowserUrl,
  formatBrowserCommentExcerpt,
  parseBrowserCommentMessage,
  placeBrowserCommentPopover,
  type BrowserCommentPick
} from '../../../shared/browser-comment'
import { PAGE_GLASS_INJECT_CSS, shouldInjectGlass } from './browser-glass-css'
import type { SideChatSource } from '../../../shared/side-chat-quote'
import './EmbeddedBrowser.css'

interface Props {
  initialUrl?: string
  /** 批注保存进 composer Selection 芯片 */
  onInsertComposer?: (text: string, source?: SideChatSource, comment?: string) => void
}

function safeCall(fn: () => void) {
  try {
    fn()
  } catch {
    /* webview 未就绪 / 已销毁 */
  }
}

/** 地址栏展示：起始页显示空白，data URL 不刷屏 */
function displayUrlForBar(raw: string): string {
  if (!raw || raw.startsWith('data:text/html')) return ''
  if (raw === 'about:blank') return ''
  return raw
}

function resolveNavigateTarget(raw: string, startUrl: string): string {
  const next = raw.trim()
  if (!next) return startUrl
  if (/^https?:\/\//i.test(next)) return next
  if (next.startsWith('about:')) return next
  /** 像 Chrome：有点号且无空格 → 网址；否则 Google 搜索 */
  if (next.includes('.') && !/\s/.test(next)) {
    return `https://${next}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(next)}`
}

/** webview 浏览器面板 */
export function EmbeddedBrowser({ initialUrl, onInsertComposer }: Props) {
  const [startTheme, setStartTheme] = useState<BrowserStartTheme>(() => resolveBrowserStartTheme())
  /** 每次渲染取新 data URL，HMR / 版本变更后不会粘住旧快捷方式页 */
  const startSrc = initialUrl?.trim() || browserStartPageDataUrl(startTheme)
  const [url, setUrl] = useState(startSrc)
  const [input, setInput] = useState(() => displayUrlForBar(startSrc))
  const [loading, setLoading] = useState(false)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  const [draft, setDraft] = useState<{ pick: BrowserCommentPick; top: number; left: number } | null>(
    null
  )
  const [draftComment, setDraftComment] = useState('')
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef(url)
  const glassCssKeyRef = useRef<string | null>(null)
  const annotatingRef = useRef(false)
  const onInsertRef = useRef(onInsertComposer)
  onInsertRef.current = onInsertComposer

  const applyAnnotate = useCallback((on: boolean) => {
    const wv = webviewRef.current
    if (!wv) return
    safeCall(() => {
      void wv.executeJavaScript(browserCommentSetScript(on)).catch(() => undefined)
    })
  }, [])

  useEffect(() => {
    urlRef.current = url
  }, [url])

  useEffect(() => {
    annotatingRef.current = annotating
    applyAnnotate(annotating)
    if (!annotating) {
      setDraft(null)
      setDraftComment('')
    }
  }, [annotating, applyAnnotate])

  useEffect(() => {
    if (annotating && !canAnnotateBrowserUrl(url)) setAnnotating(false)
  }, [url, annotating])

  /** 跟随 App 主题切换起始页（不是系统 prefers-color-scheme） */
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setStartTheme(resolveBrowserStartTheme(root))
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  }, [])

  const syncNav = useCallback(() => {
    const wv = webviewRef.current
    if (!wv) return
    safeCall(() => {
      const u = wv.getURL()
      if (u) {
        setUrl(u)
        setInput(displayUrlForBar(u))
      }
      setCanBack(Boolean(wv.canGoBack?.()))
      setCanForward(Boolean(wv.canGoForward?.()))
    })
  }, [])

  /** Dark Reader 式注入：http(s) 页叠水滴玻璃底；失败忽略 */
  const applyPageGlass = useCallback(async () => {
    const wv = webviewRef.current
    if (!wv) return
    try {
      if (glassCssKeyRef.current) {
        try {
          await wv.removeInsertedCSS(glassCssKeyRef.current)
        } catch {
          /* 旧 key 失效 */
        }
        glassCssKeyRef.current = null
      }
      let current = ''
      try {
        current = wv.getURL()
      } catch {
        return
      }
      if (!shouldInjectGlass(current)) return
      const key = await wv.insertCSS(PAGE_GLASS_INJECT_CSS)
      if (typeof key === 'string') glassCssKeyRef.current = key
    } catch {
      /* 跨域 / 销毁 / 不支持 */
    }
  }, [])

  /** 挂载 / 起始页版本 / 主题变更：仅刷新“起始页”，勿打断外站浏览 */
  useEffect(() => {
    const fresh = initialUrl?.trim() || browserStartPageDataUrl(startTheme)
    let current = ''
    try {
      current = webviewRef.current?.getURL?.() || urlRef.current || ''
    } catch {
      current = urlRef.current || ''
    }
    const onStartPage =
      !current ||
      current.startsWith('data:text/html') ||
      current === 'about:blank' ||
      current.startsWith('about:sharker')
    // 用户已在外站时只更新 startTheme 缓存，不强制 loadURL
    if (!onStartPage && !initialUrl?.trim()) return
    // 已是同一起始页时不再 loadURL，避免 webview 反复 abort 同一 data URL
    if (current === fresh || urlRef.current === fresh) {
      setInput(displayUrlForBar(fresh))
      return
    }
    setUrl(fresh)
    setInput(displayUrlForBar(fresh))
    const timer = window.setTimeout(() => {
      safeCall(() => {
        const wv = webviewRef.current
        if (!wv) return
        let live = ''
        try {
          live = wv.getURL?.() || ''
        } catch {
          live = ''
        }
        if (live && live === fresh) return
        wv.loadURL(fresh)
      })
    }, 0)
    return () => window.clearTimeout(timer)
    // 故意不依赖 url：否则 setUrl/loadURL 会自激循环并刷 ERR_ABORTED
  }, [initialUrl, startTheme])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStart = () => setLoading(true)
    const onStop = () => {
      setLoading(false)
      syncNav()
      void applyPageGlass()
    }
    const onFail = () => setLoading(false)
    const onNav = () => {
      syncNav()
      void applyPageGlass()
    }
    const onDomReady = () => {
      syncNav()
      safeCall(() => {
        wv.setZoomFactor(1)
      })
      void applyPageGlass()
      if (annotatingRef.current) applyAnnotate(true)
    }
    const onConsole = (event: Event) => {
      const message = (event as Event & { message?: string }).message
      const parsed = parseBrowserCommentMessage(String(message || ''))
      if (!parsed) return
      if (parsed === 'cancel') {
        setDraft(null)
        setDraftComment('')
        setAnnotating(false)
        return
      }
      const host = viewportRef.current?.getBoundingClientRect()
      const pos = placeBrowserCommentPopover(
        parsed.rect,
        parsed.viewport,
        { width: host?.width ?? 400, height: host?.height ?? 300 }
      )
      setDraft({ pick: parsed, top: pos.top, left: pos.left })
      setDraftComment('')
    }

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-fail-load', onFail)
    wv.addEventListener('did-navigate', onNav)
    wv.addEventListener('did-navigate-in-page', onNav)
    wv.addEventListener('dom-ready', onDomReady)
    wv.addEventListener('console-message', onConsole)

    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-fail-load', onFail)
      wv.removeEventListener('did-navigate', onNav)
      wv.removeEventListener('did-navigate-in-page', onNav)
      wv.removeEventListener('dom-ready', onDomReady)
      wv.removeEventListener('console-message', onConsole)
      glassCssKeyRef.current = null
    }
  }, [syncNav, applyPageGlass, applyAnnotate])

  const navigate = () => {
    const home = browserStartPageDataUrl(startTheme)
    const target = resolveNavigateTarget(input, home)
    setUrl(target)
    setInput(displayUrlForBar(target))
    safeCall(() => {
      webviewRef.current?.loadURL(target)
    })
  }

  const goHome = () => {
    const home = browserStartPageDataUrl(startTheme)
    setUrl(home)
    setInput('')
    safeCall(() => {
      webviewRef.current?.loadURL(home)
    })
  }

  const goBack = () => safeCall(() => webviewRef.current?.goBack())
  const goForward = () => safeCall(() => webviewRef.current?.goForward())
  const reload = () =>
    safeCall(() => {
      if (loading) webviewRef.current?.stop()
      else webviewRef.current?.reload()
    })
  const reloadBypassCache = () =>
    safeCall(() => {
      webviewRef.current?.reloadIgnoringCache?.()
    })
  const copyUrl = () => {
    const raw = urlRef.current
    const text = displayUrlForBar(raw)
    if (!text || !navigator.clipboard?.writeText) return
    void navigator.clipboard.writeText(text)
  }

  /** 浏览器聚焦时：⌘L 地址栏、⌘R 刷新、⌘←/→ 前进后退、⌘⇧C 复制网址、侧键导航 */
  useEffect(() => {
    const inBrowser = (node: EventTarget | null) => {
      const host = shellRef.current
      if (!host) return false
      return node instanceof Node && host.contains(node)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && (annotating || draft)) {
        e.preventDefault()
        e.stopPropagation()
        if (draft) {
          setDraft(null)
          setDraftComment('')
          return
        }
        setAnnotating(false)
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey) return
      if (!inBrowser(document.activeElement) && !inBrowser(e.target)) return
      if ((e.key === 'l' || e.key === 'L') && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        urlInputRef.current?.focus()
        urlInputRef.current?.select()
        return
      }
      if ((e.key === 'r' || e.key === 'R') && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        reload()
        return
      }
      if ((e.key === 'r' || e.key === 'R') && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        reloadBypassCache()
        return
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        goBack()
        return
      }
      if (e.key === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        goForward()
        return
      }
      if ((e.key === 'c' || e.key === 'C') && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        copyUrl()
      }
    }
    const onMouse = (e: MouseEvent) => {
      if (!inBrowser(e.target)) return
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        goBack()
      } else if (e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
        goForward()
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mouseup', onMouse, true)
    window.addEventListener('auxclick', onMouse, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mouseup', onMouse, true)
      window.removeEventListener('auxclick', onMouse, true)
    }
  }, [loading, annotating, draft])

  return (
    <div className="embedded-browser" ref={shellRef}>
      <div className="embedded-browser-toolbar">
        <div className="embedded-browser-nav">
          <button
            type="button"
            className="embedded-browser-icon-btn"
            onClick={goBack}
            disabled={!canBack}
            aria-label="后退"
            title="后退"
          >
            <ArrowLeft size={15} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="embedded-browser-icon-btn"
            onClick={goForward}
            disabled={!canForward}
            aria-label="前进"
            title="前进"
          >
            <ArrowRight size={15} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="embedded-browser-icon-btn"
            onClick={reload}
            aria-label={loading ? '停止' : '刷新'}
            title={loading ? '停止' : '刷新'}
          >
            <RotateCw
              size={14}
              strokeWidth={2}
              aria-hidden
              className={loading ? 'embedded-browser-spin' : undefined}
            />
          </button>
        </div>

        <div className={`embedded-browser-omnibox ${loading ? 'is-loading' : ''}`}>
          {loading ? <span className="embedded-browser-omnibox-pulse" aria-hidden /> : null}
          <input
            ref={urlInputRef}
            className="embedded-browser-url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                navigate()
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="搜索 Google 或输入网址"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="地址栏"
          />
        </div>

        <button
          type="button"
          className="embedded-browser-home-btn"
          onClick={goHome}
          title="新标签页"
          aria-label="新标签页"
        >
          主页
        </button>
        <button
          type="button"
          className={`embedded-browser-annotate-btn${annotating ? ' is-on' : ''}`}
          aria-pressed={annotating}
          aria-label={annotating ? '关闭批注' : '批注页面'}
          title={
            canAnnotateBrowserUrl(url)
              ? annotating
                ? '关闭批注'
                : '批注：点元素或拖选区域'
              : '打开网页后再批注'
          }
          onClick={() => {
            if (!canAnnotateBrowserUrl(url) && !annotating) return
            setAnnotating((on) => !on)
          }}
        >
          <PenLine size={14} strokeWidth={2} aria-hidden />
          批注
        </button>
      </div>

      <div className="embedded-browser-viewport" ref={viewportRef}>
        {/* key 随版本变，强制重建 webview，甩掉缓存的旧 data URL */}
        {/* @ts-expect-error webview is Electron-only */}
        <webview
          key={`start-v${BROWSER_START_PAGE_VERSION}-${startTheme}`}
          ref={webviewRef as never}
          className="embedded-browser-view"
          src={url}
          allowpopups="true"
          webpreferences="contextIsolation=yes, nativeWindowOpen=yes"
        />
        {draft ? (
          <form
            className="embedded-browser-comment glass-popover"
            style={{ top: draft.top, left: draft.left }}
            onSubmit={(event) => {
              event.preventDefault()
              const note = draftComment.trim()
              if (!note) return
              const excerpt = formatBrowserCommentExcerpt(draft.pick)
              onInsertRef.current?.(excerpt, 'browser', note)
              setDraft(null)
              setDraftComment('')
            }}
          >
            <p className="embedded-browser-comment-excerpt">{formatBrowserCommentExcerpt(draft.pick)}</p>
            <textarea
              className="embedded-browser-comment-input"
              value={draftComment}
              onChange={(event) => setDraftComment(event.target.value)}
              placeholder="写出问题和期望结果"
              rows={3}
              autoFocus
            />
            <div className="embedded-browser-comment-actions">
              <button
                type="button"
                className="embedded-browser-comment-cancel"
                onClick={() => {
                  setDraft(null)
                  setDraftComment('')
                }}
              >
                取消
              </button>
              <button type="submit" className="embedded-browser-comment-save" disabled={!draftComment.trim()}>
                保存
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
