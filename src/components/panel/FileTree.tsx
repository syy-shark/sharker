/**
 * 工作区文件树（右侧面板）：Home 仅目录；项目可打开文件预览并跳到引用行；HTML 无行号进内置浏览器；Markdown 默认可切富预览。
 * 文本预览聚焦时 ⌘L 打开跳行框（对标 Codex Go to line）；划选出加入对话 / 旁路提问。
 * 图片预览按预览窗 CSS 像素 contain（对标 Codex #26851 / #31112），不订直播 token。
 * 源码预览按扩展名 highlight.js 着色（对标 Codex 文件查看器 / #18966），不发明 .tex 语法。
 * 文件右键打开 / Open in Finder / Copy path，目录只揭示 / 复制（对标 Codex file tree Open menu）。
 * 写盘 revision 静默重拉树并在树内重读已打开预览（不抬 App），不清预览、不折叠已展开目录；定居后不再播进入动画以免直播抖。
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type Ref
} from 'react'
import { fileTreeRowMenuItems, resolveCitationPath } from '../../../shared/file-citation'
import { clampReviewMenuPosition } from '../../../shared/review-file-click'
import {
  filePreviewKind,
  filePreviewUnsupportedMessage,
  fileTreeReloadMode,
  isMarkdownPreviewPath,
  nextMarkdownFileView,
  resolveWorkspaceHtmlFileUrl,
  shouldAnimateFileTreeInsert,
  shouldOpenHtmlInAppBrowser,
  shouldRereadOpenPreviewOnReload,
  parseGoToLineInput,
  type FilePreviewKind,
  type FileTreeReloadReason,
  type MarkdownFileView
} from '../../../shared/file-preview'
import {
  filePreviewImageFit,
  peekChatImageSizeFromDataUrl
} from '../../../shared/chat-image'
import { fileHighlightLanguage, highlightFenceLines } from '../../../shared/syntax-highlight'
import { FileMarkdownPreview } from './FileMarkdownPreview'
import { dispatchOpenBrowserUrl } from '../../lib/browser-history-store'
import {
  dispatchCopyWorkspaceFilePath,
  dispatchRevealWorkspaceFile
} from '../../lib/open-workspace-file'
import {
  ADD_TO_CHAT_LABEL,
  ASK_IN_SIDE_CHAT_LABEL,
  formatSideChatPrompt,
  isFilePreviewSelectionRange,
  normalizeTranscriptSelection,
  placeSelectionAskBar,
  type SideChatSource
} from '../../../shared/side-chat-quote'
import type { WorkspaceTreeNode } from '../../../shared/workspace-tree'
import './FileTree.css'
import '../../styles/syntax-highlight.css'

const EMPTY_EXTRA_ROOTS: string[] = []

/** 右侧预览图：按预览窗 contain，不跟界面字号放大裁切 */
function FilePreviewImage({ src, alt }: { src: string; alt: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pane, setPane] = useState({ width: 0, height: 0 })
  const [natural, setNatural] = useState(() => peekChatImageSizeFromDataUrl(src))

  useEffect(() => {
    setNatural(peekChatImageSizeFromDataUrl(src))
  }, [src])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setPane({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [src])

  const fit = filePreviewImageFit(natural, pane)

  return (
    <div ref={boxRef} className="file-tree-viewer-media">
      <img
        className="file-tree-viewer-image"
        src={src}
        alt={alt}
        width={fit.width || natural?.width}
        height={fit.height || natural?.height}
        style={
          fit.width
            ? { width: fit.width, height: fit.height }
            : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
        }
        onLoad={(event) => {
          const img = event.currentTarget
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setNatural({ width: img.naturalWidth, height: img.naturalHeight })
          }
        }        }
      />
    </div>
  )
}

/** 源码预览：按扩展名着色一次，不订直播 token */
function FilePreviewSource({
  content,
  path,
  targetLine,
  lineTargetRef,
  bodyRef,
  onMouseUp
}: {
  content: string
  path: string
  targetLine?: number
  lineTargetRef: Ref<HTMLDivElement>
  bodyRef: Ref<HTMLElement>
  onMouseUp: () => void
}) {
  const htmlLines = useMemo(
    () => highlightFenceLines(content, fileHighlightLanguage(path)),
    [content, path]
  )
  return (
    <pre className="file-tree-viewer-body" ref={bodyRef} tabIndex={-1} onMouseUp={onMouseUp}>
      {content.split('\n').map((text, index) => {
        const lineNo = index + 1
        const target = targetLine === lineNo
        const html = htmlLines?.[index]
        return (
          <div
            key={lineNo}
            ref={target ? lineTargetRef : undefined}
            className={`file-tree-viewer-line${target ? ' is-target' : ''}`}
          >
            <span className="file-tree-viewer-gutter" aria-hidden>
              {lineNo}
            </span>
            {html != null ? (
              <span
                className="file-tree-viewer-text"
                dangerouslySetInnerHTML={{ __html: html || ' ' }}
              />
            ) : (
              <span className="file-tree-viewer-text">{text || ' '}</span>
            )}
          </div>
        )
      })}
    </pre>
  )
}

