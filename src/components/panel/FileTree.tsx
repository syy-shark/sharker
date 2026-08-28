/**
 * 工作区文件树（右侧面板）：Home 仅目录；项目可打开文件预览并跳到引用行。
 * 文本预览划选可插入输入框或旁路提问。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveCitationPath } from '../../../shared/file-citation'
import {
  filePreviewKind,
  filePreviewUnsupportedMessage,
  type FilePreviewKind
} from '../../../shared/file-preview'
import {
  formatComposerInsert,
  formatSideChatPrompt,
  isFilePreviewSelectionRange,
  normalizeTranscriptSelection,
  placeSelectionAskBar
} from '../../../shared/side-chat-quote'
import type { WorkspaceTreeNode } from '../../../shared/workspace-tree'
import './FileTree.css'

const EMPTY_EXTRA_ROOTS: string[] = []

interface Props {
  workspacePath: string
  isHome?: boolean
  /** 对话文件引用：打开预览并跳行 */
  previewRequest?: { path: string; line?: number; token: number } | null
  /** 项目附加文件夹：与主根一起出现在文件树顶层 */
  extraRoots?: string[]
  /** 划选预览正文后旁路提问（对标 Codex Ask in side chat） */
  onAskInSideChat?: (prompt: string) => void
  /** 划选预览正文插入当前输入框（对标 Codex send selection to composer） */
  onInsertComposer?: (text: string) => void
}

function TreeNodeView({
  node,
  depth,
  expanded,
  isHome,
  onToggle,
  onOpenFile
}: {
  node: WorkspaceTreeNode
  depth: number
  expanded: Set<string>
  isHome?: boolean
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
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
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** 文件树面板 */
export function FileTree({
  workspacePath,
  isHome = false,
  previewRequest = null,
  extraRoots = EMPTY_EXTRA_ROOTS,
  onAskInSideChat,
  onInsertComposer
}: Props) {
  const extras = useMemo(
    () => extraRoots.filter((root) => root && root !== workspacePath),
    [extraRoots, workspacePath]
  )
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [openFile, setOpenFile] = useState<{
    path: string
    kind: FilePreviewKind
    content?: string
    dataUrl?: string
    line?: number
  } | null>(null)
  const [fileError, setFileError] = useState('')
  const [sideAsk, setSideAsk] = useState<{ text: string; top: number; left: number } | null>(null)
  const lineTargetRef = useRef<HTMLDivElement | null>(null)
  const viewerBodyRef = useRef<HTMLPreElement | null>(null)

  const load = useCallback(async () => {
    if (!workspacePath || !window.sharker?.getWorkspaceTree) return
    setLoading(true)
    setFileError('')
    try {
      const nodes = await window.sharker.getWorkspaceTree(workspacePath, isHome, extras)
      setTree(nodes)
      setExpanded(new Set([workspacePath, ...extras]))
    } finally {
      setLoading(false)
    }
  }, [workspacePath, isHome, extras])

  useEffect(() => {
    setOpenFile(null)
    void load()
  }, [load])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', onVis)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onVis)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])


  const onToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const onOpenFile = useCallback(async (path: string, line?: number) => {
    setFileError('')
    const abs = resolveCitationPath(path, workspacePath, extraRoots)
    const kind = filePreviewKind(abs)
    if (kind === 'unsupported') {
      setFileError(filePreviewUnsupportedMessage(abs))
      setOpenFile(null)
      return
    }
    if (kind === 'image' || kind === 'pdf') {
      if (!window.sharker?.readFileDataUrl) return
      const res = await window.sharker.readFileDataUrl(abs)
      if (!res.ok) {
        setFileError(res.error)
        setOpenFile(null)
        return
      }
      setOpenFile({ path: res.path, kind, dataUrl: res.dataUrl })
      return
    }
    if (!window.sharker?.readTextFile) return
    const res = await window.sharker.readTextFile(abs)
    if (!res.ok) {
      setFileError(res.error)
      setOpenFile(null)
      return
    }
    setOpenFile({ path: res.path, kind: 'text', content: res.content, line })
  }, [workspacePath, extraRoots])

  useEffect(() => {
    if (!previewRequest?.path || isHome) return
    void onOpenFile(previewRequest.path, previewRequest.line)
  }, [isHome, onOpenFile, previewRequest])

  useEffect(() => {
    lineTargetRef.current?.scrollIntoView({ block: 'center' })
  }, [openFile?.path, openFile?.line, openFile?.content])

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
    <div className="file-tree">
      {openFile ? (
        <div className="file-tree-viewer">
          <div className="file-tree-viewer-head">
            <span className="file-tree-viewer-name" title={openFile.path}>
              {openFile.path.split('/').pop()}
              {openFile.line ? `:${openFile.line}` : ''}
            </span>
            <button type="button" className="file-tree-viewer-close" onClick={() => setOpenFile(null)}>
              关闭
            </button>
          </div>
          {openFile.kind === 'image' && openFile.dataUrl ? (
            <div className="file-tree-viewer-media">
              <img className="file-tree-viewer-image" src={openFile.dataUrl} alt="" />
            </div>
          ) : openFile.kind === 'pdf' && openFile.dataUrl ? (
            <iframe
              className="file-tree-viewer-embed"
              src={openFile.dataUrl}
              title={openFile.path.split('/').pop() || 'PDF'}
            />
          ) : (
          <pre className="file-tree-viewer-body" ref={viewerBodyRef} onMouseUp={syncSideAsk}>
            {(openFile.content ?? '').split('\n').map((text, index) => {
              const lineNo = index + 1
              const target = openFile.line === lineNo
              return (
                <div
                  key={lineNo}
                  ref={target ? lineTargetRef : undefined}
                  className={`file-tree-viewer-line${target ? ' is-target' : ''}`}
                >
                  <span className="file-tree-viewer-gutter" aria-hidden>
                    {lineNo}
                  </span>
                  <span className="file-tree-viewer-text">{text || ' '}</span>
                </div>
              )
            })}
          </pre>
          )}
          {openFile.kind === 'text' && sideAsk && (onAskInSideChat || onInsertComposer) ? (
            <div className="file-tree-side-ask-bar" style={{ top: sideAsk.top, left: sideAsk.left }}>
              {onInsertComposer ? (
                <button
                  type="button"
                  className="file-tree-side-ask glass-pill"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onInsertComposer(formatComposerInsert(sideAsk.text, 'file'))
                    setSideAsk(null)
                    window.getSelection()?.removeAllRanges()
                  }}
                >
                  插入输入框
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
                  旁路提问
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
          />
        ))}
      </ul>
    </div>
  )
}
