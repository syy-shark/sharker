/**
 * 工作区文件树（右侧面板）：Home 仅目录；项目可打开文件预览并跳到引用行。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveCitationPath } from '../../../shared/file-citation'
import type { WorkspaceTreeNode } from '../../../shared/workspace-tree'
import './FileTree.css'

interface Props {
  workspacePath: string
  isHome?: boolean
  /** 对话文件引用：打开预览并跳行 */
  previewRequest?: { path: string; line?: number; token: number } | null
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
export function FileTree({ workspacePath, isHome = false, previewRequest = null }: Props) {
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [openFile, setOpenFile] = useState<{
    path: string
    content: string
    line?: number
  } | null>(null)
  const [fileError, setFileError] = useState('')
  const lineTargetRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    if (!workspacePath || !window.sharker?.getWorkspaceTree) return
    setLoading(true)
    setFileError('')
    try {
      const nodes = await window.sharker.getWorkspaceTree(workspacePath, isHome)
      setTree(nodes)
      setExpanded(new Set([workspacePath]))
    } finally {
      setLoading(false)
    }
  }, [workspacePath, isHome])

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
    if (!window.sharker?.readTextFile) return
    setFileError('')
    const abs = resolveCitationPath(path, workspacePath)
    const res = await window.sharker.readTextFile(abs)
    if (!res.ok) {
      setFileError(res.error)
      setOpenFile(null)
      return
    }
    setOpenFile({ path: res.path, content: res.content, line })
  }, [workspacePath])

  useEffect(() => {
    if (!previewRequest?.path || isHome) return
    void onOpenFile(previewRequest.path, previewRequest.line)
  }, [isHome, onOpenFile, previewRequest])

  useEffect(() => {
    lineTargetRef.current?.scrollIntoView({ block: 'center' })
  }, [openFile?.path, openFile?.line, openFile?.content])

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
          <pre className="file-tree-viewer-body">
            {openFile.content.split('\n').map((text, index) => {
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
        </div>
      ) : null}
      {fileError ? <p className="file-tree-error">{fileError}</p> : null}
      <div className="file-tree-head">
        <span className="file-tree-root" title={workspacePath}>
          {workspacePath.split('/').pop() || workspacePath}
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