interface Props {
  workspacePath: string
  isHome?: boolean
  /** 对话文件引用：打开预览并跳行 */
  previewRequest?: { path: string; line?: number; token: number } | null
  /** 项目附加文件夹：与主根一起出现在文件树顶层 */
  extraRoots?: string[]
  /** 划选预览正文后旁路提问（对标 Codex Ask in side chat） */
  onAskInSideChat?: (prompt: string) => void
  /** 划选预览正文进 composer Selection 芯片（对标 Codex selected-text previews） */
  onInsertComposer?: (text: string, source?: SideChatSource, comment?: string) => void
  /** 工具写盘后递增：静默重拉树，不清预览、不折叠已展开目录 */
  revision?: number
}

function TreeNodeView({
  node,
  depth,
  expanded,
  isHome,
  onToggle,
  onOpenFile,
  onRowMenu
}: {
  node: WorkspaceTreeNode
  depth: number
  expanded: Set<string>
  isHome?: boolean
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onRowMenu: (event: MouseEvent, node: WorkspaceTreeNode) => void
}) {
  const isOpen = expanded.has(node.path)
  const hasChildren = Boolean(node.isDirectory && node.children?.length)

  return (
    <li className="file-tree-node">
      <button
        type="button"
        className={`file-tree-row ${node.isDirectory ? 'file-tree-row--dir' : 'file-tree-row--file'}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (node.isDirectory) onToggle(node.path)
          else if (!isHome) onOpenFile(node.path)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onRowMenu(event, node)
        }}
        title={node.path}
      >
        {node.isDirectory ? (
          <span className="file-tree-chevron" aria-hidden>
            {hasChildren ? (isOpen ? '▾' : '▸') : '·'}
          </span>
        ) : (
          <span className="file-tree-chevron file-tree-chevron--file" aria-hidden>
            ·
          </span>
        )}
        <span className="file-tree-name">{node.name}</span>
      </button>
      {node.isDirectory && isOpen && node.children?.length ? (
        <ul className="file-tree-children">
          {node.children.map((c) => (
            <TreeNodeView
              key={c.path}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              isHome={isHome}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              onRowMenu={onRowMenu}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** 文件树面板 */
export const FileTree = memo(function FileTree({
  workspacePath,
  isHome = false,
  previewRequest = null,
  extraRoots = EMPTY_EXTRA_ROOTS,
  onAskInSideChat,
  onInsertComposer,
  revision = 0
}: Props) {
  const extras = useMemo(
    () => extraRoots.filter((root) => root && root !== workspacePath),
    [extraRoots, workspacePath]
  )
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [treeSettled, setTreeSettled] = useState(false)
  const [openFile, setOpenFile] = useState<{
    path: string
    kind: FilePreviewKind
    content?: string
    dataUrl?: string
    line?: number
    markdownView?: MarkdownFileView
  } | null>(null)
  const openFileRef = useRef(openFile)
  openFileRef.current = openFile
  const [fileError, setFileError] = useState('')
  const [sideAsk, setSideAsk] = useState<{ text: string; top: number; left: number } | null>(null)
  const [goToOpen, setGoToOpen] = useState(false)
  const [goToDraft, setGoToDraft] = useState('')
  const [rowMenu, setRowMenu] = useState<{
    path: string
    isDirectory: boolean
    x: number
    y: number
  } | null>(null)
  const lineTargetRef = useRef<HTMLDivElement | null>(null)
  const viewerBodyRef = useRef<HTMLElement | null>(null)
  const treeRef = useRef<HTMLDivElement | null>(null)
  const goToInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(
    async (reason: FileTreeReloadReason = 'workspace') => {
      if (!workspacePath || !window.sharker?.getWorkspaceTree) return
      const mode = fileTreeReloadMode(reason)
      if (mode.showLoading) {
        setLoading(true)
        setFileError('')
      }
      try {
        const nodes = await window.sharker.getWorkspaceTree(workspacePath, isHome, extras)
        setTree(nodes)
        if (mode.resetExpanded) setExpanded(new Set([workspacePath, ...extras]))
      } finally {
        if (mode.showLoading) setLoading(false)
      }
    },
    [workspacePath, isHome, extras]
  )

  useEffect(() => {
    setOpenFile(null)
    setTreeSettled(false)
    void load('workspace').then(() => {
      window.requestAnimationFrame(() => setTreeSettled(true))
    })
  }, [load])

  const onToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const onOpenFile = useCallback(async (
    path: string,
    line?: number,
    opts?: { keepIfClosed?: boolean }
  ) => {
    setFileError('')
    const abs = resolveCitationPath(path, workspacePath, extraRoots)
    if (shouldOpenHtmlInAppBrowser(abs, line)) {
      const htmlUrl = resolveWorkspaceHtmlFileUrl(abs, workspacePath, extraRoots)
      if (htmlUrl) {
        dispatchOpenBrowserUrl(htmlUrl)
        return
      }
    }
    const kind = filePreviewKind(abs)
    if (kind === 'unsupported') {
      if (opts?.keepIfClosed) return
      setFileError(filePreviewUnsupportedMessage(abs))
      setOpenFile(null)
      return
    }
    const stillOpen = () => {
      if (!opts?.keepIfClosed) return true
      const open = openFileRef.current
      if (!open) return false
      return open.path === path || open.path === abs
    }
    if (kind === 'image' || kind === 'pdf') {
      if (!window.sharker?.readFileDataUrl) return
      const res = await window.sharker.readFileDataUrl(abs)
      if (!res.ok) {
        if (opts?.keepIfClosed) return
        setFileError(res.error)
        setOpenFile(null)
        return
      }
      if (!stillOpen()) return
      setOpenFile({ path: res.path, kind, dataUrl: res.dataUrl })
      return
    }
    if (!window.sharker?.readTextFile) return
    const res = await window.sharker.readTextFile(abs)
    if (!res.ok) {
      if (opts?.keepIfClosed) return
      setFileError(res.error)
      setOpenFile(null)
      return
    }
    if (!stillOpen()) return
    const lineCount = res.content.split('\n').length
    const clamped = line != null ? parseGoToLineInput(String(line), lineCount) ?? undefined : undefined
    const markdownView = nextMarkdownFileView(
      res.path,
      clamped,
      openFileRef.current,
      Boolean(opts?.keepIfClosed)
    )
    setOpenFile({ path: res.path, kind: 'text', content: res.content, line: clamped, markdownView })
  }, [workspacePath, extraRoots])

  const rereadOpenPreview = useCallback(
    (reason: FileTreeReloadReason) => {
      if (!shouldRereadOpenPreviewOnReload(reason)) return
      const open = openFileRef.current
      if (open?.path) void onOpenFile(open.path, open.line, { keepIfClosed: true })
    },
    [onOpenFile]
  )

  useEffect(() => {
    if (!revision) return
    void load('revision').then(() => rereadOpenPreview('revision'))
  }, [load, revision, rereadOpenPreview])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      void load('focus').then(() => rereadOpenPreview('focus'))
    }
    window.addEventListener('focus', onVis)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onVis)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load, rereadOpenPreview])

  useEffect(() => {
    if (!previewRequest?.path || isHome) return
    void onOpenFile(previewRequest.path, previewRequest.line)
  }, [isHome, onOpenFile, previewRequest])

  const onRowMenu = useCallback((event: MouseEvent, node: WorkspaceTreeNode) => {
    const next = clampReviewMenuPosition(
      event.clientX,
      event.clientY,
      { width: 176, height: node.isDirectory ? 76 : 108 },
      { width: window.innerWidth, height: window.innerHeight }
    )
    setRowMenu({
      path: node.path,
      isDirectory: Boolean(node.isDirectory),
      x: next.x,
      y: next.y
    })
  }, [])

  useEffect(() => {
    if (!rowMenu) return
    const onDoc = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[data-file-tree-menu]')) return
      setRowMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRowMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [rowMenu])

  useEffect(() => {
    lineTargetRef.current?.scrollIntoView({ block: 'center' })
  }, [openFile?.path, openFile?.line, openFile?.content])

  useEffect(() => {
    if (openFile?.kind !== 'text') setGoToOpen(false)
  }, [openFile?.kind, openFile?.path])

  useEffect(() => {
    if (openFile?.kind === 'text') {
      viewerBodyRef.current?.focus({ preventScroll: true })
    }
  }, [openFile?.path, openFile?.kind])

  const applyGoToLine = useCallback(() => {
    if (!openFile || openFile.kind !== 'text') return
    const lineCount = (openFile.content ?? '').split('\n').length
    const line = parseGoToLineInput(goToDraft, lineCount)
    if (line == null) return
    setOpenFile((prev) => (prev && prev.kind === 'text' ? { ...prev, line } : prev))
    setGoToOpen(false)
    requestAnimationFrame(() => viewerBodyRef.current?.focus({ preventScroll: true }))
  }, [goToDraft, openFile])

  /** 官方 Go to line：文件预览聚焦时 ⌘L；不抢输入框 / 浏览器地址栏 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey || e.shiftKey) return
      if (e.key !== 'l' && e.key !== 'L') return
      if (openFile?.kind !== 'text') return
      if (openFile.markdownView === 'preview') {
        setOpenFile((prev) =>
          prev && prev.kind === 'text' ? { ...prev, markdownView: 'source' } : prev
        )
      }
      const root = treeRef.current
      if (!root) return
      const active = document.activeElement
      const target = e.target
      const inside =
        (active instanceof Node && root.contains(active)) ||
        (target instanceof Node && root.contains(target))
      if (!inside) return
      if (target instanceof HTMLElement) {
        if (target.closest('.composer-box, .embedded-browser, textarea, [contenteditable=true]')) {
          return
        }
      }
      e.preventDefault()
      e.stopPropagation()
      setGoToOpen(true)
      setGoToDraft(openFile.line ? String(openFile.line) : '')
      requestAnimationFrame(() => {
        goToInputRef.current?.focus()
        goToInputRef.current?.select()
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [openFile?.kind, openFile?.line])

  const syncSideAsk = useCallback(() => {
    if (!onAskInSideChat && !onInsertComposer) {
      setSideAsk(null)
      return
    }
    const root = viewerBodyRef.current
    if (!root || openFile?.kind !== 'text') {
      setSideAsk(null)
      return
    }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSideAsk(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!isFilePreviewSelectionRange(range, root)) {
      setSideAsk(null)
      return
    }
    const text = normalizeTranscriptSelection(sel.toString())
    if (!text) {
      setSideAsk(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    if (rect.bottom < box.top || rect.top > box.bottom) {
      setSideAsk(null)
      return
    }
    const placed = placeSelectionAskBar(rect, box)
    const next = { text, top: placed.top, left: placed.left }
    setSideAsk((prev) =>
      prev && prev.text === next.text && prev.top === next.top && prev.left === next.left ? prev : next
    )
  }, [onAskInSideChat, onInsertComposer, openFile?.kind])

  useEffect(() => {
    setSideAsk(null)
  }, [openFile?.path])

  useEffect(() => {
    if (!onAskInSideChat && !onInsertComposer) return
    const onSel = () => syncSideAsk()
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [onAskInSideChat, onInsertComposer, syncSideAsk])

  if (!workspacePath) {
    return <p className="file-tree-empty">请先选择工作区</p>
  }

  return (
    <div
      className={`file-tree${shouldAnimateFileTreeInsert(treeSettled) ? '' : ' file-tree--settled'}`}
      ref={treeRef}
      tabIndex={-1}
    >
      {openFile ? (
        <div className="file-tree-viewer">
          <div className="file-tree-viewer-head">
            <span
              className="file-tree-viewer-name"
              title={
                openFile.kind === 'text' ? `${openFile.path} · ⌘L 跳到行` : openFile.path
              }
            >
              {openFile.path.split('/').pop()}
              {openFile.line ? `:${openFile.line}` : ''}
            </span>
            <div className="file-tree-viewer-actions">
              {openFile.kind === 'text' && isMarkdownPreviewPath(openFile.path) ? (
                <button
                  type="button"
                  className="file-tree-viewer-close"
                  onClick={() => {
                    setOpenFile((prev) =>
                      prev && prev.kind === 'text'
                        ? {
                            ...prev,
                            markdownView: prev.markdownView === 'preview' ? 'source' : 'preview'
                          }
                        : prev
                    )
                  }}
                >
                  {openFile.markdownView === 'preview' ? '源码' : '预览'}
                </button>
              ) : null}
              <button type="button" className="file-tree-viewer-close" onClick={() => setOpenFile(null)}>
                关闭
              </button>
            </div>
          </div>
          {goToOpen && openFile.kind === 'text' ? (
            <form
              className="file-tree-goto glass-pill"
              onSubmit={(event) => {
                event.preventDefault()
                applyGoToLine()
              }}
            >
              <label className="file-tree-goto-label">
                行
                <input
                  ref={goToInputRef}
                  className="file-tree-goto-input"
                  inputMode="numeric"
                  value={goToDraft}
                  onChange={(event) => setGoToDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      setGoToOpen(false)
                      viewerBodyRef.current?.focus({ preventScroll: true })
                    }
                  }}
                  aria-label="跳到行"
                  placeholder="行号"
                />
              </label>
              <button type="submit" className="file-tree-goto-go">
                跳转
              </button>
            </form>
          ) : null}
          {openFile.kind === 'image' && openFile.dataUrl ? (
            <FilePreviewImage src={openFile.dataUrl} alt={openFile.path.split('/').pop() || ''} />
          ) : openFile.kind === 'pdf' && openFile.dataUrl ? (
            <iframe
              className="file-tree-viewer-embed"
              src={openFile.dataUrl}
              title={openFile.path.split('/').pop() || 'PDF'}
            />
          ) : openFile.kind === 'text' && openFile.markdownView === 'preview' ? (
            <FileMarkdownPreview
              content={openFile.content ?? ''}
              markdownPath={openFile.path}
              workspacePath={workspacePath}
              extraRoots={extraRoots}
              onMouseUp={syncSideAsk}
              bodyRef={viewerBodyRef}
            />
          ) : (
            <FilePreviewSource
              content={openFile.content ?? ''}
              path={openFile.path}
              targetLine={openFile.line}
              lineTargetRef={lineTargetRef}
              bodyRef={viewerBodyRef}
              onMouseUp={syncSideAsk}
            />
          )}
          {openFile.kind === 'text' && sideAsk && (onAskInSideChat || onInsertComposer) ? (
            <div className="file-tree-side-ask-bar" style={{ top: sideAsk.top, left: sideAsk.left }}>
              {onInsertComposer ? (
                <button
                  type="button"
                  className="file-tree-side-ask glass-pill"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onInsertComposer(sideAsk.text, 'file')
                    setSideAsk(null)
                    window.getSelection()?.removeAllRanges()
                  }}
                >
                  {ADD_TO_CHAT_LABEL}
                </button>
              ) : null}
              {onAskInSideChat ? (
                <button
                  type="button"
                  className="file-tree-side-ask glass-pill"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onAskInSideChat(formatSideChatPrompt(sideAsk.text, '', 'file'))
                    setSideAsk(null)
                    window.getSelection()?.removeAllRanges()
                  }}
                >
                  {ASK_IN_SIDE_CHAT_LABEL}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {fileError ? <p className="file-tree-error">{fileError}</p> : null}
      <div className="file-tree-head">
        <span
          className="file-tree-root"
          title={[workspacePath, ...extras].join('\n')}
        >
          {workspacePath.split('/').pop() || workspacePath}
          {extras.length ? ` · +${extras.length}` : ''}
          {isHome ? ' · 仅文件夹' : ''}
        </span>
        <button type="button" className="file-tree-refresh" onClick={() => void load()}>
          {loading ? '…' : '刷新'}
        </button>
      </div>
      <ul className="file-tree-list">
        {tree.map((n) => (
          <TreeNodeView
            key={n.path}
            node={n}
            depth={0}
            expanded={expanded}
            isHome={isHome}
            onToggle={onToggle}
            onOpenFile={(p) => void onOpenFile(p)}
            onRowMenu={onRowMenu}
          />
        ))}
      </ul>
      {rowMenu ? (
        <div
          className="file-tree-menu glass-popover popover-enter"
          role="menu"
          data-file-tree-menu
          style={{ top: rowMenu.y, left: rowMenu.x }}
        >
          {fileTreeRowMenuItems(rowMenu.isDirectory, window.sharker?.platform).map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className="file-tree-menu-item"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (item.action === 'open') void onOpenFile(rowMenu.path)
                else if (item.action === 'reveal') dispatchRevealWorkspaceFile(rowMenu.path)
                else dispatchCopyWorkspaceFilePath(rowMenu.path)
                setRowMenu(null)
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
})
